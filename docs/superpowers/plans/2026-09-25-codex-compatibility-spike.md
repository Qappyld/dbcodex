# Codex Compatibility Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local dbcodex plugin that opens a workspace DBML file, renders a draggable SVG diagram inside a compatible Codex MCP Apps surface, and persists positions in a deterministic sidecar.

**Architecture:** A portable root plugin launches a TypeScript MCP server over `stdio`. The server delegates filesystem, DBML parsing, graph normalization, and layout persistence to a framework-free core package; a separately bundled React component consumes structured tool results through the MCP Apps bridge and calls `save_layout` after movement.

**Tech Stack:** Node.js 20.19+, npm workspaces, TypeScript, `@dbml/core` 10.2, MCP TypeScript SDK, MCP Apps helpers, Zod, React 19, SVG, esbuild, Vitest, Testing Library, jsdom.

## Global Constraints

- The decisive experience must render inside Codex; an external browser or static SVG is not acceptance.
- DBML files and imports remain inside the active workspace and are never sent over the network.
- Any path that resolves outside the workspace is rejected before reading.
- The prototype never rewrites DBML and never returns `Records` values to the UI.
- Layout data lives under `.dbcodex/layouts/` and is written deterministically and atomically.
- The UI has no direct filesystem access and calls MCP tools for durable changes.
- The tool result remains useful without UI through concise text and structured content.
- License and distribution choices remain deferred; do not add a license or publish a package.
- Every production behavior starts with a failing test and each task ends with a focused commit.
- The final Codex check records the two-second open budget and 100 ms interaction performance budget.

---

## File Map

```text
package.json                         npm workspace, shared scripts and pinned tooling
package-lock.json                    reproducible dependency graph
tsconfig.base.json                   strict shared TypeScript options
plugin.json                          portable Agent Plugins manifest
mcp.json                             bundled local stdio MCP declaration
skills/dbcodex/SKILL.md              workflow that tells Codex when and how to use the tools
packages/core/                       filesystem, parser, graph contracts and layout store
packages/mcp/                        MCP tools, UI resource and stdio entrypoint
packages/ui/                         React/SVG component and MCP Apps bridge
fixtures/basic.dbml                  three-table acceptance model
docs/evidence/codex-spike.md         actual Codex compatibility result and measurements
```

