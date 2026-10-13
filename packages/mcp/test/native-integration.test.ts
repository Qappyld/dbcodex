import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createDbcdProject, openDbcdProject, saveDbcdDraft, saveDbcdProject } from "@dbcodex/core";
import { createHandlers } from "../src/handlers.js";
import { createNativeIntegration } from "../src/native-integration.js";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });
async function setup() {
  root = await mkdtemp(join(tmpdir(), "dbcodex-native-"));
  const snapshot = await createDbcdProject({ workspaceRoot: root, projectPath: "demo.dbcd", sourceText: "// preserve\nTable users { id int [pk] }\n" });
  const handlers = createHandlers(root);
  return { snapshot, native: createNativeIntegration(async () => [root], handlers) };
}
it("launches without a path or source and maps only host paths inside roots", async () => {
  const { native } = await setup();
  expect(await native.launch()).toMatchObject({ structuredContent: { dbcodexLauncher: true } });
  const file = { file: { name: "demo.dbcd", resourceUri: "opaque://host/123" } };
  expect((await native.openFile(file, {})).isError).toBe(true);
  expect((await native.openFile(file, { "openai/resource": { path: join(root, "demo.dbcd") } })).isError).toBeUndefined();
  expect((await native.openFile(file, { "openai/resource": { path: join(root, "..", "foreign.dbcd") } })).isError).toBe(true);
  expect(JSON.stringify(await native.openFile(file, { "openai/resource": { path: "outside" } }))).not.toContain(root);
});
it("applies exact edits preserving comments and presentation, rejecting stale and ambiguous input", async () => {
  const { snapshot, native } = await setup();
  const args = { path: "demo.dbcd", expectedGeneration: snapshot.generation, expectedRevisionId: snapshot.currentRevisionId, expectedSourceHash: snapshot.sourceHash,
    edits: [{ search: "id int [pk]", replacement: "id bigint [pk]" }] };
  const saved = await native.edit(args);
  expect(saved.isError).toBeUndefined();
  const disk = await openDbcdProject({ workspaceRoot: root, projectPath: "demo.dbcd" });
  expect(disk.sourceText).toBe("// preserve\nTable users { id bigint [pk] }\n");
  expect(disk.presentation).toEqual(snapshot.presentation);
  expect(disk.generation).toBe(snapshot.generation + 1);
  expect(JSON.stringify(saved.structuredContent)).not.toContain("// preserve");
  expect((await native.edit(args)).isError).toBe(true);
  expect((await native.edit({ ...args, expectedGeneration: disk.generation, expectedRevisionId: disk.currentRevisionId, expectedSourceHash: disk.sourceHash,
    edits: [{ search: "absent", replacement: "x" }] })).isError).toBe(true);
});
it("refuses to replace a stored draft or save invalid DBML", async () => {
  const { snapshot, native } = await setup();
  const args = { path: "demo.dbcd", expectedGeneration: snapshot.generation, expectedRevisionId: snapshot.currentRevisionId, expectedSourceHash: snapshot.sourceHash,
    edits: [{ search: "Table users { id int [pk] }", replacement: "Table users {" }] };
  expect((await native.edit(args)).isError).toBe(true);
  await saveDbcdDraft({ workspaceRoot: root, projectPath: "demo.dbcd", expectedProjectId: snapshot.projectId,
    expectedRevisionId: snapshot.currentRevisionId, expectedGeneration: snapshot.generation, baseGeneration: snapshot.generation,
    sourceText: "// user's draft", presentation: snapshot.presentation });
  expect((await native.edit({ ...args, edits: [{ search: "int", replacement: "bigint" }] })).isError).toBe(true);
  // The transaction must also refuse a draft written after the external editor read.
  await expect(saveDbcdProject({ workspaceRoot: root, projectPath: "demo.dbcd", sourceText: snapshot.sourceText,
    presentation: snapshot.presentation, expectedProjectId: snapshot.projectId, expectedRevisionId: snapshot.currentRevisionId,
    expectedGeneration: snapshot.generation, rejectDraft: true })).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await openDbcdProject({ workspaceRoot: root, projectPath: "demo.dbcd" })).draft?.sourceText).toBe("// user's draft");
});
