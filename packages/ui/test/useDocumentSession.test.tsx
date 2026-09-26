// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPresentation, type DbcdProjectSnapshot, type Diagnostic, type SchemaGraph } from "@dbcodex/core";
import { readDbcdProjectResult } from "../src/bridge.js";
import { useDocumentSession } from "../src/useDocumentSession.js";

const graph: SchemaGraph = { sourcePath: "demo.dbcd", tables: [], relations: [] };
const nextGraph: SchemaGraph = { sourcePath: "demo.dbcd", tables: [{ id: "orders", schema: "public", name: "orders", columns: [] }], relations: [] };
const syntaxError: Diagnostic = { severity: "error", message: "Expected a closing brace", location: { start: { line: 1, column: 14 } } };
const snapshot: DbcdProjectSnapshot = {
  projectPath: "demo.dbcd", projectId: "secret-id", generation: 3, currentRevisionId: "r3",
  sourceText: "Table users { id int [pk] }", sourceHash: "hash", graph, diagnostics: [],
  presentation: emptyPresentation(), draft: null, revisions: [], readOnly: false,
};
const openResult = {
  structuredContent: { projectPath: snapshot.projectPath, generation: snapshot.generation,
    currentRevisionId: snapshot.currentRevisionId, sourceHash: snapshot.sourceHash,
    graph, diagnostics: [], presentation: snapshot.presentation, revisions: [], readOnly: false, hasDraft: false },
  _meta: { dbcodex: { sourceText: snapshot.sourceText, projectId: snapshot.projectId, draft: null } },
};

