import { readFile } from "node:fs/promises";
import {
  DbcdPathPolicyError, DbcdProjectStoreError, LayoutStoreError, PathPolicyError,
  discardDbcdDraft, exportDbmlProject, importDbmlProject, listDbcdRevisions, loadLayout, openDbcdProject,
  parseDbml, resolveExistingDbcd, resolveNewDbcd, resolveWorkspaceDbml,
  restoreDbcdRevision, saveDbcdDraft, saveDbcdProject, saveNodePosition, setDbcdRevisionPinned,
  type DbcdProjectSnapshot, type DbcdRevisionSummary, type PresentationDocument,
} from "@dbcodex/core";

export interface OpenDbmlInput { path: string }
export interface ProjectPathInput { path: string }
export interface OpenDbcdInput extends ProjectPathInput {}
export interface ValidateDbcdDraftInput extends ProjectPathInput { sourceText: string }
export interface SaveDbcdDraftInput extends ValidateDbcdDraftInput { baseGeneration: number; presentation: PresentationDocument }
export interface DiscardDbcdDraftInput extends ProjectPathInput { expectedGeneration: number }
export interface SaveDbcdInput extends ValidateDbcdDraftInput { expectedGeneration: number; presentation: PresentationDocument; label?: string }
export interface RestoreDbcdInput extends ProjectPathInput { expectedGeneration: number; revisionId: string }
export interface PinDbcdRevisionInput extends ProjectPathInput { revisionId: string; pinned: boolean }
export interface ImportDbmlInput { sourcePath: string; projectPath: string }
export interface ExportDbmlInput { projectPath: string; targetPath: string; revisionId?: string }
export interface SaveLayoutInput { path: string; view: string; tableId: string; x: number; y: number }
export type ValidationResult = ReturnType<typeof parseDbml>;
export type WorkspaceRoots = string | readonly string[] | (() => Promise<readonly string[]>);
type Scoped<T> = T & { workspaceRoot: string };

export interface ProjectOperations {
  open(input: Scoped<OpenDbcdInput>): Promise<DbcdProjectSnapshot>;
  validate(input: Scoped<ValidateDbcdDraftInput>): Promise<ValidationResult>;
  saveDraft(input: Scoped<SaveDbcdDraftInput>): Promise<void>;
  discardDraft(input: Scoped<DiscardDbcdDraftInput>): Promise<void>;
  save(input: Scoped<SaveDbcdInput>): Promise<DbcdProjectSnapshot>;
  revisions(input: Scoped<ProjectPathInput>): Promise<DbcdRevisionSummary[]>;
  restore(input: Scoped<RestoreDbcdInput>): Promise<DbcdProjectSnapshot>;
  pin(input: Scoped<PinDbcdRevisionInput>): Promise<void>;
  importDbml(input: Scoped<ImportDbmlInput>): Promise<DbcdProjectSnapshot>;
  exportDbml(input: Scoped<ExportDbmlInput>): Promise<{ targetPath: string; sourceHash: string }>;
}

export const defaultProjectOperations: ProjectOperations = {
  open: ({ workspaceRoot, path }) => openDbcdProject({ workspaceRoot, projectPath: path }),
  validate: async ({ sourceText, path }) => parseDbml(sourceText, path),
  saveDraft: async ({ workspaceRoot, path, ...input }) => { await saveDbcdDraft({ workspaceRoot, projectPath: path, ...input }); },
  discardDraft: async ({ workspaceRoot, path, ...input }) => { await discardDbcdDraft({ workspaceRoot, projectPath: path, ...input }); },
  save: ({ workspaceRoot, path, ...input }) => saveDbcdProject({ workspaceRoot, projectPath: path, ...input }),
  revisions: ({ workspaceRoot, path }) => listDbcdRevisions({ workspaceRoot, projectPath: path }),
  restore: ({ workspaceRoot, path, ...input }) => restoreDbcdRevision({ workspaceRoot, projectPath: path, ...input }),
  pin: async ({ workspaceRoot, path, ...input }) => { await setDbcdRevisionPinned({ workspaceRoot, projectPath: path, ...input }); },
  importDbml: ({ workspaceRoot, ...input }) => importDbmlProject({ workspaceRoot, ...input }),
  exportDbml: ({ workspaceRoot, ...input }) => exportDbmlProject({ workspaceRoot, ...input }),
};

