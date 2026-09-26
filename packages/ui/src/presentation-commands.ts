// Import the browser-safe schema module: the core barrel also exports Node-only storage.
import { presentationSchema } from "../../core/dist/presentation.js";
import type { DetailLevel, PresentationDocument, SchemaGraph } from "@dbcodex/core";
export type View = PresentationDocument["views"][string];
export type Point = { x: number; y: number };
type Group = View["groups"][string];

function command(document: PresentationDocument, change: (draft: PresentationDocument) => void): PresentationDocument {
  const draft = structuredClone(document);
  change(draft);
  const parsed = presentationSchema.safeParse(draft);
  if (!parsed.success) throw new Error("La modification de présentation est invalide.");
  return parsed.data;
}
function view(document: PresentationDocument, id: string): View {
  const result = Object.hasOwn(document.views, id) ? document.views[id] : undefined;
  if (!result) throw new Error("Vue introuvable.");
  return result;
}
function unique(document: PresentationDocument, id: string): void {
  if (["__proto__", "constructor", "prototype"].includes(id) || Object.hasOwn(document.views, id)) throw new Error("Cette vue existe déjà.");
}
export function defaultPosition(index: number): Point { return { x: 40 + (index % 3) * 280, y: 60 + Math.floor(index / 3) * 220 }; }
export function createView(document: PresentationDocument, input: { id: string; name: string; tableIds: string[] }): PresentationDocument {
  return command(document, (draft) => {
    unique(draft, input.id);
    const origin = view(draft, draft.activeViewId);
    draft.views[input.id] = { name: input.name, system: false, defaultDetail: origin.defaultDetail,
      nodes: Object.fromEntries([...new Set(input.tableIds)].map((id, index) => [id, origin.nodes[id] ?? defaultPosition(index)])),
      groups: {}, edges: {}, viewport: { x: 0, y: 0, zoom: 1 } };
    draft.activeViewId = input.id;
  });
}
export function duplicateView(document: PresentationDocument, sourceId: string, nextId: string, nextName: string): PresentationDocument {
  return command(document, (draft) => { unique(draft, nextId); draft.views[nextId] = { ...view(draft, sourceId), name: nextName, system: false }; draft.activeViewId = nextId; });
}
export function renameView(document: PresentationDocument, viewId: string, name: string): PresentationDocument {
  return command(document, (draft) => { const current = view(draft, viewId); if (current.system || viewId === "all") throw new Error("La vue système ne peut pas être renommée."); current.name = name; });
}
export function deleteView(document: PresentationDocument, viewId: string): PresentationDocument {
  return command(document, (draft) => { if (view(draft, viewId).system || viewId === "all") throw new Error("La vue système ne peut pas être supprimée."); delete draft.views[viewId]; if (draft.activeViewId === viewId) draft.activeViewId = "all"; });
}
export function setActiveView(document: PresentationDocument, viewId: string): PresentationDocument {
  return command(document, (draft) => { view(draft, viewId); draft.activeViewId = viewId; });
}
export function setViewDetail(document: PresentationDocument, viewId: string, level: DetailLevel): PresentationDocument {
  return command(document, (draft) => { view(draft, viewId).defaultDetail = level; });
}
function node(document: PresentationDocument, viewId: string, id: string) {
  const current = view(document, viewId);
  if (!Object.hasOwn(current.nodes, id)) current.nodes[id] = defaultPosition(Object.keys(current.nodes).length);
  return current.nodes[id]!;
}
export function setNodeDetail(document: PresentationDocument, viewId: string, tableId: string, levelOrNull: DetailLevel | null): PresentationDocument {
  return command(document, (draft) => { const current = node(draft, viewId, tableId); if (levelOrNull === null) delete current.detail; else current.detail = levelOrNull; });
}
export function setNodeHidden(document: PresentationDocument, viewId: string, tableId: string, hidden: boolean): PresentationDocument {
  return command(document, (draft) => { node(draft, viewId, tableId).hidden = hidden; });
}
export function setNodePosition(document: PresentationDocument, viewId: string, tableId: string, position: Point): PresentationDocument {
  return command(document, (draft) => { Object.assign(node(draft, viewId, tableId), position); });
}
export function setViewport(document: PresentationDocument, viewId: string, viewport: View["viewport"]): PresentationDocument {
  return command(document, (draft) => { view(draft, viewId).viewport = viewport; });
}
export function setPanels(document: PresentationDocument, patch: Partial<PresentationDocument["panels"]>): PresentationDocument {
  return command(document, (draft) => { draft.panels = { ...draft.panels, ...patch }; });
}
export function groupTables(document: PresentationDocument, viewId: string, group: Group & { id: string }): PresentationDocument {
  return command(document, (draft) => { const current = view(draft, viewId); if (Object.hasOwn(current.groups, group.id) || ["__proto__", "constructor", "prototype"].includes(group.id)) throw new Error("Ce groupe existe déjà.");
    const { id, ...value } = group; current.groups[id] = { ...value, tableIds: [...new Set(value.tableIds)] }; });
}
export function updateGroup(document: PresentationDocument, viewId: string, groupId: string, patch: Partial<Group>): PresentationDocument {
  return command(document, (draft) => { const current = view(draft, viewId); if (!Object.hasOwn(current.groups, groupId)) throw new Error("Groupe introuvable."); current.groups[groupId] = { ...current.groups[groupId]!, ...patch }; });
}
export function setRelationRoute(document: PresentationDocument, viewId: string, relationId: string, points: Point[]): PresentationDocument {
  return command(document, (draft) => { view(draft, viewId).edges[relationId] = { points }; });
}
export function resetRelationRoute(document: PresentationDocument, viewId: string, relationId: string): PresentationDocument {
  return command(document, (draft) => { delete view(draft, viewId).edges[relationId]; });
}
export function searchTables(graph: SchemaGraph, current: View, query: string): string[] {
  const term = query.trim().toLocaleLowerCase();
  return graph.tables.filter((table) => (current.system || Object.hasOwn(current.nodes, table.id)) &&
    [table.id, table.schema, ...table.columns.map((column) => column.name), ...Object.values(current.groups).filter((group) => group.tableIds.includes(table.id)).map((group) => group.name)]
      .some((value) => value?.toLocaleLowerCase().includes(term))).map((table) => table.id);
}
