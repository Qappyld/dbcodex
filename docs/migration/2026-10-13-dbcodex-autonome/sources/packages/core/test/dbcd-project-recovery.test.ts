import { readFile, readdir, symlink, rename } from "node:fs/promises";
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDbcdProject, openDbcdProject, restoreDbcdRevision, saveDbcdDraft, saveDbcdProject, type SaveCheckpoint } from "../src/dbcd-project-store.js";
import { emptyPresentation } from "../src/presentation.js";
import { fixtureSource, inspectDbcd, makeDbcdFixture } from "./support/dbcd-fixture.js";
import { makeTempWorkspace, removeTempWorkspace } from "./support/temp-workspace.js";

async function leaveHotJournal(path: string): Promise<void> {
  const child = fork(fileURLToPath(new URL("./support/leave-hot-journal.mjs", import.meta.url)), [path], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  try {
    await once(child, "message");
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }
}

describe("dbcd transactional recovery", () => {
  const roots: string[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(roots.splice(0).map(removeTempWorkspace));
  });

  const checkpoints: SaveCheckpoint[] = ["after-begin", "after-revision", "after-document", "before-commit"];
  it("recovers a real hot journal after a writer process is killed", async () => {
    const { input, root, path, snapshot } = await makeDbcdFixture(roots);
    await leaveHotJournal(path);
    expect((await readdir(root))).toContain("shop.dbcd-journal");
    const journal = await readFile(`${path}-journal`);
    expect(journal.subarray(0, 8).toString("hex")).toBe("d9d505f920a163d7");
    const raw = new DatabaseSync(path, { readOnly: true });
    try { expect(() => raw.prepare("SELECT generation FROM document_state").get()).toThrow(); }
    finally { raw.close(); }
    expect(await openDbcdProject(input)).toEqual(snapshot);
    expect(await readdir(root)).toEqual(["shop.dbcd"]);
    expect(inspectDbcd(path, (db) => db.prepare("PRAGMA quick_check").get()?.quick_check)).toBe("ok");
  });

  it.each(["future", "corrupt"])("preserves a %s project and its hot journal without writable recovery", async (kind) => {
    const { input, root, path } = await makeDbcdFixture(roots);
    inspectDbcd(path, (db) => db.exec(kind === "future" ? "PRAGMA user_version=99" : "UPDATE document_state SET source_hash='corrupt'"));
    await leaveHotJournal(path);
    const before = await readFile(path);
    const journal = await readFile(`${path}-journal`);
    await expect(openDbcdProject(input)).rejects.toMatchObject({ code: kind === "future" ? "READ_ONLY" : "CORRUPT_PROJECT" });
    expect((await readFile(path)).equals(before)).toBe(true);
    expect((await readFile(`${path}-journal`)).equals(journal)).toBe(true);
    expect((await readdir(root)).sort()).toEqual(["shop.dbcd", "shop.dbcd-journal"]);
  });

  it("rejects a journal link outside the workspace without modifying its target", async () => {
    const { input, root, path } = await makeDbcdFixture(roots);
    const outside = await makeTempWorkspace(roots);
    await leaveHotJournal(path);
    const target = join(outside, "private-journal");
    await rename(`${path}-journal`, target);
    await symlink(process.platform === "win32" ? outside : target, `${path}-journal`, process.platform === "win32" ? "junction" : "file");
    const before = await readFile(path);
    const journal = await readFile(target);
    await expect(openDbcdProject(input)).rejects.toMatchObject({ code: "PATH_CHANGED" });
    expect((await readFile(path)).equals(before)).toBe(true);
    expect((await readFile(target)).equals(journal)).toBe(true);
    expect((await readdir(root)).sort()).toEqual(["shop.dbcd", "shop.dbcd-journal"]);
  });
  it.each(checkpoints)("rolls back %s including revision, document, metadata and draft", async (checkpoint) => {
    const { input, root, path } = await makeDbcdFixture(roots);
    await saveDbcdDraft({ ...input, baseGeneration: 1, sourceText: "Table broken {", presentation: emptyPresentation() });
    const before = await openDbcdProject(input);
    const rowsBefore = inspectDbcd(path, (db) => ["project_meta", "document_state", "draft_state", "revisions"]
      .map((table) => db.prepare(`SELECT * FROM ${table}`).all()));
    const reached: SaveCheckpoint[] = [];
    await expect(saveDbcdProject({ ...input, expectedGeneration: 1, sourceText: `// update\n${fixtureSource}`, presentation: emptyPresentation(),
      now: () => "2027-01-01T10:00:00.000Z" }, {
      checkpoint(name) { reached.push(name); if (name === checkpoint) throw new Error("private checkpoint details"); },
    })).rejects.toMatchObject({ code: "WRITE_FAILED", message: "Unable to update the .dbcd project." });
    expect(reached).toContain(checkpoint);
    expect(await openDbcdProject(input)).toEqual(before);
    expect(inspectDbcd(path, (db) => ["project_meta", "document_state", "draft_state", "revisions"]
      .map((table) => db.prepare(`SELECT * FROM ${table}`).all()))).toEqual(rowsBefore);
    expect(await readdir(root)).toEqual(["shop.dbcd"]);
    // A failed writer must release the queue for the next save.
    expect(await saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation() })).toMatchObject({ generation: 2 });
  });

  it("explicitly rolls back before closing when COMMIT fails on runtimes without isTransaction", async () => {
    const { input } = await makeDbcdFixture(roots);
    const exec = DatabaseSync.prototype.exec;
    const close = DatabaseSync.prototype.close;
    const events: string[] = [];
    vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string) {
      if (["BEGIN IMMEDIATE", "COMMIT", "ROLLBACK"].includes(sql)) events.push(sql);
      if (sql === "COMMIT") throw new Error("commit failure");
      exec.call(this, sql);
    });
    vi.spyOn(DatabaseSync.prototype, "close").mockImplementation(function (this: DatabaseSync) {
      events.push("close");
      expect(this.prepare("SELECT generation FROM document_state").get()?.generation).toBe(1);
      close.call(this);
    });
    await expect(saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation() })).rejects.toMatchObject({ code: "WRITE_FAILED" });
    expect(events.slice(-4)).toEqual(["BEGIN IMMEDIATE", "COMMIT", "ROLLBACK", "close"]);
    vi.restoreAllMocks();
    expect(await openDbcdProject(input)).toMatchObject({ generation: 1 });
  });

  it("treats a compare-and-swap update count other than one as a conflict and rolls back the inserted revision", async () => {
    const { input } = await makeDbcdFixture(roots);
    const prepare = DatabaseSync.prototype.prepare;
    vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (this: DatabaseSync, sql: string) {
      const statement = prepare.call(this, sql);
      if (/UPDATE document_state/i.test(sql)) {
        vi.spyOn(statement, "run").mockReturnValue({ changes: 0, lastInsertRowid: 0 });
      }
      return statement;
    });
    await expect(saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation() })).rejects.toMatchObject({ code: "CONFLICT" });
    vi.restoreAllMocks();
    const reopened = await openDbcdProject(input);
    expect(reopened.generation).toBe(1);
    expect(reopened.revisions).toHaveLength(1);
  });

  it("restore uses the same rollback checkpoints as explicit save", async () => {
    const { input, snapshot } = await makeDbcdFixture(roots);
    await expect(restoreDbcdRevision({ ...input, revisionId: snapshot.currentRevisionId, expectedGeneration: 1 }, {
      checkpoint(name) { if (name === "after-document") throw new Error("interrupted restore"); },
    })).rejects.toMatchObject({ code: "WRITE_FAILED" });
    expect(await openDbcdProject(input)).toEqual(snapshot);
  });

  it("sanitizes rollback failure and closes the connection so the next writer can proceed", async () => {
    const { input, snapshot } = await makeDbcdFixture(roots);
    const exec = DatabaseSync.prototype.exec;
    vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string) {
      if (sql === "ROLLBACK" || sql === "COMMIT") throw new Error("private transaction failure");
      exec.call(this, sql);
    });
    await expect(saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation() }))
      .rejects.toMatchObject({ code: "WRITE_FAILED", message: "Unable to update the .dbcd project." });
    vi.restoreAllMocks();
    expect(await openDbcdProject(input)).toEqual(snapshot);
    expect(await saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation() })).toMatchObject({ generation: 2 });
  });

  it("rejects a reserved file replacement between read-only inspection and writable open", async () => {
    const { input, path } = await makeDbcdFixture(roots);
    const before = await readFile(path);
    const close = DatabaseSync.prototype.close;
    vi.spyOn(DatabaseSync.prototype, "close").mockImplementationOnce(function (this: DatabaseSync) {
      close.call(this);
      renameSync(path, `${path}.original`);
      writeFileSync(path, "replacement owned by someone else");
    });
    await expect(saveDbcdProject({ ...input, expectedGeneration: 1, presentation: emptyPresentation() }))
      .rejects.toMatchObject({ code: "PATH_CHANGED" });
    expect(await readFile(path, "utf8")).toBe("replacement owned by someone else");
    expect(await readFile(`${path}.original`)).toEqual(before);
  });

  it("rejects replacement by another valid project after the restore revision-read connection closes", async () => {
    const { input, path, root, snapshot } = await makeDbcdFixture(roots);
    const replacementPath = join(root, "replacement.dbcd");
    const replacement = await createDbcdProject({ ...input, projectPath: "replacement.dbcd",
      sourceText: "Table invoices { invoice_id int [pk] }\n", projectId: () => "project-b" });
    expect(replacement.generation).toBe(snapshot.generation);
    const originalBytes = await readFile(path);
    const replacementBytes = await readFile(replacementPath);
    const close = DatabaseSync.prototype.close;
    let replaced = false;
    vi.spyOn(DatabaseSync.prototype, "close").mockImplementationOnce(function (this: DatabaseSync) {
      close.call(this);
      renameSync(path, `${path}.original`);
      renameSync(replacementPath, path);
      replaced = true;
    });
    await expect(restoreDbcdRevision({ ...input, revisionId: snapshot.currentRevisionId, expectedGeneration: 1 }))
      .rejects.toMatchObject({ code: "PATH_CHANGED" });
    expect(replaced).toBe(true);
    expect(await readFile(`${path}.original`)).toEqual(originalBytes);
    expect(await readFile(path)).toEqual(replacementBytes);
    expect(await openDbcdProject(input)).toEqual({ ...replacement, projectPath: input.projectPath,
      graph: { ...replacement.graph, sourcePath: input.projectPath } });
    expect((await openDbcdProject(input)).revisions).toHaveLength(1);
  });
});
