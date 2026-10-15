import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerLiveTools } from "./live-session.js";

/** Loopback only; token is stored in the current user's profile, never in a URL. */
export async function serveLiveHttp(endpoint: string, token: string, port: number) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error("Port MCP invalide.");
  const server = createServer(async (request, response) => {
    const address = server.address();
    const host = typeof address === "object" && address ? `127.0.0.1:${address.port}` : "";
    if (request.headers.host !== host || request.headers.origin) { response.writeHead(403).end(); return; }
    if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401).end(); return; }
    if (request.url !== "/mcp") { response.writeHead(404).end(); return; }
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const mcp = new McpServer({ name: "dbcodex-live", version: "1.0.0" });
    registerLiveTools(mcp, endpoint, token);
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    response.on("close", () => { void transport.close(); void mcp.close(); });
    // SDK's HTTP transport declares optional callbacks differently under exactOptionalPropertyTypes.
    try { await mcp.connect(transport as Parameters<typeof mcp.connect>[0]); await transport.handleRequest(request, response); }
    catch { if (!response.headersSent) response.writeHead(500).end(); }
  });
  server.requestTimeout = 15000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return server;
}
