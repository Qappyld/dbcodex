import type { PresentationDocument, SchemaGraph } from "@dbcodex/core";
import { defaultPosition } from "./presentation-commands.js";

type Revision = { sourceText: string; presentation: PresentationDocument };
export interface RevisionDiffSummary {
  addedLines: number; removedLines: number; changedLines: number;
  movedNodes: number; changedDetailLevels: number; changedRoutes: number;
  addedViews: number; removedViews: number;
}

// Hirschberg LCS: exact line alignment with linear working memory.
function lengths(a: string[], b: string[]): Uint32Array {
  const row = new Uint32Array(b.length + 1);
  for (const line of a) {
    let diagonal = 0;
    for (let j = 0; j < b.length; j++) {
      const above = row[j + 1]!;
      row[j + 1] = line === b[j] ? diagonal + 1 : Math.max(above, row[j]!);
      diagonal = above;
    }
  }
  return row;
}
function align(a: string[], b: string[], ai = 0, bi = 0): Array<[number, number]> {
  if (!a.length || !b.length) return [];
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  if (prefix) {
    const matches: Array<[number, number]> = Array.from({ length: prefix }, (_, i) => [ai + i, bi + i]);
    return matches.concat(align(a.slice(prefix), b.slice(prefix), ai + prefix, bi + prefix));
  }
  if (a.length === 1) { const index = b.indexOf(a[0]!); return index < 0 ? [] : [[ai, bi + index]]; }
  const middle = Math.floor(a.length / 2);
  const left = lengths(a.slice(0, middle), b), right = lengths(a.slice(middle).reverse(), [...b].reverse());
  let split = 0;
  for (let j = 1; j <= b.length; j++) if (left[j]! + right[b.length - j]! > left[split]! + right[b.length - split]!) split = j;
  return [...align(a.slice(0, middle), b.slice(0, split), ai, bi), ...align(a.slice(middle), b.slice(split), ai + middle, bi + split)];
}

/** Counts replacement lines per contiguous edit hunk. Presentation counts are per shared view.
 * Detail counts include changed view defaults and changed node effective detail levels.
 * Positions use the canvas's graph table order; without a matching graph table, use
 * the sorted union of explicit node IDs across both documents, after known tables.
 * Thus materializing or removing an explicit default does not count as a move.
 * Routes include added/removed control-point overrides; added/removed views count separately.
 */
export function summarizeRevisionDiff(previous: Revision, next: Revision, graph?: Pick<SchemaGraph, "tables"> | null): RevisionDiffSummary {
  const result: RevisionDiffSummary = { addedLines: 0, removedLines: 0, changedLines: 0,
    movedNodes: 0, changedDetailLevels: 0, changedRoutes: 0, addedViews: 0, removedViews: 0 };
  const a = previous.sourceText ? previous.sourceText.split(/\r?\n/) : [];
  const b = next.sourceText ? next.sourceText.split(/\r?\n/) : [];
  const tableIndices = new Map(graph?.tables.map((table, index) => [table.id, index]));
  const explicitIds = new Set([previous.presentation, next.presentation]
    .flatMap((document) => Object.values(document.views).flatMap((view) => Object.keys(view.nodes))));
  for (const id of [...explicitIds].sort()) if (!tableIndices.has(id)) tableIndices.set(id, tableIndices.size);
  let ai = 0, bi = 0;
  for (const [i, j] of [...align(a, b), [a.length, b.length]]) {
    const changed = Math.min(i! - ai, j! - bi);
    result.changedLines += changed;
    result.removedLines += i! - ai - changed;
    result.addedLines += j! - bi - changed;
    ai = i! + 1; bi = j! + 1;
  }
  for (const [id, view] of Object.entries(previous.presentation.views)) {
    const other = next.presentation.views[id];
    if (!other) { result.removedViews++; continue; }
    if (view.defaultDetail !== other.defaultDetail) result.changedDetailLevels++;
    for (const nodeId of new Set([...Object.keys(view.nodes), ...Object.keys(other.nodes)])) {
      const node = view.nodes[nodeId], target = other.nodes[nodeId];
      const fallback = defaultPosition(tableIndices.get(nodeId)!);
      const from = node ?? fallback, to = target ?? fallback;
      if (from.x !== to.x || from.y !== to.y) result.movedNodes++;
      if ((node?.detail ?? view.defaultDetail) !== (target?.detail ?? other.defaultDetail)) result.changedDetailLevels++;
    }
    for (const edgeId of new Set([...Object.keys(view.edges), ...Object.keys(other.edges)])) {
      const oldPoints = view.edges[edgeId]?.points ?? [], newPoints = other.edges[edgeId]?.points ?? [];
      if (oldPoints.length !== newPoints.length || oldPoints.some((point, index) => point.x !== newPoints[index]?.x || point.y !== newPoints[index]?.y)) result.changedRoutes++;
    }
  }
  for (const id of Object.keys(next.presentation.views)) if (!previous.presentation.views[id]) result.addedViews++;
  return result;
}
