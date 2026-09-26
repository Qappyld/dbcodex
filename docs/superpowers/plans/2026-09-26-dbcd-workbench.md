# Single-File `.dbcd` Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an editable Codex DBML workbench whose DBML, views, presentation, recoverable draft, and immutable save history live in one workspace-confined `.dbcd` file.

**Architecture:** Replace the inherited `.dbml` + sidecar persistence with a `DbcdProjectStore` backed by `node:sqlite`, while retaining the DBML parser, path confinement, MCP Apps bridge, and offline packaging. The MCP server exposes narrow project operations; the React UI owns the live editing session and renders CodeMirror plus React Flow in responsive inline and fullscreen layouts.

**Tech Stack:** TypeScript 7, Node.js 22.13+ `node:sqlite`, React 19, CodeMirror 6, `@xyflow/react`, Zod 4, Vitest 5, MCP Apps 2.

## Global Constraints

- Raise the Node.js engine floor from `>=20.19.0` to `>=22.13.0`; do not add a native SQLite package.
- Keep the DBML text as the functional source of truth and preserve it byte-for-byte across import/export when no edit occurred.
- Store DBML, presentation, draft, and revisions inside one `.dbcd`; `-journal` is allowed only during a transaction or crash recovery.
- Use `journal_mode=DELETE`, `foreign_keys=ON`, `synchronous=FULL`, a bounded busy timeout, and disabled SQLite extension loading.
- Reject absolute input paths, traversal, and any symbolic-link or junction escape from the Codex workspace roots.
- Use prepared statements for values; never expose an API that executes caller-supplied SQL or attaches another database.
- Do not create a revision for autosaved drafts; every successful explicit save creates exactly one immutable revision.
- Reject explicit saves while DBML is invalid and keep the last valid graph visible in the UI.
- Keep full DBML text and absolute paths out of model-visible `content` and `structuredContent`; pass source only in tool-result `_meta` for the app.
- Make the UI fully offline with no `fetch`, XHR, WebSocket, EventSource, remote font, image, script, or stylesheet.
- Preserve the current accessible keyboard interactions and honor `prefers-reduced-motion`.
- Use test-driven development: add a focused failing test, observe the intended failure, implement the smallest passing behavior, then run the relevant package suite.

---

## File Structure

### Core project format

- `packages/core/src/presentation.ts`: versioned Zod schema and deterministic JSON codec for views, nodes, groups, edges, viewport, detail level, and panel state.
- `packages/core/src/dbcd-path-policy.ts`: workspace-confined resolution for existing and new `.dbcd` files.
- `packages/core/src/dbcd-schema.ts`: SQLite DDL, format version, pragmas, schema inspection, and transaction helper.
- `packages/core/src/dbcd-project-store.ts`: create/open/draft/save/history/restore operations and single-writer queue.
- `packages/core/src/dbcd-transfer.ts`: `.dbml` import and export without silent overwrite.
- `packages/core/src/document-contract.ts`: project-oriented API types shared by core, MCP, and UI.

### MCP boundary

- `packages/mcp/src/handlers.ts`: sanitized project handlers over injected core operations.
- `packages/mcp/src/create-server.ts`: public `open_dbcd`/import/export tools and app-only editing/history tools.

### UI workbench

- `packages/ui/src/useDocumentSession.ts`: debounced validation, draft autosave, optimistic generation, save state, and last-valid graph.
- `packages/ui/src/DbmlEditor.tsx`: CodeMirror lifecycle, DBML highlighting, diagnostics, and save key binding.
- `packages/ui/src/DbcdWorkbench.tsx`: responsive toolbar and three resizable/reflowing workbench regions.
- `packages/ui/src/DiagramCanvas.tsx`: React Flow tables, groups, relations, selection, search, detail levels, and layout editing.
- `packages/ui/src/TableNode.tsx`: accessible table rendering for the three detail modes.
- `packages/ui/src/DirectedRelationEdge.tsx`: orthogonal relation rendering, cardinalities, control points, and direction markers.
- `packages/ui/src/HistoryPanel.tsx`: revision list, diff summary, pinning, and restore command.
- `packages/ui/src/index.tsx`: tool-result bootstrap only.

---

### Task 1: Project Contracts, Presentation Codec, and `.dbcd` Path Policy

**Files:**
- Modify: `package.json`
- Create: `packages/core/src/presentation.ts`
- Create: `packages/core/src/dbcd-path-policy.ts`
- Modify: `packages/core/src/document-contract.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/presentation.test.ts`
- Create: `packages/core/test/dbcd-path-policy.test.ts`
- Modify: `packages/core/test/document-contract.test.ts`

**Interfaces:**
- Consumes: inherited `Diagnostic`, `SchemaGraph`, `hashDocument`, and workspace path rules.
- Produces: `PresentationDocument`, `DetailLevel`, `DbcdProjectSnapshot`, `DbcdDraft`, `DbcdRevisionSummary`, `resolveExistingDbcd()`, and `resolveNewDbcd()`.

- [ ] **Step 1: Raise the runtime floor and write failing presentation tests**

Change the root engine to:

```json
"engines": {
  "node": ">=22.13.0"
}
```

Add tests that parse a complete version-1 presentation, reject unknown detail levels and non-finite coordinates, and prove deterministic serialization:

```ts
const presentation: PresentationDocument = {
  version: 1,
  activeViewId: "all",
  views: {
    all: {
      name: "Toutes les tables",
      system: true,
      defaultDetail: "keys",
      nodes: { "public.users": { x: 20, y: 30, detail: "all" } },
      groups: {},
      edges: {},
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  },
  panels: { editor: 320, inspector: 280, editorCollapsed: false, inspectorCollapsed: false },
};
expect(decodePresentation(encodePresentation(presentation))).toEqual(presentation);
expect(encodePresentation({ ...presentation, views: { z: presentation.views.all, a: presentation.views.all } }))
  .toContain('"a"');
```

- [ ] **Step 2: Run the focused tests and observe missing modules**

Run: `npm test -- packages/core/test/presentation.test.ts packages/core/test/dbcd-path-policy.test.ts packages/core/test/document-contract.test.ts`

Expected: FAIL because the new codec, path policy, and project contracts do not exist.

- [ ] **Step 3: Implement the presentation schema and deterministic codec**

Define and export these exact public types and functions:

```ts
export type DetailLevel = "names" | "keys" | "all";
export type PresentationDocument = z.infer<typeof presentationSchema>;

export function emptyPresentation(): PresentationDocument {
  return {
    version: 1,
    activeViewId: "all",
    views: {
      all: {
        name: "Toutes les tables",
        system: true,
        defaultDetail: "keys",
        nodes: {}, groups: {}, edges: {},
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    panels: { editor: 320, inspector: 280, editorCollapsed: false, inspectorCollapsed: false },
  };
}

export function encodePresentation(value: PresentationDocument): string {
  return JSON.stringify(sortObject(presentationSchema.parse(value)));
}

export function decodePresentation(value: string): PresentationDocument {
  return presentationSchema.parse(JSON.parse(value) as unknown);
}
```

The Zod schema must use strict objects, finite coordinates, zoom `0.1..4`, non-empty IDs/names, and `z.enum(["names", "keys", "all"])`.

- [ ] **Step 4: Implement workspace-confined `.dbcd` resolution**

Export:

```ts
export interface ResolvedDbcdPath {
  workspaceRoot: string;
  relativePath: string;
  absolutePath: string;
}

export async function resolveExistingDbcd(
  workspaceRoot: string,
  inputPath: string,
): Promise<ResolvedDbcdPath>;

export async function resolveNewDbcd(
  workspaceRoot: string,
  inputPath: string,
): Promise<ResolvedDbcdPath>;
```

Normalize separators to `/`, require a `.dbcd` suffix case-insensitively, reject empty segments, `..`, and absolute paths, canonicalize the root, walk each existing segment with `lstat`, and reject symbolic links/junctions. `resolveExistingDbcd` requires a regular file. `resolveNewDbcd` requires an existing canonical parent and returns `ALREADY_EXISTS` when the target exists.

- [ ] **Step 5: Replace file-oriented document contracts with project contracts**

Use these shapes:

```ts
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

export interface DbcdDraft {
  baseGeneration: number;
  sourceText: string;
  presentation: PresentationDocument;
  updatedAt: string;
}

export interface SaveDbcdInput {
  workspaceRoot: string;
  projectPath: string;
  expectedGeneration: number;
  sourceText: string;
  presentation: PresentationDocument;
  label?: string;
}
```

Update compile-time tests so invalid detail levels, missing generations, and path-based export fields fail under `@ts-expect-error`.

- [ ] **Step 6: Export the new modules and run core verification**

Run: `npm test -- packages/core/test/presentation.test.ts packages/core/test/dbcd-path-policy.test.ts packages/core/test/document-contract.test.ts && npm run typecheck --workspace @dbcodex/core`

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit the contract boundary**

```bash
git add package.json package-lock.json packages/core/src packages/core/test
git commit -m "feat: define dbcd project contracts"
```

---

### Task 2: SQLite Schema and Project Creation/Open

**Files:**
- Create: `packages/core/src/dbcd-schema.ts`
- Create: `packages/core/src/dbcd-project-store.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/dbcd-project-store.test.ts`
- Create: `packages/core/test/support/dbcd-fixture.ts`

**Interfaces:**
- Consumes: `resolveExistingDbcd`, `resolveNewDbcd`, presentation codec, DBML parser, and SHA-256 hashing.
- Produces: `createDbcdProject(input)`, `openDbcdProject(input)`, `DbcdProjectStoreError`, schema version `1`, and reusable temporary project helpers.

- [ ] **Step 1: Write failing creation/open tests**

Cover one physical `.dbcd`, exact DBML round-trip, first revision creation, pragma values, a future `user_version`, corrupt input, and rejection of extension loading:

```ts
const created = await createDbcdProject({
  workspaceRoot: root,
  projectPath: "shop.dbcd",
  sourceText: "Table users { id int [pk] }\n",
  now: () => "2026-09-26T10:00:00.000Z",
  projectId: () => "project-1",
});
expect(created.generation).toBe(1);
expect(created.revisions).toHaveLength(1);
expect((await readdir(root)).sort()).toEqual(["shop.dbcd"]);
expect((await openDbcdProject({ workspaceRoot: root, projectPath: "shop.dbcd" })).sourceText)
  .toBe("Table users { id int [pk] }\n");
```

- [ ] **Step 2: Run the store test and verify the red state**

Run: `npm test -- packages/core/test/dbcd-project-store.test.ts`