### Task 1: Workspace foundation and safe path policy

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/path-policy.ts`
- Create: `packages/core/test/path-policy.test.ts`
- Create: `packages/core/test/support/temp-workspace.ts`

**Interfaces:**
- Produces: `resolveWorkspaceDbml(workspaceRoot: string, relativePath: string): Promise<{ absolutePath: string; relativePath: string }>`
- Produces: `PathPolicyError` with stable codes `ABSOLUTE_PATH`, `OUTSIDE_WORKSPACE`, `NOT_DBML`, and `NOT_FOUND`.

- [ ] **Step 1: Create the npm/TypeScript workspace configuration**

Use a private ESM workspace, pin exact dependency versions in `package-lock.json`, expose `build`, `typecheck`, and `test` scripts, and set `engines.node` to `>=20.19.0`. The root test script is `vitest run`; the build script runs core, UI, then MCP so the server can embed the UI bundle.

```json
{
  "name": "dbcodex",
  "version": "0.1.0-dev.0",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20.19.0" },
  "scripts": {
    "build": "npm run build --workspace @dbcodex/core && npm run build --workspace @dbcodex/ui && npm run build --workspace @dbcodex/mcp",
    "test": "vitest run",
    "typecheck": "tsc -b packages/core packages/ui packages/mcp"
  },
  "devDependencies": {
    "@types/node": "24.13.6",
    "typescript": "7.0.2",
    "vitest": "5.0.2"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

```json
{
  "name": "@dbcodex/core",
  "version": "0.1.0-dev.0",
  "private": true,
  "type": "module",
  "exports": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@dbml/core": "10.2.0",
    "write-file-atomic": "8.0.0",
    "zod": "4.6.5"
  }
}
```

`packages/core/tsconfig.json` extends `../../tsconfig.base.json`, sets `rootDir` to `src`, `outDir` to `dist`, includes `src/**/*.ts`, and excludes `test`. `.gitignore` contains `node_modules/`, every `dist/`, `.dbcodex/`, and Vitest coverage output.

- [ ] **Step 2: Write the failing path-policy tests**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempWorkspace, removeTempWorkspace } from "./support/temp-workspace.js";
import { PathPolicyError, resolveWorkspaceDbml } from "../src/path-policy.js";

describe("resolveWorkspaceDbml", () => {
  const roots: string[] = [];
  afterEach(async () => Promise.all(roots.splice(0).map(removeTempWorkspace)));

  it("resolves an existing DBML file below the workspace", async () => {
    const root = await makeTempWorkspace(roots);
    await mkdir(join(root, "schemas"));
    await writeFile(join(root, "schemas", "main.dbml"), "Table users { id int [pk] }");
    await expect(resolveWorkspaceDbml(root, "schemas/main.dbml")).resolves.toEqual({
      absolutePath: join(root, "schemas", "main.dbml"),
      relativePath: "schemas/main.dbml",
    });
  });

  it.each([
    [resolve(parse(process.cwd()).root, "absolute.dbml"), "ABSOLUTE_PATH"],
    ["../outside.dbml", "OUTSIDE_WORKSPACE"],
    ["schema.sql", "NOT_DBML"],
    ["missing.dbml", "NOT_FOUND"],
  ])("rejects %s with %s", async (input, code) => {
    const root = await makeTempWorkspace(roots);
    await expect(resolveWorkspaceDbml(root, input)).rejects.toMatchObject({ code });
  });
});
```

The shared test helper is:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function makeTempWorkspace(roots: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dbcodex-test-"));
  roots.push(root);
  return root;
}

export async function removeTempWorkspace(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}
```

- [ ] **Step 3: Run the test and verify the red state**

Run: `npm test -- packages/core/test/path-policy.test.ts`

Expected: FAIL because `path-policy.ts` and the test helper do not exist.

- [ ] **Step 4: Implement canonical containment and the test helper**

`resolveWorkspaceDbml` must reject absolute input, normalize separators to `/`, reject `..` after `path.relative`, require a case-insensitive `.dbml` suffix, call `realpath` for both root and candidate, and repeat containment after canonicalization so junctions and symlinks cannot escape the workspace. Map `ENOENT` to `NOT_FOUND` without including file contents.

```ts
import { realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

export type PathPolicyCode =
  | "ABSOLUTE_PATH"
  | "OUTSIDE_WORKSPACE"
  | "NOT_DBML"
  | "NOT_FOUND";

export class PathPolicyError extends Error {
  constructor(public readonly code: PathPolicyCode, message: string) {
    super(message);
    this.name = "PathPolicyError";
  }
}

function escapes(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

export async function resolveWorkspaceDbml(workspaceRoot: string, input: string) {
  if (isAbsolute(input)) throw new PathPolicyError("ABSOLUTE_PATH", "Use a workspace-relative DBML path.");
  if (extname(input).toLowerCase() !== ".dbml") throw new PathPolicyError("NOT_DBML", "The path must end in .dbml.");

  const root = await realpath(workspaceRoot);
  const unresolved = resolve(root, input);
  if (escapes(root, unresolved)) throw new PathPolicyError("OUTSIDE_WORKSPACE", "The DBML file must stay in the workspace.");

  let candidate: string;
  try {
    candidate = await realpath(unresolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new PathPolicyError("NOT_FOUND", "The DBML file does not exist.");
    }
    throw error;
  }
  if (escapes(root, candidate)) throw new PathPolicyError("OUTSIDE_WORKSPACE", "The DBML file must stay in the workspace.");
  return { absolutePath: candidate, relativePath: relative(root, candidate).split(sep).join("/") };
}
```

- [ ] **Step 5: Run the focused and workspace checks**

Run: `npm test -- packages/core/test/path-policy.test.ts && npm run typecheck`

Expected: all path-policy cases PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the foundation**

```powershell
git add package.json package-lock.json tsconfig.base.json .gitignore packages/core
git commit -m "build: initialize TypeScript workspace"
```

### Task 2: DBML parser adapter and stable graph model

**Files:**
- Create: `packages/core/src/schema-graph.ts`
- Create: `packages/core/src/dbml-adapter.ts`
- Create: `packages/core/test/dbml-adapter.test.ts`
- Create: `fixtures/basic.dbml`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `parseDbml(source: string, sourcePath: string): ParseResult`.
- Produces: `SchemaGraph`, `GraphTable`, `GraphColumn`, `GraphRelation`, and `Diagnostic` types.
- Consumes: `Parser` from `@dbml/core` using `new Parser().parse(source, "dbmlv2")` and `database.normalize()`.

- [ ] **Step 1: Define the public graph contract**

```ts
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
```

- [ ] **Step 2: Add a representative fixture and failing adapter tests**

The fixture contains `public.users`, `public.posts`, `public.comments`, primary keys, and two references. Tests assert three sorted canonical table IDs, column flags, two relation endpoints, zero diagnostics, and an error diagnostic with `graph: null` for malformed DBML. A separate fixture line contains `Records` and the test proves no record value appears in `JSON.stringify(result)`.

- [ ] **Step 3: Run the adapter test and verify failure**

Run: `npm test -- packages/core/test/dbml-adapter.test.ts`

Expected: FAIL because `parseDbml` is not exported.

- [ ] **Step 4: Implement the normalized-model adapter**

Parse with `dbmlv2`, call `normalize()`, index schemas and tables by numeric ID, then map only schemas, tables, fields, refs, and endpoints. Canonical table IDs are `${schema.name}.${table.name}` and column IDs are `${tableId}.${field.name}`. Sort tables, columns, and relations lexicographically. Catch unknown parser failures and return only `error.message` or `"Unable to parse DBML"`; never serialize the database object or source.

```ts
import { Parser } from "@dbml/core";
import type { ParseResult, SchemaGraph } from "./schema-graph.js";

const byId = <T extends { id: number }>(values: T[]) =>
  new Map(values.map((value) => [value.id, value] as const));

export function parseDbml(source: string, sourcePath: string): ParseResult {
  try {
    const model = new Parser().parse(source, "dbmlv2").normalize();
    const schemas = byId(Object.values(model.schemas));
    const normalizedTables = Object.values(model.tables);
    const tablesById = byId(normalizedTables);
    const canonicalTableIds = new Map<number, string>();

    const tables = normalizedTables.map((table) => {
      const schema = schemas.get(table.schemaId);
      if (!schema) throw new Error("Parsed table has no schema.");
      const tableId = `${schema.name}.${table.name}`;
      canonicalTableIds.set(table.id, tableId);
      const columns = table.fieldIds.map((fieldId) => {
        const field = model.fields[fieldId];
        if (!field) throw new Error("Parsed table has a missing field.");
        return {
          id: `${tableId}.${field.name}`,
          name: field.name,
          type: field.type.type_name,
          primaryKey: field.pk,
          nullable: !field.not_null,
        };
      }).sort((a, b) => a.id.localeCompare(b.id));
      return { id: tableId, schema: schema.name, name: table.name, columns };
    }).sort((a, b) => a.id.localeCompare(b.id));

    const relations = Object.values(model.refs).map((ref) => {
      const ends = ref.endpointIds.map((endpointId) => {
        const endpoint = model.endpoints[endpointId];
        if (!endpoint) throw new Error("Parsed relation has a missing endpoint.");
        const field = endpoint.fieldIds.map((fieldId) => model.fields[fieldId])[0];
        const table = field ? tablesById.get(field.tableId) : undefined;
        const tableId = table ? canonicalTableIds.get(table.id) : undefined;
        if (!tableId) throw new Error("Parsed relation has no table.");
        return { tableId, columnNames: endpoint.fieldNames, cardinality: endpoint.relation };
      });
      if (ends.length !== 2 || !ends[0] || !ends[1]) throw new Error("Parsed relation must have two endpoints.");
      return { id: `ref:${ref.id}`, source: ends[0], target: ends[1] };
    }).sort((a, b) => a.id.localeCompare(b.id));

    const graph: SchemaGraph = { sourcePath, tables, relations };
    return { graph, diagnostics: [] };
  } catch (error) {
    const message = error instanceof Error && error.message.trim()
      ? error.message
      : "Unable to parse DBML";
    return { graph: null, diagnostics: [{ severity: "error", message }] };
  }
}
```

- [ ] **Step 5: Verify parser behavior and types**

Run: `npm test -- packages/core/test/dbml-adapter.test.ts && npm run typecheck`

Expected: adapter cases PASS, including the `Records` non-disclosure assertion.

- [ ] **Step 6: Commit the parser boundary**

```powershell
git add fixtures/basic.dbml packages/core
git commit -m "feat: parse DBML into a stable graph"
```

### Task 3: Deterministic atomic layout store

**Files:**
- Create: `packages/core/src/layout-store.ts`
- Create: `packages/core/test/layout-store.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `loadLayout(workspaceRoot, sourcePath): Promise<LayoutLoadResult>`.
- Produces: `saveNodePosition(workspaceRoot, sourcePath, viewName, tableId, position): Promise<LayoutDocument>`.
- Produces: `LayoutDocument` version 1 and `LayoutStoreError` with `INVALID_LAYOUT`, `INVALID_POSITION`, `UNKNOWN_SOURCE`.

- [ ] **Step 1: Write failing tests for absent, valid, corrupt, and updated layouts**

Tests create a temporary workspace, assert an absent sidecar returns an empty version-1 document, save positions in reverse order, then assert the file is located at `.dbcodex/layouts/schemas/main.dbml.layout.json` with sorted view/node keys and no timestamp. A corrupt sidecar returns a warning and is byte-for-byte unchanged. `NaN`, `Infinity`, an empty table ID, and a source containing `..` are rejected.

- [ ] **Step 2: Verify the red state**

Run: `npm test -- packages/core/test/layout-store.test.ts`

Expected: FAIL because the layout store is absent.

- [ ] **Step 3: Implement schema validation and atomic writes**

Use Zod for the version-1 JSON shape and `write-file-atomic` for replacement. Store only finite numbers. `loadLayout` returns `{ document, warnings, writable }`; a corrupt existing document sets `writable: false`. `saveNodePosition` refuses to overwrite when `writable` is false. Serialize with recursively sorted object keys and two-space indentation followed by one newline.

```ts
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { z } from "zod";

const positionSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const layoutSchema = z.object({
  version: z.literal(1),
  source: z.string().min(1),
  views: z.record(z.string(), z.object({ nodes: z.record(z.string(), positionSchema) })),
});

export type Position = z.infer<typeof positionSchema>;
export type LayoutDocument = z.infer<typeof layoutSchema>;
export interface LayoutLoadResult {
  document: LayoutDocument;
  warnings: string[];
  writable: boolean;
}

export class LayoutStoreError extends Error {
  constructor(public readonly code: "INVALID_LAYOUT" | "INVALID_POSITION" | "UNKNOWN_SOURCE", message: string) {
    super(message);
    this.name = "LayoutStoreError";
  }
}

function cleanSource(source: string): string {
  const normalized = source.replaceAll("\\", "/");
  if (!normalized.endsWith(".dbml") || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new LayoutStoreError("UNKNOWN_SOURCE", "Layout source must be a workspace-relative DBML path.");
  }
  return normalized;
}

function sidecarPath(root: string, source: string): string {
  return join(root, ".dbcodex", "layouts", ...cleanSource(source).split("/")) + ".layout.json";
}

const emptyLayout = (source: string): LayoutDocument => ({ version: 1, source, views: {} });

export async function loadLayout(root: string, source: string): Promise<LayoutLoadResult> {
  const clean = cleanSource(source);
  try {
    const parsed = JSON.parse(await readFile(sidecarPath(root, clean), "utf8"));
    const result = layoutSchema.safeParse(parsed);
    if (!result.success) return { document: emptyLayout(clean), warnings: ["Layout sidecar is invalid."], writable: false };
    return { document: result.data, warnings: [], writable: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { document: emptyLayout(clean), warnings: [], writable: true };
    }
    if (error instanceof SyntaxError) return { document: emptyLayout(clean), warnings: ["Layout sidecar is invalid."], writable: false };
    throw error;
  }
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortDeep(item)]));
  }
  return value;
}

