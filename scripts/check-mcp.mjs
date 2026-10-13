import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(import.meta.dirname, "..");
const serverEntry = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "packages/mcp/dist/index.js");
const workspace = await mkdtemp(path.join(os.tmpdir(), "dbcodex-mcp-"));
await mkdir(path.join(workspace, "fixtures"));
await copyFile(path.join(root, "fixtures/basic.dbml"), path.join(workspace, "fixtures/basic.dbml"));
await copyFile(path.join(root, "fixtures/demo-shop.dbcd"), path.join(workspace, "fixtures/demo-shop.dbcd"));
await mkdir(path.join(workspace, "fixtures", "directory.dbml"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry, "--trust-cwd-as-workspace"],
  cwd: workspace,
  stderr: "pipe",
});
const client = new Client(
  { name: "dbcodex-verifier", version: "0.1.0" },
  {
    capabilities: {
      extensions: {
        "io.modelcontextprotocol/ui": {
          mimeTypes: ["text/html;profile=mcp-app"],
        },
      },
    },
  },
);

let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name).sort(), [
    "apply_dbcd_edits",
    "discard_dbcd_draft", "export_dbml", "import_dbml", "list_dbcd_revisions", "open_dbcd", "open_dbml",
    "open_dbcd_app", "open_dbcd_file", "open_dbcd_workbench", "pin_dbcd_revision", "read_dbcd_revision", "resolve_dbcd_file", "restore_dbcd_revision", "save_dbcd", "save_dbcd_draft",
    "save_layout", "validate_dbcd_draft",
  ].sort());
  for (const [name, type] of [["open_dbcd_app", "global"], ["open_dbcd_workbench", "thread"], ["open_dbcd_file", "file"]]) {
    assert.equal(tools.find((tool) => tool.name === name)?._meta?.["openai/ui"]?.entrypoints[0].type, type);
  }
  const launcher = await client.callTool({ name: "open_dbcd_workbench", arguments: {} });
  assert.equal(launcher.structuredContent.dbcodexLauncher, true);
  assert.ok(!JSON.stringify(launcher).includes(workspace));
  const fileEntry = await client.callTool({ name: "open_dbcd_file", arguments: { file: { name: "demo-shop.dbcd", resourceUri: "opaque://demo" } } });
  assert.equal(fileEntry.structuredContent.dbcodexFile.resourceUri, "opaque://demo");
  const fileView = await client.callTool({ name: "resolve_dbcd_file", arguments: {},
    _meta: { "openai/resource": { path: path.join(workspace, "fixtures/demo-shop.dbcd") } } });
  assert.equal(fileView.isError, undefined);
  for (const name of ["validate_dbcd_draft", "save_dbcd_draft", "discard_dbcd_draft", "save_dbcd",
    "list_dbcd_revisions", "read_dbcd_revision", "restore_dbcd_revision", "pin_dbcd_revision", "save_layout"]) {
    assert.deepEqual(tools.find((tool) => tool.name === name)?._meta?.ui?.visibility, ["app"]);
  }
  for (const name of ["open_dbcd", "open_dbml", "import_dbml", "export_dbml"]) {
    assert.equal(tools.find((tool) => tool.name === name)?._meta?.ui?.visibility, undefined);
  }
  const openTool = tools.find(({ name }) => name === "open_dbml");
  assert.equal(openTool?._meta?.ui?.resourceUri, "ui://dbcodex/diagram-v1.html");
  assert.equal(openTool?._meta?.["ui/resourceUri"], "ui://dbcodex/diagram-v1.html");

  const { resources } = await client.listResources();
  assert.ok(resources.some(({ uri, mimeType }) =>
    uri === "ui://dbcodex/diagram-v1.html" && mimeType === "text/html;profile=mcp-app"));
  const resource = await client.readResource({ uri: "ui://dbcodex/diagram-v1.html" });
  assert.equal(resource.contents[0]?.mimeType, "text/html;profile=mcp-app");
  assert.ok("text" in resource.contents[0] && resource.contents[0].text.includes('<main id="root"></main>'));
  assert.deepEqual(resource.contents[0]?._meta?.ui, {
    prefersBorder: false,
    csp: { connectDomains: [], resourceDomains: [] },
  });

  const started = performance.now();
  const result = await client.callTool({
    name: "open_dbml",
    arguments: { path: "fixtures/basic.dbml" },
  });
  const elapsedMs = performance.now() - started;
  assert.equal(result.isError, undefined);
  assert.ok("structuredContent" in result);
  assert.equal(result.structuredContent?.graph?.tables?.length, 3);
  assert.equal(result.structuredContent?.graph?.relations?.length, 2);
  assert.ok(elapsedMs < 2_000, `open_dbml took ${elapsedMs.toFixed(1)} ms`);

  const imported = await client.callTool({
    name: "import_dbml",
    arguments: { sourcePath: "fixtures/basic.dbml", projectPath: "fixtures/basic.dbcd" },
  });
  assert.deepEqual(resource.contents[0]?._meta?.["openai/ui"], { preferredDisplayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] });
  assert.equal(imported.isError, undefined);
  assert.ok(imported._meta?.dbcodex?.sourceText?.includes("Table"));
  assert.ok(!JSON.stringify(imported.content).includes("Table users"));
  assert.ok(!JSON.stringify(imported.structuredContent).includes("Table users"));
  assert.ok(!JSON.stringify(imported).includes(workspace));

  const project = await client.callTool({
    name: "open_dbcd",
    arguments: { path: "fixtures/basic.dbcd" },
  });
  assert.equal(project.isError, undefined);
  assert.equal(project.structuredContent?.graph?.tables?.length, 3);
  assert.equal(project.structuredContent?.hasDraft, false);
  assert.equal(project._meta?.dbcodex?.sourceText, imported._meta?.dbcodex?.sourceText);
  assert.ok(!JSON.stringify(project.content).includes("Table users"));
  assert.ok(!JSON.stringify(project.structuredContent).includes("Table users"));
  assert.ok(!JSON.stringify(project).includes(workspace));

  const demoPath = "fixtures/demo-shop.dbcd";
  const demo = await client.callTool({ name: "open_dbcd", arguments: { path: demoPath } });
  assert.equal(demo.isError, undefined);
  const generation = demo.structuredContent.generation;
  const revisionCount = demo.structuredContent.revisions.length;
  const sourceText = `${demo._meta.dbcodex.sourceText}\n// MCP acceptance edit\n`;
  const presentation = demo.structuredContent.presentation;
  const expected = { expectedGeneration: generation, expectedProjectId: demo._meta.dbcodex.projectId, expectedRevisionId: demo.structuredContent.currentRevisionId };
  const draft = await client.callTool({ name: "save_dbcd_draft", arguments: { path: demoPath, ...expected, baseGeneration: generation, sourceText, presentation } });
  assert.equal(draft.isError, undefined);
  const drafted = await client.callTool({ name: "open_dbcd", arguments: { path: demoPath } });
  assert.equal(drafted.structuredContent.generation, generation);
  assert.equal(drafted.structuredContent.revisions.length, revisionCount);
  assert.equal(drafted._meta.dbcodex.draft.sourceText, sourceText);
  const savedDemo = await client.callTool({ name: "save_dbcd", arguments: { path: demoPath, ...expected, sourceText, presentation } });
  assert.equal(savedDemo.isError, undefined);
  const reopenedDemo = await client.callTool({ name: "open_dbcd", arguments: { path: demoPath } });
  assert.equal(reopenedDemo.structuredContent.generation, generation + 1);
  assert.equal(reopenedDemo.structuredContent.revisions.length, revisionCount + 1);
  assert.equal(reopenedDemo.structuredContent.hasDraft, false);
  assert.equal(reopenedDemo._meta.dbcodex.sourceText, sourceText);
  const revision = await client.callTool({ name: "read_dbcd_revision", arguments: { path: demoPath, revisionId: reopenedDemo.structuredContent.currentRevisionId } });
  assert.equal(revision.isError, undefined);
  assert.equal(revision._meta.dbcodex.revision.sourceText, sourceText);
  assert.equal(revision.structuredContent.revision.sourceText, undefined);
  assert.equal(revision.structuredContent.revision.presentation, undefined);
  const exactArgs = { path: demoPath, expectedGeneration: reopenedDemo.structuredContent.generation,
    expectedRevisionId: reopenedDemo.structuredContent.currentRevisionId, expectedSourceHash: reopenedDemo.structuredContent.sourceHash,
    edits: [{ search: "// MCP acceptance edit", replacement: "// Codex exact edit" }] };
  const exact = await client.callTool({ name: "apply_dbcd_edits", arguments: exactArgs });
  assert.equal(exact.isError, undefined);
  assert.equal(exact.structuredContent.generation, generation + 2);
  assert.deepEqual(exact.structuredContent.presentation, presentation);
  assert.equal(exact._meta.dbcodex.sourceText, sourceText.replace("// MCP acceptance edit", "// Codex exact edit"));
  assert.equal((await client.callTool({ name: "apply_dbcd_edits", arguments: exactArgs })).isError, true);

  const unknownTable = await client.callTool({
    name: "save_layout",
    arguments: {
      path: "fixtures/basic.dbml",
      view: "View All",
      tableId: "public.does_not_exist",
      x: 1,
      y: 2,
    },
  });
  assert.equal(unknownTable.isError, true);
  assert.match(JSON.stringify(unknownTable), /does not exist/);

  const filesystemFailure = await client.callTool({
    name: "open_dbml",
    arguments: { path: "fixtures/directory.dbml" },
  });
  assert.equal(filesystemFailure.isError, true);
  assert.match(JSON.stringify(filesystemFailure), /failed without exposing file contents/);
  assert.ok(!JSON.stringify(filesystemFailure).includes(workspace));

  const saveStarted = performance.now();
  const saveResult = await client.callTool({
    name: "save_layout",
    arguments: {
      path: "fixtures/basic.dbml",
      view: "View All",
      tableId: "public.posts",
      x: 170,
      y: 130,
    },
  });
  const saveElapsedMs = performance.now() - saveStarted;
  assert.ok(saveElapsedMs < 100, `save_layout took ${saveElapsedMs.toFixed(1)} ms`);

  const reopened = await client.callTool({
    name: "open_dbml",
    arguments: { path: "fixtures/basic.dbml" },
  });
  if (process.env.DBCODEX_VERIFY_DEBUG) {
    process.stderr.write(`${JSON.stringify({ saveResult, reopened }, null, 2)}\n`);
  }
  assert.deepEqual(
    reopened.structuredContent?.layout?.views?.["View All"]?.nodes?.["public.posts"],
    { x: 170, y: 130 },
  );

  process.stdout.write(
    `MCP stdio integration passed: open ${elapsedMs.toFixed(1)} ms, save ${saveElapsedMs.toFixed(1)} ms.\n`,
  );
} finally {
  await client.close();
  await rm(workspace, { recursive: true, force: true });
  if (stderr.trim()) {
    process.stderr.write(stderr);
  }
}
