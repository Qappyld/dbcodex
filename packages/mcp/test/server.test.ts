import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../src/create-server.js";
import { UI_RESOURCE_URI } from "../src/ui-resource.js";

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
    expect(definitions.open._meta).toEqual({
      ui: { resourceUri: UI_RESOURCE_URI },
    });
    expect(definitions.save._meta).toEqual({
      ui: { visibility: ["app"] },
    });
  });
});
