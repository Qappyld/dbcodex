import { emptyPresentation, type SchemaGraph } from "@dbcodex/core";

export const graph: SchemaGraph = {
  sourcePath: "demo.dbcd",
  tables: [{ id: "public.users", name: "users", schema: "public", columns: [
    { id: "public.users.id", name: "id", type: "int", primaryKey: true, nullable: false },
    { id: "public.users.team_id", name: "team_id", type: "int", primaryKey: false, nullable: false },
    { id: "public.users.name", name: "name", type: "text", primaryKey: false, nullable: true },
  ] }, { id: "public.teams", name: "teams", schema: "public", columns: [] }],
  relations: [{ id: "ref:1", source: { tableId: "public.users", columnNames: ["team_id"], cardinality: "*" },
    target: { tableId: "public.teams", columnNames: ["id"], cardinality: "1" } }],
};
export function presentation() {
  const value = emptyPresentation();
  value.views.all!.nodes["public.users"] = { x: 20, y: 50 };
  return value;
}
export function openResult() {
  return { structuredContent: { projectPath: "demo.dbcd", generation: 3, currentRevisionId: "r3", sourceHash: "hash",
    graph, diagnostics: [], presentation: presentation(), revisions: [], readOnly: false, hasDraft: false },
  _meta: { dbcodex: { sourceText: "Table users { id int [pk] }", projectId: "project-id", draft: null } } };
}
