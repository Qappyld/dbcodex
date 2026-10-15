import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PresentationDocument } from "@dbcodex/core";
import { readDbcdProjectResult, type DisplayMode, type WorkbenchBridge } from "./bridge.js";
import { useDocumentSession, type DocumentSession } from "./useDocumentSession.js";
import { DbmlEditor } from "./DbmlEditor.js";
import { DiagramCanvas } from "./DiagramCanvas.js";
import { previewVisibility, withoutVisibilityPreview, type VisibilityPreview } from "./view-visibility.js";
import { ViewInspector } from "./ViewInspector.js";
import type { ViewNavigation } from "./ViewManager.js";
import { HistoryPanel } from "./HistoryPanel.js";
import { defaultPosition, setNodePosition, setNodeHidden, setActiveView, updateGroup, dbmlViewIds, setPanels as changePanels } from "./presentation-commands.js";
import { entityAtOffset, entityRange, type EntitySelection } from "./source-navigation.js";
import { ActionIcon } from "./ActionIcon.js";
import { SessionRecoveryPanel } from "./SessionRecoveryPanel.js";

const clamp = (width: number): number => Math.max(240, Math.min(600, width));
type Panels = PresentationDocument["panels"];

function PanelSeparator({ region, width, onChange }: { region: "editor" | "inspector"; width: number; onChange(width: number): void }) {
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);
  const direction = region === "editor" ? 1 : -1;
  return <div className="panel-separator" role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={region === "editor" ? "Largeur de l’éditeur" : "Largeur des vues"}
    aria-valuemin={240} aria-valuemax={600} aria-valuenow={width}
    onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      onChange(clamp(width + (event.key === "ArrowRight" ? 10 : -10) * direction));
    }}
    onPointerDown={(event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, x: event.clientX, width };
    }}
    onPointerMove={(event) => {
      if (drag.current?.id !== event.pointerId) return;
      onChange(clamp(drag.current.width + (event.clientX - drag.current.x) * direction));
    }}
    onPointerUp={(event) => { if (drag.current?.id === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
    onPointerCancel={() => { drag.current = null; }} />;
}

export function ProjectWorkbench({ result, bridge, onSessionChange, onSelectionChange }: {
  result: unknown; bridge: WorkbenchBridge; onSessionChange?(session: DocumentSession): void; onSelectionChange?(ids: string[]): void;
}) {
  const snapshot = readDbcdProjectResult(result)!;
  const session = useDocumentSession(result, bridge);
  return <DbcdWorkbench session={session} bridge={bridge} projectPath={snapshot.projectPath} readOnly={snapshot.readOnly}
    {...(onSessionChange ? { onSessionChange } : {})} {...(onSelectionChange ? { onSelectionChange } : {})} />;
}

export function DbcdWorkbench({ session, bridge, projectPath, readOnly = false, onSessionChange, onSelectionChange }: {
  session: DocumentSession; bridge: WorkbenchBridge; projectPath: string; readOnly?: boolean;
  onSessionChange?(session: DocumentSession): void; onSelectionChange?(ids: string[]): void;
}) {
  readOnly ||= !!session.recovery;
  const root = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(window.innerWidth < 900);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("inline");
  const [displayPending, setDisplayPending] = useState(false);
  const [displayMessage, setDisplayMessage] = useState("");
  const [copyPending, setCopyPending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => { onSessionChange?.(session); }, [session, onSessionChange]);
  useEffect(() => { onSelectionChange?.(selectedIds); }, [selectedIds, onSelectionChange]);
  const [visibilityPreview, setVisibilityPreview] = useState<VisibilityPreview | null>(null);
  const viewNavigation = useRef<ViewNavigation | null>(null);
  const displayedPresentation = session.graph ? previewVisibility(session.presentation, session.graph, visibilityPreview) : session.presentation;
  const [query, setQuery] = useState("");
  const [focusRequest, setFocusRequest] = useState<(EntitySelection & { nonce: number }) | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntitySelection | null>(null);
  const [sourceRequest, setSourceRequest] = useState<{ from: number; to: number; nonce: number } | null>(null);
  const [diagramHistory, setDiagramHistory] = useState<{ past: PresentationDocument[]; future: PresentationDocument[] }>({ past: [], future: [] });
  const [reorganizeOpen, setReorganizeOpen] = useState(false);
  const sourceOperation = useRef(false);
  const [panels, setPanels] = useState(session.presentation.panels);
  const savedPanels = JSON.stringify(session.presentation.panels);
  const inspectorTrigger = useRef<HTMLButtonElement>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  // Value-based reconciliation preserves transient read-only changes across ordinary
  // session renders, but accepts restored panel values and a different document.
  useEffect(() => { setPanels(JSON.parse(savedPanels) as Panels); }, [savedPanels, projectPath]);
  const updatePanels = (change: Partial<Panels>): void => {
    const next = { ...panels, ...change };
    setPanels(next);
    if (!readOnly) session.setPresentation(changePanels(session.presentation, next));
  };
  const changeDiagram = (next: PresentationDocument): void => {
    if (readOnly) return;
    if (sourceOperation.current) { sourceOperation.current = false; setDiagramHistory({ past: [], future: [] }); }
    else if (JSON.stringify(next) !== JSON.stringify(session.presentation))
      setDiagramHistory((history) => ({ past: [...history.past.slice(-99), session.presentation], future: [] }));
    session.setPresentation(next);
  };
  const travelDiagram = (redo: boolean): void => {
    if (readOnly) return;
    const stack = redo ? diagramHistory.future : diagramHistory.past, target = stack.at(-1);
    if (!target) return;
    setDiagramHistory(redo ? { past: [...diagramHistory.past, session.presentation], future: stack.slice(0, -1) }
      : { past: stack.slice(0, -1), future: [...diagramHistory.future, session.presentation] });
    session.setPresentation({ ...target, panels: session.presentation.panels });
  };
  const navigationSource = useRef(session.source); navigationSource.current = session.source;
  const selectSource = async (selection: EntitySelection): Promise<void> => {
    setSelectedEntity(selection); setSelectedId(selection.tableId); setSelectedIds([selection.tableId]);
    const source = session.source;
    const result = await bridge.callTool("validate_dbcd_draft", { path: projectPath, sourceText: source }) as { structuredContent?: { graph?: import("@dbcodex/core").SchemaGraph } };
    if (navigationSource.current !== source) return;
    const range = result.structuredContent?.graph && entityRange(result.structuredContent.graph, selection);
    if (range) {
      if (panels.editorCollapsed) updatePanels({ editorCollapsed: false });
      setSourceRequest((previous) => ({ from: range.start.offset, to: range.end.offset, nonce: (previous?.nonce ?? 0) + 1 }));
    } else setDisplayMessage("Définition introuvable dans le texte courant. Le brouillon est conservé.");
  };
  const focusDiagram = (selection: EntitySelection): void => {
    if (!readOnly) {
      let next = session.presentation;
      let viewId = next.activeViewId, current = next.views[viewId]!;
      const relation = selection.kind === "relation" ? session.graph?.relations.find((item) => item.id === selection.id) : undefined;
      const tableIds = relation ? [relation.source.tableId, relation.target.tableId] : [selection.tableId];
      const definition = session.graph?.views?.find(view => dbmlViewIds(session.graph!).get(view.id) === viewId);
      const outsideView = tableIds.some(id => definition ? !definition.tableIds.includes(id) : !current.nodes[id]);
      if (!current.system && outsideView && visibilityPreview && viewNavigation.current) {
        viewNavigation.current("all", tableIds, () => {
          setSelectedEntity(selection); setSelectedId(selection.tableId); setSelectedIds([selection.tableId]);
          setFocusRequest(previous => ({ ...selection, nonce: (previous?.nonce ?? 0) + 1 }));
        });
        return;
      }
      if (!current.system && outsideView) { next = setActiveView(next, "all"); viewId = "all"; current = next.views.all!; }
      for (const id of tableIds) if (current.nodes[id]?.hidden) next = setNodeHidden(next, viewId, id, false);
      for (const [groupId, group] of Object.entries(current.groups)) if (group.collapsed && tableIds.some((id) => group.tableIds.includes(id))) next = updateGroup(next, viewId, groupId, { collapsed: false });
      if (next !== session.presentation) changeDiagram(next);
    }
    setSelectedEntity(selection); setSelectedId(selection.tableId); setSelectedIds([selection.tableId]);
    setFocusRequest((previous) => ({ ...selection, nonce: (previous?.nonce ?? 0) + 1 }));
  };
  useEffect(() => { setDiagramHistory({ past: [], future: [] }); setReorganizeOpen(false);  setVisibilityPreview(null); }, [projectPath]);
  useEffect(() => { if (narrow && drawerOpen) drawerClose.current?.focus(); }, [narrow, drawerOpen]);
  const closeDrawer = (): void => {
    setDrawerOpen(false);
    inspectorTrigger.current?.focus();
  };
  useEffect(() => bridge.subscribeToDisplayMode?.(setDisplayMode), [bridge]);
  useEffect(() => {
    const measure = (): void => setNarrow((root.current?.getBoundingClientRect().width || window.innerWidth) < 900);
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const toggleDisplay = async (): Promise<void> => {
    const next = displayMode === "inline" ? "fullscreen" : "inline";
    setDisplayPending(true);
    setDisplayMessage("");
    try { await bridge.requestDisplayMode(next); setDisplayMode(next); }
    catch { setDisplayMessage("Ce mode d’affichage est indisponible. Votre travail est conservé."); }
    finally { setDisplayPending(false); }
  };
  const selectedTable = session.graph?.tables.find((table) => table.id === selectedId);
  const editorWidth = panels.editorCollapsed ? 40 : clamp(panels.editor);
  const inspectorVisible = narrow ? drawerOpen : !panels.inspectorCollapsed;
  const invalid = session.diagnostics.some((diagnostic) => diagnostic.severity === "error");

  return <main ref={root} className="workbench" data-mode={displayMode} data-narrow={narrow} onKeyDownCapture={(event) => {
    if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof Element) || !event.target.closest(".flow-canvas")) return;
    if (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") { event.preventDefault(); event.stopPropagation(); travelDiagram(event.shiftKey || event.key.toLowerCase() === "y"); }
  }}>
    <header className="workbench-toolbar">
      <strong title={projectPath}>{projectPath}</strong>
      <span role="status">{readOnly ? "Lecture seule" : session.saving ? "Enregistrement…" : session.dirty ? "Modifications non enregistrées" : "Enregistré"}</span>
      <span>{session.validating ? "Validation…" : invalid ? "DBML invalide" : "DBML valide"}</span>
      <button type="button" disabled={readOnly || !!session.conflict || !session.dirty || session.saving || session.validating || invalid} onClick={() => void session.save()} title="Enregistrer" aria-label="Enregistrer"><ActionIcon name="save" /><span className="action-label">Enregistrer</span></button>
      {bridge.saveCopy && <button disabled={copyPending || session.validating || invalid} onClick={() => { setCopyPending(true); void bridge.saveCopy!({ sourceText: session.source, presentation: session.presentation }).catch(error => setDisplayMessage(error instanceof Error ? error.message : "Copie impossible.")).finally(() => setCopyPending(false)); }} title="Enregistrer une copie" aria-label="Enregistrer une copie"><ActionIcon name="copy" /><span className="action-label">Enregistrer une copie</span></button>}
      <button type="button" disabled={readOnly || !diagramHistory.past.length} onClick={() => travelDiagram(false)} title="Annuler le diagramme" aria-label="Annuler le diagramme"><ActionIcon name="undo" /><span className="action-label">Annuler le diagramme</span></button>
      <button type="button" disabled={readOnly || !diagramHistory.future.length} onClick={() => travelDiagram(true)} title="Rétablir le diagramme" aria-label="Rétablir le diagramme"><ActionIcon name="redo" /><span className="action-label">Rétablir le diagramme</span></button>
      <button type="button" disabled={readOnly || !session.graph} onClick={() => setReorganizeOpen(true)} title="Réorganiser" aria-label="Réorganiser"><ActionIcon name="layout" /><span className="action-label">Réorganiser</span></button>
      <button ref={historyTrigger} type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)} title="Historique" aria-label="Historique"><ActionIcon name="history" /><span className="action-label">Historique</span></button>
      <button ref={inspectorTrigger} type="button" aria-expanded={inspectorVisible}
        title={inspectorVisible ? "Masquer les vues" : "Afficher les vues"} aria-label={inspectorVisible ? "Masquer les vues" : "Afficher les vues"} onClick={() => narrow ? setDrawerOpen(true) : updatePanels({ inspectorCollapsed: !panels.inspectorCollapsed })}>
        <ActionIcon name="views" /><span className="action-label">{narrow || panels.inspectorCollapsed ? "Afficher les vues" : "Masquer les vues"}</span>
      </button>
      <button type="button" disabled={displayPending} title={displayMode === "inline" ? "Plein écran" : "Quitter le plein écran"} aria-label={displayMode === "inline" ? "Plein écran" : "Quitter le plein écran"} onClick={() => void toggleDisplay()}><ActionIcon name="fullscreen" /><span className="action-label">{displayMode === "inline" ? "Plein écran" : "Quitter le plein écran"}</span></button>
    </header>
    <SessionRecoveryPanel session={session} />
    {reorganizeOpen && <section role="dialog" aria-label="Réorganisation du diagramme"><p>Remplacer les positions et routages de la vue courante ? Cette action peut être annulée.</p>
      <button type="button" onClick={() => {
        if (!session.graph || readOnly) return;
        const current = session.presentation.views[session.presentation.activeViewId]!;
        let next = session.graph.tables.filter((table) => (current.system || current.nodes[table.id]) && !current.nodes[table.id]?.hidden)
          .reduce((value, table, index) => setNodePosition(value, value.activeViewId, table.id, defaultPosition(index)), session.presentation);
        next = structuredClone(next); next.views[next.activeViewId]!.edges = {};
        changeDiagram(next); setReorganizeOpen(false);
      }}>Confirmer la réorganisation</button><button type="button" onClick={() => setReorganizeOpen(false)}>Annuler</button></section>}
    {session.error && <p role="alert" className="workbench-message">{session.error}</p>}
    {displayMessage && <p role="status" className="workbench-message">{displayMessage}</p>}
    {historyOpen && <HistoryPanel session={session} bridge={bridge} projectPath={projectPath} readOnly={readOnly}
      onClose={() => { setHistoryOpen(false); historyTrigger.current?.focus(); }} />}
    <section className="workbench-body">
      <section role="region" aria-label="Éditeur DBML" className="editor-panel" style={{ width: editorWidth } as CSSProperties}>
        <button type="button" className="editor-toggle" aria-expanded={!panels.editorCollapsed}
          aria-label={panels.editorCollapsed ? "Afficher l’éditeur" : "Réduire l’éditeur"}
          onClick={() => updatePanels({ editorCollapsed: !panels.editorCollapsed })}>{panels.editorCollapsed ? "›" : "‹"}<span>DBML</span></button>
        <div className="editor-content" hidden={panels.editorCollapsed}>
          <DbmlEditor value={session.source} diagnostics={session.diagnostics} readOnly={readOnly} onChange={session.setSource} onSave={() => void session.save()}
            selectionRequest={sourceRequest} onSelectionChange={(offset) => { const selection = session.graph && entityAtOffset(session.graph, offset); if (selection) focusDiagram(selection); }} />
          {session.diagnostics.length > 0 && <ul className="diagnostics" aria-label="Diagnostics">{session.diagnostics.map((diagnostic, index) => <li key={index}>
            {diagnostic.location ? `L${diagnostic.location.start.line}:${diagnostic.location.start.column} — ` : ""}{diagnostic.message}
          </li>)}</ul>}
        </div>
      </section>
      {!panels.editorCollapsed && <PanelSeparator region="editor" width={clamp(panels.editor)} onChange={(editor) => updatePanels({ editor })} />}
      {session.graph ? <DiagramCanvas graph={session.graph} presentation={displayedPresentation} onPresentationChange={next => changeDiagram(withoutVisibilityPreview(next, session.presentation, visibilityPreview))} onSelectionChange={setSelectedId}
        onEntitySelect={(selection) => void selectSource(selection)} selectedEntity={selectedEntity}
        source={session.source} onSourceChange={session.setSource} onQueryChange={setQuery} onReorganize={() => setReorganizeOpen(true)}
        onSelectedTablesChange={setSelectedIds} query={query} focusRequest={focusRequest} readOnly={readOnly} />
        : <div className="flow-canvas empty-canvas">Corrigez le DBML pour afficher le diagramme.</div>}
      {<>
        {inspectorVisible && !narrow && <PanelSeparator region="inspector" width={clamp(panels.inspector)} onChange={(inspector) => updatePanels({ inspector })} />}
        <aside hidden={!inspectorVisible} role={narrow ? "dialog" : "region"} aria-label="Vues" className={`inspector-panel${narrow ? " inspector-drawer" : ""}`}
          style={{ width: clamp(panels.inspector) }} onKeyDown={(event) => {
            if (event.key === "Escape" && narrow) { event.preventDefault(); event.stopPropagation(); closeDrawer(); }
          }}>
          <header><h2>Vues</h2>{narrow && <button ref={drawerClose} type="button" onClick={closeDrawer}>Fermer les vues</button>}</header>
          {session.graph && <ViewInspector key={projectPath} graph={session.graph} presentation={session.presentation} source={session.source} selectedIds={selectedIds} query={query}
            navigationRef={viewNavigation} onVisibilityPreview={setVisibilityPreview} onQueryChange={setQuery} onSelectTable={(id) => {
              const selection: EntitySelection = { kind: "table", id, tableId: id };
              setSelectedEntity(selection); setSelectedId(id); setSelectedIds([id]);
              let next = session.presentation;
              for (const [groupId, group] of Object.entries(next.views[next.activeViewId]!.groups))
                if (group.collapsed && group.tableIds.includes(id)) next = updateGroup(next, next.activeViewId, groupId, { collapsed: false });
              if (next !== session.presentation) changeDiagram(next);
              setFocusRequest(previous => ({ ...selection, nonce: (previous?.nonce ?? 0) + 1 }));
            }}
            onPresentationChange={changeDiagram} onSourceChange={(value) => { sourceOperation.current = true; session.setSource(value); }} readOnly={readOnly} />}
        </aside>
      </>}
    </section>
  </main>;
}