Expected: FAIL because `dbcd-schema.ts` and `dbcd-project-store.ts` are missing.

- [ ] **Step 3: Add schema constants and safe connection setup**

Create `DBCD_FORMAT_VERSION = 1` and DDL for strict tables:

```sql
CREATE TABLE project_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  format_version INTEGER NOT NULL,
  project_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE revisions (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES revisions(id),
  created_at TEXT NOT NULL,
  dbml_gzip BLOB NOT NULL,
  presentation_gzip BLOB NOT NULL,
  source_hash TEXT NOT NULL,
  presentation_hash TEXT NOT NULL,
  summary TEXT NOT NULL,
  label TEXT,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1))
) STRICT;
CREATE TABLE document_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  dbml_text TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  presentation_json TEXT NOT NULL,
  presentation_hash TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  current_revision_id TEXT NOT NULL REFERENCES revisions(id)
) STRICT;
CREATE TABLE draft_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_generation INTEGER NOT NULL,
  dbml_text TEXT NOT NULL,
  presentation_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
```

`openConnection(path, readOnly)` must use `new DatabaseSync(path, { readOnly, timeout: 2000 })`, immediately disable extension loading, execute `foreign_keys=ON`, `journal_mode=DELETE`, and `synchronous=FULL`, then verify the effective pragmas. Export no raw connection.

- [ ] **Step 4: Implement project creation as one transaction**

Validate DBML before touching disk. Insert metadata, a gzip-compressed initial revision, and `document_state` inside `BEGIN IMMEDIATE`/`COMMIT`; on any error execute `ROLLBACK`, close the connection, and remove only the just-created empty target. Derive the revision ID from timestamp plus source/presentation hashes:

```ts
function revisionId(createdAt: string, sourceHash: string, presentationHash: string): string {
  return createHash("sha256")
    .update(`${createdAt}\0${sourceHash}\0${presentationHash}`)
    .digest("hex");
}
```

- [ ] **Step 5: Implement read-only inspection and normal project opening**

Read `user_version` before migrations. Return `readOnly: true` for a version above `DBCD_FORMAT_VERSION`; throw `NOT_DBCD` for missing required tables or invalid metadata; parse presentation JSON with `decodePresentation`; decompress only revision rows requested for restore, not the whole history list. Parse `document_state.dbml_text` and return sanitized `CORRUPT_PROJECT` errors without rewriting the database.

- [ ] **Step 6: Run focused tests, inspect the stable files, and typecheck**

Run: `npm test -- packages/core/test/dbcd-project-store.test.ts && npm run typecheck --workspace @dbcodex/core`

Expected: tests pass; fixture directories contain only `.dbcd` after connections close; TypeScript exits 0.

- [ ] **Step 7: Commit the project store foundation**

```bash
git add packages/core/src packages/core/test
git commit -m "feat: create and open dbcd projects"
```

---

### Task 3: Drafts, Transactional Saves, History, and Restore

**Files:**
- Modify: `packages/core/src/dbcd-project-store.ts`
- Modify: `packages/core/src/document-contract.ts`
- Create: `packages/core/test/dbcd-project-history.test.ts`
- Create: `packages/core/test/dbcd-project-recovery.test.ts`

**Interfaces:**
- Consumes: Task 2 connection/schema helpers and Task 1 contracts.
- Produces: `saveDbcdDraft`, `discardDbcdDraft`, `saveDbcdProject`, `listDbcdRevisions`, `readDbcdRevision`, `restoreDbcdRevision`, and `setDbcdRevisionPinned`.

- [ ] **Step 1: Write failing draft and save tests**

Assert that draft autosave creates no revision, invalid DBML can be drafted but not explicitly saved, a valid save creates exactly one revision, stale generation returns `CONFLICT`, and a successful save clears the draft:

```ts
await saveDbcdDraft({ workspaceRoot: root, projectPath: "shop.dbcd", baseGeneration: 1,
  sourceText: "Table broken {", presentation: emptyPresentation() });
expect((await openDbcdProject(openInput)).revisions).toHaveLength(1);
await expect(saveDbcdProject({ ...saveInput, sourceText: "Table broken {" }))
  .rejects.toMatchObject({ code: "INVALID_DBML" });
const saved = await saveDbcdProject(saveInput);
expect(saved.generation).toBe(2);
expect(saved.revisions).toHaveLength(2);
expect(saved.draft).toBeNull();
```

- [ ] **Step 2: Run history tests and observe missing operations**

Run: `npm test -- packages/core/test/dbcd-project-history.test.ts packages/core/test/dbcd-project-recovery.test.ts`

Expected: FAIL on missing exported functions.

- [ ] **Step 3: Add a per-project writer queue and transaction wrapper**

Use the canonical `.dbcd` absolute path as lock key:

```ts
const projectQueues = new Map<string, Promise<void>>();

async function withProjectWrite<T>(path: string, action: () => T): Promise<T> {
  const previous = projectQueues.get(path) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  projectQueues.set(path, current);
  await previous;
  try { return action(); }
  finally {
    release();
    if (projectQueues.get(path) === current) projectQueues.delete(path);
  }
}
```

Wrap mutations in `BEGIN IMMEDIATE`; always `ROLLBACK` before closing after an exception.

- [ ] **Step 4: Implement draft write/discard without revisions**

