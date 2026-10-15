import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { callLive, liveEndpoint, registerLiveTools, serveLive } from "../src/live-session.js";
import { serveLiveHttp } from "../src/live-http.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { request as httpRequest } from "node:http";

let server: Server | undefined;
afterEach(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; });
const endpoint = () => liveEndpoint(join(tmpdir(), randomUUID()));
const token = "a".repeat(64);

it("round trips unsaved Unicode source through an authenticated local connection", async () => {
  const pipe = endpoint();
  server = await serveLive(pipe, async request => ({ request, sourceText: "// é\nTable clients {}", dirty: true }), token);
  expect(await callLive(pipe, { action: "read", sessionId: "1" }, token)).toEqual({
    request: { action: "read", sessionId: "1" }, sourceText: "// é\nTable clients {}", dirty: true,
  });
});
it("rejects a different token before invoking any session handler", async () => {
  const pipe = endpoint(), handler = vi.fn();
  server = await serveLive(pipe, handler, token);
  await expect(callLive(pipe, { action: "list" }, "wrong")).rejects.toThrow("non autorisée");
  expect(handler).not.toHaveBeenCalled();
});
it("reports closed sessions and missing instances without starting a window", async () => {
  const pipe = endpoint();
  server = await serveLive(pipe, async () => { throw Error("Session fermée."); }, token);
  await expect(callLive(pipe, { action: "read", sessionId: "closed" }, token)).rejects.toThrow("fermée");
  await expect(callLive(endpoint(), { action: "list" }, token)).rejects.toThrow("indisponible");
});
it("exposes only three live tools and propagates navigation failures as MCP errors", async () => {
  const pipe = endpoint();
  server = await serveLive(pipe, async request => {
    if (request.action === "list") return { sessions: [{ sessionId: "1", path: "test.dbcd" }] };
    throw Error("Cible masquée.");
  }, token);
  const mcp = new McpServer({ name: "test", version: "1" }); registerLiveTools(mcp, pipe, token);
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await mcp.connect(a); await client.connect(b);
    expect((await client.listTools()).tools.map(tool => tool.name).sort()).toEqual([
      "list_live_dbcd_sessions", "navigate_live_dbcd_session", "read_live_dbcd_session",
    ]);
    expect((await client.callTool({ name: "list_live_dbcd_sessions", arguments: {} })).structuredContent).toHaveProperty("sessions");
    expect(await client.callTool({ name: "navigate_live_dbcd_session", arguments: { sessionId: "1", kind: "table", id: "public.clients" } })).toMatchObject({ isError: true });
  } finally { await client.close(); await mcp.close(); }
});
it("serves a native MCP HTTP client on loopback and rejects missing auth, browser origins and wrong hosts", async () => {
  const pipe = endpoint();
  server = await serveLive(pipe, async () => ({ sessions: [] }), token);
  const http = await serveLiveHttp(pipe, token, 0);
  const address = http.address();
  if (!address || typeof address === "string") throw Error("No HTTP address");
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const client = new Client({ name: "http-test", version: "1" });
  try {
    expect((await fetch(url, { method: "POST" })).status).toBe(401);
    expect((await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, Origin: "https://example.com" } })).status).toBe(403);
    const wrongHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, Host: "attacker.example" } }, res => { res.resume(); resolve(res.statusCode); });
      req.on("error", reject); req.end();
    });
    expect(wrongHost).toBe(403);
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    expect((await client.listTools()).tools).toHaveLength(3);
    expect((await client.callTool({ name: "list_live_dbcd_sessions", arguments: {} })).structuredContent).toEqual({ sessions: [] });
  } finally { await client.close(); await new Promise<void>(resolve => http.close(() => resolve())); }
});
