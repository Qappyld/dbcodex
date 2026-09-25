import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./create-server.js";

const server = createServer(process.cwd());

server.connect(new StdioServerTransport()).catch(() => {
  process.stderr.write("dbcodex MCP server failed to start.\n");
  process.exitCode = 1;
});
