import { useState } from "react";
import { readDbcdProjectResult, type WorkbenchBridge } from "./bridge.js";

export function ProjectLauncher({ bridge, workspaceKey, opened }: {
  bridge: WorkbenchBridge; workspaceKey: string; opened(result: unknown): void;
}) {
  const storageKey = `dbcodex:last-project:${workspaceKey}`;
  const [path, setPath] = useState(() => {
    try { return localStorage.getItem(storageKey) ?? ""; } catch { return ""; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section className="project-launcher"><h1>Atelier DBML</h1>
    <p>Ouvrez un projet local pour travailler dans le diagramme et la conversation.</p>
    <form onSubmit={(event) => {
      event.preventDefault(); if (busy) return;
      const relativePath = path.trim();
      if (!relativePath || !/\.(dbcd|dbml)$/i.test(relativePath)) { setError("Indiquez un fichier .dbcd ou .dbml relatif à l’espace de travail."); return; }
      setBusy(true); setError("");
      void bridge.callTool(/\.dbcd$/i.test(relativePath) ? "open_dbcd" : "open_dbml", { path: relativePath })
        .then((result) => {
          const response = result as { isError?: boolean; structuredContent?: { sourcePath?: string }; content?: Array<{ text?: string }> };
          if (response?.isError || (!readDbcdProjectResult(result) && !response?.structuredContent?.sourcePath)) {
            throw new Error(response?.content?.[0]?.text ?? "Impossible d’ouvrir le projet.");
          }
          try { localStorage.setItem(storageKey, relativePath); } catch { /* Host storage is optional. */ }
          opened(result);
        }).catch(() => setError("Impossible d’ouvrir ce projet. Vérifiez son chemin et les droits de l’espace de travail."))
        .finally(() => setBusy(false));
    }}>
      <label htmlFor="project-path">Projet dans l’espace de travail</label>
      <input id="project-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder="fixtures/demo-shop.dbcd" disabled={busy} />
      <button type="submit" disabled={busy}>{busy ? "Ouverture…" : "Ouvrir le projet"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <p>Le format .dbcd permet l’édition et l’historique. Les fichiers .dbml s’ouvrent en exploration.</p>
  </section>;
}
