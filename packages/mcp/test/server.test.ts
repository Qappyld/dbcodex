import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildToolDefinitions,
  createWorkspaceRootProvider,
} from "../src/create-server.js";
import { UI_RESOURCE_URI } from "../src/ui-resource.js";
import { emptyPresentation, DBCD_MAX_SOURCE_BYTES, DBCD_MAX_PRESENTATION_BYTES } from "@dbcodex/core";

describe("MCP tool definitions", () => {
  it("rejects oversized UTF-8 and presentation inputs at the tool schema boundary", () => {
    const definitions = buildToolDefinitions();
    expect(definitions.validateDraft.inputSchema.safeParse({ path: "project.dbcd", sourceText: "é".repeat(DBCD_MAX_SOURCE_BYTES / 2 + 1) }).success).toBe(false);
    const presentation = emptyPresentation();
    presentation.views.all!.name = "x".repeat(DBCD_MAX_PRESENTATION_BYTES);
    expect(definitions.saveDbcd.inputSchema.safeParse({ path: "project.dbcd", sourceText: "", presentation,
      expectedProjectId: "p", expectedRevisionId: "r", expectedGeneration: 1 }).success).toBe(false);
  });
  it("requires full expected identity on every project mutation", () => {
    const definitions = buildToolDefinitions();
    const input = { path: "project.dbcd", sourceText: "", presentation: emptyPresentation(), baseGeneration: 1, expectedGeneration: 1, revisionId: "r1", pinned: true };
    for (const key of ["saveDraft", "discardDraft", "saveDbcd", "restoreRevision", "pinRevision"] as const) {
      expect(definitions[key].inputSchema.safeParse(input).success, key).toBe(false);
      expect(definitions[key].inputSchema.safeParse({ ...input, expectedProjectId: "project-a", expectedRevisionId: "r1" }).success, key).toBe(true);
    }
  });
  it("advertises exact closed-world public and app-only tools", () => {
    const definitions = buildToolDefinitions();

    expect(Object.keys(definitions).sort()).toEqual([
      "openDbcd", "openDbml", "importDbml", "exportDbml", "validateDraft", "saveDraft", "discardDraft",
      "saveDbcd", "listRevisions", "readRevision", "restoreRevision", "pinRevision", "saveLayout",
    ].sort());
    for (const [name, definition] of Object.entries(definitions)) {
      expect(definition.annotations.openWorldHint, name).toBe(false);
      expect(definition._meta.ui.resourceUri, name).toBe(UI_RESOURCE_URI);
    }
    for (const name of ["validateDraft", "saveDraft", "discardDraft", "saveDbcd", "listRevisions", "readRevision", "restoreRevision", "pinRevision", "saveLayout"] as const) {
      expect(definitions[name]._meta.ui.visibility).toEqual(["app"]);
    }
    for (const name of ["openDbcd", "openDbml", "importDbml", "exportDbml"] as const) {
      expect(definitions[name]._meta.ui.visibility).toBeUndefined();
    }
    for (const name of ["openDbcd", "openDbml", "validateDraft", "listRevisions", "readRevision"] as const) {
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
