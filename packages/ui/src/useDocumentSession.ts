import { useEffect, useRef, useState } from "react";
import type { DbcdProjectSnapshot, DbcdRevisionSummary, Diagnostic, PresentationDocument, SchemaGraph } from "@dbcodex/core";
import { readDbcdProjectResult, type McpAppsBridge } from "./bridge.js";
import { reconcileDbmlPresentation } from "./presentation-commands.js";
type LocalCopy = { sourceText: string; presentation: PresentationDocument };
type RecoverableCopy = LocalCopy & { recover(): void };

export interface DocumentSession {
  recovery?: { draft: NonNullable<DbcdProjectSnapshot["draft"]>; resume(): void; discard(): Promise<void> } | null;
  conflict?: { baseSource: string; localSource: string; localPresentation: PresentationDocument; disk: DbcdProjectSnapshot | null;
    retain(): void; reload(): void; merge(source: string, presentation: PresentationDocument): void } | null;
  retainedLocal?: RecoverableCopy | null;
  retainedCopies?: RecoverableCopy[];
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
type SessionState = Omit<DocumentSession, "setSource" | "setPresentation" | "save" | "restore" | "pin" | "recovery" | "conflict" | "retainedLocal" | "retainedCopies">;
type Conflict = Pick<NonNullable<DocumentSession["conflict"]>, "baseSource" | "localSource" | "localPresentation" | "disk">;
class ToolFailure extends Error { constructor(message: string, readonly code?: string) { super(message); } }

function toolContent(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("The tool returned no result.");
  const result = value as { isError?: boolean; content?: Array<{ text?: string }>; structuredContent?: unknown };
  if (result.isError) throw new ToolFailure(result.content?.[0]?.text ?? "The operation failed.",
    (result.structuredContent as { errorCode?: string } | undefined)?.errorCode);
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
  const externalResult = useRef(openResult);
  const [pendingDraft, setPendingDraft] = useState(initial.current.draft);
  const pendingRef = useRef(pendingDraft);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const conflictRef = useRef<Conflict | null>(null);
  const [localCopies, setLocalCopies] = useState<LocalCopy[]>([]);
  const identity = useRef({ expectedProjectId: opened.projectId, expectedRevisionId: opened.currentRevisionId });
  const [state, setState] = useState<SessionState>(() => ({
    source: initial.current.sourceText,
    presentation: initial.current.graph ? reconcileDbmlPresentation(initial.current.presentation, initial.current.graph) : initial.current.presentation,
    graph: initial.current.graph,
    diagnostics: initial.current.diagnostics,
    generation: initial.current.generation,
    revisions: initial.current.revisions,
    dirty: false,
    validating: false, saving: false, error: null,
  }));
  const stateRef = useRef(state);
  const loaded = useRef({ source: opened.sourceText, presentation: JSON.stringify(state.presentation) });
  const validationId = useRef(0);
  const validatedSource = useRef<string | null>(opened.sourceText);
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
  const expected = () => ({ ...identity.current, expectedGeneration: stateRef.current.generation });
  const reportFailure = async (error: unknown): Promise<void> => {
    update({ error: message(error) });
    if (!(error instanceof ToolFailure) || error.code !== "CONFLICT") return;
    clearTimers(); ++draftEpoch.current;
    const value: Conflict = { baseSource: loaded.current.source, localSource: stateRef.current.source,
      localPresentation: stateRef.current.presentation, disk: null };
    conflictRef.current = value; setConflict(value);
    try {
      const disk = readDbcdProjectResult(await bridge.callTool("open_dbcd", { path: initial.current.projectPath }));
      if (mounted.current && conflictRef.current === value) { conflictRef.current = { ...value, disk }; setConflict(conflictRef.current); }
    } catch { /* Local work remains available even if disk cannot be read. */ }
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
        ...(nextGraph && !diagnostics.some((item) => item.severity === "error") ? { graph: nextGraph,
          presentation: reconcileDbmlPresentation(stateRef.current.presentation, nextGraph) } : {}),
      });
      return diagnostics;
    } catch (error) {
      if (id === validationId.current) update({ validating: false, error: message(error) });
      return null;
    }
  };

  const queueDraft = (name: "save_dbcd_draft" | "discard_dbcd_draft",
    args: Record<string, unknown>, epoch: number, edit: number): void => {
    const operation = draftQueue.current.then(async () => {
      if (epoch !== draftEpoch.current || (name === "save_dbcd_draft" && edit !== editId.current)) return;
      toolContent(await bridge.callTool(name, args));
    });
    draftQueue.current = operation.catch(async (error: unknown) => {
      if (epoch === draftEpoch.current && edit === editId.current) await reportFailure(error);
    });
  };

  const scheduleDraft = (): void => {
    if (pendingRef.current || conflictRef.current) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    const scheduledEdit = editId.current;
    const epoch = draftEpoch.current;
    if (!stateRef.current.dirty) {
      draftTimer.current = null;
      queueDraft("discard_dbcd_draft", {
        path: initial.current.projectPath, ...expected(),
      }, epoch, scheduledEdit);
      return;
    }
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      if (scheduledEdit !== editId.current || epoch !== draftEpoch.current || savingRef.current || !stateRef.current.dirty) return;
      const current = stateRef.current;
      queueDraft("save_dbcd_draft", {
        path: initial.current.projectPath, ...expected(), baseGeneration: current.generation,
        sourceText: current.source, presentation: current.presentation,
      }, epoch, scheduledEdit);
    }, 1000);
  };

  const setSource = (value: string): void => {
    if (value === stateRef.current.source || initial.current.readOnly || pendingRef.current) return;
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
    if (initial.current.readOnly || pendingRef.current) return;
    editId.current += 1;
    update({ presentation: value, dirty: stateRef.current.source !== loaded.current.source
      || JSON.stringify(value) !== loaded.current.presentation, error: null });
    scheduleDraft();
  };

  const applySnapshot = (snapshot: DbcdProjectSnapshot, preserveEdits: boolean,
    graph = preserveEdits ? stateRef.current.graph : snapshot.graph,
    diagnostics = preserveEdits ? stateRef.current.diagnostics : snapshot.diagnostics): void => {
    const presentation = snapshot.graph ? reconcileDbmlPresentation(snapshot.presentation, snapshot.graph) : snapshot.presentation;
    loaded.current = { source: snapshot.sourceText, presentation: JSON.stringify(presentation) };
    identity.current = { expectedProjectId: snapshot.projectId, expectedRevisionId: snapshot.currentRevisionId };
    if (!preserveEdits) validatedSource.current = snapshot.sourceText;
    update({
      source: preserveEdits ? stateRef.current.source : snapshot.sourceText,
      presentation: preserveEdits ? stateRef.current.presentation : presentation,
      graph,
      diagnostics,
      generation: snapshot.generation, revisions: snapshot.revisions,
      dirty: preserveEdits && (stateRef.current.source !== snapshot.sourceText
        || JSON.stringify(stateRef.current.presentation) !== JSON.stringify(presentation)), error: null,
    });
  };

  const save = async (): Promise<void> => {
    if (savingRef.current || initial.current.readOnly || pendingRef.current || conflictRef.current || !stateRef.current.dirty) return;
    clearTimers();
    ++draftEpoch.current;
    const source = stateRef.current.source;
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
        path: initial.current.projectPath, ...expected(),
        sourceText: source, presentation: stateRef.current.presentation,
      });
      const snapshot = readDbcdProjectResult(response);
      if (!snapshot) { toolContent(response); throw new Error("The save returned no project snapshot."); }
      ++draftEpoch.current;
      applySnapshot(snapshot, edit !== editId.current);
    } catch (error) {
      await reportFailure(error);
    } finally {
      savingRef.current = false;
      update({ saving: false, ...(edit === editId.current ? { validating: false } : {}) });
      if (stateRef.current.dirty) scheduleDraft();
    }
  };

  const restore = async (revisionId: string): Promise<void> => {
    if (savingRef.current || initial.current.readOnly || pendingRef.current || conflictRef.current) return;
    clearTimers();
    ++draftEpoch.current;
    ++validationId.current;
    const edit = editId.current;
    let failed = false;
    savingRef.current = true;
    update({ saving: true, validating: false, error: null });
    try {
      const response = await bridge.callTool("restore_dbcd_revision", {
        path: initial.current.projectPath, ...expected(), revisionId,
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
    } catch (error) { failed = true; await reportFailure(error); }
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
    if (initial.current.readOnly || pendingRef.current || conflictRef.current) return;
    try {
      toolContent(await bridge.callTool("pin_dbcd_revision", { path: initial.current.projectPath, ...expected(), revisionId, pinned }));
      update({ revisions: stateRef.current.revisions.map((revision) => revision.id === revisionId
        ? { ...revision, pinned } : revision), error: null });
    } catch (error) { await reportFailure(error); }
  };

  const resumeDraft = (): void => {
    const draft = pendingRef.current;
    if (!draft || initial.current.readOnly) return;
    pendingRef.current = null; setPendingDraft(null);
    setPresentation(draft.presentation); setSource(draft.sourceText);
  };
  const discardDraft = async (): Promise<void> => {
    if (!pendingRef.current || initial.current.readOnly) return;
    try {
      toolContent(await bridge.callTool("discard_dbcd_draft", { path: initial.current.projectPath, ...expected() }));
      pendingRef.current = null; setPendingDraft(null);
    } catch (error) { await reportFailure(error); }
  };
  const adoptDisk = (source?: string, presentation?: PresentationDocument): void => {
    const disk = conflictRef.current?.disk;
    if (!disk) return;
    rememberLocal({ sourceText: pendingRef.current?.sourceText ?? stateRef.current.source, presentation: pendingRef.current?.presentation ?? stateRef.current.presentation });
    pendingRef.current = null; setPendingDraft(null);
    clearTimers(); ++validationId.current; ++draftEpoch.current; ++editId.current;
    conflictRef.current = null; setConflict(null);
    applySnapshot(disk, false);
    if (source !== undefined) { setPresentation(presentation ?? disk.presentation); setSource(source); }
  };
  useEffect(() => {
    if (externalResult.current === openResult) return;
    externalResult.current = openResult;
    if (savingRef.current || (opened.projectId === identity.current.expectedProjectId
      && opened.currentRevisionId === identity.current.expectedRevisionId && opened.generation === stateRef.current.generation)) return;
    clearTimers(); ++draftEpoch.current; ++validationId.current;
    update({ validating: false });
    if (stateRef.current.dirty || pendingRef.current || conflictRef.current) {
      const value: Conflict = { baseSource: loaded.current.source, localSource: stateRef.current.source,
        localPresentation: stateRef.current.presentation, disk: opened };
      conflictRef.current = value; setConflict(value);
    } else {
      initial.current = opened;
      applySnapshot(opened, false);
      pendingRef.current = opened.draft; setPendingDraft(opened.draft);
    }
  }, [openResult]);
  function rememberLocal(copy: LocalCopy): void {
    setLocalCopies((copies) => copies.some((previous) => previous.sourceText === copy.sourceText
      && JSON.stringify(previous.presentation) === JSON.stringify(copy.presentation)) ? copies : [...copies, copy]);
  }
  const recoverableCopies = localCopies.map((copy): RecoverableCopy => ({ ...copy, recover: () => {
    rememberLocal({ sourceText: stateRef.current.source, presentation: stateRef.current.presentation });
    setPresentation(copy.presentation); setSource(copy.sourceText);
  } }));
  return { ...state, setSource, setPresentation, save, restore, pin,
    recovery: pendingDraft ? { draft: pendingDraft, resume: resumeDraft, discard: discardDraft } : null,
    conflict: conflict ? { ...conflict, localSource: state.source, localPresentation: state.presentation, retain: () => update({ error: "Brouillon local conservé. Résolvez le conflit avant d’enregistrer." }),
      reload: () => adoptDisk(), merge: (source, presentation) => adoptDisk(source, presentation) } : null,
    retainedLocal: recoverableCopies.at(-1) ?? null, retainedCopies: recoverableCopies,
  };
}
