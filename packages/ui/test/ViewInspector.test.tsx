// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewInspector } from "../src/ViewInspector.js";
import { graph, presentation } from "./workbench-fixture.js";
import { parseDbml } from "../../core/src/dbml-adapter.js";
afterEach(cleanup);
const props = () => ({ graph, presentation: presentation(), source: "Table users { id int }", selectedIds: ["public.users"], query: "",
  onQueryChange: vi.fn(), onSelectTable: vi.fn(), onPresentationChange: vi.fn(), onSourceChange: vi.fn() });
describe("ViewInspector", () => {
  it("creates an empty functional view without touching unrelated DBML", () => {
    const original = "// keep exactly\r\nTable users { id int }\r\nTable teams { id int }\r\n";
    const p = props(); render(<ViewInspector {...p} source={original} />);
    fireEvent.click(screen.getByRole("button", { name: "Choisir une vue" }));
    fireEvent.click(screen.getByRole("button", { name: /Nouvelle vue/ }));
    const source = p.onSourceChange.mock.calls[0]![0];
    expect(source.startsWith(original)).toBe(true);
    const parsed = parseDbml(source, "views.dbml");
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph!.views?.[0]?.tableIds).toEqual([]);
  });
  it("keeps Default View first and hides its destructive actions and detail controls", () => {
    render(<ViewInspector {...props()} />);
    expect(screen.queryByLabelText("Détail de la vue")).toBeNull();
    expect(screen.queryByLabelText("Détail de public.users")).toBeNull();
    expect(screen.queryByRole("button", { name: "Actions de la vue" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choisir une vue" }));
    expect(screen.getByRole("button", { name: "Default View" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Supprimer Default View" })).toBeNull();
  });
  it("filters search, selects results and previews visibility without committing it", () => {
    const p = { ...props(), onVisibilityPreview: vi.fn() }; render(<ViewInspector {...p} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "team_id" } });
    expect(p.onQueryChange).toHaveBeenCalledWith("team_id");
    fireEvent.click(screen.getByRole("button", { name: "Centrer public.users" }));
    expect(p.onSelectTable).toHaveBeenCalledWith("public.users");
    fireEvent.click(screen.getByLabelText("Afficher public.users"));
    expect(p.onVisibilityPreview).toHaveBeenLastCalledWith({ viewId: "all", hidden: { "public.users": true } });
    expect(p.onPresentationChange).not.toHaveBeenCalled();
  });
  it("guards read-only edits", () => {
    render(<ViewInspector {...props()} readOnly />);
    expect(screen.queryByLabelText("Nom du groupe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choisir une vue" }));
    expect(screen.getByRole("button", { name: /Nouvelle vue/ })).toHaveProperty("disabled", true);
  });

});
