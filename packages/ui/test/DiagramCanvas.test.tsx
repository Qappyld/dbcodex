// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiagramCanvas } from "../src/DiagramCanvas.js";
import { graph, presentation } from "./workbench-fixture.js";
import { setupFlowDom } from "./flow-dom.js";

beforeEach(setupFlowDom);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("DiagramCanvas", () => {
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
    expect(container.querySelectorAll(".react-flow__edge-path")).toHaveLength(1);
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
