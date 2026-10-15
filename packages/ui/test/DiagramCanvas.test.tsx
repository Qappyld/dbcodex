// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiagramCanvas } from "../src/DiagramCanvas.js";
import { graph, presentation } from "./workbench-fixture.js";
import { setupFlowDom } from "./flow-dom.js";
import { parseDbml } from "../../core/src/dbml-adapter.js";
import { useState } from "react";

beforeEach(setupFlowDom);
afterEach(async () => { cleanup(); await act(() => new Promise((resolve) => setTimeout(resolve, 0))); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("DiagramCanvas", () => {
  it("keeps minimap and routing controls in the floating toolbar", async () => {
    const { container } = render(<DiagramCanvas graph={graph} presentation={presentation()} onPresentationChange={vi.fn()} />);
    const tools = screen.getByRole("group", { name: "Outils du diagramme" });
    const minimap = screen.getByRole("button", { name: "Afficher la mini-carte" });
    expect(tools.contains(minimap)).toBe(true);
    expect(minimap.textContent).toBe("");
    expect(tools.contains(screen.getByRole("button", { name: "Routage automatique" }))).toBe(true);
    fireEvent.click(minimap);
    await waitFor(() => expect(container.querySelector(".react-flow__minimap")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Masquer la mini-carte" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("changes group color from the canvas without changing its note or membership", async () => {
    const source = "Table users { id int }\nTableGroup people [color: #16a34a] {\n users\n Note: 'Preserve me'\n}\n// tail";
    const value = presentation();
    value.views.all!.groups.people = { name: "People", color: "#16a34a", tableIds: ["public.users"] };
    const sourceChange = vi.fn(), change = vi.fn();
    render(<DiagramCanvas graph={parseDbml(source, "groups.dbml").graph!} source={source} presentation={value} onPresentationChange={change} onSourceChange={sourceChange} />);
    fireEvent.click(await screen.findByRole("group", { name: "Groupe People" }));
    fireEvent.click(screen.getByRole("button", { name: "Couleur", exact: true }));
    fireEvent.change(screen.getByLabelText("Couleur personnalisée"), { target: { value: "#123456" } });
    expect(sourceChange).toHaveBeenCalledExactlyOnceWith(source.replace("#16a34a", "#123456"));
    expect(change.mock.calls[0]![0].views.all.groups.people).toMatchObject({ color: "#123456", tableIds: ["public.users"] });
  });
  it("mounts field anchors only for endpoints used by relations",async()=>{
    const {container}=render(<DiagramCanvas graph={graph} presentation={presentation()} onPresentationChange={vi.fn()}/>);
    await screen.findByRole("group",{name:/Edge from public.users/});
    expect(container.querySelectorAll('[data-nodeid="public.users"][data-handleid$=":team_id"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-nodeid="public.users"][data-handleid$=":name"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-nodeid="public.users"][data-handleid$=":id"]')).toHaveLength(0);
  });
  it("discards an asynchronous recalculation if the presentation changes meanwhile",async()=>{
    const change=vi.fn(),value=presentation(),props={graph,presentation:value,onPresentationChange:change};
    const {rerender}=render(<DiagramCanvas {...props}/>);
    await screen.findByRole("group",{name:/Edge from public.users/});
    let clock=0;vi.spyOn(performance,"now").mockImplementation(()=>clock+=10);
    fireEvent.click(screen.getByRole("button",{name:"Routage automatique",exact:true}));
    const next=structuredClone(value);next.views.all!.nodes["public.users"]!.x+=100;
    rerender(<DiagramCanvas {...props} presentation={next}/>);
    await waitFor(()=>expect(screen.getByRole("button",{name:"Routage automatique",exact:true})).toHaveProperty("disabled",false));
    expect(change).not.toHaveBeenCalled();
  });
  it("restores the live viewport when the current view is restored without remounting", async () => {
    const value = presentation(), change = vi.fn();
    const { container, rerender } = render(<DiagramCanvas graph={graph} presentation={value} onPresentationChange={change} />);
    await screen.findByRole("group", { name: "Table public.users" });
    const canvas = container.querySelector(".react-flow");
    const restored = structuredClone(value);
    restored.views.all!.viewport = { x: 145, y: -85, zoom: 1.7 };
    rerender(<DiagramCanvas graph={graph} presentation={restored} onPresentationChange={change} />);
    await waitFor(() => expect(container.querySelector<HTMLElement>(".react-flow__viewport")!.style.transform).toBe("translate(145px,-85px) scale(1.7)"));
    expect(container.querySelector(".react-flow")).toBe(canvas);
    expect(change).not.toHaveBeenCalled();
  });
  it("moves a group and all its members together on pointer release", async () => {
    const value = presentation(), change = vi.fn();
    value.views.all!.groups.people = { name: "People", color: "#16a34a", tableIds: ["public.users", "public.teams"] };
    render(<DiagramCanvas graph={graph} presentation={value} onPresentationChange={change} />);
    const node = await screen.findByRole("group", { name: "Groupe People" });
    const down = createEvent.mouseDown(node, { button: 0, clientX: 0, clientY: 0 });
    Object.defineProperty(down, "view", { value: window }); fireEvent(node, down);
    fireEvent.mouseMove(window, { buttons: 1, clientX: 2, clientY: 2 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 52, clientY: 42 });
    expect(change).not.toHaveBeenCalled();
    const up = createEvent.mouseUp(window, { button: 0, clientX: 52, clientY: 42 });
    Object.defineProperty(up, "view", { value: window }); fireEvent(window, up);
    expect(change.mock.calls.at(-1)?.[0].views.all.nodes).toMatchObject({ "public.users": { x: 70, y: 90 }, "public.teams": { x: 370, y: 100 } });
  });
  it("uses measured table bounds for automatic self loops and restores them after route reset", async () => {
    const parsed = parseDbml("Table users {\n id int [pk]\n manager_id int\n}\nRef: users.manager_id > users.id", "self.dbml");
    expect(parsed.diagnostics).toEqual([]);
    const change = vi.fn();
    function Canvas() {
      const [value, setValue] = useState(presentation());
      return <DiagramCanvas graph={parsed.graph!} presentation={value} onPresentationChange={(next) => { change(next); setValue(next); }} />;
    }
    const { container } = render(<Canvas />);
    fireEvent.keyDown(await screen.findByRole("group", { name: /Edge from public.users to public.users/ }), { key: "Enter" });
    const automatic = container.querySelector(".react-flow__edge-path")!.getAttribute("d");
    for (const point of screen.getAllByRole("button", { name: /Déplacer le segment/ })) {
      const x = Number(point.getAttribute("cx")), y = Number(point.getAttribute("cy"));
      expect(x < 20 || x > 240 || y < 50 || y > 190).toBe(true);
    }
    fireEvent.keyDown(screen.getByRole("button", { name: "Déplacer le segment 1 horizontalement" }), { key: "ArrowRight" });
    expect(change.mock.calls.at(-1)?.[0].views.all.edges[parsed.graph!.relations[0]!.id].points.length).toBeGreaterThan(1);
    fireEvent.click(await screen.findByRole("button", { name: "Routage automatique" }));
    expect(change.mock.calls.at(-1)?.[0].views.all.edges[parsed.graph!.relations[0]!.id].mode).toBe("automatic");
    await waitFor(() => expect(container.querySelector(".react-flow__edge-path")?.getAttribute("d")).toBe(automatic));
  });
  it("persists viewport changes made by zoom controls", async () => {
    const change = vi.fn();
    render(<DiagramCanvas graph={graph} presentation={presentation()} onPresentationChange={change} />);
    await screen.findByRole("group", { name: "Table public.users" });
    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    await waitFor(() => expect(change).toHaveBeenCalled());
    expect(change.mock.calls.at(-1)?.[0].views.all.viewport.zoom).toBeGreaterThan(1);
  });
  it("selects edges and commits keyboard routing through presentation commands", async () => {
    const change = vi.fn();
    render(<DiagramCanvas graph={graph} presentation={presentation()} onPresentationChange={change} />);
    fireEvent.keyDown(await screen.findByRole("group", { name: /Edge from public.users/ }), { key: "Enter" });
    const control=screen.getAllByRole("button", { name: /Déplacer le segment/ })[0]!;
    fireEvent.keyDown(control, { key: control.getAttribute("aria-label")!.endsWith("horizontalement") ? "ArrowRight" : "ArrowDown" });
    expect(change.mock.calls.at(-1)?.[0].views.all.edges["ref:1"]).toMatchObject({mode:"manual",format:"orthogonal"});
  });
  it("automatically opens the minimap above 25 tables", () => {
    const large = { ...graph, tables: Array.from({ length: 26 }, (_, index) => ({ ...graph.tables[0]!, id: `public.table_${index}` })), relations: [] };
    const { container } = render(<DiagramCanvas graph={large} presentation={presentation()} onPresentationChange={vi.fn()} />);
    expect(container.querySelector(".react-flow__minimap")).toBeTruthy();
  });
  it("opens the minimap when source edits grow the graph beyond 25 tables", () => {
    const p = presentation(), change = vi.fn();
    const { container, rerender } = render(<DiagramCanvas graph={graph} presentation={p} onPresentationChange={change} />);
    const large = { ...graph, tables: Array.from({ length: 26 }, (_, index) => ({ ...graph.tables[0]!, id: `public.table_${index}` })), relations: [] };
    rerender(<DiagramCanvas graph={large} presentation={p} onPresentationChange={change} />);
    expect(container.querySelector(".react-flow__minimap")).toBeTruthy();
  });
  it("commits every selected table after a multi-table pointer drag", async () => {
    const change = vi.fn();
    render(<DiagramCanvas graph={graph} presentation={presentation()} onPresentationChange={change} />);
    const user = await screen.findByRole("group", { name: "Table public.users" });
    const team = screen.getByRole("group", { name: "Table public.teams" });
    fireEvent.keyDown(user, { key: "Enter" });
    fireEvent.keyUp(user, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Shift" });
    fireEvent.keyDown(team, { key: "Enter", shiftKey: true });
    fireEvent.keyUp(team, { key: "Enter", shiftKey: true });
    fireEvent.keyUp(window, { key: "Shift" });
    expect(team.className).toContain("selected");
    expect(user.className).toContain("selected");
    const down = createEvent.mouseDown(user, { button: 0, clientX: 20, clientY: 50 });
    Object.defineProperty(down, "view", { value: window }); fireEvent(user, down);
    fireEvent.mouseMove(window, { buttons: 1, clientX: 22, clientY: 52 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 72, clientY: 92 });
    const up = createEvent.mouseUp(window, { button: 0, clientX: 72, clientY: 92 });
    Object.defineProperty(up, "view", { value: window }); fireEvent(window, up);
    const next = change.mock.calls.at(-1)?.[0];
    expect(next.views.all.nodes["public.users"]).toEqual({ x: 70, y: 90 });
    expect(next.views.all.nodes["public.teams"]).toEqual({ x: 370, y: 100 });
  });
  it("attenuates search nonmatches and hides tables excluded from custom views", () => {
    const p = presentation();
    const { container, rerender } = render(<DiagramCanvas graph={graph} presentation={p} query="team_id" onPresentationChange={vi.fn()} />);
    expect(container.querySelector<HTMLElement>('[data-id="public.teams"]')?.style.opacity).toBe("0.25");
    const custom = structuredClone(p); custom.activeViewId = "crm";
    custom.views.crm = { ...custom.views.all!, system: false };
    rerender(<DiagramCanvas graph={graph} presentation={custom} onPresentationChange={vi.fn()} />);
    expect(container.querySelector('[data-id="public.teams"]')).toBeNull();
  });
  it("collapses groups without losing saved positions and offers a minimap toggle", async () => {
    const p = presentation();
    p.views.all!.groups.people = { name: "Personnes", color: "#16a34a", tableIds: ["public.users"], collapsed: true };
    const { container } = render(<DiagramCanvas graph={graph} presentation={p} onPresentationChange={vi.fn()} />);
    expect(screen.getByText("Personnes")).toBeTruthy();
    expect(container.querySelector('[data-id="public.users"]')).toBeNull();
    expect(p.views.all!.nodes["public.users"]).toEqual({ x: 20, y: 50 });
    fireEvent.click(screen.getByRole("button", { name: "Afficher la mini-carte" }));
    await waitFor(() => expect(container.querySelector(".react-flow__minimap")).toBeTruthy());
  });
  it.each(["child.parent_code > parent.code", "parent.code < child.parent_code", "parent.code - child.parent_code",
    "child.parent_code >? parent.code", "parent.code ?< child.parent_code"])("shows only actual foreign keys for Ref: %s", (reference) => {
    const parsed = parseDbml(`Table parent {\n parent_id int [pk]\n code int [unique]\n}\nTable child {\n child_id int [pk]\n parent_code int\n}\nRef: ${reference}`, "keys.dbml");
    expect(parsed.diagnostics).toEqual([]);
    const { rerender } = render(<DiagramCanvas graph={parsed.graph!} presentation={presentation()} onPresentationChange={vi.fn()} />);
    expect(screen.getByText("parent_code")).toBeTruthy();
    expect(screen.getByText("parent_id")).toBeTruthy();
    expect(screen.getByText("child_id")).toBeTruthy();
    expect(screen.queryByText("code")).toBeNull();
    expect(screen.getAllByText("FK")).toHaveLength(1);
    const all = presentation();
    all.views.all!.defaultDetail = "all";
    rerender(<DiagramCanvas graph={parsed.graph!} presentation={all} onPresentationChange={vi.fn()} />);
    expect(screen.getByText("code").closest("li")?.textContent).not.toContain("FK");
  });

  it("does not invent foreign keys for a many-to-many relation", () => {
    const parsed = parseDbml("Table a { code_a int [unique] }\nTable b { code_b int [unique] }\nRef: a.code_a <> b.code_b", "many.dbml");
    render(<DiagramCanvas graph={parsed.graph!} presentation={presentation()} onPresentationChange={vi.fn()} />);
    expect(screen.queryByText("code_a")).toBeNull();
    expect(screen.queryByText("code_b")).toBeNull();
    expect(screen.queryByText("FK")).toBeNull();
  });

  it("uses the inline one-to-one column as the foreign key", () => {
    const parsed = parseDbml("Table parent { code int [unique] }\nTable child { parent_code int [ref: - parent.code] }", "inline.dbml");
    render(<DiagramCanvas graph={parsed.graph!} presentation={presentation()} onPresentationChange={vi.fn()} />);
    expect(screen.getByText("parent_code")).toBeTruthy();
    expect(screen.queryByText("code")).toBeNull();
  });
  it("shows relationship columns when the foreign key is on the target endpoint", () => {
    const reversed = { ...graph, relations: graph.relations.map((relation) => ({ ...relation, source: relation.target, target: relation.source })) };
    render(<DiagramCanvas graph={reversed} presentation={presentation()} onPresentationChange={vi.fn()} />);
    expect(screen.getByText("team_id")).toBeTruthy();
  });

  it("keeps read-only node positions unchanged", async () => {
    const changed = vi.fn();
    render(<DiagramCanvas graph={graph} presentation={presentation()} onPresentationChange={changed} readOnly />);
    fireEvent.keyDown(await screen.findByRole("group", { name: "Table public.users" }), { key: "ArrowRight" });
    expect(changed).not.toHaveBeenCalled();
  });

  it("reports keyboard selection to the inspector", async () => {
    const selected = vi.fn();
    render(<DiagramCanvas graph={graph} presentation={presentation()} onPresentationChange={vi.fn()} onSelectionChange={selected} />);
    fireEvent.keyDown(await screen.findByRole("group", { name: "Table public.users" }), { key: "Enter" });
    expect(selected).toHaveBeenCalledWith("public.users");
  });
  it("renders saved and deterministic positions with keys and accessible controls", async () => {
    const { container } = render(<DiagramCanvas graph={graph} presentation={presentation()} onPresentationChange={vi.fn()} />);
    expect(container.querySelector('[data-id="public.users"]')?.getAttribute("style")).toContain("translate(20px,50px)");
    expect(container.querySelector('[data-id="public.teams"]')?.getAttribute("style")).toContain("translate(320px,60px)");
    expect(screen.getByText("team_id")).toBeTruthy();
    expect(screen.queryByText("name")).toBeNull();
    expect(screen.getByText("+1 champs masqués")).toBeTruthy();
    expect(screen.getByRole("button", { name: /fit view/i })).toBeTruthy();
    await screen.findByRole("group", { name: "Table public.users" });
    await waitFor(()=>expect(container.querySelectorAll(".react-flow__edge-path")).toHaveLength(1));
    expect(container.querySelectorAll(".react-flow__handle.connectable")).toHaveLength(0);
  });

  it("honors explicit detail overrides and renders all and names modes exactly", () => {
    const value = presentation();
    value.views.all!.defaultDetail = "all";
    const props = { graph, presentation: value, onPresentationChange: vi.fn() };
    const { rerender } = render(<DiagramCanvas {...props} />);
    expect(screen.getByText("name")).toBeTruthy();
    const names = structuredClone(value);
    names.views.all!.nodes["public.users"]!.detail = "names";
    rerender(<DiagramCanvas {...props} presentation={names} />);
    expect(screen.queryByText("id")).toBeNull();
    expect(screen.queryByText("team_id")).toBeNull();
    expect(screen.queryByText(/champs masqués/)).toBeNull();
  });

  it("moves focused nodes by keyboard without modifying unrelated presentation fields", async () => {
    const value = presentation();
    const onPresentationChange = vi.fn();
    render(<DiagramCanvas graph={graph} presentation={value} onPresentationChange={onPresentationChange} />);
    fireEvent.keyDown(await screen.findByRole("group", { name: "Table public.users" }), { key: "ArrowRight" });
    const expected = structuredClone(value);
    expected.views.all!.nodes["public.users"]!.x = 30;
    expect(onPresentationChange).toHaveBeenCalledWith(expected);
  });

  it("commits a mouse pointer drag only on release", async () => {
    const onPresentationChange = vi.fn();
    render(<DiagramCanvas graph={graph} presentation={presentation()} onPresentationChange={onPresentationChange} />);
    const node = await screen.findByRole("group", { name: "Table public.users" });
    const down = createEvent.mouseDown(node, { button: 0, clientX: 20, clientY: 50 });
    Object.defineProperty(down, "view", { value: window });
    fireEvent(node, down);
    fireEvent.mouseMove(window, { buttons: 1, clientX: 22, clientY: 52 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 72, clientY: 92 });
    expect(onPresentationChange).not.toHaveBeenCalled();
    const up = createEvent.mouseUp(window, { button: 0, clientX: 72, clientY: 92 });
    Object.defineProperty(up, "view", { value: window });
    fireEvent(window, up);
    expect(onPresentationChange).toHaveBeenCalledWith(expect.objectContaining({ views: expect.objectContaining({
      all: expect.objectContaining({ nodes: expect.objectContaining({ "public.users": { x: 70, y: 90 } }) }),
    }) }));
  });
});
