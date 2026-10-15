import type { ColumnModel, GraphColumn, GraphRelation, GraphTable, PresentationDocument, ProjectModel, ProjectProfile, SchemaGraph, TableModel } from "@dbcodex/core";
import { columnTypes, emptyProjectModel, technicalName } from "../../core/dist/project-model.js";
import { dbmlTableReference, dbmlTokens, type Token } from "./dbml-patches.js";

export interface ModelDocument { source: string; presentation: PresentationDocument; }
type Edit = {from:number;to:number;insert:string};
const quote=(name:string)=>`"${name.replaceAll("\\","\\\\").replaceAll('"','\\"')}"`;
const word=(token:Token)=>token.text.startsWith('"')?token.text.slice(1,-1).replace(/\\(.)/g,"$1"):token.text;
const profile=(p:PresentationDocument)=>p.model?.profile??{mode:"generic" as const};
export function ensureModel(p:PresentationDocument): ProjectModel { return p.model??emptyProjectModel({mode:"generic"}); }
export function tableMetadata(p:PresentationDocument,t:GraphTable): TableModel {return p.model?.tables[t.id]??{displayName:t.name,kind:profile(p).mode==="sharepoint"?"list":"table",columns:{},nameCustomized:true};}
export function columnMetadata(p:PresentationDocument,t:GraphTable,c:GraphColumn): ColumnModel {const columns=tableMetadata(p,t).columns;return (Object.hasOwn(columns,c.name)?columns[c.name]:undefined)??{displayName:c.name,type:c.type,nameCustomized:true};}
function editable(c:ColumnModel){if(c.system&&c.readOnly!==false)throw Error("Cette colonne système est protégée.");}
function edit(source:string,edits:Edit[]):string {
  const sorted=edits.sort((a,b)=>b.from-a.from||b.to-a.to);let last=source.length+1;
  for(const e of sorted){if(e.to>last)throw Error("Modification ambiguë. Utilisez le DBML pour cette déclaration.");source=source.slice(0,e.from)+e.insert+source.slice(e.to);last=e.from;}return source;
}
function range(entity:{sourceRange?:{start:{offset:number};end:{offset:number}}|undefined}){if(!entity.sourceRange)throw Error("Déclaration introuvable dans le DBML.");return {from:entity.sourceRange.start.offset,to:entity.sourceRange.end.offset};}
function modelCopy(p:PresentationDocument){const next=structuredClone(p);next.model??=emptyProjectModel({mode:"generic"});return next;}
function memberships(source:string,graph:SchemaGraph,t:GraphTable):Edit[] {
  const result:Edit[]=[];
  for(const [isView,groups] of [[false,graph.tableGroups??[]],[true,graph.views??[]]] as const)for(const group of groups){
    if(!group.sourceRange||!group.tableIds.includes(t.id))continue;const r=range(group),ts=dbmlTokens(source.slice(r.from,r.to)).tokens;let depth=0,inTables=false;
    for(let i=0;i<ts.length;i++){const token=ts[i]!;if(token.text==="{"){depth++;if(isView&&depth===2)inTables=ts[i-1]?.text.toLowerCase()==="tables";continue;}if(token.text==="}"){if(depth===2)inTables=false;depth--;continue;}
      if(word(token)!==t.name||(!isView&&depth!==1)||(isView&&(!inTables||depth!==2))||ts[i+1]?.text===":"||ts[i-1]?.text===":")continue;
      const qualified=ts[i-1]?.text===".";if(qualified?word(ts[i-2]!)!==t.schema:t.schema!=="public")continue;
      result.push({from:r.from+(qualified?ts[i-2]!.from:token.from),to:r.from+token.to,insert:""});
    }
  }return result;
}
function ownTable(p:PresentationDocument,t:GraphTable){const m=p.model!;m.tables[t.id]??=tableMetadata(p,t);return m.tables[t.id]!;}
function safeName(name:string,p:PresentationDocument,tableName=false){if(["__proto__","constructor","prototype"].includes(name))throw Error("Ce nom technique est réservé.");if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw Error("Le nom technique doit commencer par une lettre et contenir des lettres, chiffres ou underscores.");const mode=profile(p);if(mode.mode==="sharepoint"&&name.length>32)throw Error("Le nom interne proposé doit rester dans 32 caractères.");if(mode.mode==="dataverse"&&!name.startsWith(mode.publisherPrefix+"_"))throw Error("Le nom technique doit commencer par le préfixe de l’éditeur.");if(name.length>(tableName?128:128))throw Error("Nom technique trop long.");}
export function updateTableMetadata(doc:ModelDocument,t:GraphTable,patch:Partial<TableModel>):ModelDocument {const p=modelCopy(doc.presentation),m=ownTable(p,t);Object.assign(m,patch);return {...doc,presentation:p};}
export function updateColumnMetadata(doc:ModelDocument,t:GraphTable,c:GraphColumn,patch:Partial<ColumnModel>):ModelDocument {const p=modelCopy(doc.presentation),tm=ownTable(p,t),cm=columnMetadata(p,t,c);if(cm.system&&cm.readOnly!==false&&Object.keys(patch).some(k=>k!=="description"))throw Error("Cette colonne système est protégée.");tm.columns[c.name]={...cm,...patch};return {...doc,presentation:p};}

