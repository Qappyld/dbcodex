import { readFile } from "node:fs/promises";

export const UI_RESOURCE_URI = "ui://dbcodex/diagram-v1.html";

const widgetScriptUrl = new URL("../../ui/dist/widget.js", import.meta.url);
const widgetStylesUrl = new URL("../../ui/dist/widget.css", import.meta.url);

export function buildUiHtml(script: string, styles: string): string {
  const safeStyles = styles.replaceAll("</style", "<\\/style");
  const safeScript = script.replaceAll("</script", "<\\/script");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
    <title>DBCodex diagram</title>
    <style>${safeStyles}</style>
  </head>
  <body>
    <main id="root"></main>
    <script>${safeScript}</script>
  </body>
</html>`;
}

export async function loadUiHtml(): Promise<string> {
  const [script, styles] = await Promise.all([
    readFile(widgetScriptUrl, "utf8"),
    readFile(widgetStylesUrl, "utf8"),
  ]);
  return buildUiHtml(script, styles);
}
