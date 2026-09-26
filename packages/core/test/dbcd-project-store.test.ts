import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, symlink, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as paths from "../src/dbcd-path-policy.js";
import { createDbcdProject, openDbcdProject, DbcdProjectStoreError } from "../src/dbcd-project-store.js";
import { DBCD_FORMAT_VERSION } from "../src/dbcd-schema.js";
import { hashDocument } from "../src/document-hash.js";
import { emptyPresentation, encodePresentation } from "../src/presentation.js";
import { fixtureSource, fixtureTimestamp, inspectDbcd, makeDbcdFixture } from "./support/dbcd-fixture.js";
import { makeTempWorkspace, removeTempWorkspace } from "./support/temp-workspace.js";

describe("dbcd project store", () => {
  const roots: string[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(roots.splice(0).map(removeTempWorkspace));
  });

  it("creates one stable file and round-trips exact source with an initial revision", async () => {
    const { root, input, path, snapshot } = await makeDbcdFixture(roots);
    const presentation = encodePresentation(emptyPresentation());
    const revisionId = createHash("sha256")
      .update(`${fixtureTimestamp}\0${hashDocument(fixtureSource)}\0${hashDocument(presentation)}`).digest("hex");
    expect(snapshot).toMatchObject({
      projectId: "project-1", projectPath: "shop.dbcd", generation: 1,
      sourceText: fixtureSource, currentRevisionId: revisionId, draft: null, readOnly: false,
      sourceHash: hashDocument(fixtureSource), presentation: emptyPresentation(), diagnostics: [],
    });
    expect(snapshot.graph?.tables[0]?.id).toBe("public.users");
    expect(snapshot.revisions).toEqual([{
      id: revisionId, parentId: null, createdAt: fixtureTimestamp,
      sourceHash: hashDocument(fixtureSource), presentationHash: hashDocument(presentation),
      summary: "Initial revision", pinned: false,
    }]);
    expect(await openDbcdProject(input)).toEqual(snapshot);
    expect((await readdir(root)).sort()).toEqual(["shop.dbcd"]);
    inspectDbcd(path, (db) => {
      expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(DBCD_FORMAT_VERSION);
      const tables = db.prepare("SELECT name, strict FROM pragma_table_list WHERE name NOT LIKE 'sqlite_%'").all();
      expect(tables.map((row) => row.name).sort()).toEqual(["document_state", "draft_state", "project_meta", "revisions"]);
      expect(tables.every((row) => row.strict === 1)).toBe(true);
      const row = db.prepare("SELECT * FROM revisions").get()!;
      expect(gunzipSync(row.dbml_gzip as Uint8Array).toString()).toBe(fixtureSource);
      expect(gunzipSync(row.presentation_gzip as Uint8Array).toString()).toBe(presentation);
    });
  });

  it("configures verified pragmas and rejects extension loading on store connections", async () => {
    const close = DatabaseSync.prototype.close;
    let checked = 0;
    vi.spyOn(DatabaseSync.prototype, "close").mockImplementation(function (this: DatabaseSync) {
      expect(this.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
      expect(this.prepare("PRAGMA journal_mode").get()?.journal_mode).toBe("delete");
      expect(this.prepare("PRAGMA synchronous").get()?.synchronous).toBe(2);
      expect(this.prepare("PRAGMA busy_timeout").get()?.timeout).toBe(2000);
      expect(() => this.prepare("SELECT load_extension('untrusted')").get()).toThrow(/not authorized/i);
      expect(() => this.enableLoadExtension(true)).toThrow();
      checked++;
      close.call(this);
    });
    const { input } = await makeDbcdFixture(roots);
    await openDbcdProject(input);
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  it("preserves custom presentation and source whitespace", async () => {
    const root = await makeTempWorkspace(roots);
    const presentation = emptyPresentation();
    presentation.views.all!.nodes["public.users"] = { x: 42, y: -7 };
    const sourceText = `// café\r\n${fixtureSource}\n`;
    const input = { workspaceRoot: root, projectPath: "custom.dbcd", sourceText, presentation };
    await createDbcdProject(input);
    expect(await openDbcdProject(input)).toMatchObject({ sourceText, presentation });
  });

  it("validates DBML before touching the workspace", async () => {
    const root = await makeTempWorkspace(roots);
    await expect(createDbcdProject({ workspaceRoot: root, projectPath: "bad.dbcd", sourceText: "Table {" }))
      .rejects.toMatchObject({ code: "INVALID_DBML" });
    expect(await readdir(root)).toEqual([]);
  });

  it("never overwrites an existing destination", async () => {
    const { input, path } = await makeDbcdFixture(roots);
    const before = await readFile(path);
    await expect(createDbcdProject(input)).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(await readFile(path)).toEqual(before);
  });

  it("reserves exclusively when another file appears after new-path resolution", async () => {
    const root = await makeTempWorkspace(roots);
    const resolve = paths.resolveNewDbcd;
    vi.spyOn(paths, "resolveNewDbcd").mockImplementationOnce(async (...args) => {
      const result = await resolve(...args);
      await writeFile(result.absolutePath, "belongs to someone else");
      return result;
    });
    await expect(createDbcdProject({ workspaceRoot: root, projectPath: "shop.dbcd", sourceText: fixtureSource }))
      .rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(await readFile(join(root, "shop.dbcd"), "utf8")).toBe("belongs to someone else");
  });

  it("rejects replacement of the reserved regular file and preserves its replacement", async () => {
    const root = await makeTempWorkspace(roots);
    const resolve = paths.resolveExistingDbcd;
    vi.spyOn(paths, "resolveExistingDbcd").mockImplementationOnce(async (...args) => {
      const result = await resolve(...args);
      await unlink(result.absolutePath);
      await writeFile(result.absolutePath, "replacement");
      return result;
    });
    await expect(createDbcdProject({ workspaceRoot: root, projectPath: "shop.dbcd", sourceText: fixtureSource }))
      .rejects.toMatchObject({ code: "PATH_CHANGED" });
    expect(await readFile(join(root, "shop.dbcd"), "utf8")).toBe("replacement");
  });

  it("rechecks confinement before reserving when a parent becomes a junction", async () => {
    const root = await makeTempWorkspace(roots);
    const outside = await makeTempWorkspace(roots);
    await mkdir(join(root, "projects"));
    const resolve = paths.resolveNewDbcd;
    vi.spyOn(paths, "resolveNewDbcd").mockImplementationOnce(async (...args) => {
      const result = await resolve(...args);
      await rename(join(root, "projects"), join(root, "original"));
      await symlink(outside, join(root, "projects"), process.platform === "win32" ? "junction" : "dir");
      return result;
    });
    await expect(createDbcdProject({ workspaceRoot: root, projectPath: "projects/shop.dbcd", sourceText: fixtureSource }))
      .rejects.toMatchObject({ code: "OUTSIDE_WORKSPACE" });
    expect(await readdir(outside)).toEqual([]);
  });

  it("rolls back and removes only its reserved file when initialization fails", async () => {
    const root = await makeTempWorkspace(roots);
    const exec = DatabaseSync.prototype.exec;
    vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string) {
      if (sql === "COMMIT") throw new Error("private implementation details");
      return exec.call(this, sql);
    });
    await expect(createDbcdProject({ workspaceRoot: root, projectPath: "shop.dbcd", sourceText: fixtureSource }))
      .rejects.toMatchObject({ code: "CREATE_FAILED", message: "Unable to create the .dbcd project." });
    expect(await readdir(root)).toEqual([]);
  });

  it("sanitizes rollback failures and still closes and removes its file", async () => {
    const root = await makeTempWorkspace(roots);
    const exec = DatabaseSync.prototype.exec;
    vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string) {
      if (sql === "COMMIT" || sql === "ROLLBACK") throw new Error("private transaction details");
      return exec.call(this, sql);
    });
    await expect(createDbcdProject({ workspaceRoot: root, projectPath: "shop.dbcd", sourceText: fixtureSource }))
      .rejects.toMatchObject({ code: "CREATE_FAILED", message: "Unable to create the .dbcd project." });
    expect(await readdir(root)).toEqual([]);
  });

  it("opens a future user_version read-only without changing any bytes", async () => {
    const { input, path } = await makeDbcdFixture(roots);
    inspectDbcd(path, (db) => db.exec("PRAGMA user_version=99"));
    const before = await readFile(path);
    expect(await openDbcdProject(input)).toMatchObject({ readOnly: true, sourceText: fixtureSource });
    expect(await readFile(path)).toEqual(before);
  });

  it.each(["DROP TABLE draft_state", "DELETE FROM project_meta", "UPDATE project_meta SET format_version=0"])
    ("rejects a database with missing tables or invalid metadata: %s", async (sql) => {
      const { input, path } = await makeDbcdFixture(roots);
      inspectDbcd(path, (db) => db.exec(sql));
      const before = await readFile(path);
      await expect(openDbcdProject(input)).rejects.toMatchObject({ code: "NOT_DBCD" });
      expect(await readFile(path)).toEqual(before);
    });

  it("reports sanitized errors for non-SQLite input", async () => {
    const root = await makeTempWorkspace(roots);
    await writeFile(join(root, "bad.dbcd"), "private content");
    const result = openDbcdProject({ workspaceRoot: root, projectPath: "bad.dbcd" });
    await expect(result).rejects.toBeInstanceOf(DbcdProjectStoreError);
    await expect(result).rejects.toMatchObject({ code: "CORRUPT_PROJECT", message: "Unable to read the .dbcd project." });
  });

  it.each([
    "UPDATE document_state SET dbml_text='Table {'",
    "UPDATE document_state SET presentation_json='{}'",
    "UPDATE document_state SET source_hash='wrong'",
    "UPDATE document_state SET presentation_hash='wrong'",
    "DELETE FROM document_state",
  ])("rejects corrupt document state without rewriting it: %s", async (sql) => {
    const { input, path } = await makeDbcdFixture(roots);
    inspectDbcd(path, (db) => db.exec(sql));
    const before = await readFile(path);
    await expect(openDbcdProject(input)).rejects.toMatchObject({ code: "CORRUPT_PROJECT" });
    expect(await readFile(path)).toEqual(before);
  });

  it("lists revision summaries without decompressing history blobs", async () => {
    const { input, path, snapshot } = await makeDbcdFixture(roots);
    inspectDbcd(path, (db) => db.exec("UPDATE revisions SET dbml_gzip=x'00', presentation_gzip=x'00'"));
    expect((await openDbcdProject(input)).revisions).toEqual(snapshot.revisions);
  });

  it("rejects invalid DBML even when its stored hash matches", async () => {
    const { input, path } = await makeDbcdFixture(roots);
    inspectDbcd(path, (db) => db.prepare("UPDATE document_state SET dbml_text=?, source_hash=?")
      .run("Table {", hashDocument("Table {")));
    await expect(openDbcdProject(input)).rejects.toMatchObject({ code: "CORRUPT_PROJECT" });
  });

  it("returns a persisted draft while keeping the valid document authoritative", async () => {
    const { input, path } = await makeDbcdFixture(roots);
    inspectDbcd(path, (db) => db.prepare("INSERT INTO draft_state VALUES (1, 1, ?, ?, ?)")
      .run("Table {", encodePresentation(emptyPresentation()), fixtureTimestamp));
    expect(await openDbcdProject(input)).toMatchObject({
      sourceText: fixtureSource,
      draft: { baseGeneration: 1, sourceText: "Table {", presentation: emptyPresentation(), updatedAt: fixtureTimestamp },
    });
  });
});