function makeBridge() {
  return { callTool: vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === "validate_dbcd_draft") return { structuredContent: { graph: nextGraph, diagnostics: [] } };
    if (name === "save_dbcd_draft" || name === "discard_dbcd_draft" || name === "pin_dbcd_revision") return { structuredContent: { saved: true } };
    return { ...openResult, structuredContent: { ...openResult.structuredContent, generation: 4 },
      _meta: { dbcodex: { ...openResult._meta.dbcodex, sourceText: args?.sourceText ?? snapshot.sourceText } } };
  }) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("useDocumentSession", () => {
  it("reads full source only from app metadata", () => {
    expect(readDbcdProjectResult(openResult)?.sourceText).toBe(snapshot.sourceText);
    expect(readDbcdProjectResult({ structuredContent: { ...openResult.structuredContent, sourceText: "leaked" } })).toBeNull();
  });

  it("opens a draft at the loaded generation while retaining the saved graph", async () => {
    const bridge = makeBridge();
    const draft = { baseGeneration: 3, sourceText: "Table users {", presentation: snapshot.presentation,
      updatedAt: "2026-09-26T00:00:00.000Z" };
    const withDraft = { ...openResult, _meta: { dbcodex: { ...openResult._meta.dbcodex, draft } } };
    const { result } = renderHook(() => useDocumentSession(withDraft, bridge));
    expect(result.current.source).toBe(draft.sourceText);
    expect(result.current.dirty).toBe(true);
    expect(result.current.graph).toEqual(graph);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(bridge.callTool).toHaveBeenCalledWith("validate_dbcd_draft", {
      path: "demo.dbcd", sourceText: draft.sourceText,
    });
  });

  it("debounces validation for 300 ms and retains the last valid graph on errors", async () => {
    const bridge = makeBridge();
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("Table orders { id int [pk] }"));
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(bridge.callTool).not.toHaveBeenCalledWith("validate_dbcd_draft", expect.anything());
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(bridge.callTool).toHaveBeenCalledWith("validate_dbcd_draft", { path: "demo.dbcd", sourceText: "Table orders { id int [pk] }" });
    expect(result.current.graph).toEqual(nextGraph);

    bridge.callTool.mockImplementation(async (name: string) => name === "validate_dbcd_draft"
      ? { structuredContent: { graph: null, diagnostics: [syntaxError] } }
      : { structuredContent: { saved: true } });
    act(() => result.current.setSource("Table orders {"));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(result.current.diagnostics).toEqual([syntaxError]);
    expect(result.current.graph).toEqual(nextGraph);
  });

  it("ignores validation responses for older source generations", async () => {
    const bridge = makeBridge();
    const resolves: Array<(value: unknown) => void> = [];
    bridge.callTool.mockImplementation((name: string) => name === "validate_dbcd_draft"
      ? new Promise((resolve) => { resolves.push(resolve); })
      : Promise.resolve({ structuredContent: { saved: true } }));
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("old"));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    act(() => result.current.setSource("new"));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => resolves[1]!({ structuredContent: { graph: nextGraph, diagnostics: [] } }));
    expect(result.current.graph).toEqual(nextGraph);
    await act(async () => resolves[0]!({ structuredContent: { graph: null, diagnostics: [syntaxError] } }));
    expect(result.current.graph).toEqual(nextGraph);
    expect(result.current.diagnostics).toEqual([]);
    expect(result.current.source).toBe("new");
  });

  it("autosaves the latest draft after one second without creating a revision", async () => {
    const bridge = makeBridge();
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("changed"));
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(bridge.callTool).not.toHaveBeenCalledWith("save_dbcd_draft", expect.anything());
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(bridge.callTool).toHaveBeenCalledWith("save_dbcd_draft", {
      path: "demo.dbcd", baseGeneration: 3, sourceText: "changed", presentation: snapshot.presentation,
    });
    expect(bridge.callTool).not.toHaveBeenCalledWith("save_dbcd", expect.anything());
    expect(result.current.generation).toBe(3);
  });

  it("saves once, cancels a pending draft, and advances the loaded generation", async () => {
    const bridge = makeBridge();
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("changed"));
    await act(async () => result.current.save());
    expect(bridge.callTool).toHaveBeenCalledWith("save_dbcd", {
      path: "demo.dbcd", expectedGeneration: 3, sourceText: "changed", presentation: snapshot.presentation,
    });
    expect(bridge.callTool.mock.calls.filter(([name]) => name === "save_dbcd")).toHaveLength(1);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(bridge.callTool).not.toHaveBeenCalledWith("save_dbcd_draft", expect.anything());
    expect(result.current.generation).toBe(4);
    expect(result.current.dirty).toBe(false);
  });

  it("blocks explicit save when the latest validated source has an error", async () => {
    const bridge = makeBridge();
    bridge.callTool.mockImplementation(async (name: string) => name === "validate_dbcd_draft"
      ? { structuredContent: { graph: null, diagnostics: [syntaxError] } }
      : { structuredContent: { saved: true } });
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("invalid"));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => result.current.save());
    expect(bridge.callTool).not.toHaveBeenCalledWith("save_dbcd", expect.anything());
    expect(result.current.error).toMatch(/invalid|error/i);
  });

  it("reschedules an unsaved invalid draft after a failed explicit save", async () => {
    const bridge = makeBridge();
    bridge.callTool.mockImplementation(async (name: string) => name === "validate_dbcd_draft"
      ? { structuredContent: { graph: null, diagnostics: [syntaxError] } }
      : { structuredContent: { saved: true } });
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("Table users {"));
    await act(async () => result.current.save());
    expect(bridge.callTool).not.toHaveBeenCalledWith("save_dbcd_draft", expect.anything());
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(bridge.callTool).toHaveBeenCalledWith("save_dbcd_draft", {
      path: "demo.dbcd", baseGeneration: 3, sourceText: "Table users {", presentation: snapshot.presentation,
    });
  });

  it("persists an unsaved draft after a save transport failure", async () => {
    const bridge = makeBridge();
    bridge.callTool.mockImplementation(async (name: string) => {
      if (name === "validate_dbcd_draft") return { structuredContent: { graph: nextGraph, diagnostics: [] } };
      if (name === "save_dbcd") throw new Error("Transport unavailable");
      return { structuredContent: { saved: true } };
    });
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("Table changed { id int }"));
    await act(async () => result.current.save());
    expect(result.current.error).toBe("Transport unavailable");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(bridge.callTool).toHaveBeenCalledWith("save_dbcd_draft", expect.objectContaining({
      sourceText: "Table changed { id int }", baseGeneration: 3,
    }));
  });

  it("discards a persisted draft when source returns to the saved baseline", async () => {
    const bridge = makeBridge();
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("dirty"));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(bridge.callTool).toHaveBeenCalledWith("save_dbcd_draft", expect.anything());
    act(() => result.current.setSource(snapshot.sourceText));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.dirty).toBe(false);
    expect(bridge.callTool).toHaveBeenCalledWith("discard_dbcd_draft", {
      path: "demo.dbcd", expectedGeneration: 3,
    });
  });

  it("queues a baseline discard behind an in-flight draft write", async () => {
    const bridge = makeBridge();
    let resolveDraft!: (value: unknown) => void;
    bridge.callTool.mockImplementation((name: string) => name === "save_dbcd_draft"
      ? new Promise((resolve) => { resolveDraft = resolve; })
      : Promise.resolve({ structuredContent: { saved: true, graph: nextGraph, diagnostics: [] } }));
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("dirty"));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    act(() => result.current.setSource(snapshot.sourceText));
    expect(bridge.callTool).not.toHaveBeenCalledWith("discard_dbcd_draft", expect.anything());
    await act(async () => resolveDraft({ structuredContent: { saved: true } }));
    expect(bridge.callTool).toHaveBeenCalledWith("discard_dbcd_draft", {
      path: "demo.dbcd", expectedGeneration: 3,
    });
  });

  it("ignores a superseded discard failure after a concurrent save advances generation", async () => {
    const bridge = makeBridge();
    let resolveSave!: (value: unknown) => void;
    let rejectDiscard!: (reason: unknown) => void;
    bridge.callTool.mockImplementation((name: string) => {
      if (name === "validate_dbcd_draft") return Promise.resolve({ structuredContent: { graph: nextGraph, diagnostics: [] } });
      if (name === "save_dbcd") return new Promise((resolve) => { resolveSave = resolve; });
      if (name === "discard_dbcd_draft") return new Promise((_resolve, reject) => { rejectDiscard = reject; });
      return Promise.resolve({ structuredContent: { saved: true } });
    });
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("first edit"));
    let savePromise!: Promise<void>;
    await act(async () => { savePromise = result.current.save(); await Promise.resolve(); });
    act(() => result.current.setSource(snapshot.sourceText));
    await act(async () => Promise.resolve());
    await act(async () => resolveSave({ ...openResult,
      structuredContent: { ...openResult.structuredContent, generation: 4 },
      _meta: { dbcodex: { ...openResult._meta.dbcodex, sourceText: "first edit" } },
    }));
    await act(async () => savePromise);
    await act(async () => rejectDiscard(new Error("Generation conflict")));
    expect(result.current.source).toBe(snapshot.sourceText);
    expect(result.current.generation).toBe(4);
    expect(result.current.dirty).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(bridge.callTool).toHaveBeenCalledWith("save_dbcd_draft", expect.objectContaining({
      baseGeneration: 4, sourceText: snapshot.sourceText,
    }));
  });

  it("keeps concurrent edits after restore and rejects late validation for discarded text", async () => {
    const bridge = makeBridge();
    const validationResolvers: Array<(value: unknown) => void> = [];
    let resolveRestore!: (value: unknown) => void;
    bridge.callTool.mockImplementation((name: string) => {
      if (name === "validate_dbcd_draft") return new Promise((resolve) => validationResolvers.push(resolve));
      if (name === "restore_dbcd_revision") return new Promise((resolve) => { resolveRestore = resolve; });
      return Promise.resolve({ structuredContent: { saved: true } });
    });
    const restoredGraph: SchemaGraph = { sourcePath: "demo.dbcd", tables: [
      { id: "restored", schema: "public", name: "restored", columns: [] },
    ], relations: [] };
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("discarded text"));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    let restorePromise!: Promise<void>;
    act(() => { restorePromise = result.current.restore("r1"); });
    act(() => result.current.setSource("concurrent edit"));
    await act(async () => resolveRestore({ ...openResult,
      structuredContent: { ...openResult.structuredContent, generation: 4, graph: restoredGraph },
      _meta: { dbcodex: { ...openResult._meta.dbcodex, sourceText: "restored text" } },
    }));
    await act(async () => restorePromise);
    expect(result.current.source).toBe("concurrent edit");
    expect(result.current.generation).toBe(4);
    expect(result.current.graph).toEqual(restoredGraph);
    expect(result.current.dirty).toBe(true);
    await act(async () => validationResolvers[0]!({ structuredContent: { graph: nextGraph, diagnostics: [syntaxError] } }));
    expect(result.current.graph).toEqual(restoredGraph);
    expect(result.current.diagnostics).toEqual([]);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(bridge.callTool).toHaveBeenCalledWith("save_dbcd_draft", expect.objectContaining({
      baseGeneration: 4, sourceText: "concurrent edit",
    }));
  });

  it("preserves edits made during save and uses the advanced generation for their draft", async () => {
    const bridge = makeBridge();
    let resolveSave!: (value: unknown) => void;
    bridge.callTool.mockImplementation((name: string, args?: Record<string, unknown>) => {
      if (name === "validate_dbcd_draft") return Promise.resolve({ structuredContent: { graph: nextGraph, diagnostics: [] } });
      if (name === "save_dbcd") return new Promise((resolve) => { resolveSave = resolve; });
      return Promise.resolve({ structuredContent: { saved: true } });
    });
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("first edit"));
    let savePromise!: Promise<void>;
    await act(async () => { savePromise = result.current.save(); await Promise.resolve(); });
    act(() => result.current.setSource("second edit"));
    await act(async () => resolveSave({ ...openResult,
      structuredContent: { ...openResult.structuredContent, generation: 4 },
      _meta: { dbcodex: { ...openResult._meta.dbcodex, sourceText: "first edit" } },
    }));
    await act(async () => savePromise);
    expect(result.current.source).toBe("second edit");
    expect(result.current.generation).toBe(4);
    expect(result.current.dirty).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(bridge.callTool).toHaveBeenCalledWith("save_dbcd_draft", expect.objectContaining({
      baseGeneration: 4, sourceText: "second edit",
    }));
  });
});
