import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DBCD_MAX_SOURCE_BYTES, DBCD_MAX_PRESENTATION_BYTES, emptyProjectModel, openDbcdProject, saveDbcdDraft, type DbcdProjectSnapshot } from "@dbcodex/core";
import { createHandlers } from "../src/handlers.js";
import { createAssistantHandlers } from "../src/assistant-handlers.js";
import { buildToolDefinitions, createServer } from "../src/create-server.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "dbcodex-assistant-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const path = "project.dbcd";
const sourceText = "// keep this comment\nTable customers {\n id int [pk]\n name Text\n}\n";
const model = () => ({ ...emptyProjectModel({ mode: "sharepoint" }), tables: {
  "public.customers": { displayName: "Clients", kind: "list" as const, columns: {
    name: { displayName: "Nom", type: "Text", options: { maxLength: 120 } },
  } },
} });
const expected = (snapshot: DbcdProjectSnapshot) => ({ path, expectedProjectId: snapshot.projectId,
  expectedRevisionId: snapshot.currentRevisionId, expectedGeneration: snapshot.generation });
async function setup() {
  const created = await createHandlers(root).createDbcd({ path, profile: { mode: "sharepoint" }, sourceText, model: model() });
  expect(created).not.toHaveProperty("isError");
  return { snapshot: await openDbcdProject({ workspaceRoot: root, projectPath: path }), assistant: createAssistantHandlers(root) };
}

it("creates a populated project, explicitly reads model content, and keeps UI opening private", async () => {
  const { snapshot, assistant } = await setup();
  expect(snapshot.presentation.model).toEqual(model());
  const read = await assistant.read({ path });
  expect(read).toMatchObject({ structuredContent: { sourceText, model: model(), projectId: snapshot.projectId, hasDraft: false } });
  expect(JSON.parse(read.content[0]!.text)).toMatchObject({ sourceText });
  const ui = await createHandlers(root).openDbcd({ path });
  expect(JSON.stringify(ui.structuredContent)).not.toContain("// keep this comment");
});

it("previews without writing then atomically saves source and model while preserving the diagram", async () => {
  const { snapshot, assistant } = await setup();
  const changed = model();
  changed.tables["public.customers"].columns.name.options.maxLength = 240;
  const args = { ...expected(snapshot), model: changed, sourceText: sourceText.replace("id int", "id bigint"), label: "Update clients" };
  expect(await assistant.validate(args)).toMatchObject({ structuredContent: { valid: true, sourceChanged: true, modelChanged: true } });
  expect((await openDbcdProject({ workspaceRoot: root, projectPath: path })).generation).toBe(1);
  expect(await assistant.update(args)).toMatchObject({ structuredContent: { saved: true, generation: 2 } });
  const saved = await openDbcdProject({ workspaceRoot: root, projectPath: path });
  expect(saved.sourceText).toBe(args.sourceText);
  expect(saved.presentation.views).toEqual(snapshot.presentation.views);
  expect(saved.presentation.model).toEqual(changed);
  expect(saved.revisions).toHaveLength(2);
  expect(saved.revisions[0]?.label).toBe("Update clients");
  expect(await assistant.update(args)).toMatchObject({ isError: true, structuredContent: { errorCode: "CONFLICT" } });
  expect((await openDbcdProject({ workspaceRoot: root, projectPath: path })).revisions).toHaveLength(2);
});

it("preserves omitted source and business properties on partial updates", async () => {
  const { snapshot, assistant } = await setup();
  const changed = model(); changed.tables["public.customers"].displayName = "Comptes";
  expect(await assistant.update({ ...expected(snapshot), model: changed })).not.toHaveProperty("isError");
  const saved = await openDbcdProject({ workspaceRoot: root, projectPath: path });
  expect(saved.sourceText).toBe(sourceText);
  expect(await assistant.update({ ...expected(saved), sourceText: sourceText + "\n// more" })).not.toHaveProperty("isError");
  expect((await openDbcdProject({ workspaceRoot: root, projectPath: path })).presentation.model).toEqual(changed);
});

it("rejects drafts without exposing their contents by default or discarding them", async () => {
  const { snapshot, assistant } = await setup();
  await saveDbcdDraft({ workspaceRoot: root, projectPath: path, ...expected(snapshot), baseGeneration: 1,
    sourceText: "// secret draft", presentation: snapshot.presentation });
  const read = await assistant.read({ path });
  expect(JSON.stringify(read)).not.toContain("secret draft");
  expect(read).toMatchObject({ structuredContent: { hasDraft: true } });
  expect(JSON.stringify(await assistant.read({ path, includeDraft: true }))).toContain("secret draft");
  for (const action of [assistant.validate, assistant.update]) {
    expect(await action({ ...expected(snapshot), sourceText })).toMatchObject({ isError: true, structuredContent: { errorCode: "CONFLICT" } });
  }
  expect((await openDbcdProject({ workspaceRoot: root, projectPath: path })).draft?.sourceText).toBe("// secret draft");
});

it("rejects invalid DBML, invalid business options, orphan metadata and profile conversion without saving", async () => {
  const { snapshot, assistant } = await setup();
  const invalid = model(); invalid.tables["public.customers"].columns.name.options.maxLength = 300;
  for (const changes of [{ sourceText: "Table {" }, { model: invalid }, { sourceText: "// removed tables" },
    { model: { ...model(), profile: { mode: "generic" as const } } }]) {
    expect(await assistant.update({ ...expected(snapshot), ...changes })).toMatchObject({ isError: true });
  }
  expect((await openDbcdProject({ workspaceRoot: root, projectPath: path })).generation).toBe(1);
});

