import type { SchemaGraph } from "@dbcodex/core";

/** Compare parsed structures, ignoring source ranges and diagram positions. */
export function describeSchemaChanges(previous: SchemaGraph, current: SchemaGraph): string[] {
  const changes: string[] = [];
  const before = new Map(previous.tables.map(table => [table.id, table]));
  const after = new Map(current.tables.map(table => [table.id, table]));
  for (const table of previous.tables) if (!after.has(table.id)) changes.push(`Table supprimée : ${table.displayName ?? table.name}`);
  for (const table of current.tables) {
    const old = before.get(table.id);
    const name = table.displayName ?? table.name;
    if (!old) { changes.push(`Table ajoutée : ${name}`); continue; }
    const oldColumns = new Map(old.columns.map(column => [column.name, column]));
    const newColumns = new Set(table.columns.map(column => column.name));
    for (const column of old.columns) if (!newColumns.has(column.name)) changes.push(`Colonne supprimée : ${name}.${column.displayName ?? column.name}`);
    for (const column of table.columns) {
      const prior = oldColumns.get(column.name);
      const label = `${name}.${column.displayName ?? column.name}`;
      if (!prior) changes.push(`Colonne ajoutée : ${label}`);
      else {
        const details: string[] = [];
        if (prior.type !== column.type) details.push(`${prior.type} → ${column.type}`);
        if (prior.nullable !== column.nullable) details.push(column.nullable ? "facultative" : "obligatoire");
        if (prior.primaryKey !== column.primaryKey) details.push(column.primaryKey ? "clé primaire" : "clé primaire retirée");
        if (prior.displayName !== column.displayName) details.push("nom affiché modifié");
        if (details.length) changes.push(`Colonne modifiée : ${label} (${details.join(", ")})`);
      }
    }
  }
  const relationKey = (relation: SchemaGraph["relations"][number]) => JSON.stringify([relation.source, relation.target, relation.kind]);
  const oldRelations = new Set(previous.relations.map(relationKey));
  const newRelations = new Set(current.relations.map(relationKey));
  const label = (relation: SchemaGraph["relations"][number]) => `${relation.source.tableId} → ${relation.target.tableId}`;
  for (const relation of previous.relations) if (!newRelations.has(relationKey(relation))) changes.push(`Relation supprimée : ${label(relation)}`);
  for (const relation of current.relations) if (!oldRelations.has(relationKey(relation))) changes.push(`Relation ajoutée : ${label(relation)}`);
  return changes;
}
