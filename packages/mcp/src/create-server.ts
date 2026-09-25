import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createHandlers } from "./handlers.js";

export const buildToolDefinitions = () => ({
  open: {
    title: "Open DBML diagram",
    description: "Open and parse a workspace-relative DBML file.",
    inputSchema: { path: z.string().min(1) },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
  save: {
    title: "Save DBML table position",
    description: "Persist one table position for a DBML diagram view.",
    inputSchema: {
      path: z.string().min(1),
      view: z.string().min(1),
      tableId: z.string().min(1),
      x: z.number().finite(),
      y: z.number().finite(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
});

export function createServer(workspaceRoot: string): McpServer {
  const server = new McpServer({
    name: "dbcodex",
    version: "0.1.0-dev.0",
  });
  const handlers = createHandlers(workspaceRoot);
  const definitions = buildToolDefinitions();

  server.registerTool("open_dbml", definitions.open, handlers.openDbml);
  server.registerTool("save_layout", definitions.save, handlers.saveLayout);

  return server;
}
