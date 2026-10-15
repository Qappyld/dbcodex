import { z } from "zod";
import type { Diagnostic, SchemaGraph } from "./schema-graph.js";

const text = z.string().trim().min(1).max(512);
export const projectProfileSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("generic") }),
  z.strictObject({ mode: z.literal("sql"), dialect: z.enum(["postgresql", "sqlserver", "mysql", "sqlite"]) }),
  z.strictObject({ mode: z.literal("sharepoint") }),
  z.strictObject({ mode: z.literal("dataverse"), publisherPrefix: z.string().regex(/^[a-z][a-z0-9]{1,7}$/) }),
]);
export type ProjectProfile = z.infer<typeof projectProfileSchema>;
export type ProjectMode = ProjectProfile["mode"];
export const columnOptionsSchema = z.strictObject({
  defaultValue: z.string().max(64000).optional(), choices: z.array(z.string().max(255)).max(1000).optional(),
  multiple: z.boolean().optional(), richText: z.boolean().optional(), appendChanges: z.boolean().optional(),
  maxLength: z.number().int().positive().max(1048576).optional(), decimals: z.number().int().min(0).max(10).optional(),
  minimum: z.number().finite().optional(), maximum: z.number().finite().optional(),
  dateOnly: z.boolean().optional(), formula: z.string().max(16000).optional(), resultType: text.optional(),
  currency: z.string().max(32).optional(), format: text.optional(), termSet: text.optional(),
  peopleOnly: z.boolean().optional(), unique: z.boolean().optional(), indexed: z.boolean().optional(),
  allowFillIn: z.boolean().optional(), calculation: z.enum(["simple","calculated","formula","rollup"]).optional(),
});
const lookupSchema = z.strictObject({
  targetTableId: text, targetColumn: text.optional(), displayColumn: text.optional(),
  additionalColumns: z.array(text).optional(), multiple: z.boolean(),
  onDelete: z.enum(["none", "restrict", "cascade"]).optional(), unresolved: z.boolean().optional(),
  relationshipName: text.optional(),
});
export const columnModelSchema = z.strictObject({
  displayName: text, nameCustomized: z.boolean().optional(), type: text.optional(), system: z.boolean().optional(), readOnly: z.boolean().optional(),
  description: z.string().max(64000).optional(), options: columnOptionsSchema.optional(), lookup: lookupSchema.optional(),
});
export const tableModelSchema = z.strictObject({
  displayName: text, pluralName: text.optional(), nameCustomized: z.boolean().optional(),
  kind: z.enum(["table", "list", "library"]), description: z.string().max(64000).optional(),
  primaryNameColumn: text.optional(), columns: z.record(text, columnModelSchema),
});
export const projectModelSchema = z.strictObject({
  version: z.literal(1), profile: projectProfileSchema,
  tables: z.record(text, tableModelSchema),
  relationships: z.array(z.strictObject({ id: text, name: text, sourceTableId: text, targetTableId: text, kind: z.literal("many-to-many") })).optional(),
});
export type ProjectModel = z.infer<typeof projectModelSchema>;
export type ColumnModel = z.infer<typeof columnModelSchema>;
export type TableModel = z.infer<typeof tableModelSchema>;
export const modeLabel = (profile?: ProjectProfile): string => ({generic:"DBML générique",sql:"SQL",sharepoint:"SharePoint",dataverse:"Dataverse"}[profile?.mode ?? "generic"]);

