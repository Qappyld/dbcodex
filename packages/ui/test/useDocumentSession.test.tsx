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
  it("uses imported source definitions as the clean presentation baseline", () => {
    const imported = { ...openResult, structuredContent: { ...openResult.structuredContent, graph: { ...graph, views: [{ id: "empty", name: "empty", tableIds: [] }], tableGroups: [] } } };
    const { result } = renderHook(() => useDocumentSession(imported, makeBridge()));
    act(() => result.current.setPresentation(structuredClone(result.current.presentation)));
    expect(result.current.dirty).toBe(false);
  });
  it("saves the presentation reconciled by validation for a new source-defined view", async () => {
    const bridge = makeBridge();
    bridge.callTool.mockImplementation(async (name: string) => name === "validate_dbcd_draft"
      ? { structuredContent: { graph: { ...nextGraph, views: [{ id: "subset", name: "subset", tableIds: ["orders"] }] }, diagnostics: [] } }
      : openResult);
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("Table orders {}\nDiagramView subset { Tables { orders } }"));
    await act(async () => result.current.save());
    expect(bridge.callTool).toHaveBeenCalledWith("save_dbcd", expect.objectContaining({ presentation: expect.objectContaining({
      views: expect.objectContaining({ subset: expect.objectContaining({ name: "subset" }) }),
    }) }));
  });
  it("reads full source only from app metadata", () => {
    expect(readDbcdProjectResult(openResult)?.sourceText).toBe(snapshot.sourceText);
    expect(readDbcdProjectResult({ structuredContent: { ...openResult.structuredContent, sourceText: "leaked" } })).toBeNull();
  });

  it("requires explicit draft resume at the loaded generation while retaining the saved graph", async () => {
    const bridge = makeBridge();
    const draft = { baseGeneration: 3, sourceText: "Table users {", presentation: snapshot.presentation,
      updatedAt: "2026-09-26T00:00:00.000Z" };
    const withDraft = { ...openResult, _meta: { dbcodex: { ...openResult._meta.dbcodex, draft } } };
    const { result } = renderHook(() => useDocumentSession(withDraft, bridge));
    expect(result.current.source).toBe(snapshot.sourceText);
    expect(result.current.dirty).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(bridge.callTool).not.toHaveBeenCalled();
    expect(result.current.recovery?.draft).toEqual(draft);
    act(() => result.current.recovery!.resume());
    expect(result.current.source).toBe(draft.sourceText);
    expect(result.current.dirty).toBe(true);
    expect(result.current.graph).toEqual(graph);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(bridge.callTool).toHaveBeenCalledWith("validate_dbcd_draft", {
      path: "demo.dbcd", sourceText: draft.sourceText,
    });
  });

  it("discards a recovered draft explicitly with the loaded identity", async () => {
    const bridge = makeBridge();
    const draft = { baseGeneration: 3, sourceText: "Table abandoned {", presentation: snapshot.presentation, updatedAt: "2026-09-26" };
    const { result } = renderHook(() => useDocumentSession({ ...openResult, _meta: { dbcodex: { ...openResult._meta.dbcodex, draft } } }, bridge));
    await act(async () => result.current.recovery!.discard());
    expect(result.current.recovery).toBeNull();
    expect(result.current.source).toBe(snapshot.sourceText);
    expect(bridge.callTool).toHaveBeenCalledWith("discard_dbcd_draft", { path: "demo.dbcd", expectedGeneration: 3, expectedProjectId: "secret-id", expectedRevisionId: "r3" });
  });

  it("sends project and revision identity for each mutating session request", async () => {
    const bridge = makeBridge();
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("changed"));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await act(async () => result.current.pin("r1", true));
    await act(async () => result.current.save());
    await act(async () => result.current.restore("r1"));
    for (const [name, args] of bridge.callTool.mock.calls) if (name !== "validate_dbcd_draft") {
      expect(args).toMatchObject({ expectedProjectId: "secret-id", expectedRevisionId: "r3", expectedGeneration: expect.any(Number) });
    }
  });

  it("retains local work through conflict, reload, and an explicit merge against disk identity", async () => {
    const bridge = makeBridge();
    const disk = { ...openResult, structuredContent: { ...openResult.structuredContent, generation: 3, currentRevisionId: "replacement-r3" },
      _meta: { dbcodex: { ...openResult._meta.dbcodex, projectId: "replacement-project", sourceText: "Table remote {}" } } };
    let conflict = true;
    bridge.callTool.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === "validate_dbcd_draft") return { structuredContent: { graph: nextGraph, diagnostics: [] } };
      if (name === "open_dbcd") return disk;
      if (name === "save_dbcd" && conflict) return { isError: true, structuredContent: { errorCode: "CONFLICT" }, content: [{ text: "Project changed." }] };
      if (name === "save_dbcd") return { ...disk, _meta: { dbcodex: { ...disk._meta.dbcodex, sourceText: args?.sourceText } } };
      return { structuredContent: { saved: true } };
    });
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("Table local {}"));
    await act(async () => result.current.save());
    expect(result.current.conflict?.localSource).toBe("Table local {}");
    expect(result.current.conflict?.baseSource).toBe(snapshot.sourceText);
    expect(result.current.conflict?.disk?.sourceText).toBe("Table remote {}");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(bridge.callTool).not.toHaveBeenCalledWith("save_dbcd_draft", expect.anything());
    act(() => result.current.conflict!.retain());
    expect(result.current.source).toBe("Table local {}");
    act(() => result.current.conflict!.reload());
    expect(result.current.source).toBe("Table remote {}");
    expect(result.current.retainedLocal?.sourceText).toBe("Table local {}");
    act(() => result.current.setSource("Table afterReload {}"));
    act(() => result.current.retainedLocal!.recover());
    expect(result.current.source).toBe("Table local {}");
    expect(result.current.retainedCopies?.map((copy) => copy.sourceText)).toContain("Table afterReload {}");
    await act(async () => result.current.save());
    act(() => result.current.conflict!.merge("Table merged {}", snapshot.presentation));
    expect(result.current.source).toBe("Table merged {}");
    expect(result.current.retainedCopies?.map((copy) => copy.sourceText)).toEqual(expect.arrayContaining(["Table local {}", "Table afterReload {}"]));
    conflict = false;
    await act(async () => result.current.save());
    expect(bridge.callTool).toHaveBeenLastCalledWith("save_dbcd", expect.objectContaining({ expectedProjectId: "replacement-project", expectedRevisionId: "replacement-r3", sourceText: "Table merged {}" }));
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
      expectedGeneration: 3, expectedProjectId: "secret-id", expectedRevisionId: "r3",
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
      expectedProjectId: "secret-id", expectedRevisionId: "r3",
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
      expectedGeneration: 3, expectedProjectId: "secret-id", expectedRevisionId: "r3",
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
      expectedProjectId: "secret-id", expectedRevisionId: "r3",
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
      expectedProjectId: "secret-id", expectedRevisionId: "r3",
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

  it("retains a concurrent source's validated graph when restore responds later", async () => {
    const bridge = makeBridge();
    let resolveRestore!: (value: unknown) => void;
    bridge.callTool.mockImplementation((name: string) => {
      if (name === "restore_dbcd_revision") return new Promise((resolve) => { resolveRestore = resolve; });
      if (name === "validate_dbcd_draft") return Promise.resolve({ structuredContent: { graph: nextGraph, diagnostics: [] } });
      return Promise.resolve({ structuredContent: { saved: true } });
    });
    const restoredGraph: SchemaGraph = { sourcePath: "demo.dbcd", tables: [
      { id: "restored", schema: "public", name: "restored", columns: [] },
    ], relations: [] };
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    let restorePromise!: Promise<void>;
    act(() => { restorePromise = result.current.restore("r1"); });
    act(() => result.current.setSource("Table orders { id int }"));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(result.current.graph).toEqual(nextGraph);
    expect(result.current.validating).toBe(false);
    await act(async () => resolveRestore({ ...openResult,
      structuredContent: { ...openResult.structuredContent, generation: 4, graph: restoredGraph },
      _meta: { dbcodex: { ...openResult._meta.dbcodex, sourceText: "restored text" } },
    }));
    await act(async () => restorePromise);
    expect(result.current.source).toBe("Table orders { id int }");
    expect(result.current.graph).toEqual(nextGraph);
    expect(result.current.diagnostics).toEqual([]);
    expect(result.current.generation).toBe(4);
  });

  it("reschedules dirty draft persistence after restore fails without another edit", async () => {
    const bridge = makeBridge();
    bridge.callTool.mockImplementation((name: string) => name === "restore_dbcd_revision"
      ? Promise.reject(new Error("Restore unavailable"))
      : Promise.resolve({ structuredContent: { graph: nextGraph, diagnostics: [], saved: true } }));
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("unsaved edit"));
    await act(async () => result.current.restore("r1"));
    expect(result.current.source).toBe("unsaved edit");
    expect(result.current.generation).toBe(3);
    expect(result.current.error).toBe("Restore unavailable");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(bridge.callTool).toHaveBeenCalledWith("save_dbcd_draft", {
      expectedGeneration: 3, expectedProjectId: "secret-id", expectedRevisionId: "r3",
      path: "demo.dbcd", baseGeneration: 3,
      sourceText: "unsaved edit", presentation: snapshot.presentation,
    });
  });

  it("revalidates pending source after restore fails before debounce validation", async () => {
    const bridge = makeBridge();
    bridge.callTool.mockImplementation((name: string) => name === "restore_dbcd_revision"
      ? Promise.reject(new Error("Restore unavailable"))
      : Promise.resolve({ structuredContent: { graph: null, diagnostics: [syntaxError], saved: true } }));
    const { result } = renderHook(() => useDocumentSession(openResult, bridge));
    act(() => result.current.setSource("Table users {"));
    await act(async () => result.current.restore("r1"));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(result.current.diagnostics).toEqual([syntaxError]);
    expect(result.current.validating).toBe(false);
    expect(result.current.error).toBe("Restore unavailable");
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
