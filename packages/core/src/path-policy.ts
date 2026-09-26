import { realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

export type PathPolicyCode =
  | "ABSOLUTE_PATH"
  | "OUTSIDE_WORKSPACE"
  | "NOT_DBML"
  | "NOT_FOUND";

export class PathPolicyError extends Error {
  constructor(
    public readonly code: PathPolicyCode,
    message: string,
  ) {
    super(message);
    this.name = "PathPolicyError";
  }
}

function escapes(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  );
}

export async function resolveWorkspaceDbml(
  workspaceRoot: string,
  input: string,
): Promise<{ absolutePath: string; relativePath: string }> {
  if (isAbsolute(input)) {
    throw new PathPolicyError(
      "ABSOLUTE_PATH",
      "Use a workspace-relative DBML path.",
    );
  }

  if (extname(input).toLowerCase() !== ".dbml") {
    throw new PathPolicyError("NOT_DBML", "The path must end in .dbml.");
  }

  const root = await realpath(workspaceRoot);
  const unresolved = resolve(root, input);

  if (escapes(root, unresolved)) {
    throw new PathPolicyError(
      "OUTSIDE_WORKSPACE",
      "The DBML file must stay in the workspace.",
    );
  }

  let candidate: string;
  try {
    candidate = await realpath(unresolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new PathPolicyError("NOT_FOUND", "The DBML file does not exist.");
    }
    throw error;
  }

  if (escapes(root, candidate)) {
    throw new PathPolicyError(
      "OUTSIDE_WORKSPACE",
      "The DBML file must stay in the workspace.",
    );
  }

  return {
    absolutePath: candidate,
    relativePath: relative(root, candidate).split(sep).join("/"),
  };
}