export interface ColumnType { id: string; label: string; dbml: string; }
const type = (id: string, label: string, dbml = id): ColumnType => ({ id, label, dbml });
const sharepointTypes = [type("Text","Une ligne de texte"),type("Note","Plusieurs lignes de texte"),type("Choice","Choix"),type("Number","Nombre"),type("Currency","Devise"),type("DateTime","Date et heure"),type("Boolean","Oui / Non"),type("Lookup","Recherche (Lookup)"),type("User","Personne ou groupe"),type("URL","Lien hypertexte ou image"),type("Calculated","Calculé"),type("TaxonomyFieldType","Métadonnées gérées"),type("Location","Emplacement"),type("Thumbnail","Image")];
const dataverseTypes = [type("String","Texte"),type("Memo","Texte multiligne"),type("Choice","Choix"),type("MultiSelectPicklist","Choix multiples"),type("Boolean","Oui / Non"),type("Integer","Nombre entier"),type("BigInt","Grand nombre entier"),type("Decimal","Nombre décimal"),type("Double","Nombre à virgule flottante"),type("Money","Devise"),type("DateTime","Date et heure"),type("Lookup","Recherche (Lookup)"),type("Uniqueidentifier","Identifiant unique"),type("AutoNumber","Numérotation automatique"),type("File","Fichier"),type("Image","Image")];
export function columnTypes(profile?: ProjectProfile): ColumnType[] {
  if(profile?.mode==="sharepoint")return sharepointTypes;
  if(profile?.mode==="dataverse")return dataverseTypes;
  const dialect=profile?.mode==="sql"?profile.dialect:"postgresql";
  const values=dialect==="sqlite"?["integer","real","text","blob","numeric"]:dialect==="sqlserver"?["int","bigint","nvarchar(255)","nvarchar(max)","bit","decimal(18,2)","float","datetime2","date","uniqueidentifier","varbinary(max)"]:dialect==="mysql"?["int","bigint","varchar(255)","text","boolean","decimal(18,2)","double","datetime","date","json","blob"]:["integer","bigint","varchar(255)","text","boolean","numeric(18,2)","double precision","timestamp","date","uuid","jsonb","bytea"];
  return values.map(value=>type(value,value));
}
export function technicalName(display: string, profile?: ProjectProfile, existing: string[] = []): string {
  let base=display.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_]/g,"")||"Objet";
  if(!/^[a-zA-Z_]/.test(base))base="N"+base;
  if(["__proto__","constructor","prototype"].includes(base))base="N_"+base;
  if(profile?.mode==="sql"||profile?.mode==="generic"||!profile)base=base.toLowerCase();
  if(profile?.mode==="sharepoint")base=base.slice(0,32);
  if(profile?.mode==="dataverse")base=profile.publisherPrefix+"_"+base.toLowerCase().slice(0,90);
  let name=base,n=2;while(existing.some(x=>x.toLowerCase()===name.toLowerCase())){const suffix="_"+n++;name=base.slice(0,profile?.mode==="sharepoint"?32-suffix.length:120)+suffix;}return name;
}
export function emptyProjectModel(profile: ProjectProfile): ProjectModel {return {version:1,profile:projectProfileSchema.parse(profile),tables:{}};}
function canDisplayLookupColumn(column: SchemaGraph["tables"][number]["columns"][number], model: ProjectModel | undefined, tableId: string): boolean {
  if (model?.profile.mode !== "sharepoint") return true;
  const metadata = model.tables[tableId]?.columns[column.name], type = metadata?.type ?? column.type;
  return ["Text", "Number", "DateTime"].includes(type) || type === "Lookup" && !metadata?.lookup?.multiple;
}
export function lookupDisplayColumns(graph:SchemaGraph,model:ProjectModel|undefined,tableId:string) {
  const t=graph.tables.find(t=>t.id===tableId);if(!t)return [];
  if(model?.profile.mode!=="sharepoint")return t.columns;
  return t.columns.filter(c => canDisplayLookupColumn(c, model, tableId));
}