function toolError(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}
function sanitizedError(error: unknown) {
  if (error instanceof PathPolicyError || error instanceof LayoutStoreError
    || error instanceof DbcdPathPolicyError || error instanceof DbcdProjectStoreError) return toolError(error.message);
  return toolError("dbcodex failed without exposing file contents.");
}
async function workspaceRoots(input: WorkspaceRoots): Promise<readonly string[]> {
  if (typeof input === "function") return input();
  return typeof input === "string" ? [input] : input;
}
async function resolveDbmlRoot(roots: WorkspaceRoots, path: string) {
  let notFound: PathPolicyError | undefined;
  for (const workspaceRoot of await workspaceRoots(roots)) {
    try { return { workspaceRoot, resolved: await resolveWorkspaceDbml(workspaceRoot, path) }; }
    catch (error) {
      if (error instanceof PathPolicyError && error.code === "NOT_FOUND") { notFound = error; continue; }
      throw error;
    }
  }
  throw notFound ?? new PathPolicyError("NOT_FOUND", "The DBML file does not exist.");
}
async function resolveProjectRoot(roots: WorkspaceRoots, path: string): Promise<string> {
  let notFound: DbcdPathPolicyError | undefined;
  for (const workspaceRoot of await workspaceRoots(roots)) {
    try { await resolveExistingDbcd(workspaceRoot, path); return workspaceRoot; }
    catch (error) {
      if (error instanceof DbcdPathPolicyError && error.code === "NOT_FOUND") { notFound = error; continue; }
      throw error;
    }
  }
  throw notFound ?? new DbcdPathPolicyError("NOT_FOUND", "The .dbcd project does not exist.");
}
function projectResult(snapshot: DbcdProjectSnapshot, verb: string) {
  const { sourceText, projectId, draft, ...visible } = snapshot;
  return {
    structuredContent: { ...visible, hasDraft: draft !== null },
    content: [{ type: "text" as const, text: `${verb} ${snapshot.projectPath}.` }],
    _meta: { dbcodex: { sourceText, projectId, draft } },
  };
}