export async function saveNodePosition(
  root: string,
  source: string,
  view: string,
  tableId: string,
  position: Position,
): Promise<LayoutDocument> {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !tableId.trim()) {
    throw new LayoutStoreError("INVALID_POSITION", "Position and table ID must be valid.");
  }
  const loaded = await loadLayout(root, source);
  if (!loaded.writable) throw new LayoutStoreError("INVALID_LAYOUT", "Repair the invalid layout before saving.");
  const nodes = { ...(loaded.document.views[view]?.nodes ?? {}), [tableId]: position };
  const document: LayoutDocument = {
    ...loaded.document,
    views: { ...loaded.document.views, [view]: { nodes } },
  };
  const target = sidecarPath(root, source);
  await mkdir(dirname(target), { recursive: true });
  await writeFileAtomic(target, `${JSON.stringify(sortDeep(document), null, 2)}\n`, { encoding: "utf8" });
  return document;
}
```

- [ ] **Step 4: Verify focused tests and the entire core package**

Run: `npm test -- packages/core && npm run typecheck`

Expected: all core tests PASS with no type errors.

- [ ] **Step 5: Commit durable layout storage**

```powershell
git add packages/core
git commit -m "feat: persist deterministic table layouts"
```

### Task 4: Headless MCP tools and stdio server

**Files:**
- Create: `packages/mcp/package.json`
- Create: `packages/mcp/tsconfig.json`
- Create: `packages/mcp/src/contracts.ts`
- Create: `packages/mcp/src/handlers.ts`
- Create: `packages/mcp/src/create-server.ts`
- Create: `packages/mcp/src/index.ts`
- Create: `packages/mcp/test/handlers.test.ts`
- Create: `packages/mcp/test/server.test.ts`

**Interfaces:**
- Produces headless tool: `open_dbml({ path })`; Task 5 attaches the UI resource after the resource exists.
- Produces tool: `save_layout({ path, view, tableId, x, y })`, visible to the app and model.
- Consumes core: `resolveWorkspaceDbml`, `parseDbml`, `loadLayout`, `saveNodePosition`.

`packages/mcp/package.json` uses the exact runtime dependencies below; its build script is `tsc -p tsconfig.json` and its package dependency on core is `0.1.0-dev.0`.

```json
{
  "name": "@dbcodex/mcp",
  "version": "0.1.0-dev.0",
  "private": true,
  "type": "module",
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit" },
  "dependencies": {
    "@dbcodex/core": "0.1.0-dev.0",
    "@modelcontextprotocol/ext-apps": "2.0.0",
    "@modelcontextprotocol/sdk": "1.30.1",
    "zod": "4.6.5"
  }
}
```

- [ ] **Step 1: Write failing handler tests with dependency injection**

Test that `open_dbml` resolves a workspace-relative path, returns `structuredContent` containing `graph`, `layout`, `diagnostics`, and `sourcePath`, and returns concise text without DBML content. Test that `save_layout` returns the authoritative position. Inject spies for core dependencies so handler tests do not require a transport.

- [ ] **Step 2: Run the handler test and verify failure**

Run: `npm test -- packages/mcp/test/handlers.test.ts`

Expected: FAIL because the handlers are absent.

- [ ] **Step 3: Implement handlers and Zod schemas**

`open_dbml` reads UTF-8 only after path validation, parses the text, loads the layout, and returns a result usable without UI. `save_layout` validates finite coordinates and delegates all path/storage checks to core. Both handlers convert known domain errors to stable, non-sensitive messages; unexpected errors become `dbcodex failed without exposing file contents`.

```ts
import { readFile } from "node:fs/promises";
import {
  loadLayout,
  parseDbml,
  resolveWorkspaceDbml,
  saveNodePosition,
} from "@dbcodex/core";

