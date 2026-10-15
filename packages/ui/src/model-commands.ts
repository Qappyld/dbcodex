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
      if(word(tokUser");if(kind==="library"){add("FileLeafRef","Nom du fichier","Text");add("FileRef","Chemin du fichier","Text");add("FSObjType","Type d’objet","Number");}}
  else if(pr.mode==="dataverse"){add(internal+"id","Identifiant","Uniq==="dataverse"?{primaryNameColumn:pr.publisherPrefix+"_name"}:pr.mode==="sharepoint"?{primaryNameColumn:"Title"}:{})};
  const source=doc.source+(doc.source.endsWith("\n")?"\n":"\n\n")+`Table ${quote(internal)} {\n${lines.join("\n")}\n}\n`;
  p.views.all!.nodes[id]={x:40+(graph.tables.length%3)*280,y:60+Math.floor(graph.tables.length/3)*260};return {source,presentation:p,id};
}
export function addColumn(doc:ModelDocument,t:GraphTable,name:string,typeId:string):ModelDocument & {na(),type:typeId};return {source:edit(doc.source,[{from:r.from+close.from,to:r.from+close.from,insert:`  ${quote(key)} ${type}\n`}]),presentation:p,name:key};
}
export function renameColumn(doc:ModelDocument,graph:SchemaGraph,t:GraphTable,c:GraphColumn,name:string):ModelDocument {
  if(columnMetadata(doc.presentation,t,c).system)throw Error("Le nom interne de cette colonne système est fixe.");
  editable(columnMetadata(doc.presentation,t,c));safeName(name,doc.presentation);if(name===c.name)return doc;if(t.columns.some(x=>x.name.toLowerCase()===name.toLowerCase()))throw Error("Ce nom technique existe déjà dans la table.");
  const r=range(c),token=dbmlTokens(doc.source.slice(r.from,r.to)).tokens[0];if(!token)throw Error("Colonne introuvable.");const edits:Edit[]=[{from:r.from+token.from,to:r.from+token.to,insert:quote(name)}];
  for(const rel of graph.relations.filter(x=>[x.source,x.target].some(e=>e.tableId===t.id&&e.columnNames.includes(c.name)))){
    const rr=range(rel),ts=dbmlTokens(doc.sourceObject.values(meta.columns))if(cm.lookup?.targetTableId===t.id){if(cm.lookup.displayColumn===c.name)cm.lookup.displayColumn=name;if(cm.lookup.targetColumn===c.name)cm.lookup.targetColumn=name;cm.lookup.additionalColumns=cm.lookup.additionalColumns?.map(x=>afeName(name,doc.presentation,true);if(name===t.name)return doc;if(graph.tables.some(x=>x.schema===t.schema&&x.name.toLowerCase()===name.toLowerCase()))throw Error("Ce nom technique existe déjà.");
  const all=dbmlTokens(doc.source).tokens,edits:Edit[]=[];const tr=range(t);
  for(let i=0;i<all.length;i++){const token=all[i]!;if(word(token)!==t.name)continue;
    const within=token.from>=tr.from&&token.to<tr.to;
    const declaration=within&&all[i-1]?.text.toLowerCase()==="table"||within&&all[i-1]?.text==="."&&word(all[i-2]!)===t.schema;
    const ref=graph.relations.some(r=>{const rr=range(r);return token.from>=rr.from&&token.to<=rr.to;})&&all[i+1]?.text==="."&&(all[i-1]?.text==="."?word(all[i-2]!)===t.schema:t.schema==="public");
    if(deodes[t.id]){v.nodes[id]=v.nodes[t.id]!;delete v.nodes[t.id];}for(const g of Object.values(v.groups))g.tableIds=g.tableIds.map(x=>x===t.id?id:x);v.edges={};}
  return {source:edit(doc.source,edits),presentation:p};
}
export function changeColumn(doc:ModelDocument,t:GraphTable,c:GraphColumn,patch:{type?:string;required?:boolean;primaryKey?:boolean},graph?:SchemaGraph):ModelDocument {
  if(columnMetadata(doc.presentation,t,c).system&&(patch.type!==undefined||patch.primaryKey!==undefined))throw Error("Le tot null",patch.required);if(patch.primaryKey!==undefined)changed=setSetting(changed,"pk",patch.primaryKey);
  const p=modelCopy(doc.presentation);if(patch.type){const tm=ownTable(p,t);tm.columns[c.name]={...columnMetadata(p,t,c),type:patch.type};if(gra
function removeRef(source:string,rel:GraphRelation):Edit {const r=range(rel),block=source.slice(r.from,r.to);if(/^Ref\b/i.test(block))return {...r,insert:""};
  const before=source.slice(0,r.from),after=source.slice(r.to);if(/,\s*$/.test(before)){coocument,graph:SchemaGraph,t:GraphTable,c:GraphColumn,lookup:NonNullable<ColumnModel["lookup"]>):ModelDocument {
  if(columnMetadata(doc.presentation,t,c).system)throw Error("Cette colonne système ne peut pas devenir un Lookup.");
  editable(columnMetadata(doc.presentation,t,c));const target=graph.tables.find(x=>x.id===lookup.targetTableId);if(!target)throw Error("Choisissez une table existante.");const pr=profile(doc.presentation);
  if(pr.mode==="dataverse"&&lookup.multiple)throw Error("Utilisez une relation N:N en mode Dataverse.");
  const key=pr.mode==="sql"||pr.mode==="generic"?target.columns.find(x=>x.name===lookup.targetColumn):target.columns.find(x=>x.primaryKey);if(!key)throw Error("La table cible doit avoir une clé primaire.");
  const refs=graph.relations.filter(r=>[r.source,r.target].some(e=>e.tableId===t.id&&e.columnNames.includes(c.name)));if(refs.some(r=>r.source.columnNames.length>1||r.target.columnNames.length>1))throw Error("Modifiez cette relation composée dans le DBML(doc.source,r));const p=modelCopy(doc.presentation),tm=ownTable(p,t),cm={...columnMetadata(p,t,c)};delete cm.lookup;tm.columns[c.name]=cm;return {source:edit(doc.source,edits),presentation:p};
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
