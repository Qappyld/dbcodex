import type { Diagnostic, SchemaGraph } from "./schema-graph.js";
import type { PresentationDocument } from "./presentation.js";

export interface DbcdRevisionSummary {
  id: string;
  parentId: string | null;
  createdAt: string;
  sourceHash: string;
  presentationHash: string;
  summary: string;
  label?: string;
  pinned: boolean;
}

export interface DbcdDraft {
  baseGeneration: number;
  sourceText: string;
  presentation: PresentationDocument;
  updatedAt: string;
}

export interface DbcdProjectSnapshot {
  projectPath: string;
  projectId: string;
  generation: number;
  currentRevisionId: string;
  sourceText: string;
  sourceHash: string;
  graph: SchemaGraph | null;
  diagnostics: Diagnostic[];
  presentation: PresentationDocument;
  draft: DbcdDraft | null;
  revisions: DbcdRevisionSummary[];
  readOnly: boolean;
}

export interface SaveDbcdInput {
  workspaceRoot: string;
  projectPath: string;
  expectedGeneration: number;
  sourceText: string;
  presentation: PresentationDocument;
  label?: string;
}
