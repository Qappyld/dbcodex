import { createHash, randomUUID } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, realpathSync, unlinkSync, type BigIntStats } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";
import { parseDbml } from "./dbml-adapter.js";
import { DbcdPathPolicyError, resolveExistingDbcd, resolveNewDbcd, type ResolvedDbcdPath } from "./dbcd-path-policy.js";
import { DBCD_FORMAT_VERSION, DBCD_SCHEMA_SQL } from "./dbcd-schema.js";
import type { DbcdProjectSnapshot, DbcdRevisionSnapshot, DbcdRevisionSummary, SaveDbcdInput } from "./document-contract.js";
import { hashDocument } from "./document-hash.js";
import { decodePresentation, emptyPresentation, encodePresentation, type PresentationDocument } from "./presentation.js";

export type DbcdProjectStoreCode = "INVALID_DBML" | "INVALID_PRESENTATION" | "NOT_DBCD" | "CORRUPT_PROJECT"
  | "CREATE_FAILED" | "PATH_CHANGED" | "CONFLICT" | "READ_ONLY" | "REVISION_NOT_FOUND" | "WRITE_FAILED";

export class DbcdProjectStoreError extends Error {
  constructor(public readonly code: DbcdProjectStoreCode, message: string) {
    super(message);
    this.name = "DbcdProjectStoreError";
  }
}

export interface OpenDbcdProjectInput {
  workspaceRoot: string;
  projectPath: string;
}

export interface CreateDbcdProjectInput extends OpenDbcdProjectInput {
  sourceText: string;
  presentation?: PresentationDocument;
  now?: () => string;
  projectId?: () => string;
}

export interface SaveDbcdDraftInput extends OpenDbcdProjectInput {
  baseGeneration: number;
  sourceText: string;
  presentation: PresentationDocument;
  now?: () => string;
}

export interface DiscardDbcdDraftInput extends OpenDbcdProjectInput {
  expectedGeneration: number;
}

export interface ReadDbcdRevisionInput extends OpenDbcdProjectInput {
  revisionId: string;
}

export interface RestoreDbcdRevisionInput extends ReadDbcdRevisionInput {
  expectedGeneration: number;
  now?: () => string;
}

export interface SetDbcdRevisionPinnedInput extends ReadDbcdRevisionInput {
  pinned: boolean;
}

export type SaveCheckpoint = "after-begin" | "after-revision" | "after-document" | "before-commit";
/** Fault injection for transaction recovery tests; never supplied by tool clients. */
export interface DbcdStoreTestHooks { checkpoint?(name: SaveCheckpoint): void; }

const projectQueues = new Map<string, Promise<void>>();

async function withProjectWrite<T>(path: string, action: () => T): Promise<T> {
  const previous = projectQueues.get(path) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  projectQueues.set(path, current);
  await previous;
  try { return action(); }
  finally {
    release();
    if (projectQueues.get(path) === current) projectQueues.delete(path);
  }
}

