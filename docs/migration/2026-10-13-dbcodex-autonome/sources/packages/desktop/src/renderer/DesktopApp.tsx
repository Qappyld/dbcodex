import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectWorkbench } from "../../../ui/src/DbcdWorkbench.js";
import { readDbcdProjectResult, type WorkbenchBridge } from "../../../ui/src/bridge.js";
import type { DocumentSession } from "../../../ui/src/useDocumentSession.js";
import type { ChatMode, ChatProposal, DesktopApi, DesktopState, ProviderId } from "../shared/contracts.js";

const providerName = (provider: ProviderId) => provider === "codex" ? "Codex" : "Claude Code";
const errorText = (error: unknown) => error instanceof Error ? error.message : "L’opération a échoué. Réessayez.";
type Draft = { text: string; tables: string[]; shareFullSource: boolean };
const emptyDraft: Draft = { text: "", tables: [], shareFullSource: false };

export function DesktopApp({ api }: { api: DesktopApi }) {
  const [state, setState] = useState<DesktopState | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [threadId, setThreadId] = useState("");
  const [provider, setProvider] = useState<ProviderId>("codex");
  const [title, setTitle] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editorBlocked, setEditorBlocked] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [chatWidth, setChatWidth] = useState(370);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const snapshot = readDbcdProjectResult(state?.project?.result);
  const projectId = snapshot?.projectId ?? "";
  const thread = state?.chat.threads.find((item) => item.id === threadId);
  const draftKey = `${projectId}:${threadId}`;
  const draft = drafts[draftKey] ?? emptyDraft;
  const setDraft = (change: Partial<Draft>) => setDrafts((previous) => ({ ...previous, [draftKey]: { ...(previous[draftKey] ?? emptyDraft), ...change } }));
  const operation = async (run: () => Promise<DesktopState | void>): Promise<void> => {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError("");
    try { const next = await run(); if (next) setState(next); }
    catch (failure) { setError(errorText(failure)); }
    finally { pendingRef.current = false; setPending(false); }
  };
  useEffect(() => {
    let live = true, received = false;
    const unsubscribe = api.subscribe((next) => { received = true; if (live) setState(next); });
    void api.getState().then((next) => { if (live && !received) setState(next); }).catch((failure) => { if (live) setError(errorText(failure)); });
    return () => { live = false; unsubscribe(); };
  }, [api]);
  useEffect(() => { setThreadId(state?.chat.threads[0]?.id ?? ""); setSelection([]); setEditorBlocked(false); }, [projectId]);
  useEffect(() => {
    if (state && !state.chat.threads.some((item) => item.id === threadId)) setThreadId(state.chat.threads[0]?.id ?? "");
  }, [state?.chat.threads, threadId]);
  useEffect(() => {
    if (state && !state.providers[provider].installed) {
      const available = (["codex", "claude"] as const).find((id) => state.providers[id].installed);
      if (available) setProvider(available);
    }
  }, [state?.providers, provider]);
  const bridge = useMemo<WorkbenchBridge>(() => ({ refreshProjects: true,
    callTool: (name, args) => api.workbenchCall(name, args),
    requestDisplayMode: async (mode) => {
      if (mode === "fullscreen") await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    },
    subscribeToDisplayMode: (listener) => {
      const update = () => listener(document.fullscreenElement ? "fullscreen" : "inline");
      document.addEventListener("fullscreenchange", update); update();
      return () => document.removeEventListener("fullscreenchange", update);
    },
  }), [api]);
  const sessionChanged = useCallback((session: DocumentSession) => {
    setEditorBlocked(session.dirty || session.validating || session.saving || !!session.recovery || !!session.conflict || session.diagnostics.some((item) => item.severity === "error"));
  }, []);
  const selectionChanged = useCallback((ids: string[]) => setSelection(ids), []);
  const running = !!state?.runningThreadId;
  const send = (mode: ChatMode, text = draft.text) => operation(async () => {
    if (!thread || !text.trim()) return;
    const result = await api.sendMessage({ threadId: thread.id, text: text.trim(), mode,
      tableIds: draft.tables.filter((id) => snapshot?.graph?.tables.some((table) => table.id === id)), shareFullSource: draft.shareFullSource });
    if (text === draft.text) setDraft({ text: "" });
    return result;
  });
  const isStale = (proposal: ChatProposal) => proposal.status === "stale" || proposal.baseGeneration !== snapshot?.generation
    || proposal.baseRevisionId !== snapshot?.currentRevisionId || proposal.baseSourceHash !== snapshot?.sourceHash;
  const applyBlocked = editorBlocked || !!snapshot?.readOnly || !!snapshot?.draft || running || pending;

  return <div className="desktop-app">
    <header className="desktop-header"><div className="desktop-brand"><strong>DBCodex</strong><span>Atelier de données</span></div>
      <nav aria-label="Projet"><button disabled={pending || running || editorBlocked} onClick={() => void operation(() => api.openProject())}>Ouvrir</button>
        <button disabled={pending || running || editorBlocked} onClick={() => void operation(() => api.createProject())}>Créer</button>
        <button disabled={pending || running || editorBlocked} onClick={() => void operation(() => api.importProject())}>Importer DBML</button></nav>
      <span className="desktop-file" title={snapshot?.projectPath}>{state?.project?.fileName ?? "Aucun projet ouvert"}</span>
    </header>
    {error && <div className="desktop-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Fermer l’erreur">×</button></div>}
    {!state ? <p role="status" className="desktop-empty">Chargement de l’atelier…</p> : !snapshot ? <section className="desktop-empty"><h1>Votre modèle, vos discussions.</h1>
      <p>Ouvrez un projet .dbcd ou importez un fichier DBML pour retrouver son code et son diagramme.</p>
      <p>Les discussions et propositions sont conservées localement à côté du projet.</p></section> : <div className="desktop-body" style={{ gridTemplateColumns: `minmax(0, 1fr) 6px ${chatWidth}px` }}>
      <section className="desktop-workspace" aria-label="Atelier du projet"><ProjectWorkbench key={projectId} result={state.project!.result} bridge={bridge}
        onSessionChange={sessionChanged} onSelectionChange={selectionChanged} /></section>
      <div className="desktop-divider" role="separator" tabIndex={0} aria-label="Largeur des discussions" aria-orientation="vertical" aria-valuenow={chatWidth} aria-valuemin={300} aria-valuemax={650}
        onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setChatWidth((width) => Math.max(300, Math.min(650, width + (event.key === "ArrowLeft" ? 20 : -20)))); } }}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, width: chatWidth }; }}
        onPointerMove={(event) => { if (drag.current) setChatWidth(Math.max(300, Math.min(650, drag.current.width + drag.current.x - event.clientX))); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
      <aside className="desktop-chat" aria-label="Discussions">
        <header className="chat-heading"><h1>Discussions</h1><span>{state.chat.threads.length}</span></header>
        <div className="thread-tabs" role="tablist" aria-label="Discussions du projet">{state.chat.threads.map((item) => <button key={item.id} role="tab" aria-selected={threadId === item.id}
          onClick={() => setThreadId(item.id)}>{item.title}<small>{providerName(item.provider)}</small></button>)}</div>
        <form className="new-thread" onSubmit={(event) => { event.preventDefault(); void operation(async () => {
          const next = await api.createThread({ title: title.trim() || "Nouvelle discussion", provider });
          const created = next.chat.threads.find((item) => !state.chat.threads.some((old) => old.id === item.id));
          if (created) setThreadId(created.id); setTitle(""); return next;
        }); }}>
          <input aria-label="Titre de la discussion" placeholder="Nouvelle discussion" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
          <select aria-label="Assistant de la nouvelle discussion" value={provider} onChange={(event) => setProvider(event.target.value as ProviderId)}>
            {(["codex", "claude"] as const).map((id) => <option key={id} value={id} disabled={!state.providers[id].installed}>{providerName(id)}{!state.providers[id].installed ? " — indisponible" : ""}</option>)}</select>
          <button disabled={pending || running || !state.providers[provider].installed} type="submit" aria-label="Créer une discussion">+</button>
        </form>
        {(["codex", "claude"] as const).filter((id) => !state.providers[id].installed).map((id) => <p className="provider-note" key={id}>{providerName(id)} : {state.providers[id].detail}</p>)}
        {thread ? <>
          <details className="chat-context"><summary>Contexte · {draft.tables.length} table{draft.tables.length > 1 ? "s" : ""}</summary>
            <p>Seule la structure des tables choisies est transmise par défaut : sans données, commentaires, notes ni valeurs par défaut.</p>
            <button disabled={!selection.length} onClick={() => setDraft({ tables: selection })}>Utiliser la sélection du diagramme</button>
            <div className="context-tables">{snapshot.graph?.tables.map((table) => <label key={table.id}><input type="checkbox" checked={draft.tables.includes(table.id)}
              onChange={(event) => setDraft({ tables: event.target.checked ? [...draft.tables, table.id] : draft.tables.filter((id) => id !== table.id) })} />{table.schema}.{table.name}</label>)}</div>
            <label><input type="checkbox" checked={draft.shareFullSource} onChange={(event) => setDraft({ shareFullSource: event.target.checked })} />Partager le DBML source complet</label>
            {draft.shareFullSource && <p className="full-source-notice">Le source complet, y compris ses commentaires et éventuelles données, sera envoyé à {providerName(thread.provider)}.</p>}
          </details>
          <div className="chat-timeline" role="log" aria-label="Messages et propositions">
            {!state.chat.messages.some((item) => item.threadId === thread.id) && <div className="chat-welcome"><h2>Explorer avant de modifier</h2><p>Discutez du modèle avec {providerName(thread.provider)}. Une proposition ne modifie le projet qu’après votre clic sur Appliquer.</p></div>}
            {state.chat.messages.filter((item) => item.threadId === thread.id).map((item) => <article key={item.id} className={`chat-message ${item.role}`}>
              <header>{item.role === "user" ? "Vous" : providerName(thread.provider)}<small>{item.mode === "propose" ? "Proposition" : "Discussion"}</small></header>
              <p>{item.content}</p>{item.state !== "complete" && <span className="message-state">{item.state === "interrupted" ? "Réponse interrompue" : "Échec de la réponse"} — vous pouvez renvoyer votre demande.</span>}
            </article>)}
            {state.chat.proposals.filter((item) => item.threadId === thread.id).map((proposal) => <article className="chat-proposal" key={proposal.id}>
              <h2>{proposal.title}</h2><p>{proposal.explanation}</p>
              <details><summary>Comparer avant / après</summary><h3>Avant</h3><pre>{proposal.beforeSource}</pre><h3>Après</h3><pre>{proposal.afterSource}</pre></details>
              {proposal.status === "pending" || proposal.status === "stale" ? <>
                {isStale(proposal) && <p className="proposal-warning">Proposition périmée : le projet a changé. Recalculez-la avant de l’appliquer.</p>}
                {applyBlocked && <p className="proposal-warning">L’application attend un projet enregistré, valide et sans conflit.</p>}
                <div className="proposal-actions"><button className="primary" disabled={applyBlocked || isStale(proposal)} onClick={() => void operation(() => api.applyProposal(proposal.id))}>Appliquer</button>
                  <button disabled={pending || running} onClick={() => void operation(() => api.rejectProposal(proposal.id))}>Rejeter</button>
                  {isStale(proposal) && <button disabled={pending || running || !state.providers[thread.provider].installed} onClick={() => void send("propose", `Recalculer la proposition « ${proposal.title} » sur le projet actuel. ${proposal.explanation}`)}>Recalculer</button>}</div>
              </> : <p className="proposal-status">{proposal.status === "applied" ? "Appliquée dans l’historique du projet" : "Proposition rejetée"}</p>}
            </article>)}
          </div>
          <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send("discuss"); }}>
            <div className="composer-mode"><strong>Discussion</strong><span>{providerName(thread.provider)}</span></div>
            <textarea aria-label="Votre message" placeholder="Une question sur le modèle…" value={draft.text} onChange={(event) => setDraft({ text: event.target.value })} rows={3} />
            <p className="send-notice">L’envoi transmet ce message et le contexte choisi à {providerName(thread.provider)}.</p>
            {running ? <div className="running-status" role="status"><span className="run-spinner" />{state.runningThreadId === thread.id ? "Réponse en cours…" : "Une autre discussion est en cours…"}<button type="button" onClick={() => void api.cancelRun().catch((failure) => setError(errorText(failure)))}>Interrompre</button></div> :
              <div className="composer-actions"><button className="primary" type="submit" disabled={pending || !draft.text.trim() || !state.providers[thread.provider].installed}>Envoyer</button>
                <button type="button" disabled={pending || !draft.text.trim() || !state.providers[thread.provider].installed} onClick={() => void send("propose")}>Préparer une proposition</button></div>}
          </form>
        </> : <div className="chat-welcome"><h2>Commencer une discussion</h2><p>Choisissez un assistant disponible et créez une discussion. Chaque discussion conserve son propre contexte.</p></div>}
      </aside>
    </div>}
  </div>;
}
