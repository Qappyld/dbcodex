import { closeSync, fstatSync, lstatSync, openSync, realpathSync, unlinkSync, writeSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, win32 } from "node:path";
import { DbcdPathPolicyError, resolveNewDbcd } from "./dbcd-path-policy.js";
import { createDbcdProject, openDbcdProject, readDbcdRevision } from "./dbcd-project-store.js";
import type { DbcdProjectSnapshot } from "./document-contract.js";
import { PathPolicyError, resolveWorkspaceDbml } from "./path-policy.js";

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

function resolveNewDbml(workspaceRoot: string, inputPath: string): { absolutePath: string; relativePath: string } {
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
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    parent = join(parent, segment);
    const stats = lstatSync(parent);
    if (stats.isSymbolicLink()) {
      throw new PathPolicyError("OUTSIDE_WORKSPACE", "The DBML file must stay in the workspace.");
    }
    if (!stats.isDirectory()) {
      throw new PathPolicyError("NOT_FOUND", "The DBML target directory does not exist.");
    }
  }
  const absolutePath = join(parent, segments[segments.length - 1]!);
  try {
    lstatSync(absolutePath);
    throw new DbcdPathPolicyError("ALREADY_EXISTS", "The DBML target already exists.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { absolutePath, relativePath: segments.join("/") };
}

export async function importDbmlProject(input: ImportDbmlProjectInput): Promise<DbcdProjectSnapshot> {
  const source = await resolveWorkspaceDbml(input.workspaceRoot, input.sourcePath);
  await resolveNewDbcd(input.workspaceRoot, input.projectPath);
  const sourceText = await readFile(source.absolutePath, "utf8");
  return createDbcdProject({ workspaceRoot: input.workspaceRoot, projectPath: input.projectPath, sourceText });
}

export async function exportDbmlProject(input: ExportDbmlProjectInput): Promise<{ targetPath: string; sourceHash: string }> {
  const target = resolveNewDbml(input.workspaceRoot, input.targetPath);
  const project = { workspaceRoot: input.workspaceRoot, projectPath: input.projectPath };
  const source = input.revisionId
    ? await readDbcdRevision({ ...project, revisionId: input.revisionId })
    : await openDbcdProject(project);
  let fd: number;
  try {
    fd = openSync(target.absolutePath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new DbcdPathPolicyError("ALREADY_EXISTS", "The DBML target already exists.");
    }
    throw error;
  }
  const reserved = fstatSync(fd, { bigint: true });
  try {
    const bytes = Buffer.from(source.sourceText, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(fd, bytes, offset, bytes.length - offset);
      if (written === 0) throw new Error("Unable to write the DBML export.");
      offset += written;
    }
    return { targetPath: target.relativePath, sourceHash: source.sourceHash };
  } catch (error) {
    try {
      const actual = lstatSync(target.absolutePath, { bigint: true });
      if (actual.isFile() && actual.dev === reserved.dev && actual.ino === reserved.ino
        && actual.birthtimeNs === reserved.birthtimeNs) unlinkSync(target.absolutePath);
    } catch { /* Preserve a target whose identity can no longer be established. */ }
    throw error;
  } finally {
    closeSync(fd);
  }
}
