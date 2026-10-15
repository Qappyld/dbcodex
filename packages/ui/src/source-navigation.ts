import type { SchemaGraph, SourceRange } from "@dbcodex/core";

export type EntitySelection = { kind: "table" | "column" | "relation" | "group"; id: string; tableId: string };
export function sourceEntities(graph: SchemaGraph): Array<EntitySelection & { range: SourceRange }> {
  return [
    ...(graph.tableGroups ?? []).flatMap(group => group.sourceRange ? [{ kind: "group" as const, id: group.id, tableId: group.tableIds[0] ?? "", range: group.sourceRange }] : []),
    ...graph.tables.flatMap((table) => [
      ...(table.sourceRange ? [{ kind: "table" as const, id: table.id, tableId: table.id, range: table.sourceRange }] : []),
      ...table.columns.flatMap((column) => column.sourceRange ? [{ kind: "column" as const, id: column.id, tableId: table.id, range: column.sourceRange }] : []),
    ]),
    ...graph.relations.flatMap((relation) => relation.sourceRange ? [{ kind: "relation" as const, id: relation.id, tableId: relation.source.tableId, range: relation.sourceRange }] : []),
  ];
}
export function entityAtOffset(graph: SchemaGraph, offset: number): EntitySelection | null {
  return sourceEntities(graph).filter((entity) => entity.range.start.offset <= offset && offset < entity.range.end.offset)
    .sort((a, b) => (a.range.end.offset - a.range.start.offset) - (b.range.end.offset - b.range.start.offset))[0] ?? null;
}
export function entityRange(graph: SchemaGraph, selection: EntitySelection): SourceRange | undefined {
  return sourceEntities(graph).find((entity) => entity.kind === selection.kind && entity.id === selection.id)?.range;
}
