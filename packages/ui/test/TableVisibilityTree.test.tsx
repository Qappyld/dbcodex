// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TableVisibilityTree } from "../src/TableVisibilityTree.js";
import { graph, presentation } from "./workbench-fixture.js";
afterEach(cleanup);

it("shows partial group visibility and toggles all group members together", () => {
  const view = presentation().views.all!;
  view.groups.people = { name: "Personnes", color: "#16a34a", tableIds: graph.tables.map(table => table.id) };
  view.nodes[graph.tables[0]!.id]!.hidden = true;
  const visibility = vi.fn();
  render(<TableVisibilityTree tables={graph.tables} view={view} matches={new Set(graph.tables.map(table => table.id))} selectedIds={[]} readOnly={false} onVisibility={visibility} onSelect={vi.fn()} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Regrouper les tables" }), { target: { value: "groups" } });
  const checkbox = screen.getByRole("checkbox", { name: "Afficher le groupe Personnes" }) as HTMLInputElement;
  expect(checkbox.indeterminate).toBe(true);
  expect(screen.getByText(`1/${graph.tables.length}`)).toBeTruthy();
  fireEvent.click(checkbox);
  expect(visibility).toHaveBeenCalledWith(graph.tables.map(table => table.id), true);
});

it("can group by schema and keeps table visibility read-only", () => {
  render(<TableVisibilityTree tables={graph.tables} view={presentation().views.all!} matches={new Set(graph.tables.map(table => table.id))} selectedIds={[]} readOnly onVisibility={vi.fn()} onSelect={vi.fn()} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Regrouper les tables" }), { target: { value: "schemas" } });
  expect(screen.getByText("public")).toBeTruthy();
  expect((screen.getByRole("checkbox", { name: "Afficher public.users" }) as HTMLInputElement).disabled).toBe(true);
});