/** Enrich labels and table-target lookup edges without replacing the DBML graph's identifiers. */
export function projectGraph(graph: SchemaGraph, model?: ProjectModel): SchemaGraph {
  if(!model)return graph;
  const tables=graph.tables.map(t=>{const m=model.tables[t.id];return {...t,...(m?{displayName:m.displayName,kind:m.kind}:{}),columns:t.columns.map(c=>{const cm=m?.columns[c.name];return {...c,...(cm?{displayName:cm.displayName,system:cm.system??false,semanticType:cm.type??c.type,lookup:cm.lookup}:{} )};})};});
  const relations=graph.relations.map(r=>{
    for(const end of [r.source,r.target]){const m=model.tables[end.tableId];for(const name of end.columnNames){const lookup=m?.columns[name]?.lookup;if(!lookup||lookup.unresolved)continue;const other=end===r.source?r.target:r.source;
      if(other.tableId===lookup.targetTableId){
        if(model.profile.mode==="sql"||model.profile.mode==="generic")return {...r,ownerColumnId:`${end.tableId}.${name}`};
        return {...r,kind:"lookup" as const,ownerColumnId:`${end.tableId}.${name}`,source:{tableId:end.tableId,columnNames:[name],cardinality:"*"},target:{tableId:other.tableId,columnNames:[],cardinality:lookup.multiple?"*":"1"}};
      }
    }}return r;
  });
  const tableIds = new Set(tables.map(t => t.id));
  for(const r of model.relationships??[])if(tableIds.has(r.sourceTableId)&&tableIds.has(r.targetTableId))relations.push({id:r.id,kind:"many-to-many",source:{tableId:r.sourceTableId,columnNames:[],cardinality:"*"},target:{tableId:r.targetTableId,columnNames:[],cardinality:"*"}});
  return {...graph,tables,relations};
}
/** Lookup target is derived from DBML refs after manual edits; options are kept with the owner column. */
export function reconcileProjectModel(graph: SchemaGraph, model?: ProjectModel): ProjectModel | undefined {
  if(!model)return undefined;const next=structuredClone(model);
  const references = new Map<string, Map<string, Set<SchemaGraph["relations"][number]>>>();
  for (const relation of graph.relations) for (const end of [relation.source, relation.target]) {
    let columns = references.get(end.tableId);
    if (!columns) references.set(end.tableId, columns = new Map());
    for (const name of end.columnNames) {
      let refs = columns.get(name);
      if (!refs) columns.set(name, refs = new Set());
      refs.add(relation);
    }
  }
  for(const t of graph.tables){const tm=next.tables[t.id];if(!tm)continue;
    for(const c of t.columns){const cm=tm.columns[c.name];if(!cm?.lookup)continue;
      const refs=references.get(t.id)?.get(c.name);
      const r=refs?.size===1?refs.values().next().value:undefined;
      if(r){const other=r.source.tableId===t.id&&r.source.columnNames.includes(c.name)?r.target:r.source;cm.lookup.targetTableId=other.tableId;cm.lookup.targetColumn=other.columnNames[0];cm.lookup.unresolved=false;}
      else cm.lookup.unresolved=true;
    }
  }return next;
}
export function modelDiagnostics(graph: SchemaGraph, model?: ProjectModel): Diagnostic[] {
  if(!model)return [];const result:Diagnostic[]=[];
  const tables = new Map(graph.tables.map(table => [table.id, table]));
  const displayColumns = new Map<string, Set<string>>();
  const validDisplayColumn = (table: SchemaGraph["tables"][number], name: string): boolean => {
    let names = displayColumns.get(table.id);
    if (!names) {
      names = new Set(table.columns.filter(column => canDisplayLookupColumn(column, model, table.id)).map(column => column.name));
      displayColumns.set(table.id, names);
    }
    return names.has(name);
  };
  for(const t of graph.tables){const tm=model.tables[t.id];if(!tm)continue;
    for(const c of t.columns){const cm=tm.columns[c.name];if(!cm)continue;
      if(model.profile.mode==="sharepoint"&&(cm.type??c.type)==="Text"&&(cm.options?.maxLength??255)>255)result.push({severity:"error",message:`${cm.displayName} : une ligne de texte est limitée à 255 caractères.`});
      if(cm.lookup){const target=tables.get(cm.lookup.targetTableId);
        if(cm.lookup.unresolved||!target)result.push({severity:"warning",message:`${tm.displayName} · ${cm.displayName} : Lookup à résoudre.`});
        else if(cm.lookup.displayColumn&&!validDisplayColumn(target,cm.lookup.displayColumn))result.push({severity:"warning",message:`${cm.displayName} : colonne affichée introuvable ou incompatible.`});
      }
      if(cm.options?.minimum!==undefined&&cm.options.maximum!==undefined&&cm.options.minimum>cm.options.maximum)result.push({severity:"error",message:`${cm.displayName} : le minimum dépasse le maximum.`});
      if(model.profile.mode==="dataverse"&&cm.lookup?.multiple)result.push({severity:"error",message:`${cm.displayName} : utilisez une relation N:N pour relier plusieurs enregistrements Dataverse.`});
    }
  }return result;
}
