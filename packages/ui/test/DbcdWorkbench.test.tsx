// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWorkbench } from "../src/DbcdWorkbench.js";
import { openResult } from "./workbench-fixture.js";
import { setupFlowDom } from "./flow-dom.js";

beforeEach(() => {
  setupFlowDom();
  Object.defineProperty(window, "innerWidth", { value: 1200, writable: true, configurable: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function bridge() { return { callTool: vi.fn().mockResolvedValue({ structuredContent: { saved: true } }), requestDisplayMode: vi.fn().mockResolvedValue(undefined) }; }

describe("DbcdWorkbench", () => {
  it("saves presentation through the document session only after explicit save", async () => {
    const opened = openResult();
    const host = bridge();
    host.callTool.mockImplementation(async (name: string, args: Record<string, unknown>) => name === "validate_dbcd_draft"
      ? { structuredContent: { graph: opened.structuredContent.graph, diagnostics: [] } }
      : { ...opened, structuredContent: { ...opened.structuredContent, generation: 4, presentation: args.presentation } });
    render(<ProjectWorkbench result={opened} bridge={host} />);
    fireEvent.keyDown(await screen.findByRole("group", { name: "Table public.users" }), { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(screen.getByText("Enregistré")).toBeTruthy());
    expect(host.callTool).toHaveBeenCalledWith("save_dbcd", expect.objectContaining({
      expectedGeneration: 3, sourceText: opened._meta.dbcodex.sourceText,
      presentation: expect.objectContaining({ views: expect.objectContaining({ all: expect.objectContaining({
        nodes: expect.objectContaining({ "public.users": { x: 30, y: 50 } }),
      }) }) }),
    }));
    expect(host.callTool.mock.calls.map(([name]) => name)).toEqual(["validate_dbcd_draft", "save_dbcd"]);
  });

  it("loads recovered source and panel state from private draft metadata", () => {
    const opened = openResult();
    const recoveredPresentation = structuredClone(opened.structuredContent.presentation);
    recoveredPresentation.panels.editorCollapsed = true;
    const result = { ...opened, _meta: { dbcodex: { ...opened._meta.dbcodex, draft: {
      baseGeneration: 3, sourceText: "Table recovered {}", presentation: recoveredPresentation, updatedAt: "2026-09-26T00:00:00Z",
    } } } };
    const { container } = render(<ProjectWorkbench result={result} bridge={bridge()} />);
    expect(screen.getByRole("region", { name: "Éditeur DBML" }).style.width).toBe("40px");
    expect(container.querySelector(".cm-editor")?.textContent).toContain("Table recovered {}");
    expect(screen.getByText("Modifications non enregistrées")).toBeTruthy();
  });

  it("starts clean and marks presentation edits dirty without saving a revision or layout", async () => {
    const host = bridge();
    render(<ProjectWorkbench result={openResult()} bridge={host} />);
    expect(screen.getByRole("button", { name: "Enregistrer" })).toHaveProperty("disabled", true);
    fireEvent.keyDown(await screen.findByRole("group", { name: "Table public.users" }), { key: "ArrowRight" });
    expect(screen.getByText("Modifications non enregistrées")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toHaveProperty("disabled", false);
    expect(host.callTool).not.toHaveBeenCalled();
  });

  it("collapses the editor to a rail and resizes panels using clamped keyboard and captured pointer movement", () => {
    const { container } = render(<ProjectWorkbench result={openResult()} bridge={bridge()} />);
    const editor = screen.getByRole("region", { name: "Éditeur DBML" });
    const divider = screen.getByRole("separator", { name: "Largeur de l’éditeur" });
    fireEvent.keyDown(divider, { key: "ArrowLeft" });
    expect(editor.style.width).toBe("310px");
    const capture = vi.fn();
    Object.defineProperty(divider, "setPointerCapture", { value: capture });
    Object.defineProperty(divider, "releasePointerCapture", { value: vi.fn() });
    fireEvent.pointerDown(divider, { pointerId: 1, clientX: 310 });
    fireEvent.pointerMove(divider, { pointerId: 1, clientX: 1000 });
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(capture).toHaveBeenCalledWith(1);
    expect(editor.style.width).toBe("600px");
    const cm = container.querySelector(".cm-editor");
    fireEvent.click(screen.getByRole("button", { name: "Réduire l’éditeur" }));
    expect(editor.style.width).toBe("40px");
    fireEvent.click(screen.getByRole("button", { name: "Afficher l’éditeur" }));
    expect(container.querySelector(".cm-editor")).toBe(cm);
  });

  it("uses an inspector drawer below 900 pixels", () => {
    window.innerWidth = 800;
    render(<ProjectWorkbench result={openResult()} bridge={bridge()} />);
    expect(screen.queryByRole("dialog", { name: "Inspecteur" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Afficher l’inspecteur" }));
    expect(screen.getByRole("dialog", { name: "Inspecteur" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fermer l’inspecteur" }));
    expect(screen.queryByRole("dialog", { name: "Inspecteur" })).toBeNull();
  });

  it("preserves source, selection, positions, and the mounted editor across fullscreen and refusal", async () => {
    const host = bridge();
    const { container } = render(<ProjectWorkbench result={openResult()} bridge={host} />);
    const cm = container.querySelector(".cm-editor") as HTMLElement;
    const view = EditorView.findFromDOM(cm)!;
    act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "Table changed {}" } }));
    fireEvent.click(await screen.findByRole("group", { name: "Table public.users" }));
    fireEvent.keyDown(screen.getByRole("group", { name: "Table public.users" }), { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Plein écran" }));
    await waitFor(() => expect(screen.getByRole("main").getAttribute("data-mode")).toBe("fullscreen"));
    expect(host.requestDisplayMode).toHaveBeenCalledWith("fullscreen");
    expect(container.querySelector(".cm-editor")).toBe(cm);
    expect(view.state.doc.toString()).toBe("Table changed {}");
    expect(container.querySelector('[data-id="public.users"]')?.getAttribute("style")).toContain("translate(30px,50px)");
    expect(screen.getByRole("region", { name: "Inspecteur" }).textContent).toContain("public.users");
    host.requestDisplayMode.mockRejectedValue(new Error("Declined"));
    fireEvent.click(screen.getByRole("button", { name: "Quitter le plein écran" }));
    await waitFor(() => expect(screen.getByText(/mode d’affichage.*indisponible/i)).toBeTruthy());
    expect(container.querySelector(".cm-editor")).toBe(cm);
    expect(screen.getByRole("main").getAttribute("data-mode")).toBe("fullscreen");
  });
});