Upsert the singleton row using prepared values and validate only the presentation:

```sql
INSERT INTO draft_state(id, base_generation, dbml_text, presentation_json, updated_at)
VALUES(1, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  base_generation=excluded.base_generation,
  dbml_text=excluded.dbml_text,
  presentation_json=excluded.presentation_json,
  updated_at=excluded.updated_at;
```

Refuse a draft whose `base_generation` differs from the current saved generation.

- [ ] **Step 5: Implement compare-and-swap save and retention**

Parse DBML before opening the write transaction. Inside it, read `generation` and `current_revision_id`; compare generation; insert one compressed revision; update `document_state` with `WHERE generation = ?`; delete `draft_state`; update metadata; prune unpinned revisions older than 90 days, then prune oldest unpinned entries above 500 while retaining the current revision. Treat an update count other than one as `CONFLICT`.

Expose a test-only injected checkpoint typed as:

```ts
export type SaveCheckpoint = "after-begin" | "after-revision" | "after-document" | "before-commit";
export interface DbcdStoreTestHooks { checkpoint?(name: SaveCheckpoint): void; }
```

Throwing from any checkpoint must leave the previous generation and revision count unchanged after reopen.

- [ ] **Step 6: Implement immutable history, pinning, and non-destructive restore**

`listDbcdRevisions` returns metadata newest first. `readDbcdRevision` decompresses one snapshot and verifies both hashes. `setDbcdRevisionPinned` changes only `pinned`. `restoreDbcdRevision` loads the chosen snapshot, then calls the same internal save transaction with summary `Restauration de <short id>` so restoration creates a new child of the current revision.

- [ ] **Step 7: Run recovery, history, and complete core tests**

Run: `npm test -- packages/core/test/dbcd-project-history.test.ts packages/core/test/dbcd-project-recovery.test.ts && npm test -- packages/core && npm run typecheck --workspace @dbcodex/core`

Expected: checkpoint failures roll back, history tests pass, all core tests pass, and TypeScript exits 0.

- [ ] **Step 8: Commit transactional project history**

```bash
git add packages/core/src packages/core/test
git commit -m "feat: version dbcd projects transactionally"
```

---

### Task 4: Lossless DBML Transfer and MCP Project Tools

**Files:**
- Create: `packages/core/src/dbcd-transfer.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/dbcd-transfer.test.ts`
- Modify: `packages/mcp/src/handlers.ts`
- Modify: `packages/mcp/src/create-server.ts`
- Modify: `packages/mcp/test/handlers.test.ts`
- Modify: `packages/mcp/test/server.test.ts`

**Interfaces:**
- Consumes: all core project operations and inherited workspace-root provider.
- Produces: `importDbmlProject`, `exportDbmlProject`, public MCP tools `open_dbcd`, `import_dbml`, `export_dbml`, and app-only project editing/history tools.

- [ ] **Step 1: Write failing transfer and MCP tests**

Add core tests for byte-exact import/export and collisions. Add MCP tests proving source is present only in `_meta`, every editing tool is app-only, model-visible output is sanitized, and missing roots fail closed:

```ts
const result = await handlers.openDbcd({ path: "shop.dbcd" });
expect(result.structuredContent).not.toHaveProperty("sourceText");
expect(JSON.stringify(result.content)).not.toContain("Table users");
expect(result._meta.dbcodex.sourceText).toBe("Table users { id int [pk] }\n");
```

- [ ] **Step 2: Run transfer and MCP tests in the red state**

Run: `npm test -- packages/core/test/dbcd-transfer.test.ts packages/mcp/test/handlers.test.ts packages/mcp/test/server.test.ts`

Expected: FAIL because transfer functions and `.dbcd` tools are not registered.

- [ ] **Step 3: Implement import and export without silent overwrite**

Export:

```ts
export async function importDbmlProject(input: {
  workspaceRoot: string; sourcePath: string; projectPath: string;
}): Promise<DbcdProjectSnapshot>;

export async function exportDbmlProject(input: {
  workspaceRoot: string; projectPath: string; targetPath: string; revisionId?: string;
}): Promise<{ targetPath: string; sourceHash: string }>;
```

Resolve `.dbml` with the inherited policy, resolve a new `.dbcd` target with Task 1, and call `createDbcdProject`. For export, resolve a new `.dbml` target, obtain the current or requested revision source, write with `flag: "wx"`, and remove only the newly created target if the write itself fails.

- [ ] **Step 4: Replace handler dependencies with an injected project service**

Define:

```ts
export interface ProjectOperations {
  open(input: OpenDbcdInput): Promise<DbcdProjectSnapshot>;
  validate(input: ValidateDbcdDraftInput): Promise<ValidationResult>;
  saveDraft(input: SaveDbcdDraftInput): Promise<void>;
  save(input: SaveDbcdInput): Promise<DbcdProjectSnapshot>;
  revisions(input: ProjectPathInput): Promise<DbcdRevisionSummary[]>;
  restore(input: RestoreDbcdInput): Promise<DbcdProjectSnapshot>;
  pin(input: PinDbcdRevisionInput): Promise<void>;
  importDbml(input: ImportDbmlInput): Promise<DbcdProjectSnapshot>;
  exportDbml(input: ExportDbmlInput): Promise<{ targetPath: string; sourceHash: string }>;
}
```

