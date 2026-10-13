# Editable DBML Workbench Foundation Implementation Plan

> **Superseded on 26 September 2026:** persistence through `.dbml` plus
> `.dbcodex/` sidecars was replaced by the single-file `.dbcd` design. Use
> [`2026-09-26-dbcd-workbench.md`](./2026-09-26-dbcd-workbench.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first vertical slice of the integrated dbcodex workbench: editable DBML, debounced validation, a React Flow diagram, explicit versioned saving, recoverable drafts, resizable panels, and fullscreen presentation.

**Architecture:** Start from the validated `codex/compatibility-spike` branch and preserve its core path security, MCP Apps bridge, parser, atomic sidecars, and packaging. Add pure document contracts and Node-backed draft/revision/save services in `@dbcodex/core`, expose app-only MCP tools for validation and persistence, and replace the minimal SVG UI with a CodeMirror/React Flow workbench controlled by one document-session hook.

**Tech Stack:** Node.js >=20.19.0, TypeScript 7.0.2, React 19.3.0, CodeMirror 6.0.2, React Flow 12.12.0, react-resizable-panels 4.13.3, MCP Apps 2.0.0, Vitest 5.0.2, Testing Library 16.3.3, esbuild 0.28.2.

## Global Constraints

- All DBML, layout, draft, and revision processing remains local; no network request may be introduced.
- The text DBML remains the functional source of truth.
- Invalid DBML cannot be saved; the diagram keeps the last valid graph.
- Text validation runs 300 ms after the latest edit.
- Saving is explicit through the button or `Ctrl+S` and creates one coherent local revision.
- Every write stays confined to a Codex workspace root and rejects absolute paths, traversal, symlinks, and junction escapes.
- Do not expose full DBML source or absolute paths in model-visible tool content or error messages.
- UI resources must continue to pass `npm run verify:offline-ui` with no remote dependency.
- Normal text contrast is at least 4.5:1, focus contrast at least 3:1, and interactive targets are at least 32 px.
- Respect `prefers-reduced-motion` and both light and dark host themes.
- Production code follows test-first RED/GREEN/REFACTOR cycles.

## Delivery Roadmap

This plan is milestone 1 of 4 and ends with a usable editable workbench.

1. **Foundation:** editable workbench, live validation, drafts, revisions, basic React Flow, fullscreen.
2. **Views and groups:** lossless text patching, `TableGroup`, `DiagramView`, inclusion rules, detail levels.
3. **Advanced diagram:** orthogonal editable routes, animated direction, search, minimap, auto-layout.
4. **History and hardening:** visual history/diff/restore, three-way conflicts, transaction recovery UI, accessibility and performance acceptance.

---

### Task 1: Integrate the validated compatibility prototype

**Files:**
- Merge from: `codex/compatibility-spike`
- Preserve: `docs/superpowers/specs/2026-09-25-dbcodex-workbench-design.md`
- Verify: `package.json`, `packages/core/**`, `packages/mcp/**`, `packages/ui/**`, `test/**`

**Interfaces:**
- Consumes: main commit containing the approved workbench specification.
- Produces: the TypeScript workspace and passing compatibility prototype on the implementation branch.

- [ ] **Step 1: Create the execution worktree and merge the prototype branch**

Run in the isolated implementation worktree:

```powershell
git merge --no-ff codex/compatibility-spike -m "merge: integrate Codex compatibility prototype"
```

Expected: a merge commit; the approved workbench specification remains present and the prototype source tree is added.

- [ ] **Step 2: Resolve documentation conflicts in favor of both histories**

If Git reports documentation conflicts, preserve the current workbench spec and the spike evidence. The resulting paths must include:

```text
docs/superpowers/specs/2026-09-25-dbcodex-workbench-design.md
docs/superpowers/specs/2026-09-25-codex-compatibility-spike-design.md
docs/evidence/codex-spike.md
```

Then complete the merge with:

```powershell
git add docs
git commit --no-edit
```

- [ ] **Step 3: Install the locked dependency graph**

Run:

```powershell
npm ci
```

Expected: exit 0 with the lockfile unchanged.

- [ ] **Step 4: Verify the inherited baseline before changing behavior**

Run:

```powershell
npm run build
npm run typecheck
npm test
npm run verify:offline-ui
npm run verify:mcp
git diff --check
```

Expected: all commands exit 0. If any inherited test fails, stop this plan and repair the baseline before adding features.

---

### Task 2: Define document, validation, draft, and save contracts

**Files:**
- Create: `packages/core/src/document-contract.ts`
- Create: `packages/core/src/document-hash.ts`
- Create: `packages/core/test/document-contract.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `SchemaGraph`, `Diagnostic`, and `LayoutDocument` from `@dbcodex/core`.
- Produces: `DocumentSnapshot`, `DocumentDraft`, `ValidationResult`, `SaveDocumentInput`, `SaveDocumentResult`, `RevisionSummary`, and `hashDocument(source: string): string`.

- [ ] **Step 1: Write failing contract and hashing tests**

Create `packages/core/test/document-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashDocument } from "../src/document-hash.js";

