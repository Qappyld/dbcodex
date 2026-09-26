import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { loadUiHtml, UI_RESOURCE_URI } from "../packages/mcp/dist/ui-resource.js";

const html = await loadUiHtml();
const forbidden = [
  [/\b(?:src|href)\s*=\s*["']https?:\/\//i, "remote src/href"],
  [/url\(\s*["']?https?:\/\//i, "remote CSS URL"],
  [/\bfetch\s*\(/, "fetch"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bEventSource\b/, "EventSource"],
];

const violations = forbidden
  .filter(([pattern]) => pattern.test(html))
  .map(([, label]) => label);

if (UI_RESOURCE_URI !== "ui://dbcodex/diagram-v1.html") {
  violations.push(`unexpected resource URI: ${UI_RESOURCE_URI}`);
}
if (RESOURCE_MIME_TYPE !== "text/html;profile=mcp-app") {
  violations.push(`unexpected resource MIME type: ${RESOURCE_MIME_TYPE}`);
}
if (!html.includes('<main id="root"></main>')) {
  violations.push("missing UI root");
}

if (violations.length > 0) {
  process.stderr.write(`Offline UI verification failed: ${violations.join(", ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("No remote UI dependencies detected.\n");
}
