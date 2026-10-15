import { useEffect, useMemo, useRef, useState } from "react";
import type { DbcdRevisionSnapshot, SchemaGraph } from "@dbcodex/core";
import type { WorkbenchBridge } from "./bridge.js";
import type { DocumentSession } from "./useDocumentSession.js";
import { summarizeRevisionDiff } from "./revision-diff.js";
import { describeSchemaChanges } from "./history-changes.js";

function summaryText(summary: string): string {
  return ({ "Initial revision": "Création du projet", "Saved revision": "Enregistrement du projet" } as Record<string, string>)[summary] ?? summary;
}
function readableDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date inconnue" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function HistoryPanel({ session, bridge, projectPath, readOnly, onClose }: {
  session: DocumentSession; bridge: WorkbenchBridge; projectPath: string; readOnly: boolean; onClose(): void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revision, setRevision] = useState<DbcdRevisionSnapshot | null>(null);
  const [previousGraph, setPreviousGraph] = useState<SchemaGraph | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pinning, setPinning] = useState<string | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  useEffect(() => {
    if (!selectedId) return;
    let current = true;
    setRevision(null); setPreviousGraph(null); setConfirmRestore(false); setLoading(true); setError("");
    void bridge.callTool("read_dbcd_revision", { path: projectPath, revisionId: selectedId }).then((value) => {
      if (!current) return;
      const response = value as { isError?: boolean; content?: Array<{ text?: string }>; _meta?: { dbcodex?: { revision?: DbcdRevisionSnapshot; graph?: SchemaGraph | null } } };
      if (response?.isError) throw new Error(response.content?.[0]?.text ?? "Lecture de la révision impossible.");
      const loaded = response?._meta?.dbcodex?.revision;
      if (!loaded || loaded.id !== selectedId || typeof loaded.sourceText !== "string" || !loaded.presentation) throw new Error("Révision indisponible.");
      setRevision(loaded);
      setPreviousGraph(response._meta?.dbcodex?.graph ?? null);
    }).catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : "Lecture de la révision impossible."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selectedId, projectPath, bridge, retry]);
  const diff = useMemo(() => revision ? summarizeRevisionDiff(revision, { sourceText: session.source, presentation: session.presentation }, session.graph) : null,
    [revision, session.source, session.presentation, session.graph]);
  const revisions = useMemo(() => [...session.revisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [session.revisions]);
  const changes = useMemo(() => previousGraph && session.graph && !session.validating && !session.diagnostics.some(item => item.severity === "error")
    ? describeSchemaChanges(previousGraph, session.graph) : null, [previousGraph, session.graph, session.validating, session.diagnostics]);
  const selectedIndex = revisions.findIndex(entry => entry.id === selectedId);
  const versionName = (index: number) => `Version ${revisions.length - index}`;
  const noChanges = diff && revision?.sourceText === session.source && JSON.stringify(revision.presentation) === JSON.stringify(session.presentation);
  return <section role="region" aria-label="Historique des révisions" className="history-panel"
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header><div><h2>Historique des versions <span className="history-count">{revisions.length}</span></h2>
      <p className="history-muted">Comparez une version enregistrée avec votre travail actuel{session.dirty ? ", modifications non enregistrées incluses" : ""}.</p></div>
      <button ref={close} type="button" onClick={onClose}>Fermer l’historique</button></header>
    <div className="history-content">
      <ol aria-label="Révisions">{revisions.map((entry, index) => <li key={entry.id} data-selected={selectedId === entry.id}>
        <button className="history-select" type="button" aria-label={`Voir la révision ${entry.id.slice(0, 8)}`} aria-pressed={selectedId === entry.id}
          onClick={() => setSelectedId(entry.id)}>
          <span className="history-entry-title">{entry.label || versionName(index)}{index === 0 && <span className="history-badge">La plus récente</span>}</span>
          <time dateTime={entry.createdAt}>{readableDate(entry.createdAt)}</time>
          <span className="history-entry-summary">{summaryText(entry.summary)}</span>
          <span className="history-entry-id">{entry.label && `${versionName(index)} · `}<code>{entry.id.slice(0, 8)}</code></span>
        </button>
        <button type="button" disabled={readOnly || session.saving || pinning !== null}
          className="history-pin" title="Une version épinglée est conservée lors du nettoyage automatique."
          aria-label={`${entry.pinned ? "Désépingler" : "Épingler"} ${entry.id.slice(0, 8)}`} aria-pressed={entry.pinned}
          onClick={() => { setPinning(entry.id); void session.pin(entry.id, !entry.pinned).finally(() => setPinning(null)); }}>
          {pinning === entry.id ? "En cours…" : entry.pinned ? "Épinglée" : "Épingler"}</button>
      </li>)}</ol>
      <div className="revision-detail" aria-live="polite">
        {revisions.length === 0 && <p>Aucune version enregistrée. Enregistrez le projet pour créer une version.</p>}
        {!selectedId && revisions.length > 0 && <div className="history-empty"><h3>Qu’est-ce qui a changé ?</h3><p>Sélectionnez une version pour voir les changements du schéma et du diagramme.</p><button type="button" onClick={() => setSelectedId(revisions[0]!.id)}>Comparer la dernière version</button></div>}
        {loading && <p>Chargement de la révision…</p>}
        {error && <div><p role="alert">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Réessayer</button></div>}
        {revision && diff && <>
          <h3>{revision.label || versionName(selectedIndex)} → travail courant</h3>
          <p className="history-muted">{readableDate(revision.createdAt)}{session.dirty && " · Brouillon inclus dans la comparaison"}</p>
          {noChanges ? <p className="history-identical">Cette version est identique à votre travail courant.</p> : <>
          {changes && changes.length > 0 && <div className="history-schema-changes"><h4>Changements du schéma</h4><ul>{changes.slice(0, 60).map((change, index) => <li key={index}>{change}</li>)}</ul>{changes.length > 60 && <p>{changes.length - 60} autres changements. Consultez le DBML ci-dessous.</p>}</div>}
          {changes === null && <p className="history-muted">Détail des objets indisponible pour cette comparaison. Consultez les compteurs et le DBML.</p>}
          <details className="history-counts" open={!changes?.length}><summary>Résumé des différences</summary>
          {diff.approximate && <p>Estimation des lignes pour cette comparaison volumineuse.</p>}
          <ul>
            <li>{diff.addedLines} ligne(s) ajoutée(s), {diff.removedLines} supprimée(s), {diff.changedLines} ligne(s) modifiée(s)</li>
            <li>{diff.movedNodes} table(s) déplacée(s)</li>
            <li>{diff.changedDetailLevels} niveau(x) de détail modifié(s)</li>
            <li>{diff.changedRoutes} tracé(s) modifié(s)</li>
            <li>{diff.addedViews} vue(s) ajoutée(s), {diff.removedViews} supprimée(s)</li>
            {diff.changedModel&&<li>Propriétés du modèle modifiées : noms affichés, options ou relations</li>}
          </ul>
          </details>
          {revision.sourceText !== session.source && <details className="history-source"><summary>Consulter le DBML avant / après</summary><div><section aria-label="DBML de la version sélectionnée"><h4>Version sélectionnée</h4><pre>{revision.sourceText}</pre></section><section aria-label="DBML du travail courant"><h4>Travail courant</h4><pre>{session.source}</pre></section></div></details>}
          </>}
          <div className="history-restore">
          <p>Restaurer crée une nouvelle révision courante. {session.dirty && "Les modifications non enregistrées seront remplacées."}</p>
          {readOnly && <p>Projet en lecture seule.</p>}
          {confirmRestore && session.dirty ? <div role="group" aria-label="Confirmer la restauration"><p>Remplacer les modifications non enregistrées par cette version ?</p><button type="button" disabled={session.saving || readOnly} onClick={() => { setConfirmRestore(false); void session.restore(revision.id); }}>Confirmer la restauration</button><button type="button" onClick={() => setConfirmRestore(false)}>Annuler</button></div>
            : <button type="button" aria-label={`Restaurer ${revision.id.slice(0, 8)}`} disabled={readOnly || session.saving || !!noChanges} onClick={() => { if (session.dirty) setConfirmRestore(true); else void session.restore(revision.id); }}>Restaurer cette version</button>}
          </div>
        </>}
      </div>
    </div>
  </section>;
}
