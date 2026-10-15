import { useEffect, useRef, useState } from 'react';
import type { UpdateStatus } from '../updater.js';
type Api = { call: (name: string) => Promise<UpdateStatus> };
export function UpdatePanel({ api }: { api: Api }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const panel = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => { try { const next = await api.call('update_status'); if (!disposed) setStatus(next); } catch { /* Retry at next refresh. */ } };
    void refresh(); const timer = setInterval(() => void refresh(), 1000);
    const check = setTimeout(() => { void api.call('update_check').catch(() => {}); }, 5000);
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && panel.current) panel.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && panel.current?.open) { panel.current.open = false; trigger.current?.focus(); } };
    window.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape);
    return () => { disposed = true; clearInterval(timer); clearTimeout(check); window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); };
  }, [api]);
  const run = async (name: string) => { setPending(true); setError(''); try { setStatus(await api.call(name)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Opération impossible. Réessayez.'); } finally { setPending(false); } };
  const busy = pending || ['checking', 'downloading', 'closing'].includes(status?.phase || '');
  return <details className="update-menu" ref={panel}>
    <summary ref={trigger}>Mises à jour{['available', 'ready'].includes(status?.phase || '') && <span className="update-dot" aria-label="Nouvelle version disponible">●</span>}</summary>
    <section className="update-menu-content" aria-label="Mises à jour de DBCodex">
      <strong>DBCodex {status?.currentVersion}</strong>
      <p role={status?.phase === 'error' ? 'alert' : 'status'}>{status?.message || 'Chargement…'}</p>
      {status?.phase === 'downloading' && <progress aria-label="Téléchargement de la mise à jour" max={100} value={status.progress || 0} />}
      {status?.notes && <details className="update-notes"><summary>Nouveautés de la version {status.version}</summary><p>{status.notes}</p></details>}
      {status?.lastFailure && <details className="update-notes"><summary>Détails du dernier échec</summary>
        <p>{status.lastFailure.message}</p>
        {status.lastFailure.stage && <p>Étape : {status.lastFailure.stage}</p>}
        <p>{status.lastFailure.detail}</p>
        {status.lastFailure.attemptId && <p>Référence : {status.lastFailure.attemptId}</p>}
      </details>}
      {error && <p role="alert">{error}</p>}
      {status?.phase === 'ready' ? <button disabled={busy} onClick={() => void run('update_restart')}>Mettre à jour et redémarrer</button> : <>
        {status?.version && ['available', 'error'].includes(status.phase) && <button disabled={busy} onClick={() => void run('update_download')}>Télécharger la mise à jour</button>}
        <button disabled={busy} onClick={() => void run('update_check')}>{status?.phase === 'error' ? 'Réessayer la vérification' : 'Vérifier les mises à jour'}</button>
      </>}
      <button disabled={pending || !status?.logDirectory} onClick={() => void run('open_logs')}>Ouvrir les journaux</button>
      {status && !status.logDirectory && <p>Journaux indisponibles : aucun dossier accessible en écriture.</p>}
    </section>
  </details>;
}
