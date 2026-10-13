// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { parseDbml } from "../../core/src/dbml-adapter.js";
import { ProjectWorkbench } from "../src/DbcdWorkbench.js";
import { openResult } from "./workbench-fixture.js";
import { setupFlowDom } from "./flow-dom.js";

const source = "// keep\nTable users {\n id int [pk]\n team_id int\n}\nTable teams {\n id int [pk]\n}\nRef membership: users.team_id > teams.id\n";
function result() { const opened = openResult(); return { ...opened, structuredContent: { ...opened.structuredContent, graph: parseDbml(source, "demo.dbcd").graph! }, _meta: { dbcodex: { ...opened._meta.dbcodex, sourceText: source } } }; }
const bridge = () => ({ callTool: vi.fn().mockResolvedValue({ structuredContent: { saved: true } }), requestDisplayMode: vi.fn().mockResolvedValue(undefined) });
beforeEach(() => { setupFlowDom(); Object.defineProperty(window, "innerWidth", { value: 1200, writable: true, configurable: true }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("source navigation and diagram commands", () => {
  it("navigates from diagram tables, columns, relations and search results to exact source ranges", async () => {
    const opened = result(), graph = opened.structuredContent.graph;
    const { container } = render(<ProjectWorkbench result={opened} bridge={bridge()} />);
    const editor = EditorView.findFromDOM(container.querySelector<HTMLElement>(".cm-editor")!)!;
    const assertSelected = (range: { start: { offset: number }; end: { offset: number } }) => expect(editor.state.selection.main).toMatchObject({ from: range.start.offset, to: range.end.offset });
    fireEvent.click(await screen.findByRole("group", { name: "Table public.users" }));
    assertSelected(graph.tables.find((table) => table.id === "public.users")!.sourceRange!);
    fireEvent.click(screen.getByRole("button", { name: "Champ public.users.team_id" }));
    assertSelected(graph.tables.find((table) => table.id === "public.users")!.columns.find((column) => column.name === "team_id")!.sourceRange!);
    fireEvent.keyDown(screen.getByRole("group", { name: /Edge from public.users/ }), { key: "Enter" });
    assertSelected(graph.relations[0]!.sourceRange!);
    fireEvent.click(screen.getByRole("button", { name: "Centrer public.teams" }));
    assertSelected(graph.tables.find((table) => table.id === "public.teams")!.sourceRange!);
    await waitFor(() => expect(container.querySelector<HTMLElement>(".react-flow__viewport")!.style.transform).not.toBe("translate(0px,0px) scale(1)"));
  });
  it("selects and centers a table, column and relation from source cursor movement", async () => {
    const opened = result(), graph = opened.structuredContent.graph;
    const { container } = render(<ProjectWorkbench result={opened} bridge={bridge()} />);
    await screen.findByRole("group", { name: "Table public.users" });
    const editor = EditorView.findFromDOM(container.querySelector<HTMLElement>(".cm-editor")!)!;
    act(() => editor.dispatch({ selection: { anchor: source.indexOf("Table teams") + 1 } }));
    await waitFor(() => expect(screen.getByRole("group", { name: "Table public.teams" }).className).toContain("selected"));
    act(() => editor.dispatch({ selection: { anchor: source.indexOf("team_id int") + 2 } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Champ public.users.team_id" }).getAttribute("aria-pressed")).toBe("true"));
    act(() => editor.dispatch({ selection: { anchor: graph.relations[0]!.sourceRange!.start.offset + 1 } }));
    await waitFor(() => expect(screen.getByRole("group", { name: /Edge from public.users/ }).getAttribute("class")).toContain("selected"));
    expect(editor.state.selection.main.empty).toBe(true);
  });
  it("reveals both relation endpoints when navigating from a filtered view", async () => {
    const opened = result(), graph = opened.structuredContent.graph;
    opened.structuredContent.graph.views = [{ id: "subset", name: "subset", tableIds: ["public.users"] }];
    opened.structuredContent.presentation.activeViewId = "subset";
    opened.structuredContent.presentation.views.subset = { ...structuredClone(opened.structuredContent.presentation.views.all!), system: false, name: "subset" };
    opened.structuredContent.presentation.views.all!.nodes["public.teams"] = { x: 400, y: 60, hidden: true };
    const { container } = render(<ProjectWorkbench result={opened} bridge={bridge()} />);
    await screen.findByRole("group", { name: "Table public.users" });
    const editor = EditorView.findFromDOM(container.querySelector<HTMLElement>(".cm-editor")!)!;
    act(() => editor.dispatch({ selection: { anchor: graph.relations[0]!.sourceRange!.start.offset + 1 } }));
    expect(await screen.findByRole("group", { name: /Edge from public.users/ })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Vue" })).toHaveProperty("value", "all");
    expect(screen.getByRole("group", { name: "Table public.teams" })).toBeTruthy();
  });
  it("undoes and redoes diagram movement independently of text and confirms reorganization", async () => {
    const { container } = render(<ProjectWorkbench result={result()} bridge={bridge()} />);
    const node = await screen.findByRole("group", { name: "Table public.users" });
    const editor = EditorView.findFromDOM(container.querySelector<HTMLElement>(".cm-editor")!)!;
    fireEvent.keyDown(node, { key: "ArrowRight" });
    expect(node.getAttribute("style")).toContain("translate(30px,50px)");
    fireEvent.click(screen.getByRole("button", { name: "Annuler le diagramme" }));
    expect(node.getAttribute("style")).toContain("translate(20px,50px)");
    fireEvent.click(screen.getByRole("button", { name: "Rétablir le diagramme" }));
    expect(node.getAttribute("style")).toContain("translate(30px,50px)");
    fireEvent.keyDown(node, { key: "z", ctrlKey: true });
    expect(node.getAttribute("style")).toContain("translate(20px,50px)");
    fireEvent.keyDown(node, { key: "z", ctrlKey: true, shiftKey: true });
    expect(node.getAttribute("style")).toContain("translate(30px,50px)");
    expect(editor.state.doc.toString()).toBe(source);
    fireEvent.click(screen.getByRole("button", { name: "Réorganiser" }));
    expect(node.getAttribute("style")).toContain("translate(30px,50px)");
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la réorganisation" }));
    expect(node.getAttribute("style")).not.toContain("translate(30px,50px)");
    fireEvent.click(screen.getByRole("button", { name: "Annuler le diagramme" }));
    expect(node.getAttribute("style")).toContain("translate(30px,50px)");
  });
});
