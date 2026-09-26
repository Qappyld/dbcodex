import { readFile } from "node:fs/promises";
import {
  LayoutStoreError,
  PathPolicyError,
  loadLayout,
  parseDbml,
  resolveWorkspaceDbml,
  saveNodePosition,
} from "@dbcodex/core";

export interface OpenDbmlInput {
  path: string;
}

export interface SaveLayoutInput {
  path: string;
  view: string;
  tableId: string;
  x: number;
  y: number;
}

export type WorkspaceRoots =
  | string
  | readonly string[]
  | (() => Promise<readonly string[]>);

function toolError(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

function sanitizedError(error: unknown) {
  if (error instanceof PathPolicyError || error instanceof LayoutStoreError) {
    return toolError(error.message);
  }
  return toolError("dbcodex failed without exposing file contents.");
}

async function workspaceRoots(input: WorkspaceRoots): Promise<readonly string[]> {
  if (typeof input === "function") return input();
  return typeof input === "string" ? [input] : input;
}

async function resolveFromWorkspaceRoots(roots: WorkspaceRoots, path: string) {
  let notFound: PathPolicyError | undefined;

  for (const workspaceRoot of await workspaceRoots(roots)) {
    try {
      return {
        workspaceRoot,
        resolved: await resolveWorkspaceDbml(workspaceRoot, path),
      };
    } catch (error) {
      if (error instanceof PathPolicyError && error.code === "NOT_FOUND") {
        notFound = error;
        continue;
      }
      throw error;
    }
  }

  throw notFound ?? new PathPolicyError("NOT_FOUND", "The DBML file does not exist.");
}

export function createHandlers(roots: WorkspaceRoots) {
  return {
    openDbml: async ({ path }: OpenDbmlInput) => {
      try {
        const { workspaceRoot, resolved } = await resolveFromWorkspaceRoots(roots, path);
        const source = await readFile(resolved.absolutePath, "utf8");
        const parsed = parseDbml(source, resolved.relativePath);
        const layout = await loadLayout(workspaceRoot, resolved.relativePath);
        const structuredContent = {
          sourcePath: resolved.relativePath,
          graph: parsed.graph,
          diagnostics: parsed.diagnostics,
          layout: layout.document,
          layoutWarnings: layout.warnings,
        };

        return {
          structuredContent,
          content: [
            {
              type: "text" as const,
              text: parsed.graph
                ? `Opened ${resolved.relativePath}: ${parsed.graph.tables.length} tables and ${parsed.graph.relations.length} relations.`
                : `Could not parse ${resolved.relativePath}.`,
            },
          ],
        };
      } catch (error) {
        return sanitizedError(error);
      }
    },

    saveLayout: async (input: SaveLayoutInput) => {
      try {
        const { workspaceRoot, resolved } = await resolveFromWorkspaceRoots(roots, input.path);
        const source = await readFile(resolved.absolutePath, "utf8");
        const parsed = parseDbml(source, resolved.relativePath);
        if (!parsed.graph) {
          return toolError("Cannot save a layout for invalid DBML.");
        }
        if (!parsed.graph.tables.some((table) => table.id === input.tableId)) {
          return toolError("The table does not exist in the DBML graph.");
        }

        const layout = await saveNodePosition(
          workspaceRoot,
          resolved.relativePath,
          input.view,
          input.tableId,
          { x: input.x, y: input.y },
        );

        return {
          structuredContent: {
            sourcePath: resolved.relativePath,
            view: input.view,
            tableId: input.tableId,
            position: { x: input.x, y: input.y },
            layout,
          },
          content: [
            {
              type: "text" as const,
              text: `Saved ${input.tableId} in ${input.view}.`,
            },
          ],
        };
      } catch (error) {
        return sanitizedError(error);
      }
    },
  };
}
