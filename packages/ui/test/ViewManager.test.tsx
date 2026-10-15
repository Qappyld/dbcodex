// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ViewManager } from "../src/ViewManager.js";
import { parseDbml } from "../../core/src/dbml-adapter.js";
import { createView, reconcileDbmlPresentation, setViewDetail } from "../src/presentation-commands.js";
import { previewVisibility, withoutVisibilityPreview } from "../src/view-visibility.js";
import { presentation, graph } from "./workbench-fixture.js";
import { setDbmlViewTables } from "../src/dbml-patches.js";

afterEach(cleanup);
const source = "// preserve\nTable users { id int }\nTable teams { id int }\nDiagramView crm {\n Tables { public.users }\n // Keep this note\n}\n// tail";
function Harness() {
  const [text, setText] = useState(source);
  const [value, setValue] = useState(() => createView(presentation(), { id: "crm", name: "CRM", tableIds: ["public.users"] }));
  const [query, setQuery] = useState("");
  const parsed = parseDbml(text, "test.dbml");
  return <><ViewManager graph={parsed.graph!} presentation={value} source={text} selectedIds={[]} query={query} onQueryChange={setQuery} onSelectTable={() => {}}
    onPresentationChange={setValue} onSourceChange={setText} />
    <output aria-label="Source">{text}</output><output aria-label="Présentation">{JSON.stringify(value)}</output></>;
}
const state = () => JSON.parse(screen.getByLabelText("Présentation").textContent!);
const choose = (name: string) => { fireEvent.click(screen.getByRole("button", { name: "Choisir une vue" })); fireEvent.click(screen.getByRole("button", { name, exact: true })); };

it("lists every table in a custom view and saves newly visible membership while preserving notes", () => {
  render(<Harness />);
  const teams = screen.getByRole("checkbox", { name: "Afficher public.teams" });
  expect(teams).toHaveProperty("checked", false);
  fireEvent.click(teams);
  expect(state().views.crm.nodes["public.teams"]).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer la vue" }));
  const text = screen.getByLabelText("Source").textContent!;
  expect(text).toContain("// Keep this note");
  expect(text).toMatch(/^\/\/ preserve/); expect(text).toMatch(/\/\/ tail$/);
  expect(parseDbml(text, "test.dbml").graph!.views![0]!.tableIds).toEqual(["public.teams", "public.users"]);
  expect(screen.getByRole("button", { name: "Enregistrer la vue" })).toHaveProperty("disabled", true);
});

it.each(["Annuler", "Abandonner", "Enregistrer"])("protects unsaved visibility on switching: %s", action => {
  render(<Harness />); fireEvent.click(screen.getByRole("checkbox", { name: "Afficher public.teams" }));
  choose("Default View");
  const dialog = screen.getByRole("dialog", { name: "Modifications de la vue non enregistrées" });
  fireEvent.click(within(dialog).getByRole("button", { name: action, exact: true }));
  expect(state().activeViewId).toBe(action === "Annuler" ? "crm" : "all");
  const ids = parseDbml(screen.getByLabelText("Source").textContent!, "test.dbml").graph!.views![0]!.tableIds;
  expect(ids).toEqual(action === "Enregistrer" ? ["public.teams", "public.users"] : ["public.users"]);
  if (action === "Annuler") expect(screen.getByRole("checkbox", { name: "Afficher public.teams" })).toHaveProperty("checked", true);
});

it("resets visibility and applies a filtered schema toggle to the entire schema", () => {
  render(<Harness />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "teams" } });
  expect(screen.queryByRole("checkbox", { name: "Afficher public.users" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Afficher le groupe public" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
  expect(screen.getByRole("checkbox", { name: "Afficher public.users" })).toHaveProperty("checked", true);
  expect(screen.getByRole("checkbox", { name: "Afficher public.teams" })).toHaveProperty("checked", true);
  fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
  expect(screen.getByRole("checkbox", { name: "Afficher public.teams" })).toHaveProperty("checked", false);
});

it("creates empty views, renames inline, copies the preview and confirms deletion", () => {
  render(<Harness />);
  choose("Default View");
  fireEvent.click(screen.getByRole("button", { name: "Choisir une vue" }));
  fireEvent.click(screen.getByRole("button", { name: /Nouvelle vue/ }));
  expect(Object.keys(state().views[state().activeViewId].nodes)).toEqual([]);
  expect(state().views[state().activeViewId].defaultDetail).toBe("all");
  fireEvent.click(screen.getByRole("button", { name: "Choisir une vue" }));
  fireEvent.click(screen.getByRole("button", { name: "Renommer Nouvelle vue", exact: true }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nom de la vue" }), { target: { value: "Analyse" } });
  fireEvent.click(screen.getByRole("button", { name: "Valider le nom de la vue" }));
  expect(state().views[state().activeViewId].name).toBe("Analyse");
  fireEvent.click(screen.getByRole("checkbox", { name: "Afficher public.teams" }));
  fireEvent.click(screen.getByRole("button", { name: "Options d’enregistrement de la vue" }));
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer comme nouvelle vue" }));
  expect(state().views[state().activeViewId].name).toBe("Copie de Analyse");
  const parsed = parseDbml(screen.getByLabelText("Source").textContent!, "test.dbml");
  expect(parsed.diagnostics).toEqual([]);
  expect(parsed.graph!.views!.at(-1)!.tableIds).toEqual(["public.teams"]);
  fireEvent.click(screen.getByRole("button", { name: "Actions de la vue" }));
  fireEvent.click(screen.getByRole("button", { name: "Supprimer", exact: true }));
  expect(state().activeViewId).not.toBe("all");
  fireEvent.click(screen.getByRole("button", { name: "Supprimer la vue", exact: true }));
  expect(state().activeViewId).toBe("all"); expect(state().views.all.system).toBe(true);
});

it("keeps canvas detail and movement edits separate from draft visibility", () => {
  const saved = createView(presentation(), { id: "crm", name: "CRM", tableIds: [] });
  const draft = { viewId: "crm", hidden: { "public.teams": false } };
  const preview = previewVisibility(saved, graph, draft);
  const canvas = setViewDetail(preview, "crm", "names");
  canvas.views.crm!.nodes["public.teams"]!.x = 999;
  const result = withoutVisibilityPreview(canvas, saved, draft);
  expect(result.views.crm!.nodes["public.teams"]!.hidden).toBe(true);
  expect(previewVisibility(result, graph, draft).views.crm!.nodes["public.teams"]!.x).toBe(999);
  expect(result.views.crm!.defaultDetail).toBe("names");
  expect(saved.views.crm!.defaultDetail).toBe("keys");
});

it("persists empty membership and prevents new tables entering custom views on reconciliation", () => {
  const text = setDbmlViewTables(source, "crm", []);
  const parsed = parseDbml(text, "test.dbml"); expect(parsed.diagnostics).toEqual([]);
  const value = reconcileDbmlPresentation(createView(presentation(), { id: "crm", name: "CRM", tableIds: ["public.users"] }), parsed.graph!);
  expect(Object.keys(value.views.crm!.nodes)).toEqual([]);
  expect(value.views.all!.system).toBe(true);
});
