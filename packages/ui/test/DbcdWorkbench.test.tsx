// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbcdWorkbench, ProjectWorkbench } from "../src/DbcdWorkbench.js";
import type { DocumentSession } from "../src/useDocumentSession.js";
import { openResult } from "./workbench-fixture.js";
import { setupFlowDom } from "./flow-dom.js";

beforeEach(() => {
  setupFlowDom();
  Object.defineProperty(window, "innerWidth", { value: 1200, writable: true, configurable: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function bridge() { return { callTool: vi.fn().mockResolvedValue({ structuredContent: { saved: true } }), requestDisplayMode: vi.fn().mockResolvedValue(undefined) }; }

describe("DbcdWorkbench", () => {
  it("search selection reveals a hidden collapsed member and centers/selects it", async () => {
    const opened = openResult();
    opened.structuredContent.presentation.views.all!.nodes["public.users"]!.hidden = true;
    opened.structuredContent.presentation.views.all!.groups.people = { name: "People", color: "#16a34a", tableIds: ["public.users"], collapsed: true };
    render(<ProjectWorkbench result={opened} bridge={bridge()} />);
    fireEvent.click(screen.getByRole("button", { name: "Centrer public.users" }));
    expect(await screen.findByRole("group", { name: "Table public.users" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Centrer public.users" })).toHaveProperty("ariaPressed", "true");
  });
  it("opens and resizes read-only panels transiently and reconciles only changed session inputs", () => {
    const opened = openResult();
    opened.structuredContent.presentation.panels.editorCollapsed = true;
    opened.structuredContent.presentation.panels.inspectorCollapsed = true;
    const initial = structuredClone(opened.structuredContent.presentation);
    const session: DocumentSession = { source: opened._meta.dbcodex.sourceText,
      presentation: opened.structuredContent.presentation, graph: opened.structuredContent.graph,
      diagnostics: [], generation: 3, revisions: [], dirty: false, validating: false, saving: false, error: null,
      setSource: vi.fn(), setPresentation: vi.fn(), save: vi.fn(), restore: vi.fn(), pin: vi.fn() };
    const host = bridge();
    const { rerender } = render(<DbcdWorkbench session={session} bridge={host} projectPath="read-only.dbcd" readOnly />);
    fireEvent.click(screen.getByRole("button", { name: "Afficher l’éditeur" }));
    expect(screen.getByRole("textbox", { name: "DBML source" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Afficher l’inspecteur" }));
    fireEvent.keyDown(screen.getByRole("separator", { name: "Largeur de l’éditeur" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("separator", { name: "Largeur de l’inspecteur" }), { key: "ArrowLeft" });
    expect(screen.getByRole("region", { name: "Éditeur DBML" }).style.width).toBe("330px");
    expect(screen.getByRole("region", { name: "Inspecteur" }).style.width).toBe("290px");
    const divider = screen.getByRole("separator", { name: "Largeur de l’inspecteur" });
    const capture = vi.fn();
    Object.defineProperty(divider, "setPointerCapture", { value: capture });
    Object.defineProperty(divider, "releasePointerCapture", { value: vi.fn() });
    fireEvent.pointerDown(divider, { pointerId: 2, clientX: 500 });
    fireEvent.pointerMove(divider, { pointerId: 2, clientX: 450 });
    fireEvent.pointerUp(divider, { pointerId: 2 });
    expect(capture).toHaveBeenCalledWith(2);
    expect(screen.getByRole("region", { name: "Inspecteur" }).style.width).toBe("340px");
    rerender(<DbcdWorkbench session={{ ...session, presentation: structuredClone(initial) }} bridge={host} projectPath="read-only.dbcd" readOnly />);
    expect(screen.getByRole("region", { name: "Éditeur DBML" }).style.width).toBe("330px");
    expect(screen.getByRole("region", { name: "Inspecteur" }).style.width).toBe("340px");
    fireEvent.click(screen.getByRole("button", { name: "Masquer l’inspecteur" }));
    expect(screen.queryByRole("region", { name: "Inspecteur" })).toBeNull();
    expect(session.setPresentation).not.toHaveBeenCalled();
    expect(session.save).not.toHaveBeenCalled();
    expect(host.callTool).not.toHaveBeenCalled();
    expect(session.presentation).toEqual(initial);
    rerender(<DbcdWorkbench session={session} bridge={host} projectPath="another.dbcd" readOnly />);
    expect(screen.getByRole("region", { name: "Éditeur DBML" }).style.width).toBe("40px");
  });

  it("reconciles changed saved panel values after a session restore", () => {
    const opened = openResult();
    const session: DocumentSession = { source: opened._meta.dbcodex.sourceText,
      presentation: opened.structuredContent.presentation, graph: opened.structuredContent.graph,
      diagnostics: [], generation: 3, revisions: [], dirty: false, validating: false, saving: false, error: null,
      setSource: vi.fn(), setPresentation: vi.fn(), save: vi.fn(), restore: vi.fn(), pin: vi.fn() };
    const host = bridge();
    const { rerender } = render(<DbcdWorkbench session={session} bridge={host} projectPath="restore.dbcd" />);
    fireEvent.click(screen.getByRole("button", { name: "Réduire l’éditeur" }));
    const restored = structuredClone(session.presentation);
    restored.panels.editor = 450;
    rerender(<DbcdWorkbench session={{ ...session, presentation: restored, generation: 4 }} bridge={host} projectPath="restore.dbcd" />);
    expect(screen.getByRole("region", { name: "Éditeur DBML" }).style.width).toBe("450px");
    expect(screen.getByRole("textbox", { name: "DBML source" })).toBeTruthy();
  });

  it("focuses the narrow inspector and returns focus to its trigger on Escape", () => {
    window.innerWidth = 800;
    render(<ProjectWorkbench result={openResult()} bridge={bridge()} />);
    const trigger = screen.getByRole("button", { name: "Afficher l’inspecteur" });
    trigger.focus();
    fireEvent.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "Inspecteur" });
    expect(drawer.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Inspecteur" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

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

  it("offers the saved document before explicitly resuming recovered source and panel state", () => {
    const opened = openResult();
    const recoveredPresentation = structuredClone(opened.structuredContent.presentation);
    recoveredPresentation.panels.editorCollapsed = true;
    const result = { ...opened, _meta: { dbcodex: { ...opened._meta.dbcodex, draft: {
      baseGeneration: 3, sourceText: "Table recovered {}", presentation: recoveredPresentation, updatedAt: "2026-09-26T00:00:00Z",
    } } } };
    const { container } = render(<ProjectWorkbench result={result} bridge={bridge()} />);
    expect(screen.getByRole("region", { name: "Éditeur DBML" }).style.width).toBe("320px");
    expect(container.querySelector(".cm-editor")?.textContent).toContain("Table users");
    expect(screen.getByRole("button", { name: "Enregistrer" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Reprendre le brouillon" }));
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