export function createHandlers(workspaceRoot: string) {
  return {
    openDbml: async ({ path }: { path: string }) => {
      const resolved = await resolveWorkspaceDbml(workspaceRoot, path);
      const source = await readFile(resolved.absolutePath, "utf8");
      const parsed = parseDbml(source, resolved.relativePath);
      const layout = await loadLayout(workspaceRoot, resolved.relativePath);
      const structuredContent = {
        sourcePath: resolved.relativePath,
        graph: parsed.graph,
        diagnostics: parsed.diagnostics,
        layout: layout.document,
        layoutWarnings: layout.warnings,
      };
      return {
        structuredContent,
        content: [{
          type: "text" as const,
          text: parsed.graph
            ? `Opened ${resolved.relativePath}: ${parsed.graph.tables.length} tables and ${parsed.graph.relations.length} relations.`
            : `Could not parse ${resolved.relativePath}.`,
        }],
      };
    },
    saveLayout: async (input: { path: string; view: string; tableId: string; x: number; y: number }) => {
      const resolved = await resolveWorkspaceDbml(workspaceRoot, input.path);
      const layout = await saveNodePosition(
        workspaceRoot,
        resolved.relativePath,
        input.view,
        input.tableId,
        { x: input.x, y: input.y },
      );
      return {
        structuredContent: { sourcePath: resolved.relativePath, view: input.view, tableId: input.tableId, position: { x: input.x, y: input.y }, layout },
        content: [{ type: "text" as const, text: `Saved ${input.tableId} in ${input.view}.` }],
      };
    },
  };
}
```

- [ ] **Step 4: Write the failing MCP registration test**

Export `buildToolDefinitions()` from `create-server.ts`. Create the server with a temporary workspace and assert the returned definitions contain `open_dbml` and `save_layout`, both use closed-world annotations, and neither definition contains a UI URI before Task 5 registers the resource.

- [ ] **Step 5: Register tools and connect stdio**

Use `McpServer` and `StdioServerTransport`; Task 5 upgrades `open_dbml` to `registerAppTool` when the UI resource exists. Read the workspace root once from `process.cwd()`. Send logs only to `stderr`; `stdout` is reserved for MCP. `index.ts` catches startup failure, writes the sanitized message to `stderr`, and sets `process.exitCode = 1`.

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createHandlers } from "./handlers.js";

export const buildToolDefinitions = () => ({
  open: {
    title: "Open DBML diagram",
    description: "Open and parse a workspace-relative DBML file.",
    inputSchema: { path: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  save: {
    title: "Save DBML table position",
    description: "Persist one table position for a DBML diagram view.",
    inputSchema: {
      path: z.string().min(1),
      view: z.string().min(1),
      tableId: z.string().min(1),
      x: z.number().finite(),
      y: z.number().finite(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
});

export function createServer(workspaceRoot: string): McpServer {
  const server = new McpServer({ name: "dbcodex", version: "0.1.0-dev.0" });
  const handlers = createHandlers(workspaceRoot);
  const definitions = buildToolDefinitions();
  server.registerTool("open_dbml", definitions.open, handlers.openDbml);
  server.registerTool("save_layout", definitions.save, handlers.saveLayout);
  return server;
}

const server = createServer(process.cwd());
server.connect(new StdioServerTransport()).catch(() => {
  process.stderr.write("dbcodex MCP server failed to start.\n");
  process.exitCode = 1;
});
```

