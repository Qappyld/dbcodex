import { useEffect, useRef, useState } from "react";
import type { DbcdProjectSnapshot, DbcdRevisionSummary, Diagnostic, PresentationDocument, SchemaGraph } from "@dbcodex/core";
import { readDbcdProjectResult, type McpAppsBridge } from "./bridge.js";

export interface DocumentSession {
  source: string;
  presentation: PresentationDocument;
  graph: SchemaGraph | null;
  diagnostics: Diagnostic[];
  generation: number;
  revisions: DbcdRevisionSummary[];
  dirty: boolean;
  validating: boolean;
  saving: boolean;
  error: string | null;
  setSource(value: string): void;
  setPresentation(value: PresentationDocument): void;
  save(): Promise<void>;
  restore(revisionId: string): Promise<void>;
  pin(revisionId: string, pinned: boolean): Promise<void>;
}

type Bridge = Pick<McpAppsBridge, "callTool">;
type SessionState = Omit<DocumentSession, "setSource" | "setPresentation" | "save" | "restore" | "pin">;

function toolContent(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("The tool returned no result.");
  const result = value as { isError?: boolean; content?: Array<{ text?: string }>; structuredContent?: unknown };
  if (result.isError) throw new Error(result.content?.[0]?.text ?? "The operation failed.");
  if (!result.structuredContent || typeof result.structuredContent !== "object") throw new Error("The tool returned no structured result.");
  return result.structuredContent as Record<string, unknown>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed.";
}

