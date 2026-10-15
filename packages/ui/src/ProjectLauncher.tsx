import { useState } from "react";
import { readDbcdProjectResult, type WorkbenchBridge } from "./bridge.js";
import { ProjectTypeFields } from "./ProjectTypeForm.js";
import type { ProjectProfile } from "@dbcodex/core";

export function ProjectLauncher({ bridge, workspaceKey, opened }: {
  bridge: WorkbenchBridge; workspaceKey: string; opened(result: unknown): void;
}) {
  const storageKey = `dbcodex:last-project:${workspaceKey}`;
  const [path, setPath] = useState(() => {
    try { return localStorage.getItem(storageKey) ?? ""; } catch { return ""; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creating,setCreating]=useState(false),[profile,setProfile]=useState<ProjectProfile|null>(null);
  return <section className="project-launcher"><h1>Atelier DBML</h1>
    <p>Ouvrez un projet local pour travailler dans le diagramme et la conversation.</p>
    <div className="launcher-actions"><button aria-pressed={!creating} onClick={()=>setCreating(false)}>Ouvrir</button><button aria-pressed={creating} onClick={()=>setCreating(true)}>Nouveau projet</button></div>
    <form onSubmit={(event) => {
      event.preventDefault(); if (busy) return;
      const relativePath = path.trim();
      if (!relativePath || !(creating?/\.dbcd$/i:/\.(dbcd|dbml)$/i).test(relativePath)) { setError("Indiquez un fichier .dbcd ou .dbml relatif à l’espace de travail."); return; }
      if(creating&&!profile){setError("Choisissez le type du projet.");return;}
      setBusy(true); setError("");
      void bridge.callTool(creating?"create_dbcd":/\.dbcd$/i.test(relativePath) ? "open_dbcd" : "open_dbml", { path: relativePath, ...(creating?{profile}:{}) })
        .then((result) => {
          const response = result as { isError?: boolean; structuredContent?: { sourcePath?: string }; content?: Array<{ text?: string }> };
          if (response?.isError || (!readDbcdProjectResult(result) && !response?.structuredContent?.sourcePath)) {
            throw new Error(response?.content?.[0]?.text ?? "Impossible d’ouvrir le projet.");
          }
          try { localStorage.setItem(storageKey, relativePath); } catch { /* Host storage is optional. */ }
          opened(result);
        }).catch((cause) => setError(cause instanceof Error?cause.message:"Opération impossible. Vérifiez le chemin et les droits de l’espace de travail."))
        .finally(() => setBusy(false));
    }}>
      <label htmlFor="project-path">Projet dans l’espace de travail</label>
      <input id="project-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder="fixtures/demo-shop.dbcd" disabled={busy} />
      {creating&&<ProjectTypeFields onChange={setProfile}/>}
      <button type="submit" disabled={busy||creating&&!profile}>{busy ? "Patientez…" : creating?"Créer le projet":"Ouvrir le projet"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <p>Le format .dbcd permet l’édition et l’historique. Les fichiers .dbml s’ouvrent en exploration.</p>
  </section>;
}
