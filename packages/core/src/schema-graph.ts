export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
}

export interface GraphColumn {
  id: string;
  name: string;
  type: string;
  primaryKey: boolean;
  nullable: boolean;
}

export interface GraphTable {
  id: string;
  schema: string;
  name: string;
  columns: GraphColumn[];
}

export interface GraphRelationEnd {
  tableId: string;
  columnNames: string[];
  cardinality: string;
}

export interface GraphRelation {
  id: string;
  source: GraphRelationEnd;
  target: GraphRelationEnd;
}

export interface SchemaGraph {
  sourcePath: string;
  tables: GraphTable[];
  relations: GraphRelation[];
}

export interface ParseResult {
  graph: SchemaGraph | null;
  diagnostics: Diagnostic[];
}
