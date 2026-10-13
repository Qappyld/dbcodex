import { useState } from "react";
import type { DocumentSession } from "./useDocumentSession.js";

function ConflictPanel({ conflict }: { conflict: NonNullable<DocumentSession["conflict"]> }) {
  const diskSource = conflict.disk?.sourceText ?? "";
  const proposed = diskSource === conflict.baseSource ? conflict.localSource
    : conflict.localSource === conflict.baseSource ? diskSource
    : `<<<<<<< LOCAL\n${conflict.localSource}\n||||||| BASE\n${conflict.baseSource}\n=======\n${diskSource}\n>>>>>>> DISQUE`;
  const [merged, setMerged] = useState(proposed);
  const [presentation, setPresentation] = useState("local");
  return <section role="region" aria-label="Résolution du conflit" className="workbench-message session-recovery">
    <h2>Le projet a changé sur le disque</h2>
    <p>Votre travail local est conservé. Comparez les trois versions avant d’enregistrer.</p>
    <div className="conflict-comparison">
      <details><summary>Version de base</summary><pre>{conflict.baseSource}</pre></details>
      <details><summary>Brouillon local</summary><pre>{conflict.localSource}</pre></details>
      <details><summary>Version disque</summary><pre>{diskSource}</pre></details>
    </div>
    <button type="button" onClick={conflict.retain}>Conserver le brouillon local</button>
    <button type="button" disabled={!conflict.disk} onClick={conflict.reload}>Recharger le disque</button>
    <p>Après rechargement, une copie locale reste récupérable dans cette session.</p>
    <label>Fusion DBML<textarea aria-label="Fusion DBML" value={merged} onChange={(event) => setMerged(event.target.value)} /></label>
    <label>Présentation à conserver<select aria-label="Présentation de la fusion" value={presentation} onChange={(event) => setPresentation(event.target.value)}>
      <option value="local">Locale</option><option value="disk">Disque</option>
    </select></label>
    <button type="button" disabled={!conflict.disk} onClick={() => conflict.merge(merged,
      presentation === "disk" ? conflict.disk!.presentation : conflict.localPresentation)}>Appliquer la fusion</button>
  </section>;
}

export function SessionRecoveryPanel({ session }: { session: DocumentSession }) {
  return <>
    {session.recovery && <section role="region" aria-label="Brouillon récupérable" className="workbench-message session-recovery">
      <h2>Un brouillon est disponible</h2>
      <details><summary>Comparer au document enregistré</summary><pre>{session.source}</pre><pre>{session.recovery.draft.sourceText}</pre></details>
      <button type="button" onClick={session.recovery.resume}>Reprendre le brouillon</button>
      <button type="button" onClick={() => void session.recovery!.discard()}>Écarter le brouillon</button>
    </section>}
    {session.conflict && <ConflictPanel key={`${session.conflict.disk?.projectId}:${session.conflict.disk?.currentRevisionId}`} conflict={session.conflict} />}
    {(session.retainedCopies ?? (session.retainedLocal ? [session.retainedLocal] : [])).map((copy, index) => <details key={index} className="workbench-message session-recovery"><summary>Copie locale conservée {index + 1}</summary>
      <pre>{copy.sourceText}</pre><button type="button" onClick={copy.recover}>Récupérer la copie locale {index + 1}</button>
    </details>)}
  </>;
}