function openConnection(path: string, readOnly: boolean): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly });
  try {
    db.enableLoadExtension(false);
    db.exec("PRAGMA busy_timeout=2000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;");
    if (db.prepare("PRAGMA foreign_keys").get()?.foreign_keys !== 1
      || db.prepare("PRAGMA journal_mode").get()?.journal_mode !== "delete"
      || db.prepare("PRAGMA synchronous").get()?.synchronous !== 2
      || db.prepare("PRAGMA busy_timeout").get()?.timeout !== 2000) {
      throw new Error("Unexpected SQLite settings.");
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

const nonEmpty = z.string().trim().min(1);
const timestamp = z.iso.datetime();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const metadataSchema = z.object({
  id: z.literal(1), format_version: z.number().int().positive(), project_id: nonEmpty,
  created_at: timestamp, updated_at: timestamp,
});
const documentSchema = z.object({
  id: z.literal(1), dbml_text: z.string(), source_hash: hash,
  presentation_json: z.string(), presentation_hash: hash,
  generation: z.number().int().positive(), current_revision_id: nonEmpty,
});
const revisionSchema = z.object({
  id: nonEmpty, parent_id: nonEmpty.nullable(), created_at: timestamp,
  source_hash: hash, presentation_hash: hash, summary: z.string(), label: z.string().nullable(),
  pinned: z.union([z.literal(0), z.literal(1)]),
});
const draftSchema = z.object({
  id: z.literal(1), base_generation: z.number().int().positive(), dbml_text: z.string(),
  presentation_json: z.string(), updated_at: timestamp,
});

function readSnapshot(db: DatabaseSync, projectPath: string): DbcdProjectSnapshot {
  const version = db.prepare("PRAGMA user_version").get()?.user_version;
  const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map((row) => row.name));
  if (typeof version !== "number" || version < 1
    || !["project_meta", "document_state", "revisions", "draft_state"].every((name) => tables.has(name))) {
    throw new DbcdProjectStoreError("NOT_DBCD", "The file is not a supported .dbcd project.");
  }
  let projectId: string;
  try {
    const metadata = z.array(metadataSchema).length(1).parse(db.prepare("SELECT * FROM project_meta").all())[0]!;
    if (metadata.format_version > version) throw new Error("Invalid format version.");
    projectId = metadata.project_id;
  } catch {
    throw new DbcdProjectStoreError("NOT_DBCD", "The file is not a supported .dbcd project.");
  }
  const document = z.array(documentSchema).length(1).parse(db.prepare("SELECT * FROM document_state").all())[0]!;
  const presentation = decodePresentation(document.presentation_json);
  if (hashDocument(document.dbml_text) !== document.source_hash
    || hashDocument(encodePresentation(presentation)) !== document.presentation_hash) {
    throw new Error("Invalid document hashes.");
  }
  const parsed = parseDbml(document.dbml_text, projectPath);
  if (!parsed.graph) throw new Error("Invalid document source.");
  // Listing history deliberately never reads or decompresses revision payloads.
  const revisions = z.array(revisionSchema).parse(db.prepare(`
    SELECT id, parent_id, created_at, source_hash, presentation_hash, summary, label, pinned
    FROM revisions ORDER BY created_at DESC, rowid DESC
  `).all()).map((row) => ({
    id: row.id, parentId: row.parent_id, createdAt: row.created_at,
    sourceHash: row.source_hash, presentationHash: row.presentation_hash,
    summary: row.summary, ...(row.label === null ? {} : { label: row.label }), pinned: row.pinned === 1,
  }));
  if (!revisions.some((row) => row.id === document.current_revision_id)
    || db.prepare("PRAGMA foreign_key_check").all().length > 0) {
    throw new Error("Invalid revision references.");
  }
  const drafts = z.array(draftSchema).max(1).parse(db.prepare("SELECT * FROM draft_state").all());
  const draft = drafts[0];
  return {
    projectPath, projectId, generation: document.generation,
    currentRevisionId: document.current_revision_id, sourceText: document.dbml_text,
    sourceHash: document.source_hash, graph: parsed.graph, diagnostics: parsed.diagnostics,
    presentation, revisions, readOnly: version > DBCD_FORMAT_VERSION,
    draft: draft ? {
      baseGeneration: draft.base_generation, sourceText: draft.dbml_text,
      presentation: decodePresentation(draft.presentation_json), updatedAt: draft.updated_at,
    } : null,
  };
}

function revisionId(createdAt: string, sourceHash: string, presentationHash: string, parentId?: string): string {
  const identity = `${createdAt}\0${sourceHash}\0${presentationHash}`;
  // Parent identity distinguishes repeated saves of unchanged content at the same clock tick.
  return createHash("sha256").update(parentId === undefined ? identity : `${identity}\0${parentId}`).digest("hex");
}

function assertConfinedParent(path: ResolvedDbcdPath): void {
  if (realpathSync(path.workspaceRoot) !== path.workspaceRoot) {
    throw new DbcdPathPolicyError("OUTSIDE_WORKSPACE", "The project must stay in the workspace.");
  }
  let parent = path.workspaceRoot;
  for (const segment of path.relativePath.split("/").slice(0, -1)) {
    parent = join(parent, segment);
    const stats = lstatSync(parent);
    if (stats.isSymbolicLink()) {
      throw new DbcdPathPolicyError("OUTSIDE_WORKSPACE", "Project paths cannot contain links or junctions.");
    }
    if (!stats.isDirectory()) {
      throw new DbcdPathPolicyError("NOT_DIRECTORY", "A project path component is not a directory.");
    }
  }
}

function assertReservedFile(path: ResolvedDbcdPath, reserved: BigIntStats): void {
  const changed = () => new DbcdProjectStoreError("PATH_CHANGED", "The project path changed during creation.");
  try {
    assertConfinedParent(path);
    if (!lstatSync(path.absolutePath).isFile()) throw changed();
    // Older Windows runtimes report dev=0 from lstat; compare two handle-based identities.
    const checkFd = openSync(path.absolutePath, "r");
    try {
      const actual = fstatSync(checkFd, { bigint: true });
      if (!actual.isFile() || actual.dev !== reserved.dev || actual.ino !== reserved.ino
        || actual.birthtimeNs !== reserved.birthtimeNs) throw changed();
    } finally {
      closeSync(checkFd);
    }
  } catch {
    throw changed();
  }
}

export async function createDbcdProject(input: CreateDbcdProjectInput): Promise<DbcdProjectSnapshot> {
  if (!parseDbml(input.sourceText, input.projectPath).graph) {
    throw new DbcdProjectStoreError("INVALID_DBML", "Unable to parse DBML.");
  }
  let presentationJson: string;
  try {
    presentationJson = encodePresentation(input.presentation ?? emptyPresentation());
  } catch {
    throw new DbcdProjectStoreError("INVALID_PRESENTATION", "Unable to read the presentation document.");
  }
  const path = await resolveNewDbcd(input.workspaceRoot, input.projectPath);
  assertConfinedParent(path);
  let fd: number;
  try {
    fd = openSync(path.absolutePath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new DbcdPathPolicyError("ALREADY_EXISTS", "The .dbcd project already exists.");
    }
    throw new DbcdProjectStoreError("CREATE_FAILED", "Unable to create the .dbcd project.");
  }
  const reserved = fstatSync(fd, { bigint: true });
  let db: DatabaseSync | undefined;
  let committed = false;
  let transactionStarted = false;
  try {
    const checked = await resolveExistingDbcd(path.workspaceRoot, path.relativePath);
    if (checked.workspaceRoot !== path.workspaceRoot || checked.absolutePath !== path.absolutePath) {
      throw new DbcdProjectStoreError("PATH_CHANGED", "The project path changed during creation.");
    }
    assertReservedFile(path, reserved);
    db = openConnection(path.absolutePath, false);
    assertReservedFile(path, reserved);
    const createdAt = input.now?.() ?? new Date().toISOString();
    const projectId = input.projectId?.() ?? randomUUID();
    const sourceHash = hashDocument(input.sourceText);
    const presentationHash = hashDocument(presentationJson);
    const id = revisionId(createdAt, sourceHash, presentationHash);
    db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    db.exec(DBCD_SCHEMA_SQL);
    db.exec(`PRAGMA user_version=${DBCD_FORMAT_VERSION}`);
    db.prepare("INSERT INTO project_meta VALUES (1, ?, ?, ?, ?)")
      .run(DBCD_FORMAT_VERSION, projectId, createdAt, createdAt);
    db.prepare(`INSERT INTO revisions
      (id, parent_id, created_at, dbml_gzip, presentation_gzip, source_hash, presentation_hash, summary, label, pinned)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, 0)`)
      .run(id, createdAt, gzipSync(input.sourceText), gzipSync(presentationJson), sourceHash, presentationHash, "Initial revision");
    db.prepare("INSERT INTO document_state VALUES (1, ?, ?, ?, ?, 1, ?)")
      .run(input.sourceText, sourceHash, presentationJson, presentationHash, id);
    const snapshot = readSnapshot(db, path.relativePath);
    assertReservedFile(path, reserved);
    db.exec("COMMIT");
    transactionStarted = false;
    committed = true;
    return snapshot;
  } catch (error) {
    if (db && transactionStarted) {
      try { db.exec("ROLLBACK"); } catch { /* Closing also rolls back an outstanding transaction. */ }
    }
    if (error instanceof DbcdProjectStoreError && error.code === "PATH_CHANGED") throw error;
    if (error instanceof DbcdPathPolicyError) throw error;
    throw new DbcdProjectStoreError("CREATE_FAILED", "Unable to create the .dbcd project.");
  } finally {
    try {
      db?.close();
    } finally {
      try {
        if (!committed) {
          // Never delete a replacement or follow a changed parent during cleanup.
          try {
            assertReservedFile(path, reserved);
            unlinkSync(path.absolutePath);
          } catch { /* Preserve any file whose ownership can no longer be proven. */ }
        }
      } finally {
        closeSync(fd);
      }
    }
  }
}

export async function openDbcdProject(input: OpenDbcdProjectInput): Promise<DbcdProjectSnapshot> {
  const path = await resolveExistingDbcd(input.workspaceRoot, input.projectPath);
  let db: DatabaseSync | undefined;
  try {
    // Inspection is read-only even for current versions; future formats are never migrated.
    db = openConnection(path.absolutePath, true);
    return readSnapshot(db, path.relativePath);
  } catch (error) {
    if (error instanceof DbcdProjectStoreError) throw error;
    throw new DbcdProjectStoreError("CORRUPT_PROJECT", "Unable to read the .dbcd project.");
  } finally {
    db?.close();
  }
}

function validatedPresentation(presentation: PresentationDocument): string {
  try { return encodePresentation(presentation); }
  catch { throw new DbcdProjectStoreError("INVALID_PRESENTATION", "Unable to read the presentation document."); }
}

function assertGeneration(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new DbcdProjectStoreError("CONFLICT", "The project has changed. Reload it before saving.");
  }
}

