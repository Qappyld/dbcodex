import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDbcdProject, discardDbcdDraft, openDbcdProject, restoreDbcdRevision,
  saveDbcdDraft, saveDbcdProject, setDbcdRevisionPinned,
} from "../src/dbcd-project-store.js";
import { hashDocument } from "../src/document-hash.js";
import { emptyPresentation, type PresentationDocument } from "../src/presentation.js";
import { inspectDbcd, makeDbcdFixture } from "./support/dbcd-fixture.js";
import { removeTempWorkspace } from "./support/temp-workspace.js";

describe("storage boundary regressions", () => {
  const roots: string[] = [];
  afterEach(async () => { await Promise.all(roots.splice(0).map(removeTempWorkspace)); });

  const invalidViews: [string, (presentation: PresentationDocument) => void][] = [
    ["empty views", (presentation) => { presentation.views = {}; }],
    ["missing active view", (presentation) => { presentation.activeViewId = "missing"; }],
    ["missing all view", (presentation) => { presentation.views.other = presentation.views.all!; delete presentation.views.all; presentation.activeViewId = "other"; }],
    ["non-system all view", (presentation) => { presentation.views.all!.system = false; }],
  ];
  it.each(invalidViews)("rejects %s on create, save, draft and open without changing saved bytes", async (_name, invalidate) => {
    const { input, path, snapshot } = await makeDbcdFixture(roots);
    const presentation = emptyPresentation();
    invalidate(presentation);
    const expected = { expectedProjectId: snapshot.projectId, expectedRevisionId: snapshot.currentRevisionId, expectedGeneration: snapshot.generation };
    const before = await readFile(path);
    await expect(createDbcdProject({ ...input, projectPath: "invalid.dbcd", presentation })).rejects.toMatchObject({ code: "INVALID_PRESENTATION" });
    await expect(saveDbcdProject({ ...input, ...expected, presentation })).rejects.toMatchObject({ code: "INVALID_PRESENTATION" });
    await expect(saveDbcdDraft({ ...input, ...expected, baseGeneration: 1, presentation })).rejects.toMatchObject({ code: "INVALID_PRESENTATION" });
    expect(await readFile(path)).toEqual(before);
    const json = JSON.stringify(presentation);
    inspectDbcd(path, (db) => db.prepare("UPDATE document_state SET presentation_json=?, presentation_hash=?").run(json, hashDocument(json)));
    const corrupt = await readFile(path);
    await expect(openDbcdProject(input)).rejects.toMatchObject({ code: "CORRUPT_PROJECT" });
    expect(await readFile(path)).toEqual(corrupt);
  });

  it.each(["save", "draft", "discard", "restore", "pin"])("rejects %s when another same-generation project replaces the session file", async (operation) => {
    const { input, path, root, snapshot } = await makeDbcdFixture(roots);
    const replacement = await createDbcdProject({ ...input, projectPath: "replacement.dbcd", projectId: () => "project-b" });
    await rename(path, join(root, "original.dbcd"));
    await rename(join(root, "replacement.dbcd"), path);
    const before = await readFile(path);
    const selected = { ...input, expectedProjectId: snapshot.projectId, expectedRevisionId: snapshot.currentRevisionId,
      expectedGeneration: snapshot.generation, revisionId: replacement.currentRevisionId, presentation: emptyPresentation() };
    const result = operation === "save" ? saveDbcdProject(selected)
      : operation === "draft" ? saveDbcdDraft({ ...selected, baseGeneration: 1 })
      : operation === "discard" ? discardDbcdDraft(selected)
      : operation === "restore" ? restoreDbcdRevision(selected)
      : setDbcdRevisionPinned({ ...selected, pinned: true });
    await expect(result).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await readFile(path)).toEqual(before);
  });

  it.each(["save", "draft", "discard", "restore", "pin"])("rejects %s for a stale revision even at the same project and generation", async (operation) => {
    const { input, path, snapshot } = await makeDbcdFixture(roots);
    const before = await readFile(path);
    const selected = { ...input, expectedProjectId: snapshot.projectId, expectedRevisionId: "stale-revision",
      expectedGeneration: snapshot.generation, revisionId: snapshot.currentRevisionId, presentation: emptyPresentation() };
    const result = operation === "save" ? saveDbcdProject(selected)
      : operation === "draft" ? saveDbcdDraft({ ...selected, baseGeneration: 1 })
      : operation === "discard" ? discardDbcdDraft(selected)
      : operation === "restore" ? restoreDbcdRevision(selected)
      : setDbcdRevisionPinned({ ...selected, pinned: true });
    await expect(result).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await readFile(path)).toEqual(before);
  });
});
