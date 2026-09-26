import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./create-server.js";

const trustedFallbackRoot = process.argv.includes("--trust-cwd-as-workspace")
  ? process.cwd()
  : undefined;
const server = createServer(trustedFallbackRoot);

server.connect(new StdioServerTransport()).catch(() => {
  process.stderr.write("dbcodex MCP server failed to start.\n");
  process.exitCode = 1;
});
