import {
  boundedUtf8Length, DBCD_MAX_SOURCE_BYTES, encodePresentation, modelDiagnostics, DbcdProjectStoreError,
  parseDbml, projectModelSchema, reconcileProjectModel,
  type PresentationDocument, type ProjectModel, type ProjectProfile,
} from "@dbcodex/core";

export interface ProjectChanges { sourceText?: string | undefined; model?: ProjectModel | undefined }

/** Build the exact candidate used for both preview and commit; never mutate the snapshot. */
export function prepareChanges(path: string, sourceText: string, presentation: PresentationDocument,
  changes: ProjectChanges, profile: ProjectProfile = presentation.model?.profile ?? { mode: "generic" }) {
  const source = changes.sourceText ?? sourceText;
  boundedUtf8Length(source, DBCD_MAX_SOURCE_BYTES);
  const next = structuredClone(presentation);
  if (changes.model !== undefined) next.model = projectModelSchema.parse(changes.model);
  const actualProfile = next.model?.profile ?? { mode: "generic" };
  if (JSON.stringify(actualProfile) !== JSON.stringify(profile)) throw new DbcdProjectStoreError("INVALID_PRESENTATION", "The project profile is fixed.");
  const parsed = parseDbml(source, path);
  if (parsed.graph && changes.model === undefined) {
    const reconciled = reconcileProjectModel(parsed.graph, next.model);
    if (reconciled) next.model = reconciled;
  }
  encodePresentation(next);
  const diagnostics = [...parsed.diagnostics];
  if (parsed.graph) {
    diagnostics.push(...modelDiagnostics(parsed.graph, next.model));
    const tables = new Map(parsed.graph.tables.map(table => [table.id, table]));
    // Reject orphan metadata instead of silently losing names/options after structural edits.
    for (const [id, table] of Object.entries(next.model?.tables ?? {})) {
      const target = tables.get(id);
      if (!target) diagnostics.push({ severity: "error", message: `Metadata table does not exist: ${id}.` });
      else {
        for (const name of Object.keys(table.columns)) if (!target.columns.some(column => column.name === name)) {
          diagnostics.push({ severity: "error", message: `Metadata column does not exist: ${id}.${name}.` });
        }
        if (table.primaryNameColumn && !target.columns.some(column => column.name === table.primaryNameColumn)) {
          diagnostics.push({ severity: "error", message: `Primary name column does not exist: ${id}.${table.primaryNameColumn}.` });
        }
      }
    }
    const relationshipIds = new Set<string>();
    for (const relation of next.model?.relationships ?? []) {
      if (!tables.has(relation.sourceTableId) || !tables.has(relation.targetTableId) || relationshipIds.has(relation.id)) {
        diagnostics.push({ severity: "error", message: `Invalid or duplicate relationship: ${relation.id}.` });
      }
      relationshipIds.add(relation.id);
    }
  }
  return { sourceText: source, presentation: next, graph: parsed.graph, diagnostics,
    valid: parsed.graph !== null && !diagnostics.some(diagnostic => diagnostic.severity === "error") };
}
