import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../src/create-server.js";

describe("MCP tool definitions", () => {
  it("advertises closed-world open and save tools", () => {
    const definitions = buildToolDefinitions();

    expect(Object.keys(definitions)).toEqual(["open", "save"]);
    expect(definitions.open.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false,
    });
    expect(definitions.save.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(JSON.stringify(definitions)).not.toContain("resourceUri");
  });
});
