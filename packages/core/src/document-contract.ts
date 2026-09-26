import type { Diagnostic, SchemaGraph } from "./schema-graph.js";
import type { LayoutDocument } from "./layout-store.js";

export interface RevisionSummary {
  id: string;
  createdAt: string;
  sourceHash: string;
  layoutHash: string;
  summary: string;
  label?: string;
  pinned: boolean;
}

export interface DocumentSnapshot {
  sourcePath: string;
  sourceText: string;
  sourceHash: string;
  graph: SchemaGraph | null;
  diagnostics: Diagnostic[];
  layout: LayoutDocument;
  layoutWarnings: string[];
  revisions: RevisionSummary[];
}

export interface DocumentDraft {
  sourcePath: string;
  sourceText: string;
  baseHash: string;
  layout: LayoutDocument;
  updatedAt: string;
}

export interface ValidationResult {
  sourcePath: string;
  sourceHash: string;
  graph: SchemaGraph | null;
  diagnostics: Diagnostic[];
}

export interface SaveDocumentInput {
  sourcePath: string;
  sourceText: string;
  expectedHash: string;
  layout: LayoutDocument;
  label?: string;
}

export interface SaveDocumentResult {
  sourcePath: string;
  sourceHash: string;
  graph: SchemaGraph;
  diagnostics: Diagnostic[];
  layout: LayoutDocument;
  revision: RevisionSummary;
}
