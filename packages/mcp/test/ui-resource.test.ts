import { describe, expect, it } from "vitest";
import { buildUiHtml, loadUiHtml, UI_RESOURCE_URI } from "../src/ui-resource.js";

describe("DBCodex MCP App resource", () => {
  it("assembles a self-contained HTML document", () => {
    const html = buildUiHtml("console.log('ready')", ".app { color: CanvasText; }");

    expect(html).toContain('<main id="root"></main>');
    expect(html).toContain("console.log('ready')");
    expect(html).toContain(".app { color: CanvasText; }");
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("loads the built widget assets", async () => {
    const html = await loadUiHtml();

    expect(UI_RESOURCE_URI).toBe("ui://dbcodex/diagram.html");
    expect(html).toContain("dbcodex-diagram");
    expect(html).toContain("<style>");
    expect(html).toContain("<script>");
  });
});