export function initialProject(profile:ProjectProfile):ModelDocument {const p:PresentationDocument={version:1,activeViewId:"all",views:{all:{name:"Toutes les tables",system:true,defaultDetail:"all",nodes:{},groups:{},edges:{},viewport:{x:0,y:0,zoom:1}}},panels:{editor:340,inspector:280,editorCollapsed:false,inspectorCollapsed:true},model:emptyProjectModel(profile),nameDisplay:"display"};return {source:"// Nouveau projet\n",presentation:p};}
export function addTable(doc:ModelDocument,graph:SchemaGraph,name:string,kind:TableModel["kind"]="table"):ModelDocument & {id:string} {
  name=name.trim();if(!name)throw Error("Indiquez un nom affiché.");const p=modelCopy(doc.presentation),pr=profile(p);if(kind==="library"&&pr.mode!=="sharepoint")throw Error("Les bibliothèques sont disponibles en mode SharePoint.");
  const internal=technicalName(name,pr,graph.tables.map(t=>t.name)),id=`public.${internal}`,columns:TableModel["columns"]={};
  const lines:string[]=[];const add=(key:string,display:string,type:string,pk=false)=>{lines.push(`  ${quote(key)} ${type}${pk?' [pk, not null]':''}`);columns[key]={displayName:display,type,system:true,readOnly:key!=="Title",nameCustomized:true};};
  if(pr.mode==="sharepoint") {add("ID","ID","Number",true);add("Title","Titre","Text");add("Created","Créé le","DateTime");add("Modified","Modifié le","DateTime");add("Author","Créé par","User");add("Editor","Modifié par","User");if(kind==="library"){add("FileLeafRef","Nom du fichier","Text");add("FileRef","Chemin du fichier","Text");add("FSObjType","Type d’objet","Number");}}
  else if(pr.mode==="dataverse"){add(internal+"id","Identifiant","Uniqueidentifier",true);lines.push(`  ${quote(pr.publisherPrefix+"_name")} String`);columns[pr.publisherPrefix+"_name"]={displayName:"Nom",type:"String",nameCustomized:true};add("createdon","Créé le","DateTime");add("modifiedon","Modifié le","DateTime");add("ownerid","Propriétaire","Owner");}
  else lines.push("  id integer [pk, not null]");
  p.model!.tables[id]={displayName:name,kind:pr.mode==="sharepoint"?(kind==="library"?"library":"list"):"table",columns,...(pr.mode==="dataverse"?{primaryNameColumn:pr.publisherPrefix+"_name"}:pr.mode==="sharepoint"?{primaryNameColumn:"Title"}:{})};
  const source=doc.source+(doc.source.endsWith("\n")?"\n":"\n\n")+`Table ${quote(internal)} {\n${lines.join("\n")}\n}\n`;
  p.views.all!.nodes[id]={x:40+(graph.tables.length%3)*280,y:60+Math.floor(graph.tables.length/3)*260};return {source,presentation:p,id};
}
export function addColumn(doc:ModelDocument,t:GraphTable,name:string,typeId:string):ModelDocument & {name:string} {
  if(!name.trim())throw Error("Indiquez un nom affiché.");const p=modelCopy(doc.presentation),pr=profile(p),tm=ownTable(p,t),key=technicalName(name,pr,t.columns.map(c=>c.name)),type=columnTypes(pr).find(x=>x.id===typeId)?.dbml??typeId;
  if(!/^[\w (),]+$/.test(type))throw Error("Type invalide.");const r=range(t),all=dbmlTokens(doc.source.slice(r.from,r.to)).tokens,close=all.at(-1);if(close?.text!=="}")throw Error("Fin de table introuvable.");
  tm.columns[key]={displayName:name.trim(),type:typeId};return {source:edit(doc.source,[{from:r.from+close.from,to:r.from+close.from,insert:`  ${quote(key)} ${type}\n`}]),presentation:p,name:key};
}
export function renameColumn(doc:ModelDocument,graph:SchemaGraph,t:GraphTable,c:GraphColumn,name:string):ModelDocument {
  if(columnMetadata(doc.presentation,t,c).system)throw Error("Le nom interne de cette colonne système est fixe.");
  editable(columnMetadata(doc.presentation,t,c));safeName(name,doc.presentation);if(name===c.name)return doc;if(t.columns.some(x=>x.name.toLowerCase()===name.toLowerCase()))throw Error("Ce nom technique existe déjà dans la table.");
  const r=range(c),token=dbmlTokens(doc.source.slice(r.from,r.to)).tokens[0];if(!token)throw Error("Colonne introuvable.");const edits:Edit[]=[{from:r.from+token.from,to:r.from+token.to,insert:quote(name)}];
  for(const rel of graph.relations.filter(x=>[x.source,x.target].some(e=>e.tableId===t.id&&e.columnNames.includes(c.name)))){
    const rr=range(rel),ts=dbmlTokens(doc.source.slice(rr.from,rr.to)).tokens;
    for(let i=0;i<ts.length;i++)if(word(ts[i]!)===c.name&&ts[i-1]?.text==="."&&(word(ts[i-2]!)===t.name)&&(ts[i-3]?.text==="."?word(ts[i-4]!)===t.schema:t.schema==="public"))edits.push({from:rr.from+ts[i]!.from,to:rr.from+ts[i]!.to,insert:quote(name)});
  }
  const p=modelCopy(doc.presentation),tm=ownTable(p,t);tm.columns[name]={...columnMetadata(p,t,c),nameCustomized:true};delete tm.columns[c.name];
  for(const meta of Object.values(p.model!.tables))for(const cm of Object.values(meta.columns))if(cm.lookup?.targetTableId===t.id){if(cm.lookup.displayColumn===c.name)cm.lookup.displayColumn=name;if(cm.lookup.targetColumn===c.name)cm.lookup.targetColumn=name;cm.lookup.additionalColumns=cm.lookup.additionalColumns?.map(x=>x===c.name?name:x);}
  if(tm.primaryNameColumn===c.name)tm.primaryNameColumn=name;
  return {source:edit(doc.source,edits),presentation:p};
}
export function renameTable(doc:ModelDocument,graph:SchemaGraph,t:GraphTable,name:string):ModelDocument {
  safeName(name,doc.presentation,true);if(name===t.name)return doc;if(graph.tables.some(x=>x.schema===t.schema&&x.name.toLowerCase()===name.toLowerCase()))throw Error("Ce nom technique existe déjà.");
  const all=dbmlTokens(doc.source).tokens,edits:Edit[]=[];const tr=range(t);
  for(let i=0;i<all.length;i++){const token=all[i]!;if(word(token)!==t.name)continue;
    const within=token.from>=tr.from&&token.to<tr.to;
    const declaration=within&&all[i-1]?.text.toLowerCase()==="table"||within&&all[i-1]?.text==="."&&word(all[i-2]!)===t.schema;
    const ref=graph.relations.some(r=>{const rr=range(r);return token.from>=rr.from&&token.to<=rr.to;})&&all[i+1]?.text==="."&&(all[i-1]?.text==="."?word(all[i-2]!)===t.schema:t.schema==="public");
    if(declaration||ref)edits.push({from:token.from,to:token.to,insert:quote(name)});
  }
  edits.push(...memberships(doc.source,graph,t).map(e=>({...e,insert:dbmlTableReference({...t,name})})));
  if(!edits.length)throw Error("Nom de table introuvable.");const p=modelCopy(doc.presentation),id=`${t.schema}.${name}`,tm=tableMetadata(p,t);p.model!.tables[id]={...tm,nameCustomized:true};delete p.model!.tables[t.id];
  for(const meta of Object.values(p.model!.tables))for(const cm of Object.values(meta.columns))if(cm.lookup?.targetTableId===t.id)cm.lookup.targetTableId=id;
  for(const rel of p.model!.relationships??[]){if(rel.sourceTableId===t.id)rel.sourceTableId=id;if(rel.targetTableId===t.id)rel.targetTableId=id;}
  for(const v of Object.values(p.views)){if(v.nodes[t.id]){v.nodes[id]=v.nodes[t.id]!;delete v.nodes[t.id];}for(const g of Object.values(v.groups))g.tableIds=g.tableIds.map(x=>x===t.id?id:x);v.edges={};}
  return {source:edit(doc.source,edits),presentation:p};
}
export function changeColumn(doc:ModelDocument,t:GraphTable,c:GraphColumn,patch:{type?:string;required?:boolean;primaryKey?:boolean},graph?:SchemaGraph):ModelDocument {
  if(columnMetadata(doc.presentation,t,c).system&&(patch.type!==undefined||patch.primaryKey!==undefined))throw Error("Le type de cette colonne système est fixe.");
  editable(columnMetadata(doc.presentation,t,c));const r=range(c);
  const refs=patch.type&&patch.type!=="Lookup"&&columnMetadata(doc.presentation,t,c).lookup&&graph?graph.relations.filter(rel=>[rel.source,rel.target].some(end=>end.tableId===t.id&&end.columnNames.includes(c.name))):[];
  const internal=refs.map(rel=>removeRef(doc.source,rel)).filter(rr=>rr.from>=r.from&&rr.to<=r.to);
  const block=edit(doc.source.slice(r.from,r.to),internal.map(rr=>({from:rr.from-r.from,to:rr.to-r.from,insert:rr.insert}))),all=dbmlTokens(block).tokens;let changed=block;
  if(patch.type){if(!/^[\w (),]+$/.test(patch.type))throw Error("Type invalide.");const from=all[1]?.from;if(from===undefined)throw Error("Type introuvable.");let to=all.find(x=>x.text==="[")?.from??block.length;changed=block.slice(0,from)+patch.type+" "+block.slice(to);}
  const setSetting=(text:string,key:string,on:boolean)=>{
    const open=text.indexOf("["),close=text.lastIndexOf("]");if(open<0)return text+(on?` [${key}]`:"");if(close<open)throw Error("Options DBML invalides.");
    const content=text.slice(open+1,close);const parts=content.match(/(?:[^,'`]+|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`)+/g)??[];
    const filtered=parts.map(x=>x.trim()).filter(x=>x!==key&&(key!=="not null"||x!=="null"));if(on)filtered.push(key);return text.slice(0,open)+(filtered.length?`[${filtered.join(", ")}]`:"")+text.slice(close+1);
  };
  if(patch.required!==undefined)changed=setSetting(changed,"not null",patch.required);if(patch.primaryKey!==undefined)changed=setSetting(changed,"pk",patch.primaryKey);
  const p=modelCopy(doc.presentation);if(patch.type){const tm=ownTable(p,t);tm.columns[c.name]={...columnMetadata(p,t,c),type:patch.type};if(graph&&patch.type!=="Lookup")delete tm.columns[c.name]!.lookup;}
  return {source:edit(doc.source,[{...r,insert:changed},...refs.filter(rel=>{const rr=range(rel);return rr.from<r.from||rr.to>r.to;}).map(rel=>removeRef(doc.source,rel))]),presentation:p};
}
function removeRef(source:string,rel:GraphRelation):Edit {const r=range(rel),block=source.slice(r.from,r.to);if(/^Ref\b/i.test(block))return {...r,insert:""};
  const before=source.slice(0,r.from),after=source.slice(r.to);if(/,\s*$/.test(before)){const comma=before.lastIndexOf(",");return {from:comma,to:r.to,insert:""};}if(/^\s*,/.test(after)){const comma=after.indexOf(",");return {from:r.from,to:r.to+comma+1,insert:""};}
  return {...r,insert:""};
}
export function setLookup(doc:ModelDocument,graph:SchemaGraph,t:GraphTable,c:GraphColumn,lookup:NonNullable<ColumnModel["lookup"]>):ModelDocument {
  if(columnMetadata(doc.presentation,t,c).system)throw Error("Cette colonne système ne peut pas devenir un Lookup.");
  editable(columnMetadata(doc.presentation,t,c));const target=graph.tables.find(x=>x.id===lookup.targetTableId);if(!target)throw Error("Choisissez une table existante.");const pr=profile(doc.presentation);
  if(pr.mode==="dataverse"&&lookup.multiple)throw Error("Utilisez une relation N:N en mode Dataverse.");
  const key=pr.mode==="sql"||pr.mode==="generic"?target.columns.find(x=>x.name===lookup.targetColumn):target.columns.find(x=>x.primaryKey);if(!key)throw Error("La table cible doit avoir une clé primaire.");
  const refs=graph.relations.filter(r=>[r.source,r.target].some(e=>e.tableId===t.id&&e.columnNames.includes(c.name)));if(refs.some(r=>r.source.columnNames.length>1||r.target.columnNames.length>1))throw Error("Modifiez cette relation composée dans le DBML.");
  const edits=refs.map(r=>removeRef(doc.source,r));
  if(pr.mode==="sharepoint"||pr.mode==="dataverse"){
    const cr=range(c),ts=dbmlTokens(doc.source.slice(cr.from,cr.to)).tokens;
    const end=ts.find(token=>token.text==="[")?.from??(cr.to-cr.from);
    if(ts[1])edits.push({from:cr.from+ts[1].from,to:cr.from+end,insert:"Lookup "});
  }
  const source=edit(doc.source,edits)+`\nRef: ${dbmlTableReference(t)}.${quote(c.name)} > ${dbmlTableReference(target)}.${quote(key.name)}\n`;
  const p=modelCopy(doc.presentation),tm=ownTable(p,t);tm.columns[c.name]={...columnMetadata(p,t,c),type:pr.mode==="sharepoint"||pr.mode==="dataverse"?"Lookup":c.type,lookup:{...lookup,targetColumn:key.name,unresolved:false}};
  return {source,presentation:p};
}
export function clearLookup(doc:ModelDocument,graph:SchemaGraph,t:GraphTable,c:GraphColumn):ModelDocument {
  const edits=graph.relations.filter(r=>[r.source,r.target].some(e=>e.tableId===t.id&&e.columnNames.includes(c.name))).map(r=>removeRef(doc.source,r));const p=modelCopy(doc.presentation),tm=ownTable(p,t),cm={...columnMetadata(p,t,c)};delete cm.lookup;tm.columns[c.name]=cm;return {source:edit(doc.source,edits),presentation:p};
}
export function deleteColumn(doc:ModelDocument,graph:SchemaGraph,t:GraphTable,c:GraphColumn):ModelDocument {
  if(columnMetadata(doc.presentation,t,c).system)throw Error("Cette colonne système est protégée.");
  editable(columnMetadata(doc.presentation,t,c));const r=range(c),refs=graph.relations.filter(rel=>[rel.source,rel.target].some(e=>e.tableId===t.id&&e.columnNames.includes(c.name)));
  const edits=[{...r,insert:""},...refs.filter(rel=>{const rr=range(rel);return rr.from<r.from||rr.to>r.to;}).map(rel=>removeRef(doc.source,rel))];
  const p=modelCopy(doc.presentation),tm=ownTable(p,t);delete tm.columns[c.name];for(const meta of Object.values(p.model!.tables))for(const cm of Object.values(meta.columns))if(cm.lookup?.targetTableId===t.id&&cm.lookup.targetColumn===c.name)cm.lookup.unresolved=true;
  return {source:edit(doc.source,edits),presentation:p};
}
export function deleteTable(doc:ModelDocument,graph:SchemaGraph,t:GraphTable,treatment:"keep"|"remove"):ModelDocument {
  const r=range(t),affected=graph.relations.filter(rel=>rel.source.tableId===t.id||rel.target.tableId===t.id),edits:Edit[]=[{...r,insert:""}];const p=modelCopy(doc.presentation);
  const removeCols=new Set<string>();
  for(const owner of graph.tables.filter(x=>x.id!==t.id))for(const c of owner.columns){const cm=p.model!.tables[owner.id]?.columns[c.name];if(cm?.lookup?.targetTableId===t.id){if(treatment==="remove"&&!cm.system){removeCols.add(c.id);edits.push({...range(c),insert:""});delete p.model!.tables[owner.id]!.columns[c.name];}else cm.lookup.unresolved=true;}}
  for(const rel of affected){const rr=range(rel);if(rr.from>=r.from&&rr.to<=r.to)continue;if(graph.tables.flatMap(x=>x.columns).some(c=>removeCols.has(c.id)&&rr.from>=range(c).from&&rr.to<=range(c).to))continue;edits.push(removeRef(doc.source,rel));}
  // Remove only actual membership tokens, never comments or notes.
  edits.push(...memberships(doc.source,graph,t));
  delete p.model!.tables[t.id];p.model!.relationships=(p.model!.relationships??[]).filter(x=>x.sourceTableId!==t.id&&x.targetTableId!==t.id);
  for(const v of Object.values(p.views)){delete v.nodes[t.id];for(const g of Object.values(v.groups))g.tableIds=g.tableIds.filter(id=>id!==t.id);v.edges={};}
  return {source:edit(doc.source,edits),presentation:p};
}
export function addManyToMany(doc:ModelDocument,graph:SchemaGraph,sourceId:string,targetId:string,name:string):ModelDocument {
  if(profile(doc.presentation).mode!=="dataverse")throw Error("Les relations N:N sont disponibles en mode Dataverse.");if(!graph.tables.some(t=>t.id===sourceId)||!graph.tables.some(t=>t.id===targetId))throw Error("Choisissez deux tables existantes.");const p=modelCopy(doc.presentation);p.model!.relationships??=[];const internal=technicalName(name,profile(p),p.model!.relationships.map(r=>r.name));p.model!.relationships.push({id:`nn:${internal}`,name:internal,sourceTableId:sourceId,targetTableId:targetId,kind:"many-to-many"});return {...doc,presentation:p};
}
