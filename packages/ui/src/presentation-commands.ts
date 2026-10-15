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
export function dbmlViewIds(graph: SchemaGraph): Map<string, string> {
  const reserved = new Set(["all", "__proto__", "constructor", "prototype"]);
  const used = new Set([...reserved, ...(graph.views ?? []).map((view) => view.id)]);
  return new Map((graph.views ?? []).map((view) => {
    let id = view.id;
    if (reserved.has(id)) { id = `_dbml_${view.id}`; let suffix = 2; while (used.has(id)) id = `_dbml_${view.id}_${suffix++}`; used.add(id); }
    return [view.id, id];
  }));
}
/** DBML owns functional membership; presentation owns the surviving entities' layout. */
export function reconcileDbmlPresentation(document: PresentationDocument, graph: SchemaGraph): PresentationDocument {
  if (!graph.views && !graph.tableGroups) return document;
  return command(document, (draft) => {
    if (graph.views) {
      const ids = dbmlViewIds(graph), definitions = new Set(ids.values());
      for (const id of Object.keys(draft.views)) if (id !== "all" && !definitions.has(id)) delete draft.views[id];
      for (const definition of graph.views) {
        const id = ids.get(definition.id)!;
        const saved = draft.views[id];
        draft.views[id] = { name: saved?.name ?? definition.name, system: false,
          defaultDetail: saved?.defaultDetail ?? draft.views.all!.defaultDetail,
          viewport: saved?.viewport ?? { x: 0, y: 0, zoom: 1 }, edges: saved?.edges ?? {}, groups: saved?.groups ?? {},
          nodes: Object.fromEntries(definition.tableIds.map((id, index) => [id, saved?.nodes[id] ?? draft.views.all!.nodes[id] ?? defaultPosition(index)])) };
      }
      if (!Object.hasOwn(draft.views, draft.activeViewId)) draft.activeViewId = "all";
    }
    if (graph.tableGroups) for (const current of Object.values(draft.views)) {
      current.groups = Object.fromEntries(graph.tableGroups.map((group) => [group.id, {
        name: current.groups[group.id]?.name ?? group.name,
        color: group.color ?? "#16a34a", tableIds: group.tableIds,
        ...(current.groups[group.id]?.collapsed === undefined ? {} : { collapsed: current.groups[group.id]!.collapsed }),
      }]));
    }
  });
}
export function createView(document: PresentationDocument, input: { id: string; name: string; tableIds: string[] }): PresentationDocument {
  return command(document, (draft) => {
    unique(draft, input.id);
    const origin = view(draft, draft.activeViewId);
    draft.views[input.id] = { name: input.name, system: false, defaultDetail: origin.defaultDetail,
      nodes: Object.fromEntries([...new Set(input.tableIds)].map((id, index) => [id, origin.nodes[id] ?? defaultPosition(index)])),
      groups: structuredClone(origin.groups), edges: {}, viewport: { x: 0, y: 0, zoom: 1 } };
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
  return setNodePositions(document, viewId, [{ id: tableId, position }]);
}
/** Apply a multi-selection/group move with one clone and one validation. */
export function setNodePositions(document: PresentationDocument, viewId: string, positions: ReadonlyArray<{ id: string; position: Point }>): PresentationDocument {
  return command(document, (draft) => {
    for (const { id, position } of positions) Object.assign(node(draft, viewId, id), position);
  });
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
export function setRelationRoute(document: PresentationDocument, viewId: string, relationId: string, points: Point[], metadata: Omit<View["edges"][string], "points"> = {}): PresentationDocument {
  return command(document, (draft) => { view(draft, viewId).edges[relationId] = { points, ...metadata }; });
}
export function resetRelationRoute(document: PresentationDocument, viewId: string, relationId: string): PresentationDocument {
  return command(document, (draft) => { delete view(draft, viewId).edges[relationId]; });
}
export function searchTables(graph: SchemaGraph, current: View, query: string): string[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return graph.tables.map(table => table.id);
  const groupNames = new Map<string, string[]>();
  for (const group of Object.values(current.groups)) for (const id of group.tableIds) {
    const names = groupNames.get(id);
    if (names) names.push(group.name); else groupNames.set(id, [group.name]);
  }
  return graph.tables.filter((table) =>
    [table.id, table.schema, ...table.columns.map((column) => column.name), ...(groupNames.get(table.id) ?? [])]
      .some((value) => value?.toLocaleLowerCase().includes(term))).map((table) => table.id);
}
