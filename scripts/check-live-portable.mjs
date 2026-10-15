import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { liveEndpoint, liveConnectionFile } from "../packages/mcp/dist/live-session.js";
const require = createRequire(new URL("../packages/mcp/package.json", import.meta.url));
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
if (!process.argv[2]) throw Error("Usage: node scripts/check-live-portable.mjs <portable.exe>");
const root = resolve(`build/live-mcp-smoke-${Date.now()}`);
await mkdir(root, { recursive: true });
const executable = join(root, "DBCodex MCP test.exe"), project = join(root, "demo.dbcd");
await cp(resolve(process.argv[2]), executable); await cp("fixtures/demo-shop.dbcd", project);
const portProbe = createServer(); await new Promise(resolve => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["ELECTRON_RUN_AS_NODE", "PORTABLE_EXECUTABLE_FILE", "PORTABLE_EXECUTABLE_DIR"].includes(key)));
const child = spawn(executable, ["--mcp", `--mcp-port=${port}`, project], { env, windowsHide: true, stdio: "ignore" });
let exited = false; child.once("exit", () => { exited = true; });
let client;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && !exited) {
    try {
      const config = JSON.parse(await readFile(liveConnectionFile(liveEndpoint(root)), "utf8"));
      assert.equal(config.applicationRoot, root);
      const candidate = new Client({ name: "portable-live-smoke", version: "1" });
      try { await candidate.connect(new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.httpHeaders } })); client = candidate; break; }
      catch { await candidate.close(); }
    } catch { /* The single EXE may still be extracting. */ }
    await sleep(500);
  }
  assert(client, "Le portable doit démarrer son MCP local.");
  const tools = await client.listTools(); assert.equal(tools.tools.length, 3);
  let sessionId;
  for (let attempt = 0; attempt < 40; attempt++) {
    const listed = await client.callTool({ name: "list_live_dbcd_sessions", arguments: {} });
    sessionId = listed.structuredContent.sessions.find(session => session.path === project)?.sessionId;
    if (sessionId) break; await sleep(250);
  }
  assert(sessionId, "Le projet de test doit être chargé.");
  const read = () => client.callTool({ name: "read_live_dbcd_session", arguments: { sessionId } });
  let initial;
  for (let attempt = 0; attempt < 10; attempt++) { initial = await read(); if (!initial.isError) break; await sleep(250); }
  assert(!initial.isError, JSON.stringify(initial));
  const state = initial.structuredContent.state;
  assert.equal(state.dirty, false);
  assert.match(state.sourceText, /Table /);
  const baseline = createHash("sha256").update(await readFile(project)).digest("hex");
  const tableId = state.graph.tables[0].id;
  const navigation = await client.callTool({ name: "navigate_live_dbcd_session", arguments: { sessionId, kind: "table", id: tableId } });
  assert(!navigation.isError, JSON.stringify(navigation));
  let after;
  for (let attempt = 0; attempt < 20; attempt++) {
    after = (await read()).structuredContent.state;
    if (after.selectedIds.includes(tableId)) break; await sleep(100);
  }
  assert(after.selectedIds.includes(tableId));
  // Wait beyond draft persistence and refresh timers to catch unintended writes.
  await sleep(2300); after = (await read()).structuredContent.state;
  assert.equal(after.sourceText, state.sourceText); assert.equal(after.dirty, false);
  assert.deepEqual(after.presentation, state.presentation);
  assert.equal(createHash("sha256").update(await readFile(project)).digest("hex"), baseline);
  const result = { passed: true, root, checks: ["Renamed single EXE, no Node runtime needed by app", "Authenticated MCP HTTP initialization", "Open test project discovered", "Current renderer state read", "Table selected in renderer", "No source, presentation or project-file changes"] };
  await writeFile(join(root, "checks.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally {
  if (client) await client.close().catch(() => {});
  // Only the process tree started by this test; never target an executable name.
  if (!exited && child.pid) execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
}