export function createHandlers(roots: WorkspaceRoots, projects: ProjectOperations = defaultProjectOperations) {
  return {
    openDbml: async ({ path }: OpenDbmlInput) => {
      try {
        const { workspaceRoot, resolved } = await resolveDbmlRoot(roots, path);
        const parsed = parseDbml(await readFile(resolved.absolutePath, "utf8"), resolved.relativePath);
        const layout = await loadLayout(workspaceRoot, resolved.relativePath);
        return {
          structuredContent: { sourcePath: resolved.relativePath, graph: parsed.graph, diagnostics: parsed.diagnostics,
            layout: layout.document, layoutWarnings: layout.warnings },
          content: [{ type: "text" as const, text: parsed.graph
            ? `Opened ${resolved.relativePath}: ${parsed.graph.tables.length} tables and ${parsed.graph.relations.length} relations.`
            : `Could not parse ${resolved.relativePath}.` }],
        };
      } catch (error) { return sanitizedError(error); }
    },
    saveLayout: async (input: SaveLayoutInput) => {
      try {
        const { workspaceRoot, resolved } = await resolveDbmlRoot(roots, input.path);
        const parsed = parseDbml(await readFile(resolved.absolutePath, "utf8"), resolved.relativePath);
        if (!parsed.graph) return toolError("Cannot save a layout for invalid DBML.");
        if (!parsed.graph.tables.some((table) => table.id === input.tableId)) return toolError("The table does not exist in the DBML graph.");
        const layout = await saveNodePosition(workspaceRoot, resolved.relativePath, input.view,
          input.tableId, { x: input.x, y: input.y });
        return {
          structuredContent: { sourcePath: resolved.relativePath, view: input.view, tableId: input.tableId,
            position: { x: input.x, y: input.y }, layout },
          content: [{ type: "text" as const, text: `Saved ${input.tableId} in ${input.view}.` }],
        };
      } catch (error) { return sanitizedError(error); }
    },
    openDbcd: async (input: OpenDbcdInput) => {
      try { return projectResult(await projects.open({ ...input, workspaceRoot: await resolveProjectRoot(roots, input.path) }), "Opened"); }
      catch (error) { return sanitizedError(error); }
    },
    validateDbcdDraft: async (input: ValidateDbcdDraftInput) => {
      try {
        const result = await projects.validate({ ...input, workspaceRoot: await resolveProjectRoot(roots, input.path) });
        return { structuredContent: result,
          content: [{ type: "text" as const, text: result.graph ? "DBML is valid." : "DBML has syntax errors." }] };
      } catch (error) { return sanitizedError(error); }
    },
    saveDbcdDraft: async (input: SaveDbcdDraftInput) => {
      try {
        await projects.saveDraft({ ...input, workspaceRoot: await resolveProjectRoot(roots, input.path) });
        return { structuredContent: { projectPath: input.path, saved: true },
          content: [{ type: "text" as const, text: `Saved draft in ${input.path}.` }] };
      } catch (error) { return sanitizedError(error); }
    },
    discardDbcdDraft: async (input: DiscardDbcdDraftInput) => {
      try {
        await projects.discardDraft({ ...input, workspaceRoot: await resolveProjectRoot(roots, input.path) });
        return { structuredContent: { projectPath: input.path, discarded: true },
          content: [{ type: "text" as const, text: `Discarded draft in ${input.path}.` }] };
      } catch (error) { return sanitizedError(error); }
    },
    saveDbcd: async (input: SaveDbcdInput) => {
      try { return projectResult(await projects.save({ ...input, workspaceRoot: await resolveProjectRoot(roots, input.path) }), "Saved"); }
      catch (error) { return sanitizedError(error); }
    },
    listDbcdRevisions: async (input: ProjectPathInput) => {
      try {
        const revisions = await projects.revisions({ ...input, workspaceRoot: await resolveProjectRoot(roots, input.path) });
        return { structuredContent: { projectPath: input.path, revisions },
          content: [{ type: "text" as const, text: `Listed ${revisions.length} revisions in ${input.path}.` }] };
      } catch (error) { return sanitizedError(error); }
    },
    restoreDbcdRevision: async (input: RestoreDbcdInput) => {
      try { return projectResult(await projects.restore({ ...input, workspaceRoot: await resolveProjectRoot(roots, input.path) }), "Restored"); }
      catch (error) { return sanitizedError(error); }
    },
    pinDbcdRevision: async (input: PinDbcdRevisionInput) => {
      try {
        await projects.pin({ ...input, workspaceRoot: await resolveProjectRoot(roots, input.path) });
        return { structuredContent: { projectPath: input.path, revisionId: input.revisionId, pinned: input.pinned },
          content: [{ type: "text" as const, text: `Updated revision pin in ${input.path}.` }] };
      } catch (error) { return sanitizedError(error); }
    },
    importDbml: async (input: ImportDbmlInput) => {
      try {
        const { workspaceRoot } = await resolveDbmlRoot(roots, input.sourcePath);
        await resolveNewDbcd(workspaceRoot, input.projectPath);
        return projectResult(await projects.importDbml({ ...input, workspaceRoot }), "Imported");
      } catch (error) { return sanitizedError(error); }
    },
    exportDbml: async (input: ExportDbmlInput) => {
      try {
        const exported = await projects.exportDbml({ ...input, workspaceRoot: await resolveProjectRoot(roots, input.projectPath) });
        return { structuredContent: exported,
          content: [{ type: "text" as const, text: `Exported ${exported.targetPath}.` }] };
      } catch (error) { return sanitizedError(error); }
    },
  };
}