function assertWritable(db: DatabaseSync): void {
  const version = db.prepare("PRAGMA user_version").get()?.user_version;
  if (typeof version === "number" && version > DBCD_FORMAT_VERSION) {
    throw new DbcdProjectStoreError("READ_ONLY", "This project requires a newer version of DBCodex.");
  }
}

interface ProjectReservation {
  path: ResolvedDbcdPath;
  identity: BigIntStats;
  queueKey: string;
}

/** Holds the same file identity throughout compound read/write operations. */
async function withProjectReservation<T>(
  input: OpenDbcdProjectInput,
  action: (reservation: ProjectReservation) => T | Promise<T>,
): Promise<T> {
  const path = await resolveExistingDbcd(input.workspaceRoot, input.projectPath);
  assertConfinedParent(path);
  if (!lstatSync(path.absolutePath).isFile()) {
    throw new DbcdProjectStoreError("PATH_CHANGED", "The project path changed before writing.");
  }
  const fd = openSync(path.absolutePath, "r");
  try {
    const identity = fstatSync(fd, { bigint: true });
    assertReservedFile(path, identity);
    // realpath also canonicalizes path casing on Windows, so aliases share one queue.
    return await action({ path, identity, queueKey: realpathSync(path.absolutePath) });
  } finally {
    closeSync(fd);
  }
}

