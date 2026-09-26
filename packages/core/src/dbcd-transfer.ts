import { closeSync, fstatSync, lstatSync, openSync, realpathSync, unlinkSync, writeSync, type BigIntStats } from "node:fs";
import { extname, isAbsolute, join, relative, sep, win32 } from "node:path";
import { DbcdPathPolicyError, resolveNewDbcd } from "./dbcd-path-policy.js";
import { DbcdProjectStoreError, createDbcdProject, openDbcdProject, readDbcdRevision } from "./dbcd-project-store.js";
import type { DbcdProjectSnapshot } from "./document-contract.js";
import { PathPolicyError, resolveWorkspaceDbml } from "./path-policy.js";
import { readBoundedDbmlFile } from "./dbml-file.js";

export interface ImportDbmlProjectInput {
  workspaceRoot: string;
  sourcePath: string;
  projectPath: string;
}

export interface ExportDbmlProjectInput {
  workspaceRoot: string;
  projectPath: string;
  targetPath: string;
  revisionId?: string;
}

interface ResolvedNewDbml {
  workspaceRoot: string;
  absolutePath: string;
  relativePath: string;
}

function assertConfinedParent(target: ResolvedNewDbml): void {
  if (realpathSync(target.workspaceRoot) !== target.workspaceRoot) {
    throw new PathPolicyError("OUTSIDE_WORKSPACE", "The DBML file must stay in the workspace.");
  }
  const segments = target.relativePath.split("/").slice(0, -1);
  let parent = target.workspaceRoot;
  for (const segment of segments) {
    parent = join(parent, segment);
    const stats = lstatSync(parent);
    if (stats.isSymbolicLink()) {
      throw new PathPolicyError("OUTSIDE_WORKSPACE", "The DBML file must stay in the workspace.");
    }
    if (!stats.isDirectory()) {
      throw new PathPolicyError("NOT_FOUND", "The DBML target directory does not exist.");
    }
  }
  const actual = relative(target.workspaceRoot, realpathSync(parent)).split(sep).join("/");
  const expected = segments.join("/");
  const same = process.platform === "win32" ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
  if (!same) {
    throw new PathPolicyError("OUTSIDE_WORKSPACE", "The DBML file must stay in the workspace.");
  }
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.isFile() && right.isFile() && left.dev === right.dev && left.ino === right.ino
    && left.birthtimeNs === right.birthtimeNs;
}

function assertReservedFile(target: ResolvedNewDbml, reserved: BigIntStats): void {
  const changed = () => new DbcdProjectStoreError("PATH_CHANGED", "The DBML export path changed during creation.");
  try {
    assertConfinedParent(target);
    if (!lstatSync(target.absolutePath).isFile()) throw changed();
    // Compare two handle-based identities because Windows lstat may report dev=0.
    const checkFd = openSync(target.absolutePath, "r");
    try {
      if (!sameIdentity(fstatSync(checkFd, { bigint: true }), reserved)) throw changed();
    } finally {
      closeSync(checkFd);
    }
  } catch {
    throw changed();
  }
}

function removeReservedFile(target: ResolvedNewDbml, reserved: BigIntStats): void {
  try {
    assertReservedFile(target, reserved);
    unlinkSync(target.absolutePath);
  } catch { /* Preserve any replacement or path whose identity cannot be proven. */ }
}

function resolveNewDbml(workspaceRoot: string, inputPath: string): ResolvedNewDbml {
  if (isAbsolute(inputPath) || win32.isAbsolute(inputPath) || /^[A-Za-z]:/.test(inputPath)) {
    throw new PathPolicyError("ABSOLUTE_PATH", "Use a workspace-relative DBML path.");
  }
  const normalized = inputPath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.includes("..")) {
    throw new PathPolicyError("OUTSIDE_WORKSPACE", "The DBML file must stay in the workspace.");
  }
  if (segments.some((segment) => segment === "" || segment === ".") || extname(normalized).toLowerCase() !== ".dbml") {
    throw new PathPolicyError("NOT_DBML", "The path must be a workspace-relative .dbml file.");
  }
  const root = realpathSync(workspaceRoot);
  const target = { workspaceRoot: root, relativePath: segments.join("/"), absolutePath: join(root, ...segments) };
  assertConfinedParent(target);
  try {
    lstatSync(target.absolutePath);
    throw new DbcdPathPolicyError("ALREADY_EXISTS", "The DBML target already exists.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}

export async function importDbmlProject(input: ImportDbmlProjectInput): Promise<DbcdProjectSnapshot> {
  const source = await resolveWorkspaceDbml(input.workspaceRoot, input.sourcePath);
  await resolveNewDbcd(input.workspaceRoot, input.projectPath);
  const sourceText = await readBoundedDbmlFile(source.absolutePath);
  return createDbcdProject({ workspaceRoot: input.workspaceRoot, projectPath: input.projectPath, sourceText });
}

export async function exportDbmlProject(input: ExportDbmlProjectInput): Promise<{ targetPath: string; sourceHash: string }> {
  const target = resolveNewDbml(input.workspaceRoot, input.targetPath);
  const project = { workspaceRoot: input.workspaceRoot, projectPath: input.projectPath };
  const source = input.revisionId
    ? await readDbcdRevision({ ...project, revisionId: input.revisionId })
    : await openDbcdProject(project);
  assertConfinedParent(target);
  let fd: number;
  try {
    fd = openSync(target.absolutePath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new DbcdPathPolicyError("ALREADY_EXISTS", "The DBML target already exists.");
    }
    throw error;
  }
  let reserved: BigIntStats | undefined;
  try {
    reserved = fstatSync(fd, { bigint: true });
    assertReservedFile(target, reserved);
    const bytes = Buffer.from(source.sourceText, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(fd, bytes, offset, bytes.length - offset);
      if (written === 0) throw new Error("Unable to write the DBML export.");
      offset += written;
    }
    return { targetPath: target.relativePath, sourceHash: source.sourceHash };
  } catch (error) {
    if (reserved) removeReservedFile(target, reserved);
    throw error;
  } finally {
    closeSync(fd);
  }
}
