import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { createHandlers } from "./handlers.js";
import { loadUiHtml, UI_RESOURCE_URI } from "./ui-resource.js";

interface RootsClient {
  getClientCapabilities(): { roots?: unknown } | undefined;
  listRoots(): Promise<{ roots: Array<{ uri: string }> }>;
}

export function createWorkspaceRootProvider(
  client: RootsClient,
  fallbackRoot: string,
): () => Promise<readonly string[]> {
  return async () => {
    if (!client.getClientCapabilities()?.roots) return [fallbackRoot];

    try {
      const result = await client.listRoots();
      const roots = result.roots.flatMap(({ uri }) => {
        try {
          return new URL(uri).protocol === "file:" ? [fileURLToPath(uri)] : [];
        } catch {
          return [];
        }
      });
      return roots.length > 0 ? roots : [fallbackRoot];
    } catch {
      return [fallbackRoot];
    }
  };
}

export const buildToolDefinitions = () => ({
  open: {
    title: "Open DBML diagram",
    description: "Open and parse a workspace-relative DBML file.",
    inputSchema: z.object({ path: z.string().min(1) }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    _meta: {
      ui: { resourceUri: UI_RESOURCE_URI },
    },
  },
  save: {
    title: "Save DBML table position",
    description: "Persist one table position for a DBML diagram view.",
    inputSchema: z.object({
      path: z.string().min(1),
      view: z.string().min(1),
      tableId: z.string().min(1),
      x: z.number().finite(),
      y: z.number().finite(),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    _meta: {
      ui: { visibility: ["app"] as ["app"] },
    },
  },
});

export function createServer(workspaceRoot: string): McpServer {
  const server = new McpServer({
    name: "dbcodex",
    version: "0.1.0-dev.0",
  });
  const handlers = createHandlers(
    createWorkspaceRootProvider(server.server, workspaceRoot),
  );
  const definitions = buildToolDefinitions();

  registerAppTool(server, "open_dbml", definitions.open, handlers.openDbml);
  registerAppTool(server, "save_layout", definitions.save, handlers.saveLayout);
  registerAppResource(
    server,
    "DBCodex diagram",
    UI_RESOURCE_URI,
    {},
    async () => ({
      contents: [{
        uri: UI_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: await loadUiHtml(),
        _meta: {
          ui: {
            prefersBorder: false,
            csp: { connectDomains: [], resourceDomains: [] },
          },
        },
      }],
    }),
  );

  return server;
}
