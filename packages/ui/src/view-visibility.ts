import type { PresentationDocument, SchemaGraph } from "@dbcodex/core";
import { defaultPosition } from "./presentation-commands.js";

export type VisibilityPreview = { viewId: string; hidden: Record<string, boolean> };
export function tableHidden(document: PresentationDocument, viewId: string, id: string): boolean {
  const view = document.views[viewId]!;
  return view.nodes[id]?.hidden ?? (!view.system && !Object.hasOwn(view.nodes, id));
}
/** A transient overlay: never persist these nodes through the project save command. */
export function previewVisibility(document: PresentationDocument, graph: SchemaGraph, preview: VisibilityPreview | null): PresentationDocument {
  if (!preview || preview.viewId !== document.activeViewId) return document;
  const result = structuredClone(document), view = result.views[preview.viewId]!;
  graph.tables.forEach((table, index) => {
    view.nodes[table.id] = { ...(view.nodes[table.id] ?? result.views.all!.nodes[table.id] ?? defaultPosition(index)),
      hidden: preview.hidden[table.id] ?? tableHidden(document, preview.viewId, table.id) };
  });
  return result;
}
/** Retain canvas edits while removing the transient visibility overlay. */
export function withoutVisibilityPreview(next: PresentationDocument, original: PresentationDocument, preview: VisibilityPreview | null): PresentationDocument {
  if (!preview || preview.viewId !== next.activeViewId) return next;
  const result = structuredClone(next), view = result.views[preview.viewId]!, saved = original.views[preview.viewId]!;
  for (const [id, node] of Object.entries(view.nodes)) {
    if (!Object.hasOwn(saved.nodes, id) && !saved.system) {
      if (preview.hidden[id] === false) node.hidden = true;
      else delete view.nodes[id];
      continue;
    }
    if (saved.nodes[id]?.hidden === undefined) delete node.hidden;
    else node.hidden = saved.nodes[id]!.hidden;
  }
  return result;
}
