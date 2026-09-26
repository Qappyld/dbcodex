// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewInspector } from "../src/ViewInspector.js";
import { graph, presentation } from "./workbench-fixture.js";
import { parseDbml } from "../../core/src/dbml-adapter.js";
import { createView, groupTables } from "../src/presentation-commands.js";
afterEach(cleanup);
const props = () => ({ graph, presentation: presentation(), source: "Table users { id int }", selectedIds: ["public.users"], query: "",
  onQueryChange: vi.fn(), onSelectTable: vi.fn(), onPresentationChange: vi.fn(), onSourceChange: vi.fn() });
describe("ViewInspector", () => {
  it("ignores memberships in notes/comments and preserves an unrelated group with the requested name", () => {
    const source = "Table users { id int }\nTable teams { id int }\n// TableGroup fake { users }\nTableGroup business {\n teams\n Note: 'users TableGroup fake { users }'\n}";
    const parsed = parseDbml(source, "group.dbml"); expect(parsed.diagnostics).toEqual([]);
    const p = { ...props(), source, graph: parsed.graph! };
    render(<ViewInspector {...p} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "Business" } });
    fireEvent.click(screen.getByRole("button", { name: "Grouper" })); fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
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
    render(<ViewInspector {...p} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Grouper" }));
    expect(screen.getByRole("alert").textContent).toMatch(/users.*déjà.*original/);
    expect(screen.queryByRole("button", { name: "Appliquer" })).toBeNull();
    expect(p.onSourceChange).not.toHaveBeenCalled(); expect(p.onPresentationChange).not.toHaveBeenCalled();
    expect(value).toEqual(before); expect(p.source).toBe(source);
    expect(parseDbml(p.source, "group.dbml").diagnostics).toEqual([]);
  });
  it("rejects regrouping after a successful Apply while preserving valid DBML", () => {
    const p = props(); const { rerender } = render(<ViewInspector {...p} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Grouper" })); fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    const source = p.onSourceChange.mock.calls[0]![0], value = p.onPresentationChange.mock.calls[0]![0];
    const parsed = parseDbml(source, "group.dbml"); expect(parsed.diagnostics).toEqual([]);
    p.onSourceChange.mockClear(); p.onPresentationChange.mockClear();
    rerender(<ViewInspector {...p} source={source} graph={parsed.graph!} presentation={value} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Grouper" }));
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
    render(<ViewInspector {...p} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "Business" } });
    fireEvent.click(screen.getByRole("button", { name: "Grouper" })); fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    const grouped = parseDbml(p.onSourceChange.mock.calls[0]![0], "identifiers.dbml");
    expect(grouped.diagnostics).toEqual([]);
    expect(grouped.graph!.tables[0]).toMatchObject({ schema, name });
    const next = { ...p, source: p.onSourceChange.mock.calls[0]![0], presentation: p.onPresentationChange.mock.calls[0]![0] };
    cleanup(); p.onSourceChange.mockClear(); p.onPresentationChange.mockClear(); render(<ViewInspector {...next} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Grouper" }));
    expect(screen.getByRole("alert").textContent).toContain("déjà");
    expect(p.onSourceChange).not.toHaveBeenCalled(); expect(p.onPresentationChange).not.toHaveBeenCalled();
  });
  it("keeps the system view first and disables destructive actions", () => {
    render(<ViewInspector {...props()} />);
    expect(screen.getAllByRole("option")[0]?.textContent).toBe("Toutes les tables");
    expect(screen.getByRole("button", { name: "Supprimer" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Renommer" })).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Détail de la vue")).toBeTruthy();
    expect(screen.getByLabelText("Détail de public.users")).toBeTruthy();
  });
  it("creates views, filters search, selects results and toggles eyes through callbacks", () => {
    const p = props(); render(<ViewInspector {...p} />);
    fireEvent.change(screen.getByLabelText("Nom de la vue"), { target: { value: "CRM" } });
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle vue" }));
    expect(p.onPresentationChange).toHaveBeenCalledWith(expect.objectContaining({ activeViewId: "crm" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "team_id" } });
    expect(p.onQueryChange).toHaveBeenCalledWith("team_id");
    fireEvent.click(screen.getByRole("button", { name: "Centrer public.users" }));
    expect(p.onSelectTable).toHaveBeenCalledWith("public.users");
    fireEvent.click(screen.getByLabelText("Afficher public.users"));
    expect(p.onPresentationChange.mock.calls.at(-1)?.[0].views.all.nodes["public.users"].hidden).toBe(true);
  });
  it("previews grouping and changes source and presentation only after Apply", () => {
    const p = props(); render(<ViewInspector {...p} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "Personnes" } });
    fireEvent.click(screen.getByRole("button", { name: "Grouper" }));
    expect(screen.getByLabelText("Aperçu du patch DBML").textContent).toContain("TableGroup");
    expect(p.onSourceChange).not.toHaveBeenCalled(); expect(p.onPresentationChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    expect(p.onSourceChange).toHaveBeenCalledWith(expect.stringContaining("TableGroup"));
    expect(parseDbml(p.onSourceChange.mock.calls[0]![0], "group.dbml").diagnostics).toEqual([]);
    expect(p.onPresentationChange.mock.calls[0]?.[0].views.all.groups.personnes.tableIds).toEqual(["public.users"]);
  });
  it("guards read-only edits", () => {
    render(<ViewInspector {...props()} readOnly />);
    expect(screen.getByRole("button", { name: "Grouper" })).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Détail de la vue")).toHaveProperty("disabled", true);
  });
  it("rejects a stale group preview after the DBML changes", () => {
    const p = props(); const { rerender } = render(<ViewInspector {...p} />);
    fireEvent.change(screen.getByLabelText("Nom du groupe"), { target: { value: "People" } });
    fireEvent.click(screen.getByRole("button", { name: "Grouper" }));
    rerender(<ViewInspector {...p} source={p.source + "\n// edit"} />);
    fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    expect(screen.getByRole("alert").textContent).toContain("modifié");
    expect(p.onSourceChange).not.toHaveBeenCalled();
    expect(p.onPresentationChange).not.toHaveBeenCalled();
  });
});