- [ ] **Step 6: Verify MCP tests, typecheck, and build**

Run: `npm test -- packages/mcp && npm run typecheck && npm run build --workspace @dbcodex/mcp`

Expected: MCP tests PASS and `packages/mcp/dist/index.js` exists.

- [ ] **Step 7: Commit headless MCP behavior**

```powershell
git add packages/mcp package.json package-lock.json
git commit -m "feat: expose DBML tools over MCP"
```

### Task 5: React/SVG MCP Apps interface

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/bridge.ts`
- Create: `packages/ui/src/geometry.ts`
- Create: `packages/ui/src/DiagramApp.tsx`
- Create: `packages/ui/src/styles.css`
- Create: `packages/ui/src/index.tsx`
- Create: `packages/ui/test/DiagramApp.test.tsx`
- Create: `packages/ui/test/bridge.test.ts`
- Modify: `packages/mcp/src/create-server.ts`
- Create: `packages/mcp/src/ui-resource.ts`
- Create: `packages/mcp/test/ui-resource.test.ts`

**Interfaces:**
- Produces: `McpAppsBridge` that initializes with protocol `2026-01-26`, receives `ui/notifications/tool-result`, and calls tools through `tools/call`.
- Produces: `DiagramApp({ graph, saved, save })`.
- Produces MCP resource: `ui://dbcodex/diagram-v1.html` with MIME type `text/html;profile=mcp-app`.

```json
{
  "name": "@dbcodex/ui",
  "version": "0.1.0-dev.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "esbuild src/index.tsx --bundle --format=iife --outfile=dist/widget.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@dbcodex/core": "0.1.0-dev.0",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "esbuild": "0.28.2",
    "jsdom": "30.1.1"
  }
}
```

- [ ] **Step 1: Write failing bridge tests**

Use a fake parent window. Assert `ui/initialize` is requested, `ui/notifications/initialized` follows the response, tool-result notifications update subscribers, and `callTool("save_layout", arguments)` resolves the matching JSON-RPC response. Ignore messages whose source is not `window.parent` or whose `jsonrpc` is not `"2.0"`.