describe("hashDocument", () => {
  it("returns a stable sha256 digest and changes with the source", () => {
    const first = hashDocument("Table users { id int [pk] }");
    const second = hashDocument("Table users { id uuid [pk] }");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(hashDocument("Table users { id int [pk] }"));
    expect(second).not.toBe(first);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm test -- packages/core/test/document-contract.test.ts
```

Expected: FAIL because `document-hash.ts` does not exist.

- [ ] **Step 3: Add the pure shared contracts**

Create `packages/core/src/document-contract.ts`:

```ts
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
```

- [ ] **Step 4: Implement stable source hashing and exports**

Create `packages/core/src/document-hash.ts`:

```ts
import { createHash } from "node:crypto";

export function hashDocument(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./document-contract.js";
export * from "./document-hash.js";
```

- [ ] **Step 5: Verify GREEN and type safety**

Run:

```powershell
npm test -- packages/core/test/document-contract.test.ts
npm run typecheck
```

Expected: the new test passes and typecheck exits 0.

- [ ] **Step 6: Commit the document contracts**

```powershell
git add packages/core/src/document-contract.ts packages/core/src/document-hash.ts packages/core/src/index.ts packages/core/test/document-contract.test.ts
git commit -m "feat: define editable DBML document contracts"
```

---

### Task 3: Add immutable revisions and recoverable drafts

**Files:**
- Create: `packages/core/src/sidecar-policy.ts`
- Create: `packages/core/src/revision-store.ts`
- Create: `packages/core/src/draft-store.ts`
- Create: `packages/core/test/revision-store.test.ts`
- Create: `packages/core/test/draft-store.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: workspace root, workspace-relative DBML path, source text, `LayoutDocument`, and `RevisionSummary`.
- Produces: `prepareRevision`, `commitRevision`, `listRevisions`, `pruneRevisions`, `saveDraft`, `loadDraft`, and `deleteDraft`.

- [ ] **Step 1: Write failing revision-store tests**

Create `packages/core/test/revision-store.test.ts` with these concrete assertions:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitRevision, listRevisions, prepareRevision } from "../src/revision-store.js";

describe("revision store", () => {
  it("stores a compressed immutable payload and publishes it only on commit", async () => {
    const root = await mkdtemp(join(tmpdir(), "dbcodex-revision-"));
    const prepared = await prepareRevision(root, "schema.dbml", {
      sourceText: "Table users { id int [pk] }",
      layout: { version: 1, source: "schema.dbml", views: {} },
      sourceHash: "a".repeat(64),
      layoutHash: "b".repeat(64),
      summary: "1 table added",
      createdAt: "2026-09-25T12:00:00.000Z",
    });

    expect(await listRevisions(root, "schema.dbml")).toEqual([]);
    const committed = await commitRevision(root, "schema.dbml", prepared);
    expect(await listRevisions(root, "schema.dbml")).toEqual([committed]);
    expect(await readFile(prepared.payloadPath)).not.toHaveLength(0);
  });
});
```

Add separate failing tests before implementation for the 500-version limit, the 90-day cutoff, preservation of pinned revisions, rejection of a malformed index without mutation, and sidecar escape rejection. A malformed index must throw `RevisionStoreError` with code `INVALID_INDEX`.

- [ ] **Step 2: Write failing draft-store tests**

Create `packages/core/test/draft-store.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deleteDraft, loadDraft, saveDraft } from "../src/draft-store.js";

describe("draft store", () => {
  it("round-trips and deletes a local document draft", async () => {
    const root = await mkdtemp(join(tmpdir(), "dbcodex-draft-"));
    const draft = {
      sourcePath: "schema.dbml",
      sourceText: "Table users { id int [pk] }",
      baseHash: "a".repeat(64),
      layout: { version: 1 as const, source: "schema.dbml", views: {} },
      updatedAt: "2026-09-25T12:00:00.000Z",
    };

    await saveDraft(root, draft);
    expect(await loadDraft(root, "schema.dbml")).toEqual(draft);
    await deleteDraft(root, "schema.dbml");
    expect(await loadDraft(root, "schema.dbml")).toBeNull();
  });
});
```

- [ ] **Step 3: Run both tests and verify RED**

Run:

```powershell
npm test -- packages/core/test/revision-store.test.ts packages/core/test/draft-store.test.ts
```

Expected: FAIL because both stores are missing.

- [ ] **Step 4: Implement the draft store with confined atomic writes**

First extract the baseline layout path confinement into `packages/core/src/sidecar-policy.ts`. Export this exact shared helper and keep the existing `lstat` walk that rejects symbolic links, junctions, and non-directory parents:

```ts
export type SidecarNamespace = "layouts" | "drafts" | "history" | "transactions";

export function resolveWorkspaceSidecar(
  workspaceRoot: string,
  namespace: SidecarNamespace,
  sourcePath: string,
  suffix: string,
): Promise<string>;
```

`resolveWorkspaceSidecar` normalizes a workspace-relative `.dbml` source, builds `.dbcodex/<namespace>/<sourcePath><suffix>`, confirms the result stays below the canonical workspace root, and walks every existing path segment with `lstat`. Move the inherited layout tests to this shared helper before changing layout behavior.

Then implement `packages/core/src/draft-store.ts` with this public surface:

```ts
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import writeFileAtomic from "write-file-atomic";
import type { DocumentDraft } from "./document-contract.js";
import { resolveWorkspaceSidecar } from "./sidecar-policy.js";

async function draftPath(root: string, sourcePath: string): Promise<string> {
  return resolveWorkspaceSidecar(root, "drafts", sourcePath, ".draft.json");
}

export async function saveDraft(root: string, draft: DocumentDraft): Promise<void> {
  const target = await draftPath(root, draft.sourcePath);
  await mkdir(dirname(target), { recursive: true });
  await draftPath(root, draft.sourcePath);
  await writeFileAtomic(target, `${JSON.stringify(draft, null, 2)}\n`, {
    encoding: "utf8",
  });
}

export async function loadDraft(root: string, sourcePath: string): Promise<DocumentDraft | null> {
  const target = await draftPath(root, sourcePath);
  try {
    return JSON.parse(await readFile(target, "utf8")) as DocumentDraft;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteDraft(root: string, sourcePath: string): Promise<void> {
  const target = await draftPath(root, sourcePath);
  await rm(target, { force: true });
}
```

Refactor `layout-store.ts` to use `resolveWorkspaceSidecar(root, "layouts", source, ".layout.json")`; do not duplicate path checks.

- [ ] **Step 5: Implement the revision store**

`packages/core/src/revision-store.ts` must:

- serialize `{ sourceText, layout }` as UTF-8 JSON;
- gzip it with `node:zlib` `gzip`;
- derive the immutable revision id from `createdAt`, `sourceHash`, and `layoutHash`;
- write payloads below `.dbcodex/history/<sourcePath>/`;
- keep `index.json` sorted newest first;
- publish a revision only in `commitRevision`;
- reject duplicate ids with different hashes;
- prune unpinned revisions older than 90 days or beyond the newest 500.

Use these exact exported types and signatures:

```ts
export interface RevisionPayloadInput {
  sourceText: string;
  layout: LayoutDocument;
  sourceHash: string;
  layoutHash: string;
  summary: string;
  createdAt: string;
  label?: string;
}

export interface PreparedRevision {
  summary: RevisionSummary;
  payloadPath: string;
}

export function prepareRevision(
  root: string,
  sourcePath: string,
  input: RevisionPayloadInput,
): Promise<PreparedRevision>;

export function commitRevision(
  root: string,
  sourcePath: string,
  prepared: PreparedRevision,
): Promise<RevisionSummary>;

export function listRevisions(
  root: string,
  sourcePath: string,
): Promise<RevisionSummary[]>;

export function pruneRevisions(
  root: string,
  sourcePath: string,
  now?: Date,
): Promise<RevisionSummary[]>;
```

- [ ] **Step 6: Export the stores and ignore local history**

Append to `packages/core/src/index.ts`:

```ts
export * from "./draft-store.js";
export * from "./revision-store.js";
```

Add to `.gitignore` while keeping layouts trackable:

```gitignore
.dbcodex/drafts/
.dbcodex/history/
.dbcodex/transactions/
```

- [ ] **Step 7: Verify GREEN, confinement, and retention**

Run:

```powershell
npm test -- packages/core/test/revision-store.test.ts packages/core/test/draft-store.test.ts packages/core/test/path-policy.test.ts
npm run typecheck
```

Expected: all selected tests pass, including retention, pinning, malformed-index, and confinement cases.

- [ ] **Step 8: Commit revision and draft storage**

```powershell
git add .gitignore packages/core
git commit -m "feat: store DBML drafts and immutable revisions"
```

---

### Task 4: Implement validation and transactional document saving

**Files:**
- Create: `packages/core/src/document-service.ts`
- Create: `packages/core/src/save-transaction.ts`
- Create: `packages/core/test/document-service.test.ts`
- Create: `packages/core/test/save-transaction.test.ts`
- Modify: `packages/core/src/layout-store.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `parseDbml`, `hashDocument`, `resolveWorkspaceDbml`, draft/revision stores, and `LayoutDocument`.
- Produces: `validateDocument`, `openDocument`, `saveDocument`, `saveDocumentDraft`, and `DocumentConflictError`.

- [ ] **Step 1: Write failing validation and conflict tests**

Create `packages/core/test/document-service.test.ts` covering these behaviors with a temporary workspace:

```ts
it("validates an in-memory draft without writing it", async () => {
  const result = await validateDocument("schema.dbml", "Table users { id int [pk] }");
  expect(result.graph?.tables).toHaveLength(1);
  expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/);
});

it("rejects saving invalid DBML", async () => {
  await expect(saveDocument(root, {
    sourcePath: "schema.dbml",
    sourceText: "Table users {",
    expectedHash: hashDocument(original),
    layout,
  })).rejects.toMatchObject({ code: "INVALID_DBML" });
});

it("detects an external file change before writing", async () => {
  await writeFile(join(root, "schema.dbml"), changedExternally);
  await expect(saveDocument(root, inputFromOriginal)).rejects.toBeInstanceOf(DocumentConflictError);
});
```

- [ ] **Step 2: Run the document-service tests and verify RED**

Run:

```powershell
npm test -- packages/core/test/document-service.test.ts
```

Expected: FAIL because `document-service.ts` is missing.

- [ ] **Step 3: Implement validation and open operations**

Create `packages/core/src/document-service.ts` with these exact functions:

```ts
export async function validateDocument(
  sourcePath: string,
  sourceText: string,
): Promise<ValidationResult> {
  const parsed = parseDbml(sourceText, sourcePath);
  return {
    sourcePath,
    sourceHash: hashDocument(sourceText),
    graph: parsed.graph,
    diagnostics: parsed.diagnostics,
  };
}

export async function openDocument(
  root: string,
  sourcePath: string,
): Promise<{ snapshot: DocumentSnapshot; draft: DocumentDraft | null }> {
  const resolved = await resolveWorkspaceDbml(root, sourcePath);
  const sourceText = await readFile(resolved.absolutePath, "utf8");
  const parsed = await validateDocument(resolved.relativePath, sourceText);
  const layout = await loadLayout(root, resolved.relativePath);
  return {
    snapshot: {
      sourcePath: resolved.relativePath,
      sourceText,
      sourceHash: parsed.sourceHash,
      graph: parsed.graph,
      diagnostics: parsed.diagnostics,
      layout: layout.document,
      layoutWarnings: layout.warnings,
      revisions: await listRevisions(root, resolved.relativePath),
    },
    draft: await loadDraft(root, resolved.relativePath),
  };
}
```

Define `DocumentServiceError` with codes `INVALID_DBML`, `CONFLICT`, and `WRITE_FAILED`; expose only sanitized messages.

- [ ] **Step 4: Write failing save-transaction recovery tests**

Create `packages/core/test/save-transaction.test.ts`. Inject a failure after the DBML replacement and assert:

1. `.dbcodex/transactions/<document>.json` remains;
2. reopening calls `recoverDocumentTransaction`;
3. the layout and revision index are brought to the same new state;
4. the journal is then removed.

Use an injected interface instead of mocking Node modules:

```ts
export interface SaveIo {
  writeSource(path: string, source: string): Promise<void>;
  writeLayout(root: string, layout: LayoutDocument): Promise<void>;
  commitRevision(root: string, sourcePath: string, prepared: PreparedRevision): Promise<RevisionSummary>;
}
```

- [ ] **Step 5: Implement the transaction journal and save operation**

Create `packages/core/src/save-transaction.ts` with:

```ts
export interface SaveTransactionRecord {
  version: 1;
  sourcePath: string;
  expectedHash: string;
  nextHash: string;
  nextSource: string;
  nextLayout: LayoutDocument;
  preparedRevision: PreparedRevision;
  phase: "prepared" | "source-written" | "layout-written" | "committed";
}

export function runSaveTransaction(
  root: string,
  record: SaveTransactionRecord,
  io?: SaveIo,
): Promise<RevisionSummary>;

export function recoverDocumentTransaction(
  root: string,
  sourcePath: string,
  io?: SaveIo,
): Promise<void>;
```

Each phase update uses `write-file-atomic`. Repeating a phase must be safe. The journal is deleted only after the revision index is committed.

Implement `saveDocument` in `document-service.ts` as:

```ts
export async function saveDocument(
  root: string,
  input: SaveDocumentInput,
): Promise<SaveDocumentResult> {
  const resolved = await resolveWorkspaceDbml(root, input.sourcePath);
  await recoverDocumentTransaction(root, resolved.relativePath);
  const currentSource = await readFile(resolved.absolutePath, "utf8");
  if (hashDocument(currentSource) !== input.expectedHash) {
    throw new DocumentConflictError();
  }
  const validation = await validateDocument(resolved.relativePath, input.sourceText);
  if (!validation.graph) {
    throw new DocumentServiceError("INVALID_DBML", "Invalid DBML cannot be saved.");
  }
  const preparedRevision = await prepareRevision(root, resolved.relativePath, {
    sourceText: input.sourceText,
    layout: input.layout,
    sourceHash: validation.sourceHash,
    layoutHash: hashDocument(JSON.stringify(input.layout)),
    summary: summarizeDocumentChange(currentSource, input.sourceText),
    createdAt: new Date().toISOString(),
    ...(input.label ? { label: input.label } : {}),
  });
  const revision = await runSaveTransaction(root, {
    version: 1,
    sourcePath: resolved.relativePath,
    expectedHash: input.expectedHash,
    nextHash: validation.sourceHash,
    nextSource: input.sourceText,
    nextLayout: input.layout,
    preparedRevision,
    phase: "prepared",
  });
  await deleteDraft(root, resolved.relativePath);
  return {
    sourcePath: resolved.relativePath,
    sourceHash: validation.sourceHash,
    graph: validation.graph,
    diagnostics: validation.diagnostics,
    layout: input.layout,
    revision,
  };
}
```

- [ ] **Step 6: Export layout-document atomic writing**

Refactor `packages/core/src/layout-store.ts` so the existing serializer is available as:

```ts
export function saveLayoutDocument(
  workspaceRoot: string,
  document: LayoutDocument,
): Promise<void>;
```

Keep `saveNodePosition` implemented in terms of this function and preserve all existing concurrency tests.

- [ ] **Step 7: Verify RED/GREEN recovery and full core tests**

Run:

```powershell
npm test -- packages/core/test/document-service.test.ts packages/core/test/save-transaction.test.ts
npm test -- packages/core
npm run typecheck
```

Expected: every core test passes, including injected failure recovery and inherited layout concurrency tests.

- [ ] **Step 8: Commit the document service**

```powershell
git add packages/core
git commit -m "feat: save versioned DBML documents transactionally"
```

---

### Task 5: Expose app-only validation, drafts, and document saving over MCP

**Files:**
- Modify: `packages/mcp/src/handlers.ts`
- Modify: `packages/mcp/src/create-server.ts`
- Modify: `packages/mcp/test/handlers.test.ts`
- Modify: `packages/mcp/test/server.test.ts`
- Modify: `packages/mcp/test/ui-resource.test.ts`

**Interfaces:**
- Consumes: `openDocument`, `validateDocument`, `saveDocument`, and `saveDraft`.
- Produces MCP tools: `open_dbml`, `validate_dbml`, `save_dbml_draft`, `discard_dbml_draft`, and `save_dbml_document`.

- [ ] **Step 1: Write failing handler tests**

Add tests that assert:

```ts
const opened = await handlers.openDbml({ path: "schema.dbml" });
expect(opened.structuredContent).not.toHaveProperty("sourceText");
expect(opened._meta).toMatchObject({
  document: {
    sourceText: expect.stringContaining("Table users"),
    sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  },
});

const invalid = await handlers.validateDbml({ path: "schema.dbml", sourceText: "Table users {" });
expect(invalid.structuredContent.graph).toBeNull();
expect(invalid.structuredContent.diagnostics.length).toBeGreaterThan(0);

const saved = await handlers.saveDbmlDocument({
  path: "schema.dbml",
  sourceText: validChangedSource,
  expectedHash: originalHash,
  layout,
});
expect(saved.structuredContent.revision.id).toBeTruthy();

await handlers.discardDbmlDraft({ path: "schema.dbml" });
expect(await loadDraft(root, "schema.dbml")).toBeNull();
```

- [ ] **Step 2: Run MCP handler tests and verify RED**

Run:

```powershell
npm test -- packages/mcp/test/handlers.test.ts packages/mcp/test/server.test.ts
```

Expected: FAIL because the new handlers and definitions are absent.

- [ ] **Step 3: Implement sanitized handlers**

Extend `createHandlers` with:

```ts
validateDbml: async ({ path, sourceText }: { path: string; sourceText: string }) => {
  const { resolved } = await resolveFromWorkspaceRoots(roots, path);
  const result = await validateDocument(resolved.relativePath, sourceText);
  return { structuredContent: result, content: [{ type: "text" as const, text: result.graph ? "Valid DBML draft." : "Invalid DBML draft." }] };
},

saveDbmlDraft: async (input: { path: string; sourceText: string; baseHash: string; layout: LayoutDocument }) => {
  const { workspaceRoot, resolved } = await resolveFromWorkspaceRoots(roots, input.path);
  await saveDraft(workspaceRoot, {
    sourcePath: resolved.relativePath,
    sourceText: input.sourceText,
    baseHash: input.baseHash,
    layout: input.layout,
    updatedAt: new Date().toISOString(),
  });
  return { structuredContent: { saved: true }, content: [{ type: "text" as const, text: "Draft saved locally." }] };
},

discardDbmlDraft: async ({ path }: { path: string }) => {
  const { workspaceRoot, resolved } = await resolveFromWorkspaceRoots(roots, path);
  await deleteDraft(workspaceRoot, resolved.relativePath);
  return { structuredContent: { discarded: true }, content: [{ type: "text" as const, text: "Draft discarded." }] };
},

saveDbmlDocument: async (input: SaveDbmlDocumentInput) => {
  const { workspaceRoot, resolved } = await resolveFromWorkspaceRoots(roots, input.path);
  const result = await saveDocument(workspaceRoot, { ...input, sourcePath: resolved.relativePath });
  return { structuredContent: result, content: [{ type: "text" as const, text: `Saved ${result.sourcePath} as revision ${result.revision.id}.` }] };
},
```

Return raw source and draft only in result `_meta.document`; never place them in `structuredContent` or `content`.

- [ ] **Step 4: Register strict app-only tool definitions**

Add Zod schemas using closed objects. Set `_meta.ui.visibility` to `['app']` for all four UI-initiated tools. Use annotations:

```ts
validate: {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
},
draft: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
},
discardDraft: {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
},
saveDocument: {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
},
```

Keep `save_layout` registered for backward compatibility but remove its use from the new UI.

- [ ] **Step 5: Declare fullscreen support on the UI resource**

Extend resource metadata:

```ts
_meta: {
  ui: {
    prefersBorder: false,
    csp: { connectDomains: [], resourceDomains: [] },
  },
  "openai/ui": {
    availableDisplayModes: ["inline", "fullscreen"],
  },
},
```

Add a resource test that asserts both modes and the empty CSP domain lists.

- [ ] **Step 6: Verify MCP GREEN and source privacy**

Run:

```powershell
npm test -- packages/mcp
npm run typecheck
npm run build --workspace @dbcodex/mcp
npm run verify:mcp
```

Expected: all tests pass; model-visible content contains neither raw source nor absolute paths.

- [ ] **Step 7: Commit the editable-document MCP surface**

```powershell
git add packages/mcp
git commit -m "feat: expose editable DBML document tools"
```

---

### Task 6: Build the CodeMirror editor and document session

**Files:**
- Modify: `packages/ui/package.json`
- Create: `packages/ui/src/tool-result.ts`
- Create: `packages/ui/src/use-document-session.ts`
- Create: `packages/ui/src/DbmlEditor.tsx`
- Create: `packages/ui/src/dbml-language.ts`
- Create: `packages/ui/test/tool-result.test.ts`
- Create: `packages/ui/test/use-document-session.test.tsx`
- Create: `packages/ui/test/DbmlEditor.test.tsx`
- Modify: `packages/ui/src/bridge.ts`

**Interfaces:**
- Consumes: hidden open-result metadata, app-only MCP tools, `SchemaGraph`, diagnostics, and layout.
- Produces: `useDocumentSession(initial, bridge)`, `DbmlEditor`, and safe tool-result decoders.

- [ ] **Step 1: Add exact UI dependencies**

Run:

```powershell
npm install --workspace @dbcodex/ui --save-exact @xyflow/react@12.12.0 codemirror@6.0.2 @codemirror/state@6.7.6 @codemirror/view@6.43.13 @codemirror/language@6.12.4 @codemirror/lint@6.9.7 react-resizable-panels@4.13.3
```

Expected: `packages/ui/package.json` and `package-lock.json` change; no remote runtime resource is added.

- [ ] **Step 2: Write failing safe-decoder tests**

Create `packages/ui/test/tool-result.test.ts` and assert that `decodeOpenResult`:

- reads graph/layout/diagnostics from `structuredContent`;
- reads source, source hash, and optional draft from `_meta.document`;
- returns `null` when any required field has the wrong type;
- never falls back to parsing model-visible text.

- [ ] **Step 3: Implement explicit result decoding**

Create `packages/ui/src/tool-result.ts` with Zod schemas or equivalent exact runtime guards. Export:

```ts
export interface OpenDocumentUiResult {
  snapshot: DocumentSnapshot;
  draft: DocumentDraft | null;
}

export function decodeOpenResult(value: unknown): OpenDocumentUiResult | null;
export function decodeValidationResult(value: unknown): ValidationResult | null;
export function decodeSaveResult(value: unknown): SaveDocumentResult | null;
```

Update `bridge.callTool` to return the full MCP result envelope rather than only `structuredContent`.

- [ ] **Step 4: Write the document-session hook tests before implementation**

Using fake timers and a fake bridge, assert:

```ts
const validGraph = {
  sourcePath: "schema.dbml",
  tables: [{ id: "public.users", schema: "public", name: "users", columns: [] }],
  relations: [],
};

function opened(): OpenDocumentUiResult {
  return {
    snapshot: {
      sourcePath: "schema.dbml",
      sourceText: "Table users { id int [pk] }",
      sourceHash: "a".repeat(64),
      graph: validGraph,
      diagnostics: [],
      layout: { version: 1, source: "schema.dbml", views: {} },
      layoutWarnings: [],
      revisions: [],
    },
    draft: null,
  };
}

it("validates once 300 ms after the latest edit", async () => {
  vi.useFakeTimers();
  const callTool = vi.fn().mockResolvedValue({ structuredContent: {
    sourcePath: "schema.dbml", sourceHash: "b".repeat(64), graph: validGraph, diagnostics: [],
  } });
  const { result } = renderHook(() => useDocumentSession(opened(), { callTool }));

  act(() => result.current.setSourceText("Table users { id uuid [pk] }"));
  act(() => result.current.setSourceText("Table users { id text [pk] }"));
  await act(async () => vi.advanceTimersByTimeAsync(299));
  expect(callTool).not.toHaveBeenCalledWith("validate_dbml", expect.anything());
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(callTool).toHaveBeenCalledTimes(1);
  expect(callTool).toHaveBeenCalledWith("validate_dbml", expect.objectContaining({
    sourceText: "Table users { id text [pk] }",
  }));
});

it("keeps the last valid graph and disables save when validation fails", async () => {
  vi.useFakeTimers();
  const callTool = vi.fn().mockResolvedValue({ structuredContent: {
    sourcePath: "schema.dbml", sourceHash: "c".repeat(64), graph: null,
    diagnostics: [{ severity: "error", message: "Expected }" }],
  } });
  const { result } = renderHook(() => useDocumentSession(opened(), { callTool }));

  act(() => result.current.setSourceText("Table users {"));
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(result.current.graph).toEqual(validGraph);
  expect(result.current.canSave).toBe(false);
  expect(result.current.diagnostics[0]?.message).toBe("Expected }");
});

it("persists a draft and clears dirty state after an explicit save", async () => {
  vi.useFakeTimers();
  const nextHash = "d".repeat(64);
  const callTool = vi.fn(async (name: string) => {
    if (name === "validate_dbml") {
      return { structuredContent: { sourcePath: "schema.dbml", sourceHash: nextHash, graph: validGraph, diagnostics: [] } };
    }
    if (name === "save_dbml_draft") return { structuredContent: { saved: true } };
    if (name === "save_dbml_document") {
      return { structuredContent: {
        sourcePath: "schema.dbml", sourceHash: nextHash, graph: validGraph, diagnostics: [],
        layout: opened().snapshot.layout,
        revision: { id: "revision-1", createdAt: "2026-09-25T12:00:00.000Z", sourceHash: nextHash,
          layoutHash: "e".repeat(64), summary: "type changed", pinned: false },
      } };
    }
    throw new Error(`Unexpected tool ${name}`);
  });
  const { result } = renderHook(() => useDocumentSession(opened(), { callTool }));

  act(() => result.current.setSourceText("Table users { id uuid [pk] }"));
  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  expect(callTool).toHaveBeenCalledWith("save_dbml_draft", expect.anything());
  await act(async () => result.current.save());
  expect(result.current.sourceHash).toBe(nextHash);
  expect(result.current.dirty).toBe(false);
});
```

Run and observe RED:

```powershell
npm test -- packages/ui/test/use-document-session.test.tsx
```

- [ ] **Step 5: Implement `useDocumentSession`**

Use this public interface:

```ts
export interface DocumentSessionState {
  sourceText: string;
  sourceHash: string;
  graph: SchemaGraph | null;
  diagnostics: Diagnostic[];
  layout: LayoutDocument;
  dirty: boolean;
  validating: boolean;
  saving: boolean;
  canSave: boolean;
  saveError: string | null;
}

export interface DocumentSessionActions {
  setSourceText(sourceText: string): void;
  setLayout(layout: LayoutDocument): void;
  save(label?: string): Promise<void>;
  recoverDraft(): void;
  discardDraft(): Promise<void>;
}

export function useDocumentSession(
  opened: OpenDocumentUiResult,
  bridge: Pick<McpAppsBridge, "callTool">,
): DocumentSessionState & DocumentSessionActions;
```

Use one 300 ms validation timer and one 1,000 ms draft timer. Cancel stale validation responses with a monotonically increasing request sequence. Never replace a non-null `graph` when validation returns `graph: null`; an initially invalid file keeps `graph: null` and shows an empty diagram state.

- [ ] **Step 6: Write the editor component tests**

Test that the editor:

- renders the initial source and line numbers;
- calls `onChange` with the complete document;
- maps diagnostics to CodeMirror lint markers;
- executes `onSave` on `Ctrl+S` and prevents the browser default;
- remains editable when the diagram contains the last valid graph.

- [ ] **Step 7: Implement DBML highlighting and `DbmlEditor`**

Create a small CodeMirror `StreamLanguage` in `dbml-language.ts` that recognizes DBML block keywords, settings, comments, strings, numbers, types, and relation operators. The component interface is:

```ts
export interface DbmlEditorProps {
  value: string;
  diagnostics: Diagnostic[];
  onChange(value: string): void;
  onSave(): void;
}

export function DbmlEditor(props: DbmlEditorProps): JSX.Element;
```

Create and destroy the `EditorView` in a React effect. Reconfigure lint diagnostics without recreating the editor. Use `basicSetup`, the DBML language extension, `linter`, and a save keymap.

- [ ] **Step 8: Verify editor/session GREEN**

Run:

```powershell
npm test -- packages/ui/test/tool-result.test.ts packages/ui/test/use-document-session.test.tsx packages/ui/test/DbmlEditor.test.tsx
npm run typecheck
```

Expected: all selected tests pass with no React act warnings.

- [ ] **Step 9: Commit the editor and session**

```powershell
git add packages/ui package-lock.json
git commit -m "feat: add live DBML editing session"
```

---

### Task 7: Replace the minimal diagram with the responsive workbench shell

**Files:**
- Create: `packages/ui/src/WorkbenchApp.tsx`
- Create: `packages/ui/src/DiagramCanvas.tsx`
- Create: `packages/ui/src/WorkbenchToolbar.tsx`
- Create: `packages/ui/src/InspectorPanel.tsx`
- Create: `packages/ui/src/fullscreen.ts`
- Create: `packages/ui/test/WorkbenchApp.test.tsx`
- Create: `packages/ui/test/DiagramCanvas.test.tsx`
- Modify: `packages/ui/src/index.tsx`
- Modify: `packages/ui/src/styles.css`
- Delete: `packages/ui/src/DiagramApp.tsx`
- Replace: `packages/ui/test/DiagramApp.test.tsx`

**Interfaces:**
- Consumes: `useDocumentSession`, `DbmlEditor`, source-hidden open result, React Flow nodes/edges, and host fullscreen capability.
- Produces: the three-panel inline/fullscreen workbench and a basic editable layout saved only through document save.

- [ ] **Step 1: Write failing basic diagram tests**

Test `DiagramCanvas` with three tables and two relations. Assert:

- all tables are accessible by `role="group"` and name;
- relations render behind nodes;
- pointer and keyboard movement update the in-memory layout callback;
- no MCP tool is called directly by the canvas;
- fit-view and zoom controls have accessible labels.

- [ ] **Step 2: Implement controlled React Flow nodes and edges**

Use these interfaces:

```ts
export interface DiagramCanvasProps {
  graph: SchemaGraph;
  layout: LayoutDocument;
  onLayoutChange(layout: LayoutDocument): void;
}

export function DiagramCanvas({ graph, layout, onLayoutChange }: DiagramCanvasProps): JSX.Element;
```

Map each table to a custom React Flow node keyed by stable `table.id`. Map relations to non-connectable edges. On node movement, update `layout.views["View All"].nodes[table.id]` in memory. Include `Background` and accessible `Controls`; defer minimap and custom routing to milestone 3.

When the session graph is null, `WorkbenchApp` renders a diagram empty state with the current diagnostics instead of mounting `DiagramCanvas`.

- [ ] **Step 3: Write failing workbench interaction tests**

Render an opened document and assert:

- editor, diagram, and inspector are present;
- panel collapse buttons are keyboard operable;
- dirty valid edits enable Save;
- invalid edits show diagnostics and disable Save while the previous graph remains;
- `Ctrl+S` triggers exactly one `save_dbml_document` call;
- a returned save error remains visible and the draft stays dirty;
- a recoverable draft offers Recover and Discard actions;
- fullscreen requests preserve editor text and selected table.

- [ ] **Step 4: Implement fullscreen feature detection**

Create `packages/ui/src/fullscreen.ts`:

```ts
declare global {
  interface Window {
    openai?: {
      requestDisplayMode?(input: { mode: "inline" | "fullscreen" }): Promise<unknown>;
      displayMode?: "inline" | "fullscreen" | "pip";
    };
  }
}

export async function requestFullscreen(): Promise<boolean> {
  const request = window.openai?.requestDisplayMode;
  if (!request) return false;
  await request({ mode: "fullscreen" });
  return true;
}
```

The toolbar hides or disables the command with an explanatory label when the capability is unavailable.

- [ ] **Step 5: Implement the three-panel shell**

`WorkbenchApp` uses `Group`, `Panel`, and `Separator` from `react-resizable-panels`:

```tsx
<main className="workbench-shell">
  <WorkbenchToolbar session={session} onFullscreen={requestFullscreen} />
  <Group orientation="horizontal" className="workbench-panels">
    <Panel defaultSize="28%" minSize="18%" collapsible>
      <DbmlEditor value={session.sourceText} diagnostics={session.diagnostics}
        onChange={session.setSourceText} onSave={() => void session.save()} />
    </Panel>
    <Separator className="panel-separator" />
    <Panel defaultSize="54%" minSize="32%">
      <DiagramCanvas graph={session.graph} layout={session.layout} onLayoutChange={session.setLayout} />
    </Panel>
    <Separator className="panel-separator" />
    <Panel defaultSize="18%" minSize="14%" collapsible>
      <InspectorPanel graph={session.graph} />
    </Panel>
  </Group>
</main>
```

Persist panel sizes in `window.openai.widgetState` when available, otherwise in component state for the mounted session. Do not use browser `localStorage` for document content.

- [ ] **Step 6: Wire the MCP notification to the workbench**

Replace `DiagramApp` rendering in `index.tsx` with decoded open data and `WorkbenchApp`. Show three explicit states: waiting, sanitized parse failure, and ready. Raw source may only come from hidden result metadata.

- [ ] **Step 7: Apply accessible production styling**

Update `styles.css` with host-aware variables, 32 px controls, visible focus, resizable separators, compact widths, CodeMirror height containment, and a full-height React Flow canvas. Avoid gradients and remote assets. Add:

```css
.workbench-shell { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 320px; height: min(78vh, 900px); }
.workbench-shell[data-display-mode="fullscreen"] { height: 100dvh; }
.workbench-panels { min-height: 420px; }
.panel-separator { width: 4px; background: var(--dbc-border); }
.panel-separator:focus-visible { outline: 3px solid var(--dbc-accent); outline-offset: -1px; }
.diagram-canvas, .cm-editor { height: 100%; min-height: 0; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; } }
```

- [ ] **Step 8: Verify the complete UI GREEN**

Run:

```powershell
npm test -- packages/ui
npm run typecheck
npm run build --workspace @dbcodex/ui
npm run verify:offline-ui
```

Expected: all UI tests pass, typecheck/build exit 0, and the offline verifier reports no remote dependencies.

- [ ] **Step 9: Commit the workbench shell**

```powershell
git add packages/ui package-lock.json
git commit -m "feat: render the editable DBML workbench"
```

---

### Task 8: Complete the milestone acceptance gate

**Files:**
- Modify: `README.md`
- Create: `docs/evidence/editable-workbench-foundation.md`
- Modify: `docs/decisions.md`
- Modify: `skills/dbcodex/SKILL.md`

**Interfaces:**
- Consumes: the built plugin and `fixtures/demo-shop.dbml`.
- Produces: reproducible automated and Codex desktop evidence for milestone 1.

- [ ] **Step 1: Update user and skill documentation**

Document:

- opening a workspace-relative DBML file;
- editing and the 300 ms validation behavior;
- explicit versioned saving;
- recoverable drafts;
- inline/fullscreen workbench modes;
- local-only storage paths;
- the need to create a new Codex task after plugin reinstall.

The skill must continue to forbid speculative layout writes and network transmission.

- [ ] **Step 2: Run the complete clean automated gate**

Run:

```powershell
npm ci
npm run build
npm run typecheck
npm test
npm run verify:offline-ui
npm run verify:mcp
git diff --check
```

Expected: every command exits 0, with zero failed tests and no remote UI dependency.

- [ ] **Step 3: Reinstall the local plugin build**

Run the repository’s documented plugin refresh command, then start a new Codex desktop task rooted in this repository. Do not test the stale plugin cache from the current task.

- [ ] **Step 4: Execute the manual Codex acceptance path**

Open `fixtures/demo-shop.dbml` and record evidence for:

1. three-panel workbench renders inline;
2. fullscreen opens and returns without state loss;
3. valid edit updates the diagram after 300 ms;
4. invalid edit preserves the last valid graph and disables Save;
5. valid `Ctrl+S` updates the file, layout, and one revision;
6. closing with an unsaved draft offers recovery after reopening;
7. moving a table remains a draft until explicit save;
8. no component network request occurs.

- [ ] **Step 5: Record evidence without overstating unsupported behavior**

Create `docs/evidence/editable-workbench-foundation.md` with environment versions, command outputs, observed results, latency measurements, network observation, and a PASS/FAIL verdict. Any unexecuted manual step keeps the milestone verdict at FAIL.

- [ ] **Step 6: Commit milestone documentation**

```powershell
git add README.md docs skills
git commit -m "docs: record editable workbench foundation evidence"
```

## Final Verification

- [ ] The implementation branch contains the compatibility prototype and approved workbench spec.
- [ ] Every new production behavior was preceded by a failing focused test.
- [ ] `npm ci`, build, typecheck, full tests, MCP verification, and offline verification all exit 0.
- [ ] Model-visible outputs contain no raw DBML source or absolute path.
- [ ] Invalid text cannot be saved and does not replace the last valid diagram.
- [ ] One explicit save creates exactly one coherent revision.
- [ ] Draft recovery works after closing and reopening.
- [ ] Inline/fullscreen transitions preserve session state in Codex desktop.
- [ ] `git diff --check` reports no whitespace errors.
- [ ] The evidence verdict matches the observed desktop behavior.
