import { useEffect, useRef, useState } from "react";
import type { ProjectProfile } from "@dbcodex/core";
import { projectProfileSchema } from "../../core/dist/project-model.js";

export function ProjectTypeFields({ onChange }: {onChange(profile:ProjectProfile|null):void}) {
  const [mode,setMode]=useState(""),[dialect,setDialect]=useState<"postgresql"|"sqlserver"|"mysql"|"sqlite">("postgresql"),[prefix,setPrefix]=useState("app");
  useEffect(()=>{const profile=mode==="sql"?{mode,dialect}:mode==="dataverse"?{mode,publisherPrefix:prefix}:{mode};const parsed=projectProfileSchema.safeParse(profile);onChange(parsed.success?parsed.data:null);},[mode,dialect,prefix]);
  return <div className="project-type-fields"><label>Type de projet<select aria-label="Type de projet" value={mode} onChange={e=>setMode(e.target.value)} required><option value="">Choisir un type…</option><option value="sharepoint">SharePoint</option><option value="dataverse">Dataverse</option><option value="sql">SQL</option><option value="generic">DBML générique</option></select></label>
    {mode==="sql"&&<label>Moteur SQL<select aria-label="Moteur SQL" value={dialect} onChange={e=>setDialect(e.target.value as typeof dialect)}><option value="postgresql">PostgreSQL</option><option value="sqlserver">SQL Server</option><option value="mysql">MySQL</option><option value="sqlite">SQLite</option></select></label>}
    {mode==="dataverse"&&<label>Préfixe de l’éditeur<input value={prefix} onChange={e=>setPrefix(e.target.value)} pattern="[a-z][a-z0-9]{1,7}" required /><small>2 à 8 caractères : lettres minuscules et chiffres, en commençant par une lettre.</small></label>}
    <p className="builder-hint">Le type est fixé pour ce projet. Vous pourrez alterner entre DBML et Construction.</p>
  </div>;
}

export function NewProjectDialog({onCreate,onClose,busy=false}:{onCreate(profile:ProjectProfile):Promise<void>;onClose():void;busy?:boolean}) {
  const [profile,setProfile]=useState<ProjectProfile|null>(null),[error,setError]=useState("");const dialog=useRef<HTMLDivElement>(null),previous=useRef(document.activeElement);
  useEffect(()=>{dialog.current?.querySelector<HTMLSelectElement>("select")?.focus();return ()=>{if(previous.current instanceof HTMLElement&&previous.current.isConnected)previous.current.focus();};},[]);
  return <div className="view-dialog-backdrop" onKeyDown={e=>{if(e.key==="Escape"&&!busy){e.stopPropagation();onClose();}if(e.key==="Tab"){const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input,select")??[]);if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus();}}}}><div ref={dialog} className="view-dialog" role="dialog" aria-modal="true" aria-label="Créer un projet"><h2>Nouveau projet</h2><form onSubmit={e=>{e.preventDefault();if(profile&&!busy)void onCreate(profile).catch(c=>setError(c instanceof Error?c.message:"Création impossible."));}}><ProjectTypeFields onChange={setProfile}/>{error&&<p role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" disabled={!profile||busy}>{busy?"Création…":"Choisir le fichier et créer"}</button></footer></form></div></div>;
}
