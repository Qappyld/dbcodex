import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, win32 } from "node:path";

export type DbcdPathPolicyCode =
  | "ABSOLUTE_PATH"
  | "OUTSIDE_WORKSPACE"
  | "INVALID_PATH"
  | "NOT_DBCD"
  | "NOT_FOUND"
  | "NOT_DIRECTORY"
  | "NOT_FILE"
  | "ALREADY_EXISTS";

export class DbcdPathPolicyError extends Error {
  constructor(
    public readonly code: DbcdPathPolicyCode,
    message: string,
  ) {
    super(message);
    this.name = "DbcdPathPolicyError";
  }
}

export interface ResolvedDbcdPath {
  workspaceRoot: string;
  relativePath: string;
  absolutePath: string;
}

function cleanSegments(inputPath: string): string[] {
  const normalized = inputPath.replaceAll("\\", "/");
  if (isAbsolute(inputPath) || win32.isAbsolute(inputPath) || /^[A-Za-z]:/.test(inputPath)) {
    throw new DbcdPathPolicyError("ABSOLUTE_PATH", "Use a workspace-relative .dbcd path.");
  }
  const segments = normalized.split("/");
  if (segments.includes("..")) {
    throw new DbcdPathPolicyError("OUTSIDE_WORKSPACE", "The project must stay in the workspace.");
  }
  if (segments.some((segment) => segment === "" || segment === ".")) {
    throw new DbcdPathPolicyError("INVALID_PATH", "The project path has an empty or invalid segment.");
  }
  if (!normalized.toLowerCase().endsWith(".dbcd")) {
    throw new DbcdPathPolicyError("NOT_DBCD", "The path must end in .dbcd.");
  }
  return segments;
}

async function canonicalRoot(workspaceRoot: string): Promise<string> {
  const root = await realpath(workspaceRoot);
  const stats = await lstat(root);
  if (!stats.isDirectory()) {
    throw new DbcdPathPolicyError("NOT_DIRECTORY", "The workspace root must be a directory.");
  }
  return root;
}

async function checkedSegment(path: string): Promise<Awaited<ReturnType<typeof lstat>>> {
  let stats: Awaited<ReturnType<typeof lstat>>;
  try {
    stats = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DbcdPathPolicyError("NOT_FOUND", "The project path does not exist.");
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new DbcdPathPolicyError("OUTSIDE_WORKSPACE", "Project paths cannot contain links or junctions.");
  }
  return stats;
}

async function checkedParent(root: string, segments: string[]): Promise<string> {
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    parent = join(parent, segment);
    const stats = await checkedSegment(parent);
    if (!stats.isDirectory()) {
      throw new DbcdPathPolicyError("NOT_DIRECTORY", "A project path component is not a directory.");
    }
  }
  return parent;
}

export async function resolveExistingDbcd(
  workspaceRoot: string,
  inputPath: string,
): Promise<ResolvedDbcdPath> {
  const segments = cleanSegments(inputPath);
  const root = await canonicalRoot(workspaceRoot);
  const parent = await checkedParent(root, segments);
  const target = join(parent, segments[segments.length - 1]!);
  const stats = await checkedSegment(target);
  if (!stats.isFile()) {
    throw new DbcdPathPolicyError("NOT_FILE", "The .dbcd project must be a regular file.");
  }
  return { workspaceRoot: root, relativePath: segments.join("/"), absolutePath: target };
}

export async function resolveNewDbcd(
  workspaceRoot: string,
  inputPath: string,
): Promise<ResolvedDbcdPath> {
  const segments = cleanSegments(inputPath);
  const root = await canonicalRoot(workspaceRoot);
  const parent = await checkedParent(root, segments);
  const target = join(parent, segments[segments.length - 1]!);
  try {
    const stats = await lstat(target);
    if (stats.isSymbolicLink()) {
      throw new DbcdPathPolicyError("OUTSIDE_WORKSPACE", "Project paths cannot contain links or junctions.");
    }
    throw new DbcdPathPolicyError("ALREADY_EXISTS", "The .dbcd project already exists.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return { workspaceRoot: root, relativePath: segments.join("/"), absolutePath: target };
}
