import {
  DbcdProjectStoreError, openDbcdProject, saveDbcdProject,
  type DbcdExpectedState, type DbcdProjectSnapshot,
} from "@dbcodex/core";
import { resolveProjectRoot, sanitizedError, type WorkspaceRoots } from "./handlers.js";
import { prepareChanges, type ProjectChanges } from "./assistant-changes.js";

export interface AssistantChangesInput extends DbcdExpectedState, ProjectChanges { path: string; label?: string | undefined }

function result(data: Record<string, unknown>) {
  // Plain MCP content works with clients that do not render MCP Apps.
  return { structuredContent: data, content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}
function assertEditable(snapshot: DbcdProjectSnapshot, input: AssistantChangesInput) {
  if (snapshot.readOnly) throw new DbcdProjectStoreError("READ_ONLY", "The project is read-only.");
  if (snapshot.draft || snapshot.projectId !== input.expectedProjectId
    || snapshot.currentRevisionId !== input.expectedRevisionId || snapshot.generation !== input.expectedGeneration) {
    throw new DbcdProjectStoreError("CONFLICT", "The project changed or has a recoverable draft. Resolve the draft and read the project again.");
  }
  if (input.sourceText === undefined && input.model === undefined) {
    throw new DbcdProjectStoreError("INVALID_PRESENTATION", "Supply sourceText or model.");
  }
}
function identity(snapshot: DbcdProjectSnapshot) {
  return { projectPath: snapshot.projectPath, projectId: snapshot.projectId, generation: snapshot.generation,
    currentRevisionId: snapshot.currentRevisionId, sourceHash: snapshot.sourceHash };
}

export function createAssistantHandlers(roots: WorkspaceRoots) {
  async function propose(input: AssistantChangesInput, commit: boolean) {
    try {
      const workspaceRoot = await resolveProjectRoot(roots, input.path);
      const snapshot = await openDbcdProject({ workspaceRoot, projectPath: input.path });
      assertEditable(snapshot, input);
      const candidate = prepareChanges(input.path, snapshot.sourceText, snapshot.presentation, input);
      const before = new Set(snapshot.graph?.tables.map(table => table.id));
      const after = new Set(candidate.graph?.tables.map(table => table.id));
      const preview = { ...identity(snapshot), valid: candidate.valid, diagnostics: candidate.diagnostics,
        sourceChanged: candidate.sourceText !== snapshot.sourceText,
        modelChanged: JSON.stringify(candidate.presentation.model) !== JSON.stringify(snapshot.presentation.model),
        addedTables: [...after].filter(id => !before.has(id)), removedTables: [...before].filter(id => !after.has(id)) };
      if (!candidate.valid || !commit) return { ...result(preview), ...(!candidate.valid ? { isError: true as const } : {}) };
      const saved = await saveDbcdProject({ workspaceRoot, projectPath: input.path,
        expectedProjectId: input.expectedProjectId, expectedRevisionId: input.expectedRevisionId,
        expectedGeneration: input.expectedGeneration, sourceText: candidate.sourceText,
        presentation: candidate.presentation, rejectDraft: true, ...(input.label === undefined ? {} : { label: input.label }) });
      return result({ ...preview, ...identity(saved), saved: true });
    } catch (error) { return sanitizedError(error); }
  }
  return {
    read: async (input: { path: string; includeDraft?: boolean | undefined }) => {
      try {
        const snapshot = await openDbcdProject({ workspaceRoot: await resolveProjectRoot(roots, input.path), projectPath: input.path });
        return result({ ...identity(snapshot), sourceText: snapshot.sourceText,
          profile: snapshot.presentation.model?.profile ?? { mode: "generic" }, model: snapshot.presentation.model ?? null,
          graph: snapshot.graph, diagnostics: snapshot.diagnostics, readOnly: snapshot.readOnly, hasDraft: snapshot.draft !== null,
          ...(input.includeDraft ? { draft: snapshot.draft } : {}) });
      } catch (error) { return sanitizedError(error); }
    },
    validate: (input: AssistantChangesInput) => propose(input, false),
    update: (input: AssistantChangesInput) => propose(input, true),
  };
}
