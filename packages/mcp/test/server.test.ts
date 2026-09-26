import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildToolDefinitions,
  createWorkspaceRootProvider,
} from "../src/create-server.js";
import { UI_RESOURCE_URI } from "../src/ui-resource.js";

describe("MCP tool definitions", () => {
  it("advertises exact closed-world public and app-only tools", () => {
    const definitions = buildToolDefinitions();

    expect(Object.keys(definitions).sort()).toEqual([
      "openDbcd", "openDbml", "importDbml", "exportDbml", "validateDraft", "saveDraft", "discardDraft",
      "saveDbcd", "listRevisions", "restoreRevision", "pinRevision", "saveLayout",
    ].sort());
    for (const [name, definition] of Object.entries(definitions)) {
      expect(definition.annotations.openWorldHint, name).toBe(false);
      expect(definition._meta.ui.resourceUri, name).toBe(UI_RESOURCE_URI);
    }
    for (const name of ["validateDraft", "saveDraft", "discardDraft", "saveDbcd", "listRevisions", "restoreRevision", "pinRevision", "saveLayout"] as const) {
      expect(definitions[name]._meta.ui.visibility).toEqual(["app"]);
    }
    for (const name of ["openDbcd", "openDbml", "importDbml", "exportDbml"] as const) {
      expect(definitions[name]._meta.ui.visibility).toBeUndefined();
    }
    for (const name of ["openDbcd", "openDbml", "validateDraft", "listRevisions"] as const) {
      expect(definitions[name].annotations.readOnlyHint).toBe(true);
    }
    for (const name of ["importDbml", "exportDbml", "saveDbcd", "restoreRevision"] as const) {
      expect(definitions[name].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    }
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

  it("fails closed when an advertised roots request throws", async () => {
    const provider = createWorkspaceRootProvider({
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => { throw new Error("roots unavailable"); },
    }, "trusted-fallback");

    await expect(provider()).resolves.toEqual([]);
  });

  it("fails closed when an advertised roots list is empty", async () => {
    const provider = createWorkspaceRootProvider({
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => ({ roots: [] }),
    }, "trusted-fallback");

    await expect(provider()).resolves.toEqual([]);
  });

  it("requires an explicit fallback when the client has no roots capability", async () => {
    const provider = createWorkspaceRootProvider({
      getClientCapabilities: () => ({}),
      listRoots: async () => ({ roots: [] }),
    }, undefined);

    await expect(provider()).resolves.toEqual([]);
  });

  it("uses an explicitly trusted fallback when the client has no roots capability", async () => {
    const provider = createWorkspaceRootProvider({
      getClientCapabilities: () => ({}),
      listRoots: async () => ({ roots: [] }),
    }, "trusted-fallback");

    await expect(provider()).resolves.toEqual(["trusted-fallback"]);
  });
});
