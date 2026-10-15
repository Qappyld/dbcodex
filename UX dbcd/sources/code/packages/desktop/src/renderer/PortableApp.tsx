import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ProjectWorkbench } from "../../../ui/src/DbcdWorkbench.js";
import type { WorkbenchBridge } from "../../../ui/src/bridge.js";
import "../../../ui/src/styles.css";
import "./portable.css";
import { ActionIcon } from "../../../ui/src/ActionIcon.js";
import { UpdatePanel } from './UpdatePanel.js';
import { NewProjectDialog } from '../../../ui/src/ProjectTypeForm.js';
const api = (window as any).dbcodex;
export function PortableApp() {
  const [result, setResult] = useState<unknown>(null), [prefs, setPrefs] = useState<any>(null), [error, setError] = useState(""), [pending, setPending] = useState(false);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const fileMenu = useRef<HTMLDetailsElement>(null);
  const fileTrigger = useRef<HTMLElement>(null);
  const bridge = useMemo<WorkbenchBridge>(() => ({ refreshProjects: true, callTool: (name, args) => api.call(name, args),
    saveCopy: async input => { await api.call("save_copy", input); },
    subscribeToTeardown: listener => api.onClose(listener), requestDisplayMode: async mode => { if (mode === "fullscreen") await document.documentElement.requestFullscreen(); else if (document.fullscreenElement) await document.exitFullscreen(); } }), []);
  const refresh = async () => setPrefs(await api.call("preferences"));
  const run = async (name: string, args = {}) => { if (fileMenu.current) fileMenu.current.open = false; setPending(true); setError(""); try { const next = await api.call(name, args); if (next && !next.openedInNewWindow && ["open", "create", "import", "locate"].includes(name)) setResult(next); await refresh(); return name==="create"?next!==null:true; } catch (cause) { setError(cause instanceof Error ? cause.message : "Opération impossible"); if ((args as any).path) setUnavailable(old => [...old, (args as any).path]); return false; } finally { setPending(false); } };
  useEffect(() => { void refresh(); const project = new URLSearchParams(location.search).get("project"); if (project) void run("open", { path: project }); }, []);
  useEffect(() => { if (prefs) document.documentElement.dataset.theme = prefs.theme; }, [prefs]);
  useEffect(() => { if (!result) return api.onClose(async () => {}); }, [result]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !fileMenu.current?.contains(event.target) && fileMenu.current) fileMenu.current.open = false; };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && fileMenu.current?.open) { fileMenu.current.open = false; fileTrigger.current?.focus(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o" && !event.repeat) { event.preventDefault(); if (!pending) void run("open"); }
    };
    window.addEventListener("pointerdown", outside); window.addEventListener("keydown", keyboard);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", keyboard); };
  }, [pending]);
  return <div className="portable-app"><header className="portable-header"><strong>◈ DBCodex</strong>
    <details className="file-menu" ref={fileMenu} onToggle={() => { if (fileMenu.current?.open) void refresh(); }}>
      <summary ref={fileTrigger}>Fichier <ActionIcon name="chevronDown" /></summary>
      <div className="file-menu-content">
        <button disabled={pending} onClick={() => { if(fileMenu.current)fileMenu.current.open=false;setNewProjectOpen(true); }}><ActionIcon name="new" />Nouveau projet</button>
        <button disabled={pending} onClick={() => void run("open")}><ActionIcon name="open" />Ouvrir un fichier .dbcd…<kbd>Ctrl+O</kbd></button>
        <div className="recent-heading">Ouvrir un fichier récent</div>
        {!prefs?.recent?.length && <p className="recent-empty">Aucun fichier récent.</p>}
        <div className="recent-menu-list">{prefs?.recent?.map((item: any) => <button key={item.entry} disabled={pending} title={item.path} onClick={() => void run("open", { path: item.path })}><ActionIcon name="history" /><span><strong>{item.name}</strong><small>{item.path}</small>{unavailable.includes(item.path) && <small>Indisponible · cliquer pour réessayer</small>}</span></button>)}</div>
        <div className="file-menu-divider" />
        <button disabled={pending} onClick={() => void run("import")}><ActionIcon name="import" />Importer DBML…</button>
        {!!result && <button disabled={pending} onClick={() => void run("export")}><ActionIcon name="export" />Exporter DBML…</button>}
      </div>
    </details>
    <small className="portable-edition">Portable</small>
    <UpdatePanel api={api} />
    <button className="theme-button" title={prefs?.theme === "dark" ? "Thème clair" : "Thème sombre"} aria-label={prefs?.theme === "dark" ? "Thème clair" : "Thème sombre"} onClick={() => void run("theme", { theme: prefs?.theme === "dark" ? "light" : "dark" })}><ActionIcon name="theme" /></button></header>
    {prefs?.notice && <p className="portable-notice" role="status">{prefs.notice}</p>}{error && <p className="portable-error" role="alert">{error}<button onClick={() => setError("")}>Fermer</button></p>}
    {result ? <ProjectWorkbench result={result} bridge={bridge} /> : <section className="portable-home"><h1>Vos schémas, dans un seul fichier.</h1><p>Créez un projet ou ouvrez un .dbcd pour éditer son DBML, organiser le diagramme et retrouver ses révisions.</p>
      <div className="home-actions"><button disabled={pending} onClick={() => setNewProjectOpen(true)}><ActionIcon name="new" />Créer un projet</button><button disabled={pending} onClick={() => void run("open")}><ActionIcon name="open" />Ouvrir un fichier .dbcd</button></div><h2>Projets récents</h2>{!prefs?.recent?.length && <p>Aucun projet récent.</p>}<ul>{prefs?.recent?.map((item: any) => <li key={item.entry}><div><strong>{item.name}</strong><small title={item.path}>{item.path}</small>{unavailable.includes(item.path) && <span>Projet indisponible</span>}</div>
        <button disabled={pending} onClick={() => void run("open", { path: item.path })}>{unavailable.includes(item.path) ? "Réessayer" : "Ouvrir"}</button><button onClick={() => void run("locate", { entry: item.entry })}>Retrouver le fichier</button><button onClick={() => void run("remove_recent", { entry: item.entry })}>Retirer</button></li>)}</ul></section>}
    {newProjectOpen&&<NewProjectDialog busy={pending} onClose={()=>setNewProjectOpen(false)} onCreate={async profile=>{if(await run("create",{profile}))setNewProjectOpen(false);}}/>}
  </div>;
}
createRoot(document.getElementById("root")!).render(<PortableApp />);