async function writeProject(
  input: OpenDbcdProjectInput,
  action: (db: DatabaseSync, snapshot: DbcdProjectSnapshot) => void,
  hooks?: DbcdStoreTestHooks,
): Promise<DbcdProjectSnapshot> {
  return withProjectReservation(input, (reservation) => writeReservedProject(reservation, action, hooks));
}

/** Acquires the writer queue exactly once, without replacing an existing reservation. */
async function writeReservedProject(
  { path, identity, queueKey }: ProjectReservation,
  action: (db: DatabaseSync, snapshot: DbcdProjectSnapshot) => void,
  hooks?: DbcdStoreTestHooks,
): Promise<DbcdProjectSnapshot> {
  return withProjectWrite(queueKey, () => {
    let db: DatabaseSync | undefined;
    let transactionStarted = false;
    try {
      assertReservedFile(path, identity);
      // Future formats must be rejected before opening any writable connection.
      db = openConnection(path.absolutePath, true);
      assertReservedFile(path, identity);
      assertWritable(db);
      db.close();
      db = undefined;
      assertReservedFile(path, identity);
      db = openConnection(path.absolutePath, false);
      assertReservedFile(path, identity);
      db.exec("BEGIN IMMEDIATE");
      transactionStarted = true;
      hooks?.checkpoint?.("after-begin");
      assertWritable(db);
      const snapshot = readSnapshot(db, path.relativePath);
      action(db, snapshot);
      const saved = readSnapshot(db, path.relativePath);
      hooks?.checkpoint?.("before-commit");
      assertReservedFile(path, identity);
      db.exec("COMMIT");
      transactionStarted = false;
      return saved;
    } catch (error) {
      if (db && transactionStarted) {
        try { db.exec("ROLLBACK"); } catch { /* Closing rolls back if explicit rollback failed. */ }
      }
      if (error instanceof DbcdProjectStoreError || error instanceof DbcdPathPolicyError) throw error;
      throw new DbcdProjectStoreError("WRITE_FAILED", "Unable to update the .dbcd project.");
    } finally {
      db?.close();
    }
  });
}