- [ ] **Step 2: Implement the MCP Apps bridge**

Maintain a monotonically increasing numeric request ID and a map of pending promises. Remove every settled request. Expose `start`, `subscribeToToolResults`, `callTool`, and `dispose`; `dispose` removes the event listener and rejects outstanding requests.

```ts
type RpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: unknown };
type RpcNotification = { jsonrpc: "2.0"; method: string; params?: unknown };

export class McpAppsBridge {
  private nextId = 0;
  private pending = new Map<number, { resolve(value: unknown): void; reject(reason: unknown): void }>();
  private listeners = new Set<(result: unknown) => void>();
  private ready: Promise<void> | null = null;

  private onMessage = (event: MessageEvent<RpcResponse | RpcNotification>) => {
    if (event.source !== window.parent || event.data?.jsonrpc !== "2.0") return;
    const message = event.data;
    if ("id" in message) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(message.error); else pending.resolve(message.result);
      return;
    }
    if (message.method === "ui/notifications/tool-result") {
      this.listeners.forEach((listener) => listener(message.params));
    }
  };

  private request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    });
  }

  start(): Promise<void> {
    if (this.ready) return this.ready;
    window.addEventListener("message", this.onMessage);
    this.ready = this.request("ui/initialize", {
      appInfo: { name: "dbcodex-diagram", version: "0.1.0-dev.0" },
      appCapabilities: {},
      protocolVersion: "2026-01-26",
    }).then(() => {
      window.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }, "*");
    });
    return this.ready;
  }

  subscribeToToolResults(listener: (result: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.start();
    return this.request("tools/call", { name, arguments: args });
  }

  dispose(): void {
    window.removeEventListener("message", this.onMessage);
    this.pending.forEach(({ reject }) => reject(new Error("MCP Apps bridge disposed.")));
    this.pending.clear();
    this.listeners.clear();
  }
}
```

- [ ] **Step 3: Write failing UI interaction tests**

Render three tables and two relations. Assert accessible table groups, file/validation status, visible focus, and a recenter button. Simulate pointer movement and keyboard arrows; assert local coordinates update immediately and exactly one `save_layout` call occurs when the pointer is released or the keyboard movement completes. Re-render with a saved layout and assert the SVG transform uses the saved coordinates.

- [ ] **Step 4: Implement the minimal SVG diagram**

Use fixed table width, deterministic initial grid positions, derived table height, and straight relation lines behind nodes. Each table is a focusable `<g role="group" aria-label="Table …">`. Arrow keys move by 10 pixels; Shift+Arrow moves by 1 pixel. Pointer capture handles dragging. Text uses React escaping only; no `dangerouslySetInnerHTML`.

```tsx
import { useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { SchemaGraph } from "@dbcodex/core";

type Position = { x: number; y: number };
type Save = (tableId: string, position: Position) => Promise<void>;

export function DiagramApp({ graph, saved, save }: { graph: SchemaGraph; saved: Record<string, Position>; save: Save }) {
  const initial = useMemo(() => Object.fromEntries(graph.tables.map((table, index) => [
    table.id,
    saved[table.id] ?? { x: 40 + (index % 3) * 280, y: 60 + Math.floor(index / 3) * 220 },
  ])), [graph, saved]);
  const [positions, setPositions] = useState(initial);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);

  const move = (id: string, position: Position) => setPositions((current) => ({ ...current, [id]: position }));
  const onPointerDown = (event: PointerEvent<SVGGElement>, id: string) => {
    const position = positions[id];
    if (!position) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id, dx: event.clientX - position.x, dy: event.clientY - position.y });
  };
  const onPointerMove = (event: PointerEvent<SVGGElement>) => {
    if (drag) move(drag.id, { x: event.clientX - drag.dx, y: event.clientY - drag.dy });
  };
  const finishDrag = async () => {
    if (!drag) return;
    const position = positions[drag.id];
    setDrag(null);
    if (position) await save(drag.id, position);
  };
  const onKeyDown = async (event: KeyboardEvent<SVGGElement>, id: string) => {
    const delta = event.shiftKey ? 1 : 10;
    const offsets: Record<string, Position> = {
      ArrowLeft: { x: -delta, y: 0 }, ArrowRight: { x: delta, y: 0 },
      ArrowUp: { x: 0, y: -delta }, ArrowDown: { x: 0, y: delta },
    };
    const offset = offsets[event.key];
    const current = positions[id];
    if (!offset || !current) return;
    event.preventDefault();
    const next = { x: current.x + offset.x, y: current.y + offset.y };
    move(id, next);
    await save(id, next);
  };

  return <main>
    <header><strong>{graph.sourcePath}</strong><span role="status">Valid DBML</span><button type="button">Recenter</button></header>
    <svg aria-label="DBML diagram" viewBox="0 0 1000 700">
      <g aria-hidden="true">{graph.relations.map((relation) => {
        const a = positions[relation.source.tableId]; const b = positions[relation.target.tableId];
        return a && b ? <line key={relation.id} x1={a.x + 220} y1={a.y + 30} x2={b.x} y2={b.y + 30} /> : null;
      })}</g>
      {graph.tables.map((table) => {
        const position = positions[table.id];
        if (!position) return null;
        return <g key={table.id} role="group" aria-label={`Table ${table.id}`} tabIndex={0}
          transform={`translate(${position.x} ${position.y})`}
          onPointerDown={(event) => onPointerDown(event, table.id)} onPointerMove={onPointerMove}
          onPointerUp={finishDrag} onPointerCancel={finishDrag}
          onKeyDown={(event) => onKeyDown(event, table.id)}>
          <rect width="220" height={44 + table.columns.length * 24} rx="8" />
          <text x="12" y="27" className="table-title">{table.id}</text>
          {table.columns.map((column, index) => <text key={column.id} x="12" y={54 + index * 24}>
            {column.primaryKey ? "PK " : ""}{column.name}: {column.type}
          </text>)}
        </g>;
      })}
    </svg>
  </main>;
}
```

