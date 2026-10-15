import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { OpenAIFileEntrypointInputSchema, type OpenAIFileEntrypointInput, type OpenAIUiToolMetadata } from "@openai/mcp-extensions/server";
import { createNativeIntegration } from "./native-integration.js";
import { fileURLToPath } from "node:url";
import { presentationSchema, assertJsonByteLimit, boundedUtf8Length, DBCD_MAX_PRESENTATION_BYTES, DBCD_MAX_SOURCE_BYTES } from "@dbcodex/core";
import { projectProfileSchema, projectModelSchema } from "@dbcodex/core";
import { createAssistantHandlers } from "./assistant-handlers.js";
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
const entryUi = (type: "thread" | "global" | "file") => ({
  ...publicUi,
  "openai/ui": { entrypoints: [type === "file" ? { type, extensions: [".dbcd", ".dbml"] } : { type }] } satisfies OpenAIUiToolMetadata,
});
const icons = [{ src: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33"><rect x="2" y="2" width="6" height="7" rx="1"/><rect x="12" y="11" width="6" height="7" rx="1"/><path d="M8 5h7v6M3 5h4m6 9h4"/></svg>'), mimeType: "image/svg+xml", sizes: ["any"] }];
const appUi = { ui: { resourceUri: UI_RESOURCE_URI, visibility: ["app"] as ["app"] } };
const readOnly = { readOnlyHint: true, openWorldHint: false };
const writeOnce = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const pathInput = z.object({ path: z.string().min(1) });
const boundedSource = z.string().refine((value) => { try { boundedUtf8Length(value, DBCD_MAX_SOURCE_BYTES); return true; } catch { return false; } }, "The project payload exceeds its size limit.");
const boundedPresentation = z.preprocess((value, context) => {
  try { assertJsonByteLimit(value, DBCD_MAX_PRESENTATION_BYTES); return value; }
  catch { context.addIssue({ code: "custom", message: "The project payload exceeds its size limit." }); return z.NEVER; }
}, presentationSchema);
const projectDraftInput = pathInput.extend({ sourceText: boundedSource });
const expectedState = { expectedProjectId: z.string().min(1), expectedRevisionId: z.string().min(1), expectedGeneration: z.number().int().positive() };
const boundedModel = z.preprocess((value, context) => {
  try { assertJsonByteLimit(value, DBCD_MAX_PRESENTATION_BYTES); return value; }
  catch { context.addIssue({ code: "custom", message: "The project model exceeds its size limit." }); return z.NEVER; }
}, projectModelSchema);
const assistantChanges = pathInput.extend({ ...expectedState, sourceText: boundedSource.optional(),
  model: boundedModel.optional(), label: z.string().max(512).optional() })
  .refine(input => input.sourceText !== undefined || input.model !== undefined, "Supply sourceText or model.");

export const buildToolDefinitions = () => ({
  readAssistant: { title: "Read DBCodex for assistant", description: "Explicitly share saved DBML, business model and revision identity with the requesting assistant. Draft content is excluded unless includeDraft is true. No MCP Apps UI required.",
    inputSchema: pathInput.extend({ includeDraft: z.boolean().optional() }), annotations: readOnly, _meta: {} },
  validateAssistant: { title: "Preview DBCodex changes", description: "Validate proposed DBML and/or a complete replacement business model without writing. Requires fresh project identity; refuses drafts and fixed-profile changes. Omitted source/model is preserved; diagram views are always preserved.",
    inputSchema: assistantChanges, annotations: readOnly, _meta: {} },
  updateAssistant: { title: "Update DBCodex project", description: "Save user-requested DBML and/or a complete replacement business model as one revision. Validate first with validate_dbcd_changes. Requires fresh identity, refuses recoverable drafts and conflicts, preserves diagram views and fixed profile. Omitted source/model is preserved (lookup targets reconcile after source edits).",
    inputSchema: assistantChanges, annotations: { ...writeOnce, destructiveHint: true }, _meta: {} },
  createDbcd: { title: "Create DBCodex project", description: "Create a workspace .dbcd with a fixed SharePoint, Dataverse, SQL or generic profile. Optional sourceText and complete business model initialize a populated project atomically. Never overwrites an existing file.", inputSchema:pathInput.extend({profile:projectProfileSchema,sourceText:boundedSource.optional(),model:boundedModel.optional()}),annotations:writeOnce,_meta:publicUi },
  threadWorkbench: { title: "Atelier DBML", description: "Open the local DBML workbench beside the conversation.", inputSchema: z.object({}), annotations: readOnly, icons, _meta: entryUi("thread") },
  globalWorkbench: { title: "dbcodex", description: "Open the local DBCodex app.", inputSchema: z.object({}), annotations: readOnly, icons, _meta: entryUi("global") },
  fileWorkbench: { title: "Atelier dbcodex", description: "Open a host-provided workspace .dbcd or .dbml file.", inputSchema: z.object({ file: z.object({ name: z.string().min(1), resourceUri: z.string().trim().min(1) }) }), annotations: readOnly, icons, _meta: entryUi("file") },
  resolveFile: { title: "Resolve opened workspace file", description: "Resolve a file entrypoint using host-owned resource metadata.", inputSchema: z.object({}), annotations: readOnly, _meta: appUi },
  editDbcd: { title: "Apply exact DBML edits", description: "Apply user-requested exact text replacements to a saved .dbcd project. Refuses stale generations, ambiguous matches, invalid DBML and recoverable drafts; creates a revision without changing presentation.",
    inputSchema: pathInput.extend({ expectedGeneration: z.number().int().positive(), expectedRevisionId: z.string().min(1), expectedSourceHash: z.string().regex(/^[a-f0-9]{64}$/),
      edits: z.array(z.object({ search: boundedSource.refine((value) => value.length > 0), replacement: boundedSource })).min(1).max(100) }),
    annotations: { ...writeOnce, destructiveHint: true }, _meta: publicUi },
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
    inputSchema: projectDraftInput.extend({ ...expectedState, baseGeneration: z.number().int().positive(), presentation: boundedPresentation }),
    annotations: writeOnce,
    _meta: appUi,
  },
  discardDraft: {
    title: "Discard DBCodex draft",
    description: "Clear the stored draft when the editor returns to the saved revision.",
    inputSchema: pathInput.extend(expectedState),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: appUi,
  },
  saveDbcd: {
    title: "Save DBCodex revision",
    description: "Commit a new project revision.",
    inputSchema: projectDraftInput.extend({ ...expectedState, presentation: boundedPresentation, label: z.string().optional() }),
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
    inputSchema: pathInput.extend({ ...expectedState, revisionId: z.string().min(1) }),
    annotations: writeOnce,
    _meta: appUi,
  },
  pinRevision: {
    title: "Pin DBCodex revision",
    description: "Set the retention pin on a revision.",
    inputSchema: pathInput.extend({ ...expectedState, revisionId: z.string().min(1), pinned: z.boolean() }),
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
  const roots = createWorkspaceRootProvider(server.server, trustedFallbackRoot);
  const handlers = createHandlers(roots);
  const assistant = createAssistantHandlers(roots);
  const native = createNativeIntegration(roots, handlers);
  const definitions = buildToolDefinitions();

  server.registerTool("read_dbcd", definitions.readAssistant, assistant.read);
  server.registerTool("validate_dbcd_changes", definitions.validateAssistant, assistant.validate);
  server.registerTool("update_dbcd", definitions.updateAssistant, assistant.update);

  registerAppTool(server, "open_dbcd_workbench", definitions.threadWorkbench, native.launch);
  registerAppTool(server, "open_dbcd_app", definitions.globalWorkbench, native.launch);
  registerAppTool(server, "open_dbcd_file", definitions.fileWorkbench, async (input: OpenAIFileEntrypointInput) => ({
    content: [], structuredContent: { dbcodexFile: OpenAIFileEntrypointInputSchema.parse(input).file },
  }));
  registerAppTool(server, "resolve_dbcd_file", definitions.resolveFile, (_input: Record<string, never>, extra: { _meta?: Record<string, unknown> }) => native.openFile({ file: { name: "", resourceUri: "" } }, extra._meta));
  registerAppTool(server, "apply_dbcd_edits", definitions.editDbcd, native.edit);

  registerAppTool(server, "open_dbcd", definitions.openDbcd, handlers.openDbcd);
  registerAppTool(server, "create_dbcd", definitions.createDbcd, handlers.createDbcd);
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
          "openai/ui": { preferredDisplayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] },
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