export function useDocumentSession(openResult: unknown, bridge: Bridge): DocumentSession {
  const opened = readDbcdProjectResult(openResult);
  if (!opened) throw new Error("A valid .dbcd project result is required.");
  const initial = useRef(opened);
  const recovered = initial.current.draft?.baseGeneration === initial.current.generation
    ? initial.current.draft : null;
  const [state, setState] = useState<SessionState>(() => ({
    source: recovered?.sourceText ?? initial.current.sourceText,
    presentation: recovered?.presentation ?? initial.current.presentation,
    graph: initial.current.graph,
    diagnostics: initial.current.diagnostics,
    generation: initial.current.generation,
    revisions: initial.current.revisions,
    dirty: recovered !== null && (recovered.sourceText !== initial.current.sourceText
      || JSON.stringify(recovered.presentation) !== JSON.stringify(initial.current.presentation)),
    validating: false, saving: false, error: null,
  }));
  const stateRef = useRef(state);
  const loaded = useRef({ source: opened.sourceText, presentation: JSON.stringify(opened.presentation) });
  const validationId = useRef(0);
  const validatedSource = useRef<string | null>(recovered ? null : opened.sourceText);
  const editId = useRef(0);
  const draftEpoch = useRef(0);
  const draftQueue = useRef<Promise<void>>(Promise.resolve());
  const validationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const mounted = useRef(true);

  const update = (change: Partial<SessionState>): void => {
    if (!mounted.current) return;
    stateRef.current = { ...stateRef.current, ...change };
    setState(stateRef.current);
  };
  const clearTimers = (): void => {
    if (validationTimer.current) clearTimeout(validationTimer.current);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    validationTimer.current = null;
    draftTimer.current = null;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      validationId.current += 1;
      clearTimers();
    };
  }, []);

  const validate = async (source: string, id: number): Promise<Diagnostic[] | null> => {
    try {
      const content = toolContent(await bridge.callTool("validate_dbcd_draft", {
        path: initial.current.projectPath, sourceText: source,
      }));
      if (id !== validationId.current || !mounted.current) return null;
      const diagnostics = Array.isArray(content.diagnostics) ? content.diagnostics as Diagnostic[] : [];
      const nextGraph = content.graph as SchemaGraph | null | undefined;
      validatedSource.current = source;
      update({ diagnostics, validating: false,
        ...(nextGraph && !diagnostics.some((item) => item.severity === "error") ? { graph: nextGraph } : {}),
      });
      return diagnostics;
    } catch (error) {
      if (id === validationId.current) update({ validating: false, error: message(error) });
      return null;
    }
  };

  useEffect(() => {
    if (!recovered) return;
    const id = ++validationId.current;
    update({ validating: true });
    validationTimer.current = setTimeout(() => {
      validationTimer.current = null;
      void validate(recovered.sourceText, id);
    }, 300);
  }, []);

  const queueDraft = (name: "save_dbcd_draft" | "discard_dbcd_draft",
    args: Record<string, unknown>, epoch: number, edit: number): void => {
    const operation = draftQueue.current.then(async () => {
      if (epoch !== draftEpoch.current || (name === "save_dbcd_draft" && edit !== editId.current)) return;
      toolContent(await bridge.callTool(name, args));
    });
    draftQueue.current = operation.catch((error: unknown) => {
      if (epoch === draftEpoch.current && edit === editId.current) update({ error: message(error) });
    });
  };

  const scheduleDraft = (): void => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    const scheduledEdit = editId.current;
    const epoch = draftEpoch.current;
    if (!stateRef.current.dirty) {
      draftTimer.current = null;
      queueDraft("discard_dbcd_draft", {
        path: initial.current.projectPath, expectedGeneration: stateRef.current.generation,
      }, epoch, scheduledEdit);
      return;
    }
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      if (scheduledEdit !== editId.current || epoch !== draftEpoch.current || savingRef.current || !stateRef.current.dirty) return;
      const current = stateRef.current;
      queueDraft("save_dbcd_draft", {
        path: initial.current.projectPath, baseGeneration: current.generation,
        sourceText: current.source, presentation: current.presentation,
      }, epoch, scheduledEdit);
    }, 1000);
  };

  const setSource = (value: string): void => {
    if (value === stateRef.current.source || initial.current.readOnly) return;
    editId.current += 1;
    validatedSource.current = null;
    const id = ++validationId.current;
    if (validationTimer.current) clearTimeout(validationTimer.current);
    update({ source: value, dirty: value !== loaded.current.source
      || JSON.stringify(stateRef.current.presentation) !== loaded.current.presentation,
      validating: true, error: null });
    validationTimer.current = setTimeout(() => {
      validationTimer.current = null;
      void validate(value, id);
    }, 300);
    scheduleDraft();
  };

  const setPresentation = (value: PresentationDocument): void => {
    if (initial.current.readOnly) return;
    editId.current += 1;
    update({ presentation: value, dirty: stateRef.current.source !== loaded.current.source
      || JSON.stringify(value) !== loaded.current.presentation, error: null });
    scheduleDraft();
  };

  const applySnapshot = (snapshot: DbcdProjectSnapshot, preserveEdits: boolean,
    graph = preserveEdits ? stateRef.current.graph : snapshot.graph,
    diagnostics = preserveEdits ? stateRef.current.diagnostics : snapshot.diagnostics): void => {
    loaded.current = { source: snapshot.sourceText, presentation: JSON.stringify(snapshot.presentation) };
    if (!preserveEdits) validatedSource.current = snapshot.sourceText;
    update({
      source: preserveEdits ? stateRef.current.source : snapshot.sourceText,
      presentation: preserveEdits ? stateRef.current.presentation : snapshot.presentation,
      graph,
      diagnostics,
      generation: snapshot.generation, revisions: snapshot.revisions,
      dirty: preserveEdits && (stateRef.current.source !== snapshot.sourceText
        || JSON.stringify(stateRef.current.presentation) !== JSON.stringify(snapshot.presentation)), error: null,
    });
  };

  const save = async (): Promise<void> => {
    if (savingRef.current || initial.current.readOnly || !stateRef.current.dirty) return;
    clearTimers();
    ++draftEpoch.current;
    const source = stateRef.current.source;
    const presentation = stateRef.current.presentation;
    const edit = editId.current;
    const id = ++validationId.current;
    savingRef.current = true;
    update({ saving: true, validating: true, error: null });
    try {
      const diagnostics = await validate(source, id);
      if (diagnostics === null || edit !== editId.current) return;
      if (diagnostics.some((item) => item.severity === "error")) {
        update({ error: "Cannot save invalid DBML." });
        return;
      }
      const response = await bridge.callTool("save_dbcd", {
        path: initial.current.projectPath, expectedGeneration: stateRef.current.generation,
        sourceText: source, presentation,
      });
      const snapshot = readDbcdProjectResult(response);
      if (!snapshot) { toolContent(response); throw new Error("The save returned no project snapshot."); }
      ++draftEpoch.current;
      applySnapshot(snapshot, edit !== editId.current);
    } catch (error) {
      update({ error: message(error) });
    } finally {
      savingRef.current = false;
      update({ saving: false, ...(edit === editId.current ? { validating: false } : {}) });
      if (stateRef.current.dirty) scheduleDraft();
    }
  };

  const restore = async (revisionId: string): Promise<void> => {
    if (savingRef.current || initial.current.readOnly) return;
    clearTimers();
    ++draftEpoch.current;
    ++validationId.current;
    const edit = editId.current;
    let failed = false;
    savingRef.current = true;
    update({ saving: true, validating: false, error: null });
    try {
      const response = await bridge.callTool("restore_dbcd_revision", {
        path: initial.current.projectPath, expectedGeneration: stateRef.current.generation, revisionId,
      });
      const snapshot = readDbcdProjectResult(response);
      if (!snapshot) { toolContent(response); throw new Error("The restore returned no project snapshot."); }
      ++draftEpoch.current;
      const concurrentEdit = edit !== editId.current;
      const currentSourceValidated = concurrentEdit && validatedSource.current === stateRef.current.source;
      applySnapshot(snapshot, concurrentEdit,
        currentSourceValidated ? stateRef.current.graph : snapshot.graph,
        currentSourceValidated ? stateRef.current.diagnostics : snapshot.diagnostics);
      if (!concurrentEdit) editId.current += 1;
    } catch (error) { failed = true; update({ error: message(error) }); }
    finally {
      savingRef.current = false;
      update({ saving: false, ...(edit === editId.current ? { validating: false } : {}) });
      if (failed && edit === editId.current && validatedSource.current !== stateRef.current.source) {
        const source = stateRef.current.source, id = ++validationId.current;
        update({ validating: true });
        validationTimer.current = setTimeout(() => {
          validationTimer.current = null;
          void validate(source, id);
        }, 300);
      }
      if (stateRef.current.dirty) scheduleDraft();
    }
  };

  const pin = async (revisionId: string, pinned: boolean): Promise<void> => {
    try {
      toolContent(await bridge.callTool("pin_dbcd_revision", { path: initial.current.projectPath, revisionId, pinned }));
      update({ revisions: stateRef.current.revisions.map((revision) => revision.id === revisionId
        ? { ...revision, pinned } : revision), error: null });
    } catch (error) { update({ error: message(error) }); }
  };

  return { ...state, setSource, setPresentation, save, restore, pin };
}
