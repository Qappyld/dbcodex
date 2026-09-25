import { readFile } from "node:fs/promises";
import {
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

export function createHandlers(workspaceRoot: string) {
  return {
    openDbml: async ({ path }: OpenDbmlInput) => {
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
    },

    saveLayout: async (input: SaveLayoutInput) => {
      const resolved = await resolveWorkspaceDbml(workspaceRoot, input.path);
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
    },
  };
}
