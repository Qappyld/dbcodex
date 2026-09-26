import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { presentationSchema } from "@dbcodex/core";
import { createHandlers } from "./handlers.js";
import { loadUiHtml, UI_RESOURCE_URI } from "./ui-resource.js";

interface RootsClient {
  getClientCapabilities(): { roots?: unknown } | undefined;
  listRoots(): Promise<{ roots: Array<{ uri: string }> }>;
}

export function createWorkspaceRootProvider(
  client: RootsClient,
  trustedFallbackRoot?: string,
): () => Promise<readonly string[]> {
  return async () => {
    if (!client.getClientCapabilities()?.roots) {
      return trustedFallbackRoot ? [trustedFallbackRoot] : [];
    }

    try {
      const result = await client.listRoots();
      const roots = result.roots.flatMap(({ uri }) => {
        try {
          return new URL(uri).protocol === "file:" ? [fileURLToPath(uri)] : [];
        } catch {
          return [];
        }
      });
      return roots;
    } catch {
      return [];
    }
  };
}

const publicUi = { ui: { resourceUri: UI_RESOURCE_URI } };
const appUi = { ui: { resourceUri: UI_RESOURCE_URI, visibility: ["app"] as ["app"] } };
const readOnly = { readOnlyHint: true, openWorldHint: false };
const writeOnce = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const pathInput = z.object({ path: z.string().min(1) });
const projectDraftInput = pathInput.extend({ sourceText: z.string() });

export const buildToolDefinitions = () => ({
  openDbcd: {
    title: "Open DBCodex project",
    description: "Open a workspace-relative .dbcd project.",
    inputSchema: pathInput,
    annotations: readOnly,
    _meta: publicUi,
  },
  openDbml: {
    title: "Open DBML diagram",
    description: "Open and parse a workspace-relative DBML file.",
    inputSchema: z.object({ path: z.string().min(1) }),
    annotations: readOnly,
    _meta: publicUi,
  },
  importDbml: {
    title: "Import DBML as DBCodex project",
    description: "Create a new .dbcd project from a workspace-relative .dbml file.",
    inputSchema: z.object({ sourcePath: z.string().min(1), projectPath: z.string().min(1) }),
    annotations: writeOnce,
    _meta: publicUi,
  },
  exportDbml: {
    title: "Export DBCodex project to DBML",
    description: "Create a new .dbml file from the current or selected project revision.",
    inputSchema: z.object({ projectPath: z.string().min(1), targetPath: z.string().min(1), revisionId: z.string().min(1).optional() }),
    annotations: writeOnce,
    _meta: publicUi,
  },
  validateDraft: {
    title: "Validate DBML draft",
    description: "Validate draft DBML in a DBCodex project.",
    inputSchema: projectDraftInput,
    annotations: readOnly,
    _meta: appUi,
  },
  saveDraft: {
    title: "Save DBCodex draft",
    description: "Persist a draft source and presentation.",
    inputSchema: projectDraftInput.extend({ baseGeneration: z.number().int().positive(), presentation: presentationSchema }),
    annotations: writeOnce,
    _meta: appUi,
  },
  discardDraft: {
    title: "Discard DBCodex draft",
    description: "Clear the stored draft when the editor returns to the saved revision.",
    inputSchema: pathInput.extend({ expectedGeneration: z.number().int().positive() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: appUi,
  },
  saveDbcd: {
    title: "Save DBCodex revision",
    description: "Commit a new project revision.",
    inputSchema: projectDraftInput.extend({ expectedGeneration: z.number().int().positive(), presentation: presentationSchema, label: z.string().optional() }),
    annotations: writeOnce,
    _meta: appUi,
  },
  readRevision: {
    title: "Read DBCodex revision",
    description: "Read one revision privately for the history comparison panel.",
    inputSchema: pathInput.extend({ revisionId: z.string().min(1) }),
    annotations: readOnly,
    _meta: appUi,
  },
  listRevisions: {
    title: "List DBCodex revisions",
    description: "List revision summaries.",
    inputSchema: pathInput,
    annotations: readOnly,
    _meta: appUi,
  },
  restoreRevision: {
    title: "Restore DBCodex revision",
    description: "Create a new revision from an earlier revision.",
    inputSchema: pathInput.extend({ expectedGeneration: z.number().int().positive(), revisionId: z.string().min(1) }),
    annotations: writeOnce,
    _meta: appUi,
  },
  pinRevision: {
    title: "Pin DBCodex revision",
    description: "Set the retention pin on a revision.",
    inputSchema: pathInput.extend({ revisionId: z.string().min(1), pinned: z.boolean() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: appUi,
  },
  saveLayout: {
    title: "Save DBML table position",
    description: "Persist one table position for a DBML diagram view.",
    inputSchema: z.object({
      path: z.string().min(1),
      view: z.string().min(1),
      tableId: z.string().min(1),
      x: z.number().finite(),
      y: z.number().finite(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: appUi,
  },
});

export function createServer(trustedFallbackRoot?: string): McpServer {
  const server = new McpServer({
    name: "dbcodex",
    version: "0.1.0-dev.0",
  });
  const handlers = createHandlers(
    createWorkspaceRootProvider(server.server, trustedFallbackRoot),
  );
  const definitions = buildToolDefinitions();

  registerAppTool(server, "open_dbcd", definitions.openDbcd, handlers.openDbcd);
  registerAppTool(server, "open_dbml", definitions.openDbml, handlers.openDbml);
  registerAppTool(server, "import_dbml", definitions.importDbml, handlers.importDbml);
  registerAppTool(server, "export_dbml", definitions.exportDbml, handlers.exportDbml);
  registerAppTool(server, "validate_dbcd_draft", definitions.validateDraft, handlers.validateDbcdDraft);
  registerAppTool(server, "save_dbcd_draft", definitions.saveDraft, handlers.saveDbcdDraft);
  registerAppTool(server, "discard_dbcd_draft", definitions.discardDraft, handlers.discardDbcdDraft);
  registerAppTool(server, "save_dbcd", definitions.saveDbcd, handlers.saveDbcd);
  registerAppTool(server, "list_dbcd_revisions", definitions.listRevisions, handlers.listDbcdRevisions);
  registerAppTool(server, "read_dbcd_revision", definitions.readRevision, handlers.readDbcdRevision);
  registerAppTool(server, "restore_dbcd_revision", definitions.restoreRevision, handlers.restoreDbcdRevision);
  registerAppTool(server, "pin_dbcd_revision", definitions.pinRevision, handlers.pinDbcdRevision);
  registerAppTool(server, "save_layout", definitions.saveLayout, handlers.saveLayout);
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
