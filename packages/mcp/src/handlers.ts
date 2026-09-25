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

export function createHandlers(workspaceRoot: string) {
  return {
    openDbml: async ({ path }: OpenDbmlInput) => {
      try {
        const resolved = await resolveWorkspaceDbml(workspaceRoot, path);
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
        const resolved = await resolveWorkspaceDbml(workspaceRoot, input.path);
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
