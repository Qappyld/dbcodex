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
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
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
  assert.deepEqual(tools.map(({ name }) => name).sort(), ["open_dbml", "save_layout"]);
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
