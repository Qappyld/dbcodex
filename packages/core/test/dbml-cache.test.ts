import { afterEach, describe, expect, it, vi } from "vitest";
import { Parser } from "@dbml/core";
import { parseDbml } from "../src/dbml-adapter.js";

afterEach(() => vi.restoreAllMocks());
describe("bounded DBML parse reuse", () => {
  it("reuses identical text across paths without sharing mutable graphs", () => {
    const spy = vi.spyOn(Parser.prototype, "parse");
    const source = "Table cache_isolation { id int [pk] }";
    const first = parseDbml(source, "first.dbcd");
    first.graph!.tables[0]!.columns[0]!.name = "mutated";
    first.diagnostics.push({ severity: "error", message: "mutated" });
    const second = parseDbml(source, "second.dbcd");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(second.graph!.sourcePath).toBe("second.dbcd");
    expect(second.graph!.tables[0]!.columns[0]!.name).toBe("id");
    expect(second.diagnostics).toEqual([]);
    second.graph!.tables.length = 0;
    expect(parseDbml(source, "third.dbcd").graph!.tables).toHaveLength(1);
  });
  it("invalidates by exact text and preserves invalid-source diagnostics", () => {
    const spy = vi.spyOn(Parser.prototype, "parse");
    const source = "Table cache_edits { id int }";
    expect(parseDbml(source, "same.dbcd").graph).not.toBeNull();
    expect(parseDbml(source + "\nTable broken {", "same.dbcd").graph).toBeNull();
    expect(parseDbml(source + "\nTable broken {", "same.dbcd").diagnostics[0]!.severity).toBe("error");
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("evicts old entries instead of retaining an unbounded editing history", () => {
    const spy = vi.spyOn(Parser.prototype, "parse");
    for (let i = 0; i < 5; i++) parseDbml(`Table cache_eviction_${i} { id int }`, "cache.dbcd");
    parseDbml("Table cache_eviction_0 { id int }", "cache.dbcd");
    expect(spy).toHaveBeenCalledTimes(6);
  });
  it("does not retain oversized source text", () => {
    const spy = vi.spyOn(Parser.prototype, "parse");
    const source = "//" + "x".repeat(500_001) + "\nTable cache_large { id int }";
    expect(parseDbml(source, "large.dbcd").graph).not.toBeNull();
    expect(parseDbml(source, "large.dbcd").graph).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
