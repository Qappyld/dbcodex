import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDbml } from "../src/dbml-adapter.js";
import { DBCD_MAX_SOURCE_BYTES } from "../src/dbcd-resource-limits.js";

const fixtureUrl = new URL("../../../fixtures/basic.dbml", import.meta.url);

describe("parseDbml", () => {
  it("preserves the table header color supplied by DBML", () => {
    const parsed = parseDbml("Table Section [headercolor: #CA4242] {\n Id uuid [pk]\n}\n", "colors.dbml");
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph!.tables[0]!.headerColor).toBe("#CA4242");
  });
  it("rejects oversized UTF-8 input before invoking the DBML parser", () => {
    expect(() => parseDbml("é".repeat(DBCD_MAX_SOURCE_BYTES / 2 + 1), "large.dbml")).toThrow(/size limit/);
  });
  it("keeps semantic relation identities across insertion, deletion and reordering", () => {
    const tables = "Table a { id int [pk] }\nTable b { a int }\nTable c { a int }\n";
    const first = parseDbml(tables + "Ref retained: b.a > a.id", "stable.dbml").graph!;
    const inserted = parseDbml(tables + "Ref inserted: c.a > a.id\nRef retained: b.a > a.id", "stable.dbml").graph!;
    const reordered = parseDbml(tables + "Ref retained: b.a > a.id\nRef inserted: c.a > a.id", "stable.dbml").graph!;
    const retained = first.relations[0]!;
    expect(inserted.relations.find((relation) => relation.source.tableId === "public.b")?.id).toBe(retained.id);
    expect(reordered.relations.find((relation) => relation.source.tableId === "public.b")?.id).toBe(retained.id);
    expect(new Set(inserted.relations.map((relation) => relation.id)).size).toBe(2);
    const savedRoutes = { [retained.id]: { points: [{ x: 40, y: 90 }] } };
    const selection = retained.id;
    expect(inserted.relations.find((relation) => relation.id === selection)).toBeDefined();
    expect(savedRoutes[inserted.relations.find((relation) => relation.source.tableId === "public.b")!.id]).toEqual(savedRoutes[selection]);
  });

  it("exposes source ranges and imported functional groups and views without parser internals", () => {
    const source = "// keep\r\nTable a { id int [pk] }\r\nTable b { a int }\r\nRef kept: b.a > a.id\r\nTableGroup team [color: #123456] {\r\n a\r\n b\r\n}\r\nDiagramView subset {\r\n Tables {\r\n  a\r\n }\r\n}\r\n";
    const graph = parseDbml(source, "ranges.dbml").graph!;
    const table = graph.tables.find((item) => item.name === "a")!;
    expect(table.sourceRange?.start).toEqual({ line: 2, column: 1, offset: source.indexOf("Table a") });
    expect(source.slice(table.columns[0]!.sourceRange!.start.offset, table.columns[0]!.sourceRange!.end.offset)).toContain("id int [pk]");
    expect(source.slice(graph.relations[0]!.sourceRange!.start.offset, graph.relations[0]!.sourceRange!.end.offset)).toContain("Ref kept");
    expect(graph.tableGroups).toEqual([expect.objectContaining({ id: "team", name: "team", color: "#123456", tableIds: ["public.a", "public.b"] })]);
    expect(graph.views).toEqual([expect.objectContaining({ id: "subset", name: "subset", tableIds: ["public.a"] })]);
    expect(JSON.stringify(graph)).not.toContain("filepath");
  });
  it.each([
    ["Ref: a.fk > b.code", ["public.a", "*"], ["public.b", "1"]],
    ["Ref: b.code < a.fk", ["public.b", "1"], ["public.a", "*"]],
    ["Ref: b.code - a.fk", ["public.b", "1"], ["public.a", "1"]],
  ])("retains endpoint order and cardinality for %s", (reference, source, target) => {
    const result = parseDbml(`Table a { fk int }\nTable b { code int [unique] }\n${reference}`, "direction.dbml");
    const relation = result.graph!.relations[0]!;
    expect([relation.source.tableId, relation.source.cardinality]).toEqual(source);
    expect([relation.target.tableId, relation.target.cardinality]).toEqual(target);
  });

  it("normalizes inline one-to-one references with the FK endpoint second", () => {
    const result = parseDbml("Table a { fk int [ref: - b.code] }\nTable b { code int [unique] }", "inline.dbml");
    const relation = result.graph!.relations[0]!;
    expect(relation.source.tableId).toBe("public.b");
    expect(relation.target.tableId).toBe("public.a");
  });
  it("normalizes tables, columns, and relations deterministically", async () => {
    const source = await readFile(fileURLToPath(fixtureUrl), "utf8");

    const result = parseDbml(source, "fixtures/basic.dbml");

    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.tables.map((table) => table.id)).toEqual([
      "public.comments",
      "public.posts",
      "public.users",
    ]);
    expect(result.graph?.tables.find((table) => table.id === "public.users")?.columns).toContainEqual({
      id: "public.users.id",
      name: "id",
      type: "int",
      primaryKey: true,
      nullable: false,
      sourceRange: { start: { line: 2, column: 3, offset: source.indexOf("id int") }, end: { line: 2, column: 24, offset: source.indexOf("id int") + 21 } },
    });
    expect(result.graph?.relations).toHaveLength(2);
    expect(result.graph?.relations.map((relation) => [
      relation.source.tableId,
      relation.target.tableId,
    ])).toEqual([
      ["public.posts", "public.users"],
      ["public.comments", "public.posts"],
    ]);
  });

  it("returns a sanitized diagnostic for invalid DBML", () => {
    const result = parseDbml("Table users {", "broken.dbml");

    expect(result.graph).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      severity: "error",
      code: 1005,
      location: {
        start: { line: 1, column: expect.any(Number) },
      },
    });
    expect(result.diagnostics[0]?.message).not.toContain("Table users {");
  });

  it("never includes Records values in the graph result", () => {
    const secret = "private-alice@example.test";
    const result = parseDbml(`
      Table users {
        id int [pk]
        email varchar
      }
      records users(id, email) {
        1, '${secret}'
      }
    `, "records.dbml");

    expect(result.graph).not.toBeNull();
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
