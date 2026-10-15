import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { PresentationDocument, SchemaGraph } from "@dbcodex/core";
import { ActionIcon } from "./ActionIcon.js";
import { TableVisibilityTree } from "./TableVisibilityTree.js";
import { createView, duplicateView, renameView, deleteView, setActiveView, setNodeHidden, updateGroup, dbmlViewIds, searchTables } from "./presentation-commands.js";
import { applyDbmlPatch, dbmlTableReference, previewDbmlBlock, removeDbmlBlock, renameDbmlView, setDbmlViewTables } from "./dbml-patches.js";
import { allocateDbmlIdentifier } from "./dbml-identifiers.js";
import { previewVisibility, tableHidden, type VisibilityPreview } from "./view-visibility.js";

export function ViewDialog({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="view-dialog-backdrop"><section ref={ref} role="dialog" aria-modal="true" aria-label={title} className="view-dialog" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === "Tab") {
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}><h2>{title}</h2>{children}</section></div>;
}

export type ViewNavigation = (id: string, tableIds: string[], onComplete: () => void) => void;
type Transition = { type: "select"; id: string; tableIds?: string[]; onComplete?: () => void } | { type: "create" | "copy" } | { type: "delete"; id: string } | { type: "rename"; id: string; name: string };
export function ViewManager({ graph, presentation, source, selectedIds, query, onQueryChange, onSelectTable, onPresentationChange, onSourceChange, onVisibilityPreview, navigationRef, readOnly = false }: {
  graph: SchemaGraph; presentation: PresentationDocument; source: string; selectedIds: string[]; query: string;
  onQueryChange(value: string): void; onSelectTable(id: string): void;
  onPresentationChange(value: PresentationDocument): void; onSourceChange(value: string): void;
  onVisibilityPreview?(value: VisibilityPreview | null): void; readOnly?: boolean;
  navigationRef?: RefObject<ViewNavigation | null>;
}) {
  const viewId = presentation.activeViewId;
  const [draft, setDraft] = useState<VisibilityPreview | null>(null);
  const [listOpen, setListOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false), [saveOpen, setSaveOpen] = useState(false);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null), [transition, setTransition] = useState<Transition | null>(null);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const updateDraft = (value: VisibilityPreview | null) => { setDraft(value); onVisibilityPreview?.(value); };
  useEffect(() => { setDraft(null); onVisibilityPreview?.(null); setRename(null); setTransition(null); setDeleting(null); }, [viewId, readOnly]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setListOpen(false); setMenuOpen(false); setSaveOpen(false); } };
    document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close);
  }, []);
  const hidden = draft?.viewId === viewId ? draft.hidden : {};
  const dirty = graph.tables.some(table => Object.hasOwn(hidden, table.id) && hidden[table.id] !== tableHidden(presentation, viewId, table.id));
  const preview = previewVisibility(presentation, graph, draft);
  const current = preview.views[viewId]!;
  const run = (action: () => void) => { if (readOnly) return; try { action(); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Modification impossible."); } };
  const sourceId = (id: string) => [...dbmlViewIds(graph)].find(([, mapped]) => mapped === id)?.[0] ?? id;
  const visibleTables = (value: PresentationDocument) => graph.tables.filter(table => !tableHidden(value, value.activeViewId, table.id));
  const savedDraft = (): { value: PresentationDocument; text: string } => {
    const value = structuredClone(preview);
    const text = viewId === "all" ? source : setDbmlViewTables(source, sourceId(viewId), visibleTables(value));
    return { value, text };
  };
  const publish = (value: PresentationDocument, text: string) => {
    if (text !== source) onSourceChange(text);
    onPresentationChange(value); updateDraft(null); setListOpen(false); setMenuOpen(false); setSaveOpen(false); setTransition(null);
  };
  const execute = (action: Transition, value = presentation, text = source) => {
    if (action.type === "select") {
      value = setActiveView(value, action.id);
      for (const id of action.tableIds ?? []) if (tableHidden(value, action.id, id)) value = setNodeHidden(value, action.id, id, false);
      for (const [id, group] of Object.entries(value.views[action.id]!.groups))
        if (group.collapsed && (action.tableIds ?? []).some(table => group.tableIds.includes(table))) value = updateGroup(value, action.id, id, { collapsed: false });
    }
    else if (action.type === "delete") { text = removeDbmlBlock(text, "DiagramView", sourceId(action.id)); value = deleteView(value, action.id); }
    else if (action.type === "rename") {
      const name = action.name.trim();
      if (!name) throw new Error("Saisissez un nom de vue.");
      if (Object.entries(value.views).some(([id, view]) => id !== action.id && view.name === name)) throw new Error("Ce nom de vue existe déjà.");
      const id = allocateDbmlIdentifier(name, { ...Object.fromEntries(Object.entries(value.views).filter(([id]) => id !== action.id)),
        ...Object.fromEntries((graph.views ?? []).filter(view => view.id !== sourceId(action.id)).map(view => [view.id, true])) });
      text = renameDbmlView(text, sourceId(action.id), id); value = renameView(value, action.id, name);
      if (id !== action.id) { value.views[id] = value.views[action.id]!; delete value.views[action.id]; if (value.activeViewId === action.id) value.activeViewId = id; }
      setRename(null);
    }
    else {
      let name = action.type === "copy" ? `Copie de ${value.views[value.activeViewId]!.name}` : "Nouvelle vue";
      const names = new Set(Object.values(value.views).map(view => view.name));
      const base = name; for (let suffix = 2; names.has(name); suffix++) name = `${base} ${suffix}`;
      const id = allocateDbmlIdentifier(name, { ...Object.fromEntries((graph.views ?? []).map(view => [view.id, true])), ...value.views });
      value = action.type === "copy" ? duplicateView(value, value.activeViewId, id, name) : createView(value, { id, name, tableIds: [] });
      if (action.type === "create") value.views[id]!.defaultDetail = "all";
      const tables = action.type === "copy" ? visibleTables(value) : [];
      const block = `DiagramView ${id} {\n  Tables {\n${tables.map(table => `    ${dbmlTableReference(table)}`).join("\n")}\n  }\n}`;
      text = applyDbmlPatch(text, previewDbmlBlock(text, "DiagramView", id, block));
    }
    publish(value, text);
    if (action.type === "select") action.onComplete?.();
  };
  const request = (action: Transition) => run(() => {
    if (action.type === "select" && action.id === viewId) { setListOpen(false); return; }
    setListOpen(false); setMenuOpen(false);
    if (dirty) setTransition(action); else execute(action);
  });
  if (navigationRef) navigationRef.current = (id, tableIds, onComplete) => request({ type: "select", id, tableIds, onComplete });
  const finishRename = () => run(() => {
    if (rename) request({ type: "rename", ...rename });
  });
  const setVisibility = (ids: string[], show: boolean) => {
    if (readOnly) return;
    const next = { ...hidden }; ids.forEach(id => { if (show === !tableHidden(presentation, viewId, id)) delete next[id]; else next[id] = !show; });
    updateDraft(Object.keys(next).length ? { viewId, hidden: next } : null);
  };
  return <div ref={root} className="view-manager" onKeyDown={event => {
    if (event.key === "Escape" && !transition && !deleting) { setListOpen(false); setMenuOpen(false); setSaveOpen(false); setRename(null); event.stopPropagation(); }
  }}>
    <div className="view-picker">
      <button type="button" aria-label="Choisir une vue" aria-expanded={listOpen} onClick={() => { setListOpen(!listOpen); setMenuOpen(false); }}>{viewId === "all" ? "Default View" : current.name}<ActionIcon name="chevronDown" /></button>
      {viewId !== "all" && <button type="button" aria-label="Actions de la vue" aria-expanded={menuOpen} disabled={readOnly} onClick={() => { setMenuOpen(!menuOpen); setListOpen(false); }}>⋮</button>}
      {menuOpen && <div className="view-popover"><button onClick={() => { setRename({ id: viewId, name: current.name }); setListOpen(true); setMenuOpen(false); }}>Renommer</button><button onClick={() => { setDeleting(viewId); setMenuOpen(false); }}>Supprimer</button></div>}
      {listOpen && <div className="view-popover view-list" aria-label="Liste des vues">
        {Object.entries(presentation.views).sort(([a], [b]) => a === "all" ? -1 : b === "all" ? 1 : 0).map(([id, view]) => <div className="view-list-row" key={id}>
          {rename?.id === id ? <><input aria-label="Nom de la vue" autoFocus value={rename.name} onChange={event => setRename({ ...rename, name: event.target.value })} onKeyDown={event => { if (event.key === "Enter") finishRename(); }} /><button aria-label="Valider le nom de la vue" disabled={readOnly || !rename.name.trim()} onClick={finishRename}>✓</button><button aria-label="Annuler le renommage" onClick={() => setRename(null)}>×</button></>
            : <><button className="view-list-choice" aria-current={id === viewId ? "true" : undefined} onClick={() => request({ type: "select", id })}><span aria-hidden="true">{id === viewId ? "✓" : ""}</span>{id === "all" ? "Default View" : view.name}</button>{id !== "all" && <><button aria-label={`Renommer ${view.name}`} disabled={readOnly} onClick={() => setRename({ id, name: view.name })}>✎</button><button aria-label={`Supprimer ${view.name}`} disabled={readOnly} onClick={() => setDeleting(id)}>×</button></>}</>}
        </div>)}
        <button className="view-new" disabled={readOnly} onClick={() => request({ type: "create" })}>＋ Nouvelle vue</button>
      </div>}
    </div>
    <div className="view-save-actions">{dirty && <button disabled={readOnly} onClick={() => updateDraft(null)}>Réinitialiser</button>}<button className="view-save" disabled={readOnly || !dirty} onClick={() => run(() => { const saved = savedDraft(); publish(saved.value, saved.text); })}>Enregistrer la vue</button><div className="view-save-menu"><button aria-label="Options d’enregistrement de la vue" aria-expanded={saveOpen} disabled={readOnly} onClick={() => setSaveOpen(!saveOpen)}><ActionIcon name="chevronDown" /></button>{saveOpen && <div className="view-popover"><button onClick={() => run(() => execute({ type: "copy" }, preview))}>Enregistrer comme nouvelle vue</button></div>}</div></div>
    <label>Rechercher<input type="search" aria-label="Rechercher tables, colonnes, groupes et schémas" placeholder="Table, schéma ou groupe…" value={query} onChange={event => onQueryChange(event.target.value)} /></label>
    <TableVisibilityTree tables={graph.tables} view={current} matches={new Set(searchTables(graph, current, query))} selectedIds={selectedIds} readOnly={readOnly} onSelect={id => { if (!readOnly && tableHidden(preview, viewId, id)) setVisibility([id], true); onSelectTable(id); }} onVisibility={setVisibility} />
    {transition && <ViewDialog title="Modifications de la vue non enregistrées" onClose={() => setTransition(null)}><p>Enregistrer les changements de visibilité de « {current.name} » avant de continuer ?</p><div className="inspector-actions"><button disabled={readOnly} onClick={() => run(() => { const saved = savedDraft(); execute(transition, saved.value, saved.text); })}>Enregistrer</button><button disabled={readOnly} onClick={() => run(() => execute(transition))}>Abandonner</button><button onClick={() => setTransition(null)}>Annuler</button></div></ViewDialog>}
    {deleting && <ViewDialog title="Supprimer la vue ?" onClose={() => setDeleting(null)}><p>Supprimer la vue « {presentation.views[deleting]?.name} » ? Les tables du schéma sont conservées.</p><div className="inspector-actions"><button onClick={() => setDeleting(null)}>Annuler</button><button className="view-delete" disabled={readOnly} onClick={() => { const id = deleting; setDeleting(null); request({ type: "delete", id }); }}>Supprimer la vue</button></div></ViewDialog>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