The default implementation resolves each path against all client roots. `openDbcd` returns graph, diagnostics, presentation, generation, current revision, draft presence, and revision summaries in `structuredContent`; put `sourceText`, draft source, and `projectId` under `_meta.dbcodex`.

- [ ] **Step 5: Register exact MCP tools and visibility**

Public model-callable tools:

```text
open_dbcd(path)
open_dbml(path)             # read-only compatibility preview
import_dbml(sourcePath, projectPath)
export_dbml(projectPath, targetPath, revisionId?)
```

App-only tools with `_meta.ui.visibility = ["app"]`:

```text
validate_dbcd_draft(path, sourceText)
save_dbcd_draft(path, baseGeneration, sourceText, presentation)
save_dbcd(path, expectedGeneration, sourceText, presentation, label?)
list_dbcd_revisions(path)
restore_dbcd_revision(path, expectedGeneration, revisionId)
pin_dbcd_revision(path, revisionId, pinned)
```

Mark open/list/validate read-only, import/export/save/restore non-destructive but non-idempotent where a revision or file is created, and all tools `openWorldHint: false`.

- [ ] **Step 6: Run core/MCP tests and packaging checks**

Run: `npm test -- packages/core/test/dbcd-transfer.test.ts packages/mcp && npm run typecheck --workspace @dbcodex/core && npm run typecheck --workspace @dbcodex/mcp && npm run build --workspace @dbcodex/mcp && npm run verify:mcp`

Expected: all tests pass, bundled MCP starts, and the protocol verifier opens a `.dbcd` without source leakage.

- [ ] **Step 7: Commit the MCP project boundary**

```bash
git add packages/core packages/mcp package-lock.json
git commit -m "feat: expose dbcd project tools"
```

---

### Task 5: Live Document Session and CodeMirror Editor

**Files:**
- Modify: `packages/ui/package.json`
- Create: `packages/ui/src/useDocumentSession.ts`
- Create: `packages/ui/src/dbml-language.ts`
- Create: `packages/ui/src/DbmlEditor.tsx`
- Create: `packages/ui/test/useDocumentSession.test.tsx`
- Create: `packages/ui/test/DbmlEditor.test.tsx`
- Modify: `packages/ui/src/bridge.ts`

**Interfaces:**
- Consumes: Task 4 tool names, `DbcdProjectSnapshot`, `PresentationDocument`, diagnostics, and `McpAppsBridge.callTool`.
- Produces: `DocumentSession`, `useDocumentSession(openResult, bridge)`, and `DbmlEditor` with controlled source and diagnostics.

- [ ] **Step 1: Add editor dependencies and failing session tests**

Add exact production dependencies:

```json
"@codemirror/commands": "6.11.1",
"@codemirror/language": "6.12.4",
"@codemirror/lint": "6.9.7",
"@codemirror/state": "6.7.6",
"@codemirror/view": "6.43.13",
"codemirror": "6.0.2"
```

Install these exact versions with `npm install --save --save-exact --workspace @dbcodex/ui` and commit the resulting lockfile.

Test a 300 ms validation debounce, 1 second draft debounce, last-valid graph retention, stale response suppression, one save call per `Ctrl+S`, generation advancement, and invalid-save blocking:

```ts
act(() => session.current.setSource("Table orders { id int [pk] }"));
await act(async () => vi.advanceTimersByTimeAsync(299));
expect(bridge.callTool).not.toHaveBeenCalledWith("validate_dbcd_draft", expect.anything());
await act(async () => vi.advanceTimersByTimeAsync(1));
expect(bridge.callTool).toHaveBeenCalledWith("validate_dbcd_draft", expect.objectContaining({
  sourceText: "Table orders { id int [pk] }",
}));
```

- [ ] **Step 2: Run session/editor tests and confirm the red state**

Run: `npm test -- packages/ui/test/useDocumentSession.test.tsx packages/ui/test/DbmlEditor.test.tsx`

Expected: FAIL because the hook and editor components do not exist.

- [ ] **Step 3: Implement the live session state machine**

Expose:

```ts
export interface DocumentSession {
  source: string;
  presentation: PresentationDocument;
  graph: SchemaGraph | null;
  diagnostics: Diagnostic[];
  generation: number;
  revisions: DbcdRevisionSummary[];
  dirty: boolean;
  validating: boolean;
  saving: boolean;
  error: string | null;
  setSource(value: string): void;
  setPresentation(value: PresentationDocument): void;
  save(): Promise<void>;
  restore(revisionId: string): Promise<void>;
  pin(revisionId: string, pinned: boolean): Promise<void>;
}
```

Use monotonically increasing validation request IDs and ignore results older than the current ID. On invalid results update diagnostics but not `graph`. Schedule `save_dbcd_draft` after 1000 ms of inactivity. Explicit save must cancel pending draft work, reject when any diagnostic has severity `error`, call `save_dbcd` with the loaded generation, and replace generation/revisions only after success.

- [ ] **Step 4: Implement DBML highlighting and diagnostics**

Create a `StreamLanguage` tokenizer recognizing `Table`, `Ref`, `Enum`, `TableGroup`, `Project`, `Note`, settings in brackets, quoted strings, comments, numbers, types, and relation operators. Convert diagnostics to CodeMirror lint ranges with safe line/column clamping.

The editor interface is:

