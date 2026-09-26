import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  discardDbcdDraft, listDbcdRevisions, openDbcdProject, readDbcdRevision,
  restoreDbcdRevision, saveDbcdDraft, saveDbcdProject, setDbcdRevisionPinned,
} from "../src/dbcd-project-store.js";
import { emptyPresentation } from "../src/presentation.js";
import { fixtureSource, inspectDbcd, makeDbcdFixture } from "./support/dbcd-fixture.js";
import { removeTempWorkspace } from "./support/temp-workspace.js";

describe("dbcd drafts and history", () => {
  const roots: string[] = [];
  afterEach(async () => { await Promise.all(roots.splice(0).map(removeTempWorkspace)); });

  it("persists invalid drafts without changing the saved document or revision count", async () => {
    const { input, snapshot } = await makeDbcdFixture(roots);
    await saveDbcdDraft({ ...input, baseGeneration: 1, sourceText: "Table broken {", presentation: emptyPresentation() });
    await saveDbcdDraft({ ...input, baseGeneration: 1, sourceText: "Table unfinished {", presentation: emptyPresentation() });
    const reopened = await openDbcdProject(input);
    expect(reopened).toMatchObject({ generation: 1, sourceText: fixtureSource,
      draft: { baseGeneration: 1, sourceText: "Table unfinished {", presentation: emptyPresentation() } });
    expect(reopened.revisions).toEqual(snapshot.revisions);
    expect(reopened.graph).toEqual(snapshot.graph);
  });

  it("rejects invalid DBML on explicit save and preserves the draft", async () => {
    const { input } = await makeDbcdFixture(roots);
    await saveDbcdDraft({ ...input, baseGeneration: 1, sourceText: "Table broken {", presentation: emptyPresentation() });
    const before = await openDbcdProject(input);
    await expect(saveDbcdProject({ ...input, expectedGeneration: 1, sourceText: "Table broken {", presentation: emptyPresentation() }))
      .rejects.toMatchObject({ code: "INVALID_DBML" });
    expect(await openDbcdProject(input)).toEqual(before);
  });

  it("saves exactly one compressed revision, increments generation, updates metadata and clears draft", async () => {
    const { input, snapshot, path } = await makeDbcdFixture(roots);
    await saveDbcdDraft({ ...input, baseGeneration: 1, presentation: emptyPresentation() });
    const presentation = emptyPresentation();
    presentation.views.all!.nodes["public.users"] = { x: 8, y: 19 };
    const sourceText = `// café\r\n${fixtureSource}\n`;
    const saved = await saveDbcdProject({ ...input, expectedGeneration: 1, sourceText, presentation,
      label: "Release '1'", now: () => "2026-09-27T10:00:00.000Z" });
    expect(saved).toMatchObject({ generation: 2, draft: null, sourceText, presentation });
    expect(saved.revisions).toHaveLength(2);
    expect(saved.revisions[0]).toMatchObject({ id: saved.currentRevisionId, parentId: snapshot.currentRevisionId, label: "Release '1'" });
    expect(await readDbcdRevision({ ...input, revisionId: saved.currentRevisionId })).toMatchObject({ sourceText, presentation });
    expect(await openDbcdProject(input)).toEqual(saved);
    inspectDbcd(path, (db) => expect(db.prepare("SELECT updated_at FROM project_meta").get()?.updated_at).toBe("2026-09-27T10:00:00.000Z"));
  });

  it("gives successive identical saves distinct IDs even at the same timestamp", async () => {
    const { input } = await makeDbcdFixture(roots);
    const second = await saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation() });
    const third = await saveDbcdProject({ ...input, expectedGeneration: 2, expectedRevisionId: second.currentRevisionId, presentation: emptyPresentation() });
    expect(new Set(third.revisions.map((revision) => revision.id)).size).toBe(3);
    expect(third.revisions[0]?.id).toBe(third.currentRevisionId);
    expect(third.revisions[1]?.id).toBe(second.currentRevisionId);
  });

  it("refuses stale saves, drafts and discards without changing the current document or draft", async () => {
    const { input } = await makeDbcdFixture(roots);
    const saved = await saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation() });
    await saveDbcdDraft({ ...input, expectedGeneration: 2, expectedRevisionId: saved.currentRevisionId,
      baseGeneration: 2, sourceText: "latest draft", presentation: emptyPresentation() });
    const before = await openDbcdProject(input);
    await expect(saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation() })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(saveDbcdDraft({ ...input, baseGeneration: 1, presentation: emptyPresentation() })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(discardDbcdDraft({ ...input, expectedGeneration: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await openDbcdProject(input)).toEqual(before);
  });

  it("discards a draft without a new revision and is idempotent", async () => {
    const { input, snapshot } = await makeDbcdFixture(roots);
    await saveDbcdDraft({ ...input, baseGeneration: 1, presentation: emptyPresentation() });
    await discardDbcdDraft({ ...input, expectedGeneration: 1 });
    await discardDbcdDraft({ ...input, expectedGeneration: 1 });
    expect(await openDbcdProject(input)).toEqual(snapshot);
  });

  it.each(["draft", "save"])("validates presentation for %s before mutation", async (operation) => {
    const { input, path } = await makeDbcdFixture(roots);
    const presentation = emptyPresentation();
    presentation.panels.editor = -1;
    const before = await readFile(path);
    const result = operation === "draft"
      ? saveDbcdDraft({ ...input, baseGeneration: 1, presentation })
      : saveDbcdProject({ ...input, expectedGeneration: 1, presentation });
    await expect(result).rejects.toMatchObject({ code: "INVALID_PRESENTATION" });
    expect(await readFile(path)).toEqual(before);
  });

  it("serializes concurrent writers so only one save of a generation succeeds", async () => {
    const { input } = await makeDbcdFixture(roots);
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => saveDbcdProject({
      ...input, sourceText: `// save ${i}\n${fixtureSource}`, expectedGeneration: 1, presentation: emptyPresentation(),
    })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected").map((result) => result.reason.code)).toEqual(Array(4).fill("CONFLICT"));
    expect(await openDbcdProject(input)).toMatchObject({ generation: 2 });
    expect(await listDbcdRevisions(input)).toHaveLength(2);
  });

  it("lists metadata newest first without reading corrupt payloads", async () => {
    const { input, path } = await makeDbcdFixture(roots);
    const saved = await saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation(), now: () => "2026-09-27T10:00:00.000Z" });
    inspectDbcd(path, (db) => db.exec("UPDATE revisions SET dbml_gzip=x'00', presentation_gzip=x'00'"));
    expect(await listDbcdRevisions(input)).toEqual(saved.revisions);
  });

  it("pinning changes only pinned and leaves payloads, metadata, draft and generation untouched", async () => {
    const { input, path, snapshot } = await makeDbcdFixture(roots);
    await saveDbcdDraft({ ...input, baseGeneration: 1, presentation: emptyPresentation() });
    const before = inspectDbcd(path, (db) => db.prepare("SELECT * FROM revisions").get());
    const saved = await openDbcdProject(input);
    await setDbcdRevisionPinned({ ...input, revisionId: snapshot.currentRevisionId, pinned: true });
    expect(inspectDbcd(path, (db) => db.prepare("SELECT * FROM revisions").get())).toEqual({ ...before, pinned: 1 });
    expect(await openDbcdProject(input)).toEqual({ ...saved, revisions: [{ ...saved.revisions[0], pinned: true }] });
    await setDbcdRevisionPinned({ ...input, revisionId: snapshot.currentRevisionId, pinned: false });
    expect(await openDbcdProject(input)).toEqual(saved);
  });

  it("restores both source and presentation as a new child of the current revision", async () => {
    const { input, path, snapshot } = await makeDbcdFixture(roots);
    const presentation = emptyPresentation();
    presentation.panels.editor = 555;
    const saved = await saveDbcdProject({ ...input, sourceText: `// change\n${fixtureSource}`, presentation, expectedGeneration: 1 });
    const before = inspectDbcd(path, (db) => db.prepare("SELECT * FROM revisions ORDER BY rowid").all());
    const restored = await restoreDbcdRevision({ ...input, revisionId: snapshot.currentRevisionId, expectedGeneration: 2, expectedRevisionId: saved.currentRevisionId });
    expect(restored).toMatchObject({ generation: 3, sourceText: fixtureSource, presentation: emptyPresentation() });
    expect(restored.revisions).toHaveLength(3);
    expect(restored.revisions[0]).toMatchObject({ parentId: saved.currentRevisionId, summary: `Restauration de ${snapshot.currentRevisionId.slice(0, 8)}` });
    expect(inspectDbcd(path, (db) => db.prepare("SELECT * FROM revisions ORDER BY rowid LIMIT 2").all())).toEqual(before);
    await expect(restoreDbcdRevision({ ...input, revisionId: saved.currentRevisionId, expectedGeneration: 2 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each(["read", "restore", "pin"])("reports a missing revision for %s without mutations", async (operation) => {
    const { input, snapshot } = await makeDbcdFixture(roots);
    const selected = { ...input, revisionId: "missing ' revision" };
    const result = operation === "read" ? readDbcdRevision(selected) : operation === "restore"
      ? restoreDbcdRevision({ ...selected, expectedGeneration: 1 }) : setDbcdRevisionPinned({ ...selected, pinned: true });
    await expect(result).rejects.toMatchObject({ code: "REVISION_NOT_FOUND" });
    expect(await openDbcdProject(input)).toEqual(snapshot);
  });

  it.each(["dbml_gzip", "presentation_gzip"])("checks the decompressed %s hash", async (column) => {
    const { input, path, snapshot } = await makeDbcdFixture(roots);
    inspectDbcd(path, (db) => db.prepare(`UPDATE revisions SET ${column}=?`).run(gzipSync("modified payload")));
    await expect(readDbcdRevision({ ...input, revisionId: snapshot.currentRevisionId })).rejects.toMatchObject({ code: "CORRUPT_PROJECT" });
    await expect(restoreDbcdRevision({ ...input, revisionId: snapshot.currentRevisionId, expectedGeneration: 1 })).rejects.toMatchObject({ code: "CORRUPT_PROJECT" });
    expect(await openDbcdProject(input)).toEqual(snapshot);
  });

  it("prunes old unpinned history while retaining pinned and current snapshots and valid references", async () => {
    const { input, path, snapshot } = await makeDbcdFixture(roots);
    await setDbcdRevisionPinned({ ...input, revisionId: snapshot.currentRevisionId, pinned: true });
    const old = await saveDbcdProject({ ...input, presentation: emptyPresentation(), expectedGeneration: 1 });
    const current = await saveDbcdProject({ ...input, presentation: emptyPresentation(), expectedGeneration: 2, expectedRevisionId: old.currentRevisionId,
      now: () => "2027-01-01T10:00:00.000Z" });
    expect(current.revisions.map((revision) => revision.id)).toEqual([current.currentRevisionId, snapshot.currentRevisionId]);
    expect(current.revisions.find((revision) => revision.id === old.currentRevisionId)).toBeUndefined();
    expect(await readDbcdRevision({ ...input, revisionId: snapshot.currentRevisionId })).toMatchObject({ sourceText: fixtureSource });
    expect(inspectDbcd(path, (db) => db.prepare("PRAGMA foreign_key_check").all())).toEqual([]);
  });

  it("prunes oldest unpinned entries above 500 and retains the current revision even with a backdated clock", async () => {
    const { input, path, snapshot } = await makeDbcdFixture(roots);
    // Seed realistic parent links cheaply; the store performs the actual retention transaction.
    inspectDbcd(path, (db) => {
      db.exec("BEGIN");
      const insert = db.prepare(`INSERT INTO revisions SELECT ?, ?, created_at, dbml_gzip, presentation_gzip,
        source_hash, presentation_hash, summary, label, ? FROM revisions WHERE id=?`);
      let parent = snapshot.currentRevisionId;
      for (let i = 0; i < 505; i++) {
        const id = `seed-${i}`;
        insert.run(id, parent, i < 2 ? 1 : 0, snapshot.currentRevisionId);
        parent = id;
      }
      db.exec("COMMIT");
    });
    const saved = await saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation(),
      now: () => "2026-09-25T10:00:00.000Z" });
    expect(saved.revisions).toHaveLength(500);
    expect(saved.revisions.some((revision) => revision.id === saved.currentRevisionId)).toBe(true);
    expect(saved.revisions.filter((revision) => revision.pinned).map((revision) => revision.id).sort()).toEqual(["seed-0", "seed-1"]);
    expect(saved.revisions.some((revision) => revision.id === "seed-2")).toBe(false);
    expect(inspectDbcd(path, (db) => db.prepare("PRAGMA foreign_key_check").all())).toEqual([]);
  });

  it("retention detaches only the first retained child and preserves all retained snapshot bytes and hashes", async () => {
    const { input, path } = await makeDbcdFixture(roots);
    const first = await saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation(),
      now: () => "2026-12-01T10:00:00.000Z" });
    const second = await saveDbcdProject({ ...input, expectedGeneration: 2, expectedRevisionId: first.currentRevisionId, presentation: emptyPresentation(),
      now: () => "2026-12-02T10:00:00.000Z" });
    const before = inspectDbcd(path, (db) => db.prepare("SELECT * FROM revisions WHERE id IN (?, ?) ORDER BY rowid")
      .all(first.currentRevisionId, second.currentRevisionId));
    await saveDbcdProject({ ...input, expectedGeneration: 3, expectedRevisionId: second.currentRevisionId, presentation: emptyPresentation(),
      now: () => "2027-01-01T10:00:00.000Z" });
    const after = inspectDbcd(path, (db) => db.prepare("SELECT * FROM revisions WHERE id IN (?, ?) ORDER BY rowid")
      .all(first.currentRevisionId, second.currentRevisionId));
    expect(after).toEqual([{ ...before[0], parent_id: null }, before[1]]);
  });

  it.each(["save", "draft", "discard", "pin", "restore"])("rejects %s on future formats without changing bytes", async (operation) => {
    const { input, path, snapshot } = await makeDbcdFixture(roots);
    inspectDbcd(path, (db) => db.exec("PRAGMA user_version=99"));
    const before = await readFile(path);
    const selected = { ...input, revisionId: snapshot.currentRevisionId, expectedGeneration: 1, presentation: emptyPresentation() };
    const result = operation === "save" ? saveDbcdProject(selected)
      : operation === "draft" ? saveDbcdDraft({ ...selected, baseGeneration: 1 })
      : operation === "discard" ? discardDbcdDraft(selected)
      : operation === "pin" ? setDbcdRevisionPinned({ ...selected, pinned: true }) : restoreDbcdRevision(selected);
    await expect(result).rejects.toMatchObject({ code: "READ_ONLY" });
    expect(await readFile(path)).toEqual(before);
  });
});
