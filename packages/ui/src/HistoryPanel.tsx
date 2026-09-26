import { useEffect, useMemo, useRef, useState } from "react";
import type { DbcdRevisionSnapshot } from "@dbcodex/core";
import type { WorkbenchBridge } from "./bridge.js";
import type { DocumentSession } from "./useDocumentSession.js";
import { summarizeRevisionDiff } from "./revision-diff.js";

export function HistoryPanel({ session, bridge, projectPath, readOnly, onClose }: {
  session: DocumentSession; bridge: WorkbenchBridge; projectPath: string; readOnly: boolean; onClose(): void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revision, setRevision] = useState<DbcdRevisionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pinning, setPinning] = useState<string | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  useEffect(() => {
    if (!selectedId) return;
    let current = true;
    setRevision(null); setLoading(true); setError("");
    void bridge.callTool("read_dbcd_revision", { path: projectPath, revisionId: selectedId }).then((value) => {
      if (!current) return;
      const response = value as { isError?: boolean; content?: Array<{ text?: string }>; _meta?: { dbcodex?: { revision?: DbcdRevisionSnapshot } } };
      if (response?.isError) throw new Error(response.content?.[0]?.text ?? "Lecture de la révision impossible.");
      const loaded = response?._meta?.dbcodex?.revision;
      if (!loaded || loaded.id !== selectedId || typeof loaded.sourceText !== "string" || !loaded.presentation) throw new Error("Révision indisponible.");
      setRevision(loaded);
    }).catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : "Lecture de la révision impossible."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selectedId, projectPath, bridge]);
  const diff = useMemo(() => revision ? summarizeRevisionDiff(revision, { sourceText: session.source, presentation: session.presentation }) : null,
    [revision, session.source, session.presentation]);
  const revisions = [...session.revisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <section role="region" aria-label="Historique des révisions" className="history-panel"
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header><h2>Historique</h2><button ref={close} type="button" onClick={onClose}>Fermer l’historique</button></header>
    <div className="history-content">
      <ol aria-label="Révisions">{revisions.map((entry) => <li key={entry.id}>
        <button type="button" aria-label={`Voir la révision ${entry.id.slice(0, 8)}`} aria-pressed={selectedId === entry.id}
          onClick={() => setSelectedId(entry.id)}><code>{entry.id.slice(0, 8)}</code> <time dateTime={entry.createdAt}>{entry.createdAt}</time></button>
        <p>{entry.summary}</p>{entry.label && <span>{entry.label}</span>}
        <button type="button" disabled={readOnly || session.saving || pinning !== null}
          aria-label={`${entry.pinned ? "Désépingler" : "Épingler"} ${entry.id.slice(0, 8)}`} aria-pressed={entry.pinned}
          onClick={() => { setPinning(entry.id); void session.pin(entry.id, !entry.pinned).finally(() => setPinning(null)); }}>
          {entry.pinned ? "Épinglée" : "Épingler"}</button>
      </li>)}</ol>
      <div className="revision-detail" aria-live="polite">
        {revisions.length === 0 && <p>Aucune révision.</p>}
        {!selectedId && revisions.length > 0 && <p>Sélectionnez une révision pour la comparer au travail courant.</p>}
        {loading && <p>Chargement de la révision…</p>}
        {error && <p role="alert">{error}</p>}
        {revision && diff && <>
          <h3>{revision.id.slice(0, 8)} → travail courant</h3>
          <ul>
            <li>{diff.addedLines} ligne(s) ajoutée(s), {diff.removedLines} supprimée(s), {diff.changedLines} ligne(s) modifiée(s)</li>
            <li>{diff.movedNodes} table(s) déplacée(s)</li>
            <li>{diff.changedDetailLevels} niveau(x) de détail modifié(s)</li>
            <li>{diff.changedRoutes} tracé(s) modifié(s)</li>
            <li>{diff.addedViews} vue(s) ajoutée(s), {diff.removedViews} supprimée(s)</li>
          </ul>
          <p>Restaurer crée une nouvelle révision courante. {session.dirty && "Les modifications non enregistrées seront remplacées."}</p>
          <button type="button" disabled={readOnly || session.saving} onClick={() => void session.restore(revision.id)}>Restaurer {revision.id.slice(0, 8)}</button>
        </>}
      </div>
    </div>
  </section>;
}