it("never creates an invalid file or overwrites an existing destination", async () => {
  const handlers = createHandlers(root);
  expect(await handlers.createDbcd({ path, profile: { mode: "generic" }, sourceText: "Table {" })).toMatchObject({ isError: true });
  expect(await readdir(root)).toEqual([]);
  const { snapshot } = await setup();
  expect(await handlers.createDbcd({ path, profile: { mode: "generic" } })).toMatchObject({ isError: true });
  expect((await openDbcdProject({ workspaceRoot: root, projectPath: path })).projectId).toBe(snapshot.projectId);
});

it("refuses foreign identities, empty changes and workspace traversal", async () => {
  const { snapshot, assistant } = await setup();
  expect(await assistant.update({ ...expected(snapshot), expectedProjectId: "other", sourceText })).toMatchObject({ isError: true });
  expect(await assistant.update(expected(snapshot))).toMatchObject({ isError: true });
  expect(await assistant.read({ path: "../project.dbcd" })).toMatchObject({ isError: true });
  expect(await createAssistantHandlers([]).read({ path })).toMatchObject({ isError: true });
  const definitions = buildToolDefinitions();
  expect(definitions.updateAssistant.inputSchema.safeParse(expected(snapshot)).success).toBe(false);
  expect(definitions.createDbcd.inputSchema.safeParse({ path, profile: { mode: "generic" }, model: {} }).success).toBe(false);
  expect(definitions.updateAssistant.inputSchema.safeParse({ ...expected(snapshot), sourceText: "é".repeat(DBCD_MAX_SOURCE_BYTES / 2 + 1) }).success).toBe(false);
  expect(definitions.createDbcd.inputSchema.safeParse({ path, profile: { mode: "sharepoint" }, model: {
    ...model(), relationships: [{ id: "x".repeat(DBCD_MAX_PRESENTATION_BYTES), name: "x", sourceTableId: "a", targetTableId: "b", kind: "many-to-many" }],
  } }).success).toBe(false);
});

it("allows only one concurrent update from the same version", async () => {
  const { snapshot, assistant } = await setup();
  const replies = await Promise.all(["first", "second"].map(comment =>
    assistant.update({ ...expected(snapshot), sourceText: sourceText + `\n// ${comment}` })));
  expect(replies.filter(reply => "isError" in reply)).toHaveLength(1);
  const saved = await openDbcdProject({ workspaceRoot: root, projectPath: path });
  expect(saved.generation).toBe(2);
  expect(saved.revisions).toHaveLength(2);
});

it("creates a fixed SQL profile and refuses changing its dialect", async () => {
  const handlers = createHandlers(root);
  expect(await handlers.createDbcd({ path, profile: { mode: "sql", dialect: "sqlite" }, sourceText: "Table users { id integer [pk] }" })).not.toHaveProperty("isError");
  const snapshot = await openDbcdProject({ workspaceRoot: root, projectPath: path });
  expect(await createAssistantHandlers(root).update({ ...expected(snapshot), model: emptyProjectModel({ mode: "sql", dialect: "mysql" }) }))
    .toMatchObject({ isError: true, structuredContent: { errorCode: "INVALID_PRESENTATION" } });
});

it("supports Dataverse many-to-many properties and validates missing relationship targets", async () => {
  const dataverse = { ...emptyProjectModel({ mode: "dataverse", publisherPrefix: "app" }), relationships: [
    { id: "clients_tags", name: "Clients tags", sourceTableId: "public.app_client", targetTableId: "public.app_tag", kind: "many-to-many" as const },
  ] };
  const created = await createHandlers(root).createDbcd({ path, profile: dataverse.profile, model: dataverse,
    sourceText: "Table app_client { id Uniqueidentifier [pk] }\nTable app_tag { id Uniqueidentifier [pk] }" });
  expect(created).not.toHaveProperty("isError");
  const snapshot = await openDbcdProject({ workspaceRoot: root, projectPath: path });
  dataverse.relationships[0]!.targetTableId = "public.missing";
  expect(await createAssistantHandlers(root).update({ ...expected(snapshot), model: dataverse })).toMatchObject({ isError: true });
});

it("serves a plain MCP client with no Apps capability through discovery, creation, read, preview and commit", async () => {
  const server = createServer(root);
  const client = new Client({ name: "plain-assistant", version: "1" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    for (const name of ["read_dbcd", "validate_dbcd_changes", "update_dbcd"]) {
      expect(tools.tools.find(tool => tool.name === name)?._meta?.ui).toBeUndefined();
    }
    expect(await client.callTool({ name: "create_dbcd", arguments: { path, profile: { mode: "generic" }, sourceText } })).not.toHaveProperty("isError");
    const read = await client.callTool({ name: "read_dbcd", arguments: { path } });
    const data = read.structuredContent!;
    const args = { path, expectedProjectId: data.projectId, expectedGeneration: data.generation,
      expectedRevisionId: data.currentRevisionId, sourceText: sourceText + "\n// assistant edit" };
    expect(await client.callTool({ name: "validate_dbcd_changes", arguments: args })).not.toHaveProperty("isError");
    expect(await client.callTool({ name: "update_dbcd", arguments: args })).toMatchObject({ structuredContent: { saved: true, generation: 2 } });
  } finally { await client.close(); await server.close(); }
});
