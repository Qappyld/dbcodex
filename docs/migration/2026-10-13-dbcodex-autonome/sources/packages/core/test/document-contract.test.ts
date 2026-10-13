import { describe, expect, it } from "vitest";
import { hashDocument } from "../src/document-hash.js";
import { emptyPresentation } from "../src/presentation.js";
import type {
  DbcdDraft,
  DbcdProjectSnapshot,
  DbcdRevisionSummary,
  SaveDbcdInput,
} from "../src/document-contract.js";
import type { DetailLevel } from "../src/presentation.js";

describe("hashDocument", () => {
  it("returns a stable sha256 digest and changes with the source", () => {
    const first = hashDocument("Table users { id int [pk] }");
    const second = hashDocument("Table users { id uuid [pk] }");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(hashDocument("Table users { id int [pk] }"));
    expect(second).not.toBe(first);
  });
});

describe("dbcd project contracts", () => {
  it("describes a generation-based project and draft", () => {
    const draft: DbcdDraft = {
      baseGeneration: 1,
      sourceText: "Table users { id int [pk] }",
      presentation: emptyPresentation(),
      updatedAt: "2026-09-26T00:00:00.000Z",
    };
    const revision: DbcdRevisionSummary = {
      id: "rev-1",
      parentId: null,
      createdAt: draft.updatedAt,
      sourceHash: hashDocument(draft.sourceText),
      presentationHash: "abc",
      summary: "Initial version",
      pinned: false,
    };
    const snapshot: DbcdProjectSnapshot = {
      projectPath: "project.dbcd",
      projectId: "project-1",
      generation: 1,
      currentRevisionId: revision.id,
      sourceText: draft.sourceText,
      sourceHash: revision.sourceHash,
      graph: null,
      diagnostics: [],
      presentation: draft.presentation,
      draft,
      revisions: [revision],
      readOnly: false,
    };
    expect(snapshot.generation).toBe(draft.baseGeneration);
    expect(snapshot.revisions[0]).toBe(revision);
  });
});

// These assignments are checked with `tsc` in addition to the runtime tests.
const validSave: SaveDbcdInput = {
  workspaceRoot: "/workspace",
  projectPath: "project.dbcd",
  expectedGeneration: 1,
  sourceText: "",
  presentation: emptyPresentation(),
};
void validSave;

// @ts-expect-error A detail level must be a supported literal.
const invalidDetail: DetailLevel = "summary";
void invalidDetail;

// @ts-expect-error Saves require an expected generation.
const missingGeneration: SaveDbcdInput = {
  workspaceRoot: "/workspace",
  projectPath: "project.dbcd",
  sourceText: "",
  presentation: emptyPresentation(),
};
void missingGeneration;

const pathBasedSave: SaveDbcdInput = {
  ...validSave,
  // @ts-expect-error The project contract does not accept a separate source path.
  sourcePath: "source.dbml",
};
void pathBasedSave;
