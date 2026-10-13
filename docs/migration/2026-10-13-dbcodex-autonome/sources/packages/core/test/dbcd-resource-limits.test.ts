import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as parser from "../src/dbml-adapter.js";
import { createDbcdProject, openDbcdProject, readDbcdRevision, saveDbcdDraft, saveDbcdProject } from "../src/dbcd-project-store.js";
import { importDbmlProject } from "../src/dbcd-transfer.js";
import { hashDocument } from "../src/document-hash.js";
import { decodePresentation, emptyPresentation, encodePresentation } from "../src/presentation.js";
import { fixtureTimestamp, inspectDbcd, makeDbcdFixture } from "./support/dbcd-fixture.js";
import { removeTempWorkspace } from "./support/temp-workspace.js";

const LIMIT = 4 * 1024 * 1024;
describe("bounded project payloads", () => {
  const roots: string[] = [];
  afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(removeTempWorkspace)); });

  it.each(["create", "save", "draft"])("rejects oversized UTF-8 DBML before parsing or writing for %s", async (operation) => {
    const { input, path } = await makeDbcdFixture(roots);
    const before = await readFile(path);
    const parse = vi.spyOn(parser, "parseDbml");
    const selected = { ...input, sourceText: `// ${"é".repeat(LIMIT / 2)}`, presentation: emptyPresentation() };
    const result = operation === "create" ? createDbcdProject({ ...selected, projectPath: "new.dbcd" })
      : operation === "save" ? saveDbcdProject(selected) : saveDbcdDraft({ ...selected, baseGeneration: 1 });
    await expect(result).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    expect(parse).not.toHaveBeenCalled();
    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it("rejects oversized presentation JSON before JSON.parse", () => {
    const json = `{"padding":"${"x".repeat(LIMIT)}"}`;
    const parse = vi.spyOn(JSON, "parse");
    expect(() => decodePresentation(json)).toThrow(/size limit/i);
    expect(parse).not.toHaveBeenCalled();
  });

  it("rejects an oversized presentation object before schema cloning and compression", async () => {
    const { input, path } = await makeDbcdFixture(roots);
    const presentation = emptyPresentation();
    presentation.views.all!.name = "é".repeat(LIMIT / 2 + 1);
    const before = await readFile(path);
    expect(() => encodePresentation(presentation)).toThrow(/size limit/i);
    await expect(saveDbcdProject({ ...input, presentation })).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it.each(["document source", "document presentation", "draft source", "draft presentation"])("rejects oversized stored %s before payload retrieval", async (kind) => {
    const { input, path } = await makeDbcdFixture(roots);
    const draft = kind.startsWith("draft");
    const table = draft ? "draft_state" : "document_state";
    const column = kind.endsWith("source") ? "dbml_text" : "presentation_json";
    inspectDbcd(path, (db) => {
      if (draft) db.prepare("INSERT INTO draft_state VALUES(1, 1, '', ?, ?)").run(encodePresentation(emptyPresentation()), fixtureTimestamp);
      db.exec(`UPDATE ${table} SET ${column}=CAST(zeroblob(${LIMIT + 1}) AS TEXT)`);
    });
    const before = await readFile(path);
    const prepare = DatabaseSync.prototype.prepare;
    const payloadRead = vi.fn();
    vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (this: DatabaseSync, sql: string) {
      if (sql.includes(`SELECT * FROM ${table}`)) payloadRead();
      return prepare.call(this, sql);
    });
    await expect(openDbcdProject(input)).rejects.toMatchObject({ code: "CORRUPT_PROJECT" });
    expect(payloadRead).not.toHaveBeenCalled();
    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it.each(["dbml_gzip", "presentation_gzip"])("checks %s compressed length before retrieving blobs", async (column) => {
    const { input, path, snapshot } = await makeDbcdFixture(roots);
    inspectDbcd(path, (db) => db.exec(`UPDATE revisions SET ${column}=zeroblob(${LIMIT + 1})`));
    const before = await readFile(path);
    const prepare = DatabaseSync.prototype.prepare;
    const payloadRead = vi.fn();
    vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (this: DatabaseSync, sql: string) {
      if (/SELECT dbml_gzip, presentation_gzip/i.test(sql)) payloadRead();
      return prepare.call(this, sql);
    });
    await expect(readDbcdRevision({ ...input, revisionId: snapshot.currentRevisionId })).rejects.toMatchObject({ code: "CORRUPT_PROJECT" });
    expect(payloadRead).not.toHaveBeenCalled();
    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it.each(["dbml_gzip", "presentation_gzip"])("bounds %s decompression before parsing even when hashes match", async (column) => {
    const { input, path, snapshot } = await makeDbcdFixture(roots);
    const text = column === "dbml_gzip" ? `// ${"x".repeat(LIMIT)}\n` : `${" ".repeat(LIMIT)}${encodePresentation(emptyPresentation())}`;
    inspectDbcd(path, (db) => db.prepare(`UPDATE revisions SET ${column}=?, ${column === "dbml_gzip" ? "source_hash" : "presentation_hash"}=?`)
      .run(gzipSync(text), hashDocument(text)));
    const before = await readFile(path);
    await expect(readDbcdRevision({ ...input, revisionId: snapshot.currentRevisionId })).rejects.toMatchObject({ code: "CORRUPT_PROJECT" });
    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it("rejects oversized DBML import before reading/parsing it", async () => {
    const { input, root } = await makeDbcdFixture(roots);
    await writeFile(join(root, "huge.dbml"), `// ${"x".repeat(LIMIT)}`);
    const parse = vi.spyOn(parser, "parseDbml");
    await expect(importDbmlProject({ workspaceRoot: input.workspaceRoot, sourcePath: "huge.dbml", projectPath: "import.dbcd" }))
      .rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    expect(parse).not.toHaveBeenCalled();
  });
});
