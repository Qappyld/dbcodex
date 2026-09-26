// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Root } from "../src/Root.js";
import { graph, openResult } from "./workbench-fixture.js";
import { setupFlowDom } from "./flow-dom.js";

beforeEach(setupFlowDom);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("routes private project results to a persistent session and legacy results to DiagramApp", async () => {
  let notify: (result: unknown) => void = () => {};
  const bridge = { callTool: vi.fn().mockResolvedValue({}), start: vi.fn().mockResolvedValue(undefined),
    requestDisplayMode: vi.fn().mockResolvedValue(undefined), subscribeToToolResults: (listener: typeof notify) => { notify = listener; return () => {}; } };
  const { container } = render(<Root bridge={bridge} />);
  expect(screen.getByRole("status").textContent).toContain("Waiting");
  act(() => notify(openResult()));
  const editor = container.querySelector(".cm-editor");
  fireEvent.keyDown(await screen.findByRole("group", { name: "Table public.users" }), { key: "ArrowRight" });
  act(() => notify({ structuredContent: { saved: true } }));
  act(() => notify(openResult()));
  expect(container.querySelector(".cm-editor")).toBe(editor);
  expect(screen.getByText("Modifications non enregistrées")).toBeTruthy();
  expect(bridge.callTool).not.toHaveBeenCalled();
  const another = openResult();
  another._meta.dbcodex.projectId = "second-project";
  act(() => notify(another));
  expect(container.querySelector(".cm-editor")).toBe(editor);
  expect(screen.getByRole("region", { name: "Résolution du conflit" })).toBeTruthy();
  expect(screen.getByText("Modifications non enregistrées")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Enregistrer" })).toHaveProperty("disabled", true);
  act(() => notify({ structuredContent: { sourcePath: "legacy.dbml", graph: { ...graph, sourcePath: "legacy.dbml" },
    layout: { version: 1, views: { "View All": { nodes: {} } } }, diagnostics: [], layoutWarnings: [] } }));
  expect(screen.getByLabelText("DBML diagram")).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
});

it("keeps invalid project sources editable and displays legacy parser errors", () => {
  let notify: (result: unknown) => void = () => {};
  const bridge = { callTool: vi.fn(), start: vi.fn().mockResolvedValue(undefined), requestDisplayMode: vi.fn(),
    subscribeToToolResults: (listener: typeof notify) => { notify = listener; return () => {}; } };
  render(<Root bridge={bridge} />);
  const project = openResult();
  act(() => notify({ ...project, structuredContent: { ...project.structuredContent, graph: null,
    diagnostics: [{ severity: "error", message: "Missing brace" }] } }));
  expect(screen.getByRole("textbox")).toBeTruthy();
  expect(screen.getByText("Missing brace")).toBeTruthy();
  act(() => notify({ structuredContent: { sourcePath: "legacy.dbml", graph: null, layout: { views: {} },
    diagnostics: [{ severity: "error", message: "Missing brace", location: { start: { line: 1, column: 2 } } }], layoutWarnings: [] } }));
  expect(screen.getByRole("alert").textContent).toContain("Line 1, column 2");
});