```ts
export interface DbmlEditorProps {
  value: string;
  diagnostics: Diagnostic[];
  readOnly: boolean;
  onChange(value: string): void;
  onSave(): void;
}
```

Create one `EditorView`, destroy it on unmount, dispatch external changes instead of reconstructing the view, and install `keymap.of([{ key: "Mod-s", preventDefault: true, run: () => { onSave(); return true; } }])`.

- [ ] **Step 5: Run session/editor tests and UI typecheck**

Run: `npm test -- packages/ui/test/useDocumentSession.test.tsx packages/ui/test/DbmlEditor.test.tsx && npm run typecheck --workspace @dbcodex/ui`

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit the editing session**

```bash
git add packages/ui package-lock.json
git commit -m "feat: add live dbcd editing session"
```

---

### Task 6: Responsive Workbench Shell, React Flow Canvas, and Fullscreen

**Files:**
- Modify: `packages/ui/package.json`
- Create: `packages/ui/src/DbcdWorkbench.tsx`
- Create: `packages/ui/src/DiagramCanvas.tsx`
- Create: `packages/ui/src/TableNode.tsx`
- Modify: `packages/ui/src/index.tsx`
- Modify: `packages/ui/src/styles.css`
- Create: `packages/ui/test/DbcdWorkbench.test.tsx`
- Create: `packages/ui/test/DiagramCanvas.test.tsx`
- Modify: `packages/ui/test/DiagramApp.test.tsx`

**Interfaces:**
- Consumes: Task 5 `DocumentSession`, inherited graph model, MCP Apps display-mode bridge, and presentation state.
- Produces: the editable three-region inline/fullscreen workbench and base React Flow layout editing.

- [ ] **Step 1: Add React Flow and failing shell/canvas tests**

Install `@xyflow/react@12.12.0` with `npm install --save --save-exact --workspace @dbcodex/ui @xyflow/react@12.12.0`. Test toolbar state, editor collapse, inspector drawer at narrow width, pointer and keyboard node movement, detail rendering, presentation-only dirty state, and fullscreen request:

```ts
await user.click(screen.getByRole("button", { name: "Plein écran" }));
expect(bridge.requestDisplayMode).toHaveBeenCalledWith("fullscreen");
await user.keyboard("{ArrowRight}");
expect(onPresentationChange).toHaveBeenCalledWith(expect.objectContaining({
  views: expect.objectContaining({ all: expect.objectContaining({
    nodes: expect.objectContaining({ "public.users": expect.objectContaining({ x: 30 }) }),
  }) }),
}));
```

- [ ] **Step 2: Run shell/canvas tests and confirm the red state**

Run: `npm test -- packages/ui/test/DbcdWorkbench.test.tsx packages/ui/test/DiagramCanvas.test.tsx`

Expected: FAIL because the workbench and React Flow components do not exist.

- [ ] **Step 3: Extend the bridge with display mode support**

Add:

```ts
export type DisplayMode = "inline" | "fullscreen";
export interface WorkbenchBridge {
  callTool(name: string, input: Record<string, unknown>): Promise<unknown>;
  requestDisplayMode(mode: DisplayMode): Promise<void>;
}
```

Use the MCP Apps host display-mode request exposed by the current bridge protocol. If the host declines, preserve all session state and show a non-blocking message instead of remounting.

- [ ] **Step 4: Implement the responsive workbench shell**

`DbcdWorkbench` renders:

```tsx
<main className="workbench" data-mode={displayMode}>
  <WorkbenchToolbar />
  <section className="workbench-body">
    <ResizablePanel region="editor"><DbmlEditor /></ResizablePanel>
    <DiagramCanvas />
    <ResizablePanel region="inspector"><Inspector /></ResizablePanel>
  </section>
</main>
```

Use pointer-captured separators with keyboard arrows. Clamp editor and inspector widths to 240–600 px. At widths below 900 px, keep the diagram central, make the inspector a drawer, and allow the editor to collapse to a 40 px rail. Persist panel values through `session.setPresentation`.

- [ ] **Step 5: Implement the base React Flow diagram**

Map tables to `TableNode` keyed by stable table ID and relations to non-connectable edges. When no saved node exists, use the inherited deterministic grid placement. On node drag stop or keyboard arrows, update only `presentation.views[activeViewId].nodes[tableId]`; do not call MCP directly. Include `Background`, accessible `Controls`, fit-view, and selection state.

`TableNode` renders exact modes:

```ts
"names" -> table header only
"keys"  -> primary-key and foreign-key columns plus “+N champs masqués”
"all"   -> every column
```

An explicit node detail override wins over the view default.

- [ ] **Step 6: Bootstrap from tool-result metadata**

Parse sanitized fields from `structuredContent` and `sourceText`, draft source, and project identity from `_meta.dbcodex`. Instantiate `useDocumentSession`; remove the old immediate `save_layout` behavior and render `DbcdWorkbench`. Keep a compatibility branch that renders the inherited read-only `DiagramApp` for `open_dbml` results.

- [ ] **Step 7: Run UI tests, offline verification, and build**

Run: `npm test -- packages/ui && npm run typecheck --workspace @dbcodex/ui && npm run build --workspace @dbcodex/ui && npm run verify:offline-ui`

Expected: all UI tests pass, the bundle builds, and the verifier finds no remote-resource or network API usage.

- [ ] **Step 8: Commit the usable workbench shell**

