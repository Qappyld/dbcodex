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
