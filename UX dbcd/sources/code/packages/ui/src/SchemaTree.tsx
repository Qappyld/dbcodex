import { useState } from "react";
import type { GraphColumn, GraphTable, PresentationDocument, SchemaGraph } from "@dbcodex/core";
import { columnMetadata, tableMetadata } from "./model-commands.js";
import { ActionIcon } from "./ActionIcon.js";

/** Navigation remains available while properties are edited or the document is read-only. */
export function SchemaTree({graph,presentation,tableId,columnId,onTable,onColumn}:{graph:SchemaGraph;presentation:PresentationDocument;tableId?:string|undefined;columnId?:string|undefined;onTable(t:GraphTable):void;onColumn(t:GraphTable,c:GraphColumn):void}) {
  const [query,setQuery]=useState(""),[folds,setFolds]=useState<Record<string,boolean>>({});
  const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const term=normalize(query.trim());
  const matches=(...values:string[])=>values.some(value=>normalize(value).includes(term));
  const tables=graph.tables.filter(t=>matches(t.name,tableMetadata(presentation,t).displayName)||t.columns.some(c=>matches(c.name,columnMetadata(presentation,t,c).displayName)));
  return <div className="builder-explorer">
    <label className="builder-search"><span className="builder-search-symbol" aria-hidden="true">⌕</span><input type="search" aria-label="Rechercher une table ou une colonne" placeholder="Rechercher…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Escape"){setQuery("");e.stopPropagation();}}}/>{query&&<button aria-label="Effacer la recherche" onClick={()=>setQuery("")}>×</button>}</label>
    <div className="builder-tree" aria-label="Tables et colonnes">{tables.map(t=>{
      const meta=tableMetadata(presentation,t),tableMatches=matches(t.name,meta.displayName),open=!!term||!folds[t.id];
      const columns=t.columns.filter(c=>!term||tableMatches||matches(c.name,columnMetadata(presentation,t,c).displayName));
      const renderColumn=(c:GraphColumn)=>{const m=columnMetadata(presentation,t,c);return <button key={c.id} className="builder-column-row" aria-pressed={tableId===t.id&&columnId===c.id} onClick={()=>onColumn(t,c)} title={`${m.displayName} · ${c.name}`}><span className="builder-column-symbol" aria-hidden="true">{m.lookup?"↗":"·"}</span><span className="builder-tree-name">{m.displayName}</span>{m.lookup?.unresolved?<small>À résoudre</small>:<small aria-hidden="true">{m.lookup?"Lookup":m.type??c.type}</small>}</button>;};
      return <div key={t.id} className="builder-tree-object"><div className="builder-tree-table"><button aria-label={`${open?"Replier":"Déplier"} ${meta.displayName}`} aria-expanded={open} disabled={!!term} onClick={()=>setFolds({...folds,[t.id]:!folds[t.id]})}><ActionIcon name={open?"chevronDown":"chevronRight"}/></button><button aria-label={`${meta.displayName} ${meta.kind==="library"?"Bibliothèque":meta.kind==="list"?"Liste":"Table"}`} aria-pressed={tableId===t.id&&!columnId} onClick={()=>onTable(t)} title={`${meta.displayName} · ${t.name}`}><ActionIcon name={meta.kind==="library"?"open":"grid"}/><span className="builder-tree-name">{meta.displayName}</span><small>{meta.kind==="library"?"Bibliothèque":meta.kind==="list"?"Liste":"Table"}</small></button></div>
      {open&&<div className="builder-tree-columns">{columns.filter(c=>!columnMetadata(presentation,t,c).system).map(renderColumn)}{columns.some(c=>columnMetadata(presentation,t,c).system)&&<details open={term?true:undefined} key={term?"search":"browse"}><summary>Colonnes système</summary>{columns.filter(c=>columnMetadata(presentation,t,c).system).map(renderColumn)}</details>}</div>}</div>;
    })}{!tables.length&&<p className="builder-empty" role="status">{query?"Aucune table ni colonne trouvée.":"Créez votre première table avec les boutons ci-dessus."}{query&&<button onClick={()=>setQuery("")}>Effacer la recherche</button>}</p>}</div>
  </div>;
}