```bash
git add packages/ui package-lock.json
git commit -m "feat: render dbcd editing workbench"
```

---

### Task 7: Views, Groups, Search, Detail Controls, and Directed Relations

**Files:**
- Create: `packages/ui/src/ViewInspector.tsx`
- Create: `packages/ui/src/DirectedRelationEdge.tsx`
- Create: `packages/ui/src/presentation-commands.ts`
- Modify: `packages/ui/src/DiagramCanvas.tsx`
- Modify: `packages/ui/src/TableNode.tsx`
- Modify: `packages/ui/src/DbcdWorkbench.tsx`
- Modify: `packages/ui/src/styles.css`
- Create: `packages/ui/test/presentation-commands.test.ts`
- Create: `packages/ui/test/ViewInspector.test.tsx`
- Create: `packages/ui/test/DirectedRelationEdge.test.tsx`
- Modify: `packages/ui/test/DiagramCanvas.test.tsx`

**Interfaces:**
- Consumes: Task 6 diagram/shell and Task 1 presentation schema.
- Produces: pure immutable presentation commands and the requested diagram manipulation controls.

- [ ] **Step 1: Write failing pure-command and component tests**

Cover create/duplicate/rename/delete view, permanent system view, grouping selected tables, group collapse/color, view/global and per-table detail, search filtering, relation control points, reset route, and reduced motion:

```ts
const next = createView(presentation, { id: "crm", name: "CRM", tableIds: ["public.users"] });
expect(next.views.crm.nodes["public.users"]).toBeDefined();
expect(() => deleteView(next, "all")).toThrow("La vue système ne peut pas être supprimée.");
expect(groupTables(next, "crm", { id: "people", name: "Personnes", color: "#16a34a",
  tableIds: ["public.users"] }).views.crm.groups.people.tableIds).toEqual(["public.users"]);
```

- [ ] **Step 2: Run the new tests and observe the red state**

Run: `npm test -- packages/ui/test/presentation-commands.test.ts packages/ui/test/ViewInspector.test.tsx packages/ui/test/DirectedRelationEdge.test.tsx packages/ui/test/DiagramCanvas.test.tsx`

Expected: FAIL on missing commands and components.

- [ ] **Step 3: Implement immutable presentation commands**

Export exact commands:

```ts
createView(document, input): PresentationDocument;
duplicateView(document, sourceId, nextId, nextName): PresentationDocument;
renameView(document, viewId, name): PresentationDocument;
deleteView(document, viewId): PresentationDocument;
setActiveView(document, viewId): PresentationDocument;
setViewDetail(document, viewId, level): PresentationDocument;
setNodeDetail(document, viewId, tableId, levelOrNull): PresentationDocument;
groupTables(document, viewId, group): PresentationDocument;
updateGroup(document, viewId, groupId, patch): PresentationDocument;
setRelationRoute(document, viewId, relationId, points): PresentationDocument;
resetRelationRoute(document, viewId, relationId): PresentationDocument;
```

Every command parses its output through the presentation schema and throws a localized domain error without mutating the input.

- [ ] **Step 4: Build the view/detail/group inspector**

Render a view selector with « Toutes les tables » always first, actions for new/duplicate/rename/delete, a search input spanning tables/columns/groups/schemas, the three detail choices, and a tree of visible tables with eye toggles. Disable destructive view actions for the system view. The selected-table command « Grouper » creates a named/colorized group and updates the DBML through an editor patch preview before applying it.

Implement the patch as a focused helper that appends or replaces one `TableGroup`/`DiagramView` block using parser source ranges; when no unambiguous range exists, return a diff preview and require the user’s explicit Apply button. Never serialize the entire DBML AST.

- [ ] **Step 5: Implement directed orthogonal relation edges**

Render an SVG orthogonal path through saved control points, cardinality labels at both ends, and small direction dots using CSS `offset-path`. Animate dots only while hovered or selected. Under `@media (prefers-reduced-motion: reduce)`, disable animation and render a static arrow marker. Selected edges expose keyboard-focusable control points; arrow keys move by 10 px and Shift+arrow by 1 px. « Routage automatique » removes the saved route.

- [ ] **Step 6: Add search, minimap, grouping, and detail controls to the canvas**

Attenuate non-matches with `opacity: 0.25` rather than removing context; selecting a search result centers and selects it. Render group containers behind member nodes, allow collapse without losing positions, and include a collapsible `MiniMap` automatically open for more than 25 tables. Feed every visual mutation through the pure commands and the session presentation setter.

- [ ] **Step 7: Run focused and complete UI checks**

Run: `npm test -- packages/ui/test/presentation-commands.test.ts packages/ui/test/ViewInspector.test.tsx packages/ui/test/DirectedRelationEdge.test.tsx packages/ui/test/DiagramCanvas.test.tsx && npm test -- packages/ui && npm run typecheck --workspace @dbcodex/ui && npm run verify:offline-ui`

Expected: all focused and full UI tests pass; offline verification passes.

- [ ] **Step 8: Commit advanced diagram interactions**

```bash
git add packages/ui
git commit -m "feat: add dbcd views and diagram controls"
```

---

### Task 8: History UI, Fixture Conversion, Documentation, and Acceptance