export async function saveDbcdDraft(input: SaveDbcdDraftInput): Promise<DbcdProjectSnapshot> {
  const presentationJson = validatedPresentation(input.presentation);
  return writeProject(input, (db, snapshot) => {
    assertGeneration(snapshot.generation, input.baseGeneration);
    db.prepare(`INSERT INTO draft_state(id, base_generation, dbml_text, presentation_json, updated_at)
      VALUES(1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET base_generation=excluded.base_generation,
        dbml_text=excluded.dbml_text, presentation_json=excluded.presentation_json, updated_at=excluded.updated_at`)
      .run(input.baseGeneration, input.sourceText, presentationJson, input.now?.() ?? new Date().toISOString());
  });
}

export async function discardDbcdDraft(input: DiscardDbcdDraftInput): Promise<DbcdProjectSnapshot> {
  return writeProject(input, (db, snapshot) => {
    assertGeneration(snapshot.generation, input.expectedGeneration);
    db.prepare("DELETE FROM draft_state WHERE id=1").run();
  });
}

function pruneRevisions(db: DatabaseSync, currentId: string, createdAt: string): void {
  const cutoff = new Date(Date.parse(createdAt) - 90 * 24 * 60 * 60 * 1000).toISOString();
  // ON DELETE SET NULL detaches only links whose parent is actually removed.
  db.prepare("DELETE FROM revisions WHERE pinned=0 AND id<>? AND created_at<?").run(currentId, cutoff);
  db.prepare(`DELETE FROM revisions WHERE id IN (
    SELECT id FROM revisions WHERE pinned=0 AND id<>? ORDER BY created_at ASC, rowid ASC
    LIMIT MAX(0, (SELECT COUNT(*) FROM revisions) - 500)
  )`).run(currentId);
}

export async function saveDbcdProject(input: SaveDbcdInput, hooks?: DbcdStoreTestHooks): Promise<DbcdProjectSnapshot> {
  return saveProject(input, "Saved revision", hooks);
}

