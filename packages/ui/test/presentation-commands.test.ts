import { describe, expect, it } from "vitest";
import { presentation, graph } from "./workbench-fixture.js";
import { createView, duplicateView, renameView, deleteView, setActiveView, setViewDetail, setNodeDetail,
  groupTables, updateGroup, setRelationRoute, resetRelationRoute, setNodeHidden, setNodePosition, setPanels, searchTables } from "../src/presentation-commands.js";
import { previewDbmlBlock, applyDbmlPatch } from "../src/dbml-patches.js";

describe("presentation commands", () => {
  it("validates immutable panel updates", () => {
    const initial = presentation();
    expect(setPanels(initial, { editor: 450 }).panels.editor).toBe(450);
    expect(initial.panels.editor).toBe(320);
    expect(() => setPanels(initial, { editor: -1 })).toThrow(/présentation/);
  });
  it("creates, duplicates, activates, renames and deletes views without mutating input", () => {
    const original = presentation(); const before = structuredClone(original);
    const created = createView(original, { id: "crm", name: "CRM", tableIds: ["public.users"] });
    expect(created.views.crm?.nodes["public.users"]).toEqual({ x: 20, y: 50 });
    const copy = duplicateView(created, "crm", "copy", "Copie");
    const renamed = renameView(setActiveView(copy, "copy"), "copy", "Clients");
    expect(renamed.views.copy?.name).toBe("Clients");
    expect(deleteView(renamed, "copy").activeViewId).toBe("all");
    expect(original).toEqual(before);
    expect(copy.views.copy).not.toBe(created.views.crm);
  });
  it("preserves the system view and rejects invalid and missing entities with localized errors", () => {
    expect(() => deleteView(presentation(), "all")).toThrow("La vue système ne peut pas être supprimée.");
    expect(() => renameView(presentation(), "all", "X")).toThrow(/vue système/);
    expect(() => setActiveView(presentation(), "missing")).toThrow(/introuvable/);
    expect(() => createView(presentation(), { id: "all", name: "X", tableIds: [] })).toThrow(/existe/);
    expect(() => setRelationRoute(presentation(), "all", "ref:1", [{ x: NaN, y: 0 }])).toThrow(/présentation/);
    expect(() => setViewDetail(presentation(), "all", "invalid" as never)).toThrow(/présentation/);
  });
  it("sets and resets detail, visibility, position, groups and routes immutably", () => {
    const initial = presentation();
    let value = setViewDetail(initial, "all", "all");
    value = setNodeDetail(value, "all", "public.users", "names");
    expect(value.views.all?.nodes["public.users"]?.detail).toBe("names");
    value = setNodeDetail(value, "all", "public.users", null);
    expect(value.views.all?.nodes["public.users"]).not.toHaveProperty("detail");
    value = setNodeHidden(value, "all", "public.users", true);
    value = setNodePosition(value, "all", "public.users", { x: 88, y: 99 });
    value = groupTables(value, "all", { id: "people", name: "Personnes", color: "#16a34a", tableIds: ["public.users"] });
    value = updateGroup(value, "all", "people", { collapsed: true, color: "#123456" });
    expect(value.views.all?.groups.people).toEqual({ name: "Personnes", color: "#123456", collapsed: true, tableIds: ["public.users"] });
    value = setRelationRoute(value, "all", "ref:1", [{ x: 100, y: 20 }]);
    expect(value.views.all?.edges["ref:1"]?.points).toEqual([{ x: 100, y: 20 }]);
    expect(resetRelationRoute(value, "all", "ref:1").views.all?.edges).toEqual({});
    expect(initial.views.all?.nodes["public.users"]).toEqual({ x: 20, y: 50 });
  });
  it("searches tables, columns, schemas and group names", () => {
    const value = groupTables(presentation(), "all", { id: "g", name: "Personnes", color: "#16a34a", tableIds: ["public.users"] });
    for (const query of ["users", "team_id", "Personnes"]) expect(searchTables(graph, value.views.all!, query)).toEqual(["public.users"]);
    expect(searchTables(graph, value.views.all!, "PUBLIC")).toHaveLength(2);
    expect(searchTables(graph, value.views.all!, "absent")).toEqual([]);
  });
});

describe("focused DBML patches", () => {
  const source = "// untouched\r\nTable users { id int [pk] }\r\nTableGroup people {\r\n  users\r\n}\r\n// trailing\r\n";
  it("replaces exactly a mapped block, preserving comments and CRLF", () => {
    const preview = previewDbmlBlock(source, "TableGroup", "people", "TableGroup people [color: #16a34a] {\n  public.users\n}");
    expect(preview.ambiguous).toBe(false);
    expect(applyDbmlPatch(source, preview)).toBe(source.replace("TableGroup people {\r\n  users\r\n}", "TableGroup people [color: #16a34a] {\r\n  public.users\r\n}"));
    expect(() => applyDbmlPatch(source + "// edit", preview)).toThrow(/modifié/);
  });
  it("ignores fake blocks in comments and strings and previews ambiguous append", () => {
    const tricky = "// TableGroup people {}\nTable users { note: 'TableGroup people {}' }\n";
    expect(previewDbmlBlock(tricky, "TableGroup", "people", "TableGroup people {}").from).toBe(tricky.length);
    const duplicate = source + "TableGroup people {}";
    const preview = previewDbmlBlock(duplicate, "TableGroup", "people", "TableGroup people {}");
    expect(preview.ambiguous).toBe(true);
    expect(preview.diff).toContain("+TableGroup");
    expect(() => applyDbmlPatch(duplicate, preview)).toThrow(/explicite/);
    expect(applyDbmlPatch(duplicate, preview, true)).toContain("// untouched");
  });
  it("maps DiagramView blocks without serializing other declarations", () => {
    const text = "Table users {}\nDiagramView crm { users }\n";
    expect(applyDbmlPatch(text, previewDbmlBlock(text, "DiagramView", "crm", "DiagramView crm {\n public.users\n}"))).toBe("Table users {}\nDiagramView crm {\n public.users\n}\n");
  });
  it.each(["/* TableGroup people {}", "TableGroup people\nTable users {}", "Note n { 'unterminated TableGroup people {}"])("marks malformed source ambiguous without replacing declarations: %s", (source) => {
    const patch = previewDbmlBlock(source, "TableGroup", "people", "TableGroup people {}");
    expect(patch.ambiguous).toBe(true);
    expect(patch.from).toBe(source.length);
  });
});
