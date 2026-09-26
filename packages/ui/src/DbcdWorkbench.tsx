import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PresentationDocument } from "@dbcodex/core";
import { readDbcdProjectResult, type DisplayMode, type WorkbenchBridge } from "./bridge.js";
import { useDocumentSession, type DocumentSession } from "./useDocumentSession.js";
import { DbmlEditor } from "./DbmlEditor.js";
import { DiagramCanvas } from "./DiagramCanvas.js";

const clamp = (width: number): number => Math.max(240, Math.min(600, width));
type Panels = PresentationDocument["panels"];

function PanelSeparator({ region, width, onChange }: { region: "editor" | "inspector"; width: number; onChange(width: number): void }) {
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);
  const direction = region === "editor" ? 1 : -1;
  return <div className="panel-separator" role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={region === "editor" ? "Largeur de l’éditeur" : "Largeur de l’inspecteur"}
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

export function ProjectWorkbench({ result, bridge }: { result: unknown; bridge: WorkbenchBridge }) {
  const snapshot = readDbcdProjectResult(result)!;
  const session = useDocumentSession(result, bridge);
  return <DbcdWorkbench session={session} bridge={bridge} projectPath={snapshot.projectPath} readOnly={snapshot.readOnly} />;
}

export function DbcdWorkbench({ session, bridge, projectPath, readOnly = false }: {
  session: DocumentSession; bridge: WorkbenchBridge; projectPath: string; readOnly?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(window.innerWidth < 900);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("inline");
  const [displayPending, setDisplayPending] = useState(false);
  const [displayMessage, setDisplayMessage] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    if (!readOnly) session.setPresentation({ ...session.presentation, panels: next });
  };
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

  return <main ref={root} className="workbench" data-mode={displayMode} data-narrow={narrow}>
    <header className="workbench-toolbar">
      <strong title={projectPath}>{projectPath}</strong>
      <span role="status">{readOnly ? "Lecture seule" : session.saving ? "Enregistrement…" : session.dirty ? "Modifications non enregistrées" : "Enregistré"}</span>
      <span>{session.validating ? "Validation…" : invalid ? "DBML invalide" : "DBML valide"}</span>
      <button type="button" disabled={readOnly || !session.dirty || session.saving || session.validating || invalid} onClick={() => void session.save()}>Enregistrer</button>
      <button ref={inspectorTrigger} type="button" aria-expanded={inspectorVisible}
        onClick={() => narrow ? setDrawerOpen(true) : updatePanels({ inspectorCollapsed: !panels.inspectorCollapsed })}>
        {narrow || panels.inspectorCollapsed ? "Afficher l’inspecteur" : "Masquer l’inspecteur"}
      </button>
      <button type="button" disabled={displayPending} onClick={() => void toggleDisplay()}>{displayMode === "inline" ? "Plein écran" : "Quitter le plein écran"}</button>
    </header>
    {session.error && <p role="alert" className="workbench-message">{session.error}</p>}
    {displayMessage && <p role="status" className="workbench-message">{displayMessage}</p>}
    <section className="workbench-body">
      <section role="region" aria-label="Éditeur DBML" className="editor-panel" style={{ width: editorWidth } as CSSProperties}>
        <button type="button" className="editor-toggle" aria-expanded={!panels.editorCollapsed}
          aria-label={panels.editorCollapsed ? "Afficher l’éditeur" : "Réduire l’éditeur"}
          onClick={() => updatePanels({ editorCollapsed: !panels.editorCollapsed })}>{panels.editorCollapsed ? "›" : "‹"}<span>DBML</span></button>
        <div className="editor-content" hidden={panels.editorCollapsed}>
          <DbmlEditor value={session.source} diagnostics={session.diagnostics} readOnly={readOnly} onChange={session.setSource} onSave={() => void session.save()} />
          {session.diagnostics.length > 0 && <ul className="diagnostics" aria-label="Diagnostics">{session.diagnostics.map((diagnostic, index) => <li key={index}>
            {diagnostic.location ? `L${diagnostic.location.start.line}:${diagnostic.location.start.column} — ` : ""}{diagnostic.message}
          </li>)}</ul>}
        </div>
      </section>
      {!panels.editorCollapsed && <PanelSeparator region="editor" width={clamp(panels.editor)} onChange={(editor) => updatePanels({ editor })} />}
      {session.graph ? <DiagramCanvas graph={session.graph} presentation={session.presentation} onPresentationChange={session.setPresentation} onSelectionChange={setSelectedId} readOnly={readOnly} />
        : <div className="flow-canvas empty-canvas">Corrigez le DBML pour afficher le diagramme.</div>}
      {inspectorVisible && <>
        {!narrow && <PanelSeparator region="inspector" width={clamp(panels.inspector)} onChange={(inspector) => updatePanels({ inspector })} />}
        <aside role={narrow ? "dialog" : "region"} aria-label="Inspecteur" className={`inspector-panel${narrow ? " inspector-drawer" : ""}`}
          style={{ width: clamp(panels.inspector) }} onKeyDown={(event) => {
            if (event.key === "Escape" && narrow) { event.preventDefault(); event.stopPropagation(); closeDrawer(); }
          }}>
          <header><h2>Inspecteur</h2>{narrow && <button ref={drawerClose} type="button" onClick={closeDrawer}>Fermer l’inspecteur</button>}</header>
          {selectedTable ? <><h3>{selectedTable.id}</h3><p>{selectedTable.columns.length} champs</p></> : <p>Sélectionnez une table pour voir ses détails.</p>}
        </aside>
      </>}
    </section>
  </main>;
}
