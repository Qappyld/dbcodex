import { createHash, randomUUID } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, realpathSync, unlinkSync, type BigIntStats } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import { parseDbml } from "./dbml-adapter.js";
import { DbcdPathPolicyError, resolveExistingDbcd, resolveNewDbcd, type ResolvedDbcdPath } from "./dbcd-path-policy.js";
import { DBCD_FORMAT_VERSION, DBCD_SCHEMA_SQL } from "./dbcd-schema.js";
import type { DbcdProjectSnapshot } from "./document-contract.js";
import { hashDocument } from "./document-hash.js";
import { decodePresentation, emptyPresentation, encodePresentation, type PresentationDocument } from "./presentation.js";

export type DbcdProjectStoreCode = "INVALID_DBML" | "INVALID_PRESENTATION" | "NOT_DBCD" | "CORRUPT_PROJECT" | "CREATE_FAILED" | "PATH_CHANGED";

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

function openConnection(path: string, readOnly: boolean): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly, timeout: 2000 });
  try {
    db.enableLoadExtension(false);
    db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;");
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
    FROM revisions ORDER BY created_at DESC, id DESC
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

function revisionId(createdAt: string, sourceHash: string, presentationHash: string): string {
  return createHash("sha256").update(`${createdAt}\0${sourceHash}\0${presentationHash}`).digest("hex");
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
    const actual = lstatSync(path.absolutePath, { bigint: true });
    if (!actual.isFile() || actual.dev !== reserved.dev || actual.ino !== reserved.ino
      || actual.birthtimeNs !== reserved.birthtimeNs) throw changed();
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
    committed = true;
    return snapshot;
  } catch (error) {
    if (db?.isTransaction) {
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
