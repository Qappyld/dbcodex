import { createConnection, createServer, type Server } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { userInfo, tmpdir, homedir } from "node:os";
import { resolve, join } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const liveRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z.object({ action: z.literal("read"), sessionId: z.string().min(1) }).strict(),
  z.object({ action: z.literal("navigate"), sessionId: z.string().min(1),
    kind: z.enum(["table", "column", "relation"]), id: z.string().min(1) }).strict(),
]);
export type LiveRequest = z.infer<typeof liveRequestSchema>;
const MAX_BYTES = 16 * 1024 * 1024;
export function liveConnectionFile(endpoint: string): string {
  return join(homedir(), ".dbcodex", "live", createHash("sha256").update(endpoint).digest("hex") + ".json");
}
export async function writeLiveConnection(endpoint: string, token: string, port: number, applicationRoot: string): Promise<void> {
  await writeFile(liveConnectionFile(endpoint), JSON.stringify({ applicationRoot,
    url: `http://127.0.0.1:${port}/mcp`, httpHeaders: { Authorization: `Bearer ${token}` } }, null, 2), { mode: 0o600 });
}
export async function liveToken(endpoint: string): Promise<string> {
  const folder = join(homedir(), ".dbcodex", "live");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const path = join(folder, createHash("sha256").update(endpoint).digest("hex") + ".key");
  try { await writeFile(path, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const token = await readFile(path, "utf8");
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error("Clé de connexion locale invalide.");
  return token;
}
export function liveEndpoint(root: string): string {
  const key = createHash("sha256").update(`${userInfo().username}:${resolve(root).toLowerCase()}`).digest("hex");
  return process.platform === "win32" ? `\\\\.\\pipe\\dbcodex-live-${key}` : join(tmpdir(), `dbcodex-live-${key}.sock`);
}

// One bounded JSON message per connection. No file, SQL or arbitrary IPC commands.
export function serveLive(endpoint: string, handle: (request: LiveRequest) => Promise<unknown>, token: string): Promise<Server> {
  return new Promise((resolveServer, reject) => {
    const server = createServer(socket => {
      let chunks = "", bytes = 0, received = false;
      socket.setEncoding("utf8"); socket.setTimeout(10000, () => socket.destroy());
      socket.on("error", () => {});
      socket.on("data", chunk => {
        if (received) return;
        bytes += Buffer.byteLength(chunk); if (bytes > MAX_BYTES) { socket.destroy(); return; }
        chunks += chunk;
        if (!chunks.includes("\n")) return;
        received = true;
        void (async () => {
          try {
            const envelope = JSON.parse(chunks.slice(0, chunks.indexOf("\n")));
            if (envelope.token !== token) throw Error("Connexion locale non autorisée.");
            const request = liveRequestSchema.parse(envelope.request);
            const response = JSON.stringify({ result: await handle(request) });
            if (Buffer.byteLength(response) > MAX_BYTES) throw Error("Session trop volumineuse.");
            socket.end(response + "\n");
          } catch (error) { socket.end(JSON.stringify({ error: error instanceof Error ? error.message : "Commande refusée." }) + "\n"); }
        })();
      });
    });
    server.once("error", reject);
    server.listen(endpoint, () => resolveServer(server));
  });
}

export function callLive(endpoint: string, request: LiveRequest, token: string): Promise<unknown> {
  const parsed = liveRequestSchema.parse(request);
  return new Promise((resolveResult, reject) => {
    const socket = createConnection(endpoint); let chunks = "", bytes = 0;
    const fail = (error: Error) => { socket.destroy(); reject(error); };
    socket.setEncoding("utf8");
    socket.setTimeout(12000, () => fail(Error("DBCodex ne répond pas.")));
    socket.on("connect", () => socket.write(JSON.stringify({ token, request: parsed }) + "\n"));
    socket.on("error", () => fail(Error("Instance DBCodex indisponible. Ouvrez la version portable correspondante.")));
    socket.on("end", () => { if (!chunks.includes("\n")) fail(Error("Réponse DBCodex interrompue.")); });
    socket.on("data", chunk => {
      bytes += Buffer.byteLength(chunk); if (bytes > MAX_BYTES) { fail(Error("Session trop volumineuse.")); return; }
      chunks += chunk; if (!chunks.includes("\n")) return;
      try {
        const response = JSON.parse(chunks.slice(0, chunks.indexOf("\n")));
        socket.destroy();
        if (response.error) reject(Error(response.error)); else resolveResult(response.result);
      } catch { fail(Error("Réponse DBCodex invalide.")); }
    });
  });
}

export function registerLiveTools(server: McpServer, endpoint: string, token: string): void {
  const invoke = async (request: LiveRequest) => {
    try {
      const data = await callLive(endpoint, request, token);
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> };
    } catch (error) { return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Session indisponible." }] }; }
  };
  server.registerTool("list_live_dbcd_sessions", { description: "List open portable DBCodex windows without reading document content.", inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: false } }, () => invoke({ action: "list" }));
  server.registerTool("read_live_dbcd_session", { description: "Explicitly share the current in-memory document, including unsaved edits, selection and diagnostics. Graph may be the last valid graph; inspect validating and diagnostics.", inputSchema: z.object({ sessionId: z.string().min(1) }), annotations: { readOnlyHint: true, openWorldHint: false } }, input => invoke({ action: "read", ...input }));
  server.registerTool("navigate_live_dbcd_session", { description: "Select and center a visible table, column or relation in the existing window. Does not edit or save the document. Rejects hidden or absent targets.", inputSchema: z.object({ sessionId: z.string().min(1), kind: z.enum(["table", "column", "relation"]), id: z.string().min(1) }), annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }, input => invoke({ action: "navigate", ...input }));
}
