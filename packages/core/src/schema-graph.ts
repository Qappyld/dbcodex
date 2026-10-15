export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  code?: string | number;
  location?: {
    start: { line: number; column: number };
    end?: { line: number; column: number };
  };
}

export interface SourceRange {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
}

export interface GraphColumn {
  displayName?: string;
  semanticType?: string;
  system?: boolean;
  lookup?: import("./project-model.js").ColumnModel["lookup"] | undefined;
  sourceRange?: SourceRange | undefined;
  id: string;
  name: string;
  type: string;
  primaryKey: boolean;
  nullable: boolean;
}

export interface GraphTable {
  displayName?: string;
  kind?: string;
  headerColor?: string;
  sourceRange?: SourceRange | undefined;
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
  kind?: "lookup" | "many-to-many";
  ownerColumnId?: string;
  sourceRange?: SourceRange | undefined;
  id: string;
  source: GraphRelationEnd;
  target: GraphRelationEnd;
}

export interface SchemaGraph {
  sourcePath: string;
  tables: GraphTable[];
  relations: GraphRelation[];
  tableGroups?: Array<{ id: string; name: string; tableIds: string[]; color?: string; sourceRange?: SourceRange | undefined }>;
  views?: Array<{ id: string; name: string; tableIds: string[]; sourceRange?: SourceRange | undefined }>;
}

export interface ParseResult {
  graph: SchemaGraph | null;
  diagnostics: Diagnostic[];
}
