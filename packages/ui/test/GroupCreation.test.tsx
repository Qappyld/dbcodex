// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupCreation } from "../src/GroupCreation.js";
import { graph, presentation } from "./workbench-fixture.js";
import { parseDbml } from "../../core/src/dbml-adapter.js";
import { createView, groupTables } from "../src/presentation-commands.js";
import { dbmlTableGroups } from "../src/dbml-patches.js";
afterEach(cleanup);
const props = () => ({ graph, presentation: presentation(), source: "Table users { id int }", selectedIds: ["public.users"], query: "",
  onQueryChange: vi.fn(), onSelectTable: vi.fn(), onPresentationChange: vi.fn(), onSourceChange: vi.fn() });
describe("GroupCreation", () => {
  it("keeps numeric-name collision IDs scanner-readable across three successive groups", () => {
    let source = "Table users { id int }\nTable teams { id int }\nTable jobs { id int }";
    let value = presentation();
    const p = props();
    const { rerender } = render(<GroupCreation onClose={vi.fn()} {...p} source={source} graph={parseDbml(source, "numeric.dbml").graph!} />);
    const expected: Array<{ name: string; tables: string[] }> = [];
    for (const [index, table] of ["users", "teams", "jobs"].entries()) {
      rerender(<GroupCreation onClose={vi.fn()} {...p} source={source} graph={parseDbml(source, "numeric.dbml").graph!} presentation={value} selectedIds={[`public.${table}`]} />);
      fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "2026" } });
      fireEvent.click(screen.getByRole("button", { name: "Créer le groupe" }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(p.onSourceChange).toHaveBeenCalledTimes(index + 1);
      const next = p.onSourceChange.mock.calls[index]![0];
      expect(next.startsWith(source)).toBe(true);
      expect(parseDbml(next, "numeric.dbml").diagnostics).toEqual([]);
      const id = index === 0 ? "g_2026" : `g_2026_${index + 1}`;
      value = p.onPresentationChange.mock.calls[index]![0];
      expect(value.views.all!.groups).toHaveProperty(id);
      expect(value.views.all!.groups[id]!.tableIds).toEqual([`public.${table}`]);
      expected.push({ name: id, tables: [`public.${table}`] });
      expect(dbmlTableGroups(next).map((group) => ({ name: group.name, tables: group.tables.map((member) => `${member.schema}.${member.name}`) }))).toEqual(expected);
      source = next;
    }
    expect(Object.keys(value.views.all!.groups)).toEqual(["g_2026", "g_2026_2", "g_2026_3"]);
  });
  it("ignores memberships in notes/comments and preserves an unrelated group with the requested name", () => {
    const source = "Table users { id int }\nTable teams { id int }\n// TableGroup fake { users }\nTableGroup business {\n teams\n Note: 'users TableGroup fake { users }'\n}";
    const parsed = parseDbml(source, "group.dbml"); expect(parsed.diagnostics).toEqual([]);
    const p = { ...props(), source, graph: parsed.graph! };
    render(<GroupCreation onClose={vi.fn()} {...p} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "Business" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le groupe" }));
    const next = p.onSourceChange.mock.calls[0]![0];
    expect(next.startsWith(source)).toBe(true);
    expect(next).toContain("TableGroup business_2");
    expect(parseDbml(next, "group.dbml").diagnostics).toEqual([]);
  });
  it.each(["same view", "another view", "DBML only", "alias"])("rejects a second functional group in %s without mutating source or presentation", (scenario) => {
    const source = scenario === "alias" ? "Table users as U { id int }\nTableGroup original { U }" : "Table users { id int }\nTableGroup original { public.users }";
    const parsed = parseDbml(source, "group.dbml"); expect(parsed.diagnostics).toEqual([]);
    let value = presentation();
    if (scenario === "same view" || scenario === "another view") value = groupTables(value, "all", { id: "original", name: "Original", color: "#16a34a", tableIds: ["public.users"] });
    if (scenario === "another view") value = createView(value, { id: "crm", name: "CRM", tableIds: ["public.users"] });
    const p = { ...props(), source, graph: parsed.graph!, presentation: value };
    const before = structuredClone(value);
    render(<GroupCreation onClose={vi.fn()} {...p} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le groupe" }));
    expect(screen.getByRole("alert").textContent).toMatch(/users.*déjà.*original/);
    expect(p.onSourceChange).not.toHaveBeenCalled(); expect(p.onPresentationChange).not.toHaveBeenCalled();
    expect(value).toEqual(before); expect(p.source).toBe(source);
    expect(parseDbml(p.source, "group.dbml").diagnostics).toEqual([]);
  });
  it("rejects regrouping after creation while preserving valid DBML", () => {
    const p = props(); const { rerender } = render(<GroupCreation onClose={vi.fn()} {...p} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le groupe" }));
    const source = p.onSourceChange.mock.calls[0]![0], value = p.onPresentationChange.mock.calls[0]![0];
    const parsed = parseDbml(source, "group.dbml"); expect(parsed.diagnostics).toEqual([]);
    p.onSourceChange.mockClear(); p.onPresentationChange.mockClear();
    rerender(<GroupCreation onClose={vi.fn()} {...p} source={source} graph={parsed.graph!} presentation={value} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le groupe" }));
    expect(screen.getByRole("alert").textContent).toMatch(/déjà.*first/);
    expect(p.onSourceChange).not.toHaveBeenCalled(); expect(p.onPresentationChange).not.toHaveBeenCalled();
  });
  it.each([
    ['Table "order.items" { id int }', "public", "order.items"],
    ['Table "sales.region".orders { id int }', "sales.region", "orders"],
    ['Table "sales.region"."order.items" { id int }', "sales.region", "order.items"],
    [String.raw`Table "sales\\region"."order\"items\\archive" { id int }`, "sales\\region", 'order"items\\archive'],
  ])("quotes identifier boundaries in a valid grouping patch for %s", (source, schema, name) => {
    const parsed = parseDbml(source, "identifiers.dbml"); expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph!.tables[0]).toMatchObject({ schema, name });
    const p = { ...props(), source, graph: parsed.graph!, selectedIds: [parsed.graph!.tables[0]!.id] };
    render(<GroupCreation onClose={vi.fn()} {...p} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "Business" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le groupe" }));
    const grouped = parseDbml(p.onSourceChange.mock.calls[0]![0], "identifiers.dbml");
    expect(grouped.diagnostics).toEqual([]);
    expect(grouped.graph!.tables[0]).toMatchObject({ schema, name });
    const next = { ...p, source: p.onSourceChange.mock.calls[0]![0], presentation: p.onPresentationChange.mock.calls[0]![0] };
    cleanup(); p.onSourceChange.mockClear(); p.onPresentationChange.mockClear(); render(<GroupCreation onClose={vi.fn()} {...next} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le groupe" }));
    expect(screen.getByRole("alert").textContent).toContain("déjà");
    expect(p.onSourceChange).not.toHaveBeenCalled(); expect(p.onPresentationChange).not.toHaveBeenCalled();
  });

  it("submits the form and cancels with Escape without changing the document", () => {
    const p = props(), close = vi.fn(); render(<GroupCreation {...p} onClose={close} />);
    const input = screen.getByLabelText("Nom du groupe");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "People" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce(); expect(p.onSourceChange).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole("dialog"));
    expect(p.onSourceChange).toHaveBeenCalledOnce();
    expect(p.onPresentationChange.mock.calls[0]![0].views.all.groups.people.tableIds).toEqual(["public.users"]);
  });
  it("disables creation for an empty selection or a read-only document", () => {
    const p = props(); const { rerender } = render(<GroupCreation {...p} selectedIds={[]} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "People" } });
    expect(screen.getByRole("button", { name: "Créer le groupe" })).toHaveProperty("disabled", true);
    rerender(<GroupCreation {...p} readOnly onClose={vi.fn()} />);
    fireEvent.submit(screen.getByRole("dialog"));
    expect(p.onSourceChange).not.toHaveBeenCalled();
  });
});
