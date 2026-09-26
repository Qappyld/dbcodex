import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDbml } from "../src/dbml-adapter.js";

const fixtureUrl = new URL("../../../fixtures/basic.dbml", import.meta.url);

describe("parseDbml", () => {
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