- [ ] **Step 5: Add accessible host-aware styling**

Use system fonts and CSS custom properties with light defaults plus `prefers-color-scheme: dark`. Provide a 3:1 focus outline, non-color validation labels, minimum 32-pixel controls, and `touch-action: none` only on draggable table groups. Do not load fonts, images, scripts, or styles from a URL.

- [ ] **Step 6: Bundle and register the UI resource**

Build `packages/ui/dist/widget.js` as one IIFE with esbuild. `ui-resource.ts` reads that bundle relative to `import.meta.url`, escapes the closing `</script` sequence, and embeds it in HTML containing `<div id="root"></div>`. Register with `registerAppResource` and `RESOURCE_MIME_TYPE`; declare an empty CSP domain allowlist and `prefersBorder: false`.

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const DIAGRAM_URI = "ui://dbcodex/diagram-v1.html";

export async function registerDiagramResource(server: McpServer): Promise<void> {
  const bundleUrl = new URL("../../ui/dist/widget.js", import.meta.url);
  const bundle = (await readFile(fileURLToPath(bundleUrl), "utf8")).replaceAll("</script", "<\\/script");
  registerAppResource(server, "dbcodex-diagram", DIAGRAM_URI, {}, async () => ({
    contents: [{
      uri: DIAGRAM_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: `<div id="root"></div><script>${bundle}</script>`,
      _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } } },
    }],
  }));
}
```

Change `createServer` to `async`, await `registerDiagramResource(server)`, attach `_meta: { ui: { resourceUri: DIAGRAM_URI } }` to `open_dbml`, and await `createServer(process.cwd())` before connecting `StdioServerTransport`. This prevents advertising a template before its bundle is readable.

- [ ] **Step 7: Test the resource envelope and complete UI suite**

Run: `npm run build --workspace @dbcodex/ui && npm test -- packages/ui packages/mcp/test/ui-resource.test.ts && npm run typecheck`

Expected: UI and resource tests PASS; the HTML contains the root and bundled script but no `http://` or `https://` references.

- [ ] **Step 8: Commit the interactive component**

```powershell
git add packages/ui packages/mcp package.json package-lock.json
git commit -m "feat: render an interactive DBML diagram"
```

### Task 6: Portable plugin package and repository-local test entry

**Files:**
- Create: `plugin.json`
- Create: `mcp.json`
- Create: `skills/dbcodex/SKILL.md`
- Create: `.agents/plugins/marketplace.json`
- Create: `.codex/config.toml`
- Create: `test/plugin-manifest.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces plugin identity: `dbcodex`, development version `0.1.0-dev.0`.
- Produces bundled MCP server name: `dbcodex` using local `stdio` and `node`.
- Produces skill name: `dbcodex` instructing Codex to call `open_dbml` for workspace-relative DBML files.

- [ ] **Step 1: Write failing manifest tests**

Parse the three JSON files and assert the Agent Plugins schemas are present, names match `dbcodex`, the marketplace source is `./`, paths stay within the repository, and the MCP command resolves to the built server without a network URL. Parse `SKILL.md` frontmatter and assert it names `dbcodex` and mentions both tools.

- [ ] **Step 2: Create the portable plugin manifest**

Use root `plugin.json` with schema `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, name `dbcodex`, version `0.1.0-dev.0`, repository URL, description, and OpenAI interface metadata. Omit the `license` field because the license decision is deferred.

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "dbcodex",
  "version": "0.1.0-dev.0",
  "description": "Open and explore local DBML diagrams directly in Codex.",
  "repository": "https://github.com/Qappyld/dbcodex",
  "extensions": {
    "com.openai": {
      "interface": {
        "displayName": "dbcodex",
        "shortDescription": "Explore local DBML diagrams in Codex",
        "longDescription": "Open, validate, and interact with local DBML diagrams without sending schema files to an external service.",
        "developerName": "Qappyld",
        "category": "Developer Tools",
        "capabilities": ["Read", "Write"],
        "defaultPrompt": ["Open fixtures/basic.dbml with dbcodex."],
        "brandColor": "#6D5EF5"
      }
    }
  }
}
```

- [ ] **Step 3: Create the local stdio declaration**

Use root `mcp.json` with schema `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`. Declare one server with `type: "stdio"`, command `node`, and `args: ["${PLUGIN_ROOT}/packages/mcp/dist/index.js"]`. Omit `cwd` so the host process inherits the active workspace as `process.cwd()`. Do not declare an HTTP URL, credential, or network access.

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "dbcodex": {
      "type": "stdio",
      "command": "node",
      "args": ["${PLUGIN_ROOT}/packages/mcp/dist/index.js"]
    }
  }
}
```

