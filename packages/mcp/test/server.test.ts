import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildToolDefinitions,
  createWorkspaceRootProvider,
} from "../src/create-server.js";
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

  it("uses file roots advertised by the MCP client", async () => {
    const projectRoot = process.cwd();
    const provider = createWorkspaceRootProvider({
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => ({
        roots: [{ uri: pathToFileURL(projectRoot).href, name: "project" }],
      }),
    }, "fallback");

    await expect(provider()).resolves.toEqual([projectRoot]);
  });
});