**Files:**
- Create: `packages/ui/src/HistoryPanel.tsx`
- Create: `packages/ui/src/revision-diff.ts`
- Modify: `packages/ui/src/DbcdWorkbench.tsx`
- Create: `packages/ui/test/HistoryPanel.test.tsx`
- Create: `packages/ui/test/revision-diff.test.ts`
- Create: `scripts/generate-dbcd-fixtures.mjs`
- Create: `fixtures/demo-shop.dbcd`
- Modify: `scripts/check-mcp.mjs`
- Modify: `skills/dbcodex/SKILL.md`
- Modify: `README.md`
- Modify: `plugin.json`
- Modify: `docs/feature-inventory.md`
- Modify: `docs/decisions.md`
- Modify: `test/plugin-manifest.test.ts`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: complete revision workflow, reproducible `.dbcd` demonstration fixture, updated plugin guidance, and end-to-end evidence.

- [ ] **Step 1: Write failing history and acceptance tests**

Test newest-first revisions, pin toggle, DBML/presentation diff summaries, restore creating a new current revision, and state survival across fullscreen toggles. Extend the MCP verifier to open `fixtures/demo-shop.dbcd`, draft an edit, save it to a temporary copied project, reopen, and assert generation plus revision count advanced exactly once.

```ts
await user.click(screen.getByRole("button", { name: "Historique" }));
await user.click(screen.getByRole("button", { name: /Restaurer .*a1b2c3/i }));
expect(bridge.callTool).toHaveBeenCalledWith("restore_dbcd_revision", {
  path: "fixtures/demo-shop.dbcd",
  expectedGeneration: 3,
  revisionId: "a1b2c3",
});
```

- [ ] **Step 2: Run history and verifier tests in the red state**

Run: `npm test -- packages/ui/test/HistoryPanel.test.tsx packages/ui/test/revision-diff.test.ts test/plugin-manifest.test.ts && npm run verify:mcp`

Expected: FAIL because the history UI, fixture, and `.dbcd` verifier path do not exist.

- [ ] **Step 3: Implement revision diff and history panel**

`summarizeRevisionDiff(previous, next)` returns added/removed/changed DBML line counts plus moved nodes, changed detail levels, changed routes, and view additions/removals. `HistoryPanel` lists timestamp, summary, label, pin, and short ID; selecting an entry loads one revision lazily, shows the summary, and exposes Restore. Restoration remains a deliberate action inside this panel and updates the session from the returned snapshot.

- [ ] **Step 4: Generate a deterministic demo fixture**

`scripts/generate-dbcd-fixtures.mjs` imports `fixtures/demo-shop.dbml` through built core APIs using fixed project ID `demo-shop`, fixed timestamp `2026-09-26T00:00:00.000Z`, and `emptyPresentation()`. The script writes only `fixtures/demo-shop.dbcd` and exits nonzero if build output is missing. Run:

```bash
npm run build --workspace @dbcodex/core
node scripts/generate-dbcd-fixtures.mjs
```

Then open the fixture through the public store and verify its source hash matches `fixtures/demo-shop.dbml`.

- [ ] **Step 5: Update plugin guidance and manifest assertions**

Document these user flows verbatim:

```text
Ouvre fixtures/demo-shop.dbcd avec dbcodex.
Importe fixtures/demo-shop.dbml dans fixtures/demo-shop.dbcd.
Exporte la version courante de fixtures/demo-shop.dbcd vers fixtures/demo-shop-export.dbml.
```

Explain that `.dbcd` is the editable project file, `.dbml` is the exchange format, every explicit save is versioned, drafts are not revisions, the app can request fullscreen, and custom OS/editor association is not guaranteed. Keep the local-only and no-speculative-write rules.

- [ ] **Step 6: Run complete automated acceptance**

Run:

```bash
npm ci
npm run build
npm run typecheck
npm test
npm run verify:offline-ui
npm run verify:mcp
git diff --check
```

Expected: every command exits 0; tests include transaction rollback, conflict, recovery, import/export, UI save/history/restore, manifest, and no-network checks.

- [ ] **Step 7: Perform the Codex desktop smoke path**

From the plugin development install, run « Ouvre `fixtures/demo-shop.dbcd` avec dbcodex », verify editor/diagram/inspector display, switch to fullscreen and back, change DBML, move a table, create a view, change detail level, save once, reopen, inspect the new revision, and restore it. Record observed results and any host limitation in `docs/evidence/dbcd-workbench.md`; do not claim the side-panel file association if the host only provides inline/fullscreen MCP Apps.

- [ ] **Step 8: Commit the complete `.dbcd` workbench**

```bash
git add README.md plugin.json skills scripts fixtures packages/ui docs test
git commit -m "feat: complete the dbcd workbench"
```

---

## Completion Checklist

- [ ] The stable project artifact is exactly one `.dbcd` file at rest.
- [ ] Import/export preserves untouched DBML bytes.
- [ ] Draft autosave creates no revision; every valid explicit save creates exactly one.
- [ ] Invalid, stale, failed, and interrupted saves leave the prior saved state intact.
- [ ] Views, groups, node positions, detail levels, relation routes, panels, and viewport reopen exactly.
- [ ] History diff, pin, retention, and non-destructive restore work.
- [ ] Model-visible MCP output contains no raw DBML or absolute path.
- [ ] The UI performs no network request and works inline/fullscreen.
- [ ] Complete build, typecheck, tests, MCP verifier, offline verifier, and `git diff --check` pass.