- [ ] **Step 4: Add the skill and local marketplace**

The skill tells Codex to request a workspace-relative `.dbml` path, call `open_dbml`, show diagnostics without leaking source, and use `save_layout` only for an explicit user/UI movement. The repo marketplace exposes the root plugin as available, and `.codex/config.toml` enables `dbcodex@dbcodex-local` for this trusted project.

```markdown
---
name: dbcodex
description: Open, validate, and interact with local DBML files directly in Codex.
---

Use `open_dbml` with a workspace-relative `.dbml` path. Present parser diagnostics without quoting the full source. The interactive component may call `save_layout` after the user moves a table; do not call `save_layout` for speculative or implicit changes. Never send DBML content to a network service.
```

```json
{
  "name": "dbcodex-local",
  "plugins": [{
    "name": "dbcodex",
    "source": { "source": "local", "path": "./" },
    "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
    "category": "Developer Tools"
  }]
}
```

```toml
[plugins."dbcodex@dbcodex-local"]
enabled = true
```

- [ ] **Step 5: Document local build and reload behavior**

README commands are `npm ci`, `npm run build`, `npm test`, `codex plugin marketplace add .`, and `codex plugin marketplace list`. State that a new Codex task is required after plugin changes and that the compatibility spike is not a public release.

- [ ] **Step 6: Verify packaging**

Run: `npm test -- test/plugin-manifest.test.ts && npm run build && npm run typecheck && npm test`

Expected: manifest test and full suite PASS; all three workspace packages build.

- [ ] **Step 7: Commit the installable development plugin**

```powershell
git add plugin.json mcp.json skills .agents .codex test README.md package.json package-lock.json
git commit -m "feat: package dbcodex for local Codex testing"
```

### Task 7: Codex compatibility proof and release gate

**Files:**
- Create: `scripts/check-offline-ui.mjs`
- Create: `docs/evidence/codex-spike.md`
- Modify: `package.json`
- Modify: `docs/decisions.md`

**Interfaces:**
- Produces script: `npm run verify:offline-ui`.
- Produces evidence fields: Codex version, OS, Node version, fixture, render result, drag result, persistence result, latency, longest task, network observation, final verdict.

- [ ] **Step 1: Write the failing offline-bundle test**

The script reads the emitted UI HTML through the resource builder and fails if it finds remote `src`, `href`, CSS `url(http…)`, `fetch(`, `XMLHttpRequest`, `WebSocket`, or `EventSource`. It also fails when the HTML lacks the MCP Apps MIME resource marker and versioned `ui://dbcodex/diagram-v1.html` URI.

- [ ] **Step 2: Run and then satisfy the offline check**

Run: `npm run build && npm run verify:offline-ui`

Expected: first run FAIL until the script is wired; after implementation, PASS with `No remote UI dependencies detected`.

- [ ] **Step 3: Run the complete automated gate**

Run: `npm ci && npm run build && npm run typecheck && npm test && npm run verify:offline-ui`

Expected: every command exits 0 with no failed test.

- [ ] **Step 4: Install/reload the local plugin in Codex**

Add or refresh the repository marketplace, restart the desktop app when required, create a new Codex task in this repository, enable `dbcodex`, and request: `Ouvre fixtures/basic.dbml avec dbcodex.`

- [ ] **Step 5: Execute the decisive manual acceptance path**

Confirm the component renders inside Codex, displays exactly three tables and two relations, moves `public.posts`, saves the position, closes, reopens, and restores the exact coordinates. With network observation enabled, confirm zero request from the component. Record open-to-interactive latency and the longest UI task; both must remain below the design budgets.

- [ ] **Step 6: Record evidence without overstating the outcome**

Fill every evidence field. Set verdict to `PASS` only when all acceptance steps are observed. Otherwise set `FAIL`, name the precise unsupported bridge/resource/tool-call capability, and leave the V1 blocked. Never mark an unexecuted field as passing.

- [ ] **Step 7: Update project status and commit evidence**

If PASS, change the decision register to authorize V1 planning. If FAIL, record that the Codex integration gate remains closed. Then run the complete automated gate again and commit:

```powershell
git add scripts package.json docs/evidence/codex-spike.md docs/decisions.md
git commit -m "test: record Codex compatibility spike"
```

## Final Verification

- [ ] Run `npm ci` from a clean dependency state.
- [ ] Run `npm run build` and confirm core, UI, then MCP build successfully.
- [ ] Run `npm run typecheck` with zero errors.
- [ ] Run `npm test` with zero failed tests.
- [ ] Run `npm run verify:offline-ui` and confirm no remote dependency.
- [ ] Run `git diff --check` and confirm no whitespace errors.
- [ ] Confirm the actual Codex result in `docs/evidence/codex-spike.md` matches observed behavior.
- [ ] Push only after local HEAD, the recorded evidence, and the final test output agree.
