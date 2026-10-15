import { describe, expect, it } from "vitest";
import { describeSchemaChanges } from "../src/history-changes.js";
import { graph } from "./workbench-fixture.js";

describe("history schema changes", () => {
  it("names added and removed objects, type changes and required columns", () => {
    const next = structuredClone(graph);
    next.tables.pop();
    next.tables[0]!.columns[2]!.type = "varchar(80)";
    next.tables[0]!.columns[2]!.nullable = false;
    next.tables[0]!.columns.splice(1, 1);
    next.tables[0]!.columns.push({ id: "email", name: "email", type: "text", primaryKey: false, nullable: true });
    next.tables.push({ id: "public.orders", name: "orders", schema: "public", columns: [] });
    next.relations = [];
    expect(describeSchemaChanges(graph, next)).toEqual([
      "Table supprimée : teams",
      "Colonne supprimée : users.team_id",
      "Colonne modifiée : users.name (text → varchar(80), obligatoire)",
      "Colonne ajoutée : users.email",
      "Table ajoutée : orders",
      "Relation supprimée : public.users → public.teams",
    ]);
  });
  it("ignores source locations and ordering", () => {
    const next = structuredClone(graph);
    next.tables.reverse();
    next.tables[1]!.columns.reverse();
    next.tables[0]!.sourceRange = { start: { line: 1, column: 1, offset: 0 }, end: { line: 2, column: 1, offset: 10 } };
    expect(describeSchemaChanges(graph, next)).toEqual([]);
  });
});