async function saveProject(
  input: SaveDbcdInput,
  summary: string,
  hooks?: DbcdStoreTestHooks,
  reservation?: ProjectReservation,
): Promise<DbcdProjectSnapshot> {
  // DBML validation and compression happen before acquiring the write transaction.
  if (!parseDbml(input.sourceText, input.projectPath).graph) {
    throw new DbcdProjectStoreError("INVALID_DBML", "Unable to parse DBML.");
  }
  const presentationJson = validatedPresentation(input.presentation);
  const sourceHash = hashDocument(input.sourceText);
  const presentationHash = hashDocument(presentationJson);
  const sourceGzip = gzipSync(input.sourceText);
  const presentationGzip = gzipSync(presentationJson);
  const save = (db: DatabaseSync, snapshot: DbcdProjectSnapshot) => {
    assertGeneration(snapshot.generation, input.expectedGeneration);
    const createdAt = timestamp.parse(input.now?.() ?? new Date().toISOString());
    const id = revisionId(createdAt, sourceHash, presentationHash, snapshot.currentRevisionId);
    db.prepare(`INSERT INTO revisions
      (id, parent_id, created_at, dbml_gzip, presentation_gzip, source_hash, presentation_hash, summary, label, pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)
      .run(id, snapshot.currentRevisionId, createdAt, sourceGzip, presentationGzip, sourceHash, presentationHash, summary, input.label ?? null);
    hooks?.checkpoint?.("after-revision");
    const changed = db.prepare(`UPDATE document_state SET dbml_text=?, source_hash=?, presentation_json=?,
      presentation_hash=?, generation=generation+1, current_revision_id=? WHERE id=1 AND generation=?`)
      .run(input.sourceText, sourceHash, presentationJson, presentationHash, id, input.expectedGeneration);
    if (changed.changes !== 1) {
      throw new DbcdProjectStoreError("CONFLICT", "The project has changed. Reload it before saving.");
    }
    hooks?.checkpoint?.("after-document");
    db.prepare("DELETE FROM draft_state WHERE id=1").run();
    db.prepare("UPDATE project_meta SET updated_at=? WHERE id=1").run(createdAt);
    pruneRevisions(db, id, createdAt);
  };
  return reservation ? writeReservedProject(reservation, save, hooks) : writeProject(input, save, hooks);
}

export async function listDbcdRevisions(input: OpenDbcdProjectInput): Promise<DbcdRevisionSummary[]> {
  return (await openDbcdProject(input)).revisions;
}

export async function readDbcdRevision(input: ReadDbcdRevisionInput): Promise<DbcdRevisionSnapshot> {
  return withProjectReservation(input, (reservation) => readReservedRevision(reservation, input.revisionId));
}

function readReservedRevision({ path, identity }: ProjectReservation, revisionId: string): DbcdRevisionSnapshot {
  let db: DatabaseSync | undefined;
  try {
    assertReservedFile(path, identity);
    db = openConnection(path.absolutePath, true);
    assertReservedFile(path, identity);
    const snapshot = readSnapshot(db, path.relativePath);
    const summary = snapshot.revisions.find((revision) => revision.id === revisionId);
    if (!summary) throw new DbcdProjectStoreError("REVISION_NOT_FOUND", "The revision does not exist.");
    const row = db.prepare("SELECT dbml_gzip, presentation_gzip FROM revisions WHERE id=?").get(revisionId)!;
    const sourceText = gunzipSync(z.instanceof(Uint8Array).parse(row.dbml_gzip)).toString("utf8");
    const presentationJson = gunzipSync(z.instanceof(Uint8Array).parse(row.presentation_gzip)).toString("utf8");
    if (hashDocument(sourceText) !== summary.sourceHash || hashDocument(presentationJson) !== summary.presentationHash) {
      throw new Error("Invalid revision hashes.");
    }
    const presentation = decodePresentation(presentationJson);
    if (!parseDbml(sourceText, path.relativePath).graph) throw new Error("Invalid revision source.");
    assertReservedFile(path, identity);
    return { ...summary, sourceText, presentation };
  } catch (error) {
    if (error instanceof DbcdProjectStoreError) throw error;
    throw new DbcdProjectStoreError("CORRUPT_PROJECT", "Unable to read the .dbcd revision.");
  } finally {
    db?.close();
  }
}

export async function setDbcdRevisionPinned(input: SetDbcdRevisionPinnedInput): Promise<DbcdProjectSnapshot> {
  return writeProject(input, (db) => {
    const result = db.prepare("UPDATE revisions SET pinned=? WHERE id=?").run(input.pinned ? 1 : 0, input.revisionId);
    if (result.changes !== 1) throw new DbcdProjectStoreError("REVISION_NOT_FOUND", "The revision does not exist.");
  });
}

export async function restoreDbcdRevision(input: RestoreDbcdRevisionInput, hooks?: DbcdStoreTestHooks): Promise<DbcdProjectSnapshot> {
  return withProjectReservation(input, (reservation) => {
    const revision = readReservedRevision(reservation, input.revisionId);
    return saveProject({ ...input, sourceText: revision.sourceText, presentation: revision.presentation },
      `Restauration de ${revision.id.slice(0, 8)}`, hooks, reservation);
  });
}
