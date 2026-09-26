import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHandlers } from "../src/handlers.js";
import { createDbcdProject, emptyPresentation } from "../../core/src/index.js";

describe("MCP handlers", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function workspace(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "dbcodex-mcp-"));
    roots.push(root);
    await writeFile(join(root, "schema.dbml"), `
      Table users {
        id int [pk]
      }
      Table posts {
        id int [pk]
        user_id int
      }
      Ref: posts.user_id > users.id
    `, "utf8");
    return root;
  }

  it("opens DBML with structured and model-readable results", async () => {
    const root = await workspace();
    const result = await createHandlers(root).openDbml({ path: "schema.dbml" });

    expect(result.structuredContent).toMatchObject({
      sourcePath: "schema.dbml",
      graph: { sourcePath: "schema.dbml" },
      diagnostics: [],
      layout: { version: 1, source: "schema.dbml" },
    });
    expect(result.structuredContent.graph?.tables).toHaveLength(2);
    expect(result.content[0]?.text).toContain("2 tables and 1 relations");
    expect(JSON.stringify(result)).not.toContain("Table users");
  });

  it("opens DBML from the client workspace root that contains it", async () => {
    const unrelatedRoot = await mkdtemp(join(tmpdir(), "dbcodex-unrelated-"));
    roots.push(unrelatedRoot);
    const projectRoot = await workspace();

    const result = await createHandlers([unrelatedRoot, projectRoot])
      .openDbml({ path: "schema.dbml" });

    expect(result.structuredContent).toMatchObject({
      sourcePath: "schema.dbml",
      graph: { sourcePath: "schema.dbml" },
    });
  });

  it("saves and returns the authoritative position", async () => {
    const root = await workspace();
    const result = await createHandlers(root).saveLayout({
      path: "schema.dbml",
      view: "View All",
      tableId: "public.posts",
      x: 120,
      y: 80,
    });

    expect(result.structuredContent).toMatchObject({
      sourcePath: "schema.dbml",
      view: "View All",
      tableId: "public.posts",
      position: { x: 120, y: 80 },
    });
    const sidecar = await readFile(join(root, ".dbcodex", "layouts", "schema.dbml.layout.json"), "utf8");
    expect(sidecar).toContain('"public.posts"');
  });

  it("does not expose source contents in an invalid parse response", async () => {
    const root = await workspace();
    await writeFile(join(root, "broken.dbml"), "Table secret {", "utf8");

    const result = await createHandlers(root).openDbml({ path: "broken.dbml" });

    expect(result.structuredContent.graph).toBeNull();
    expect(JSON.stringify(result)).not.toContain("Table secret {");
  });

  it("rejects unknown table IDs without creating layout state", async () => {
    const root = await workspace();
    const result = await createHandlers(root).saveLayout({
      path: "schema.dbml",
      view: "View All",
      tableId: "public.does_not_exist",
      x: 120,
      y: 80,
    });

    expect(result).toMatchObject({
      isError: true,
      content: [{ text: "The table does not exist in the DBML graph." }],
    });
    await expect(readFile(join(root, ".dbcodex", "layouts", "schema.dbml.layout.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("sanitizes unexpected filesystem failures", async () => {
    const root = await workspace();
    await mkdir(join(root, "directory.dbml"));

    const result = await createHandlers(root).openDbml({ path: "directory.dbml" });

    expect(result).toMatchObject({
      isError: true,
      content: [{ text: "dbcodex failed without exposing file contents." }],
    });
    expect(JSON.stringify(result)).not.toContain(root);
  });

  it("opens a project with source and identity only in app metadata", async () => {
    const root = await workspace();
    const sourceText = "Table users { id int [pk] }\n";
    await createDbcdProject({ workspaceRoot: root, projectPath: "shop.dbcd", sourceText });
    const result = await createHandlers(root).openDbcd({ path: "shop.dbcd" });

    expect(result.structuredContent).toMatchObject({
      projectPath: "shop.dbcd", generation: 1, graph: { sourcePath: "shop.dbcd" },
      diagnostics: [], presentation: emptyPresentation(), hasDraft: false,
    });
    expect(result.structuredContent).not.toHaveProperty("sourceText");
    expect(result.structuredContent).not.toHaveProperty("projectId");
    expect(result._meta.dbcodex).toMatchObject({ sourceText, projectId: expect.any(String) });
    expect(JSON.stringify(result.content)).not.toContain(sourceText);
    expect(JSON.stringify(result.structuredContent)).not.toContain(sourceText);
    expect(JSON.stringify(result)).not.toContain(root);
  });

  it("keeps invalid draft source in app metadata and returns safe validation", async () => {
    const root = await workspace();
    await createDbcdProject({ workspaceRoot: root, projectPath: "shop.dbcd", sourceText: "Table users { id int [pk] }\n" });
    const handlers = createHandlers(root);
    const draftSource = "Table secret {";
    const draft = await handlers.saveDbcdDraft({ path: "shop.dbcd", baseGeneration: 1,
      sourceText: draftSource, presentation: emptyPresentation() });
    expect(JSON.stringify(draft.content)).not.toContain(draftSource);
    expect(JSON.stringify(draft.structuredContent)).not.toContain(draftSource);
    const opened = await handlers.openDbcd({ path: "shop.dbcd" });
    expect(opened.structuredContent).toMatchObject({ hasDraft: true });
    expect(opened._meta.dbcodex.draft.sourceText).toBe(draftSource);
    expect(JSON.stringify(opened.structuredContent)).not.toContain(draftSource);
    const validation = await handlers.validateDbcdDraft({ path: "shop.dbcd", sourceText: draftSource });
    expect(validation.structuredContent).toMatchObject({ graph: null, diagnostics: [{ severity: "error" }] });
    expect(JSON.stringify(validation.content)).not.toContain(draftSource);
    expect(JSON.stringify(validation.structuredContent)).not.toContain(draftSource);
  });

  it("discards a draft without changing the revision generation", async () => {
    const root = await workspace();
    await createDbcdProject({ workspaceRoot: root, projectPath: "shop.dbcd", sourceText: "Table users { id int [pk] }\n" });
    const handlers = createHandlers(root);
    await handlers.saveDbcdDraft({ path: "shop.dbcd", baseGeneration: 1,
      sourceText: "Table secret {", presentation: emptyPresentation() });
    const discarded = await handlers.discardDbcdDraft({ path: "shop.dbcd", expectedGeneration: 1 });
    expect(discarded.structuredContent).toMatchObject({ projectPath: "shop.dbcd", discarded: true });
    const reopened = await handlers.openDbcd({ path: "shop.dbcd" });
    expect(reopened.structuredContent).toMatchObject({ generation: 1, hasDraft: false });
    expect(reopened._meta.dbcodex.draft).toBeNull();
    expect(JSON.stringify(discarded.structuredContent)).not.toContain("Table secret {");
  });

  it("imports, saves, lists, pins, restores and exports without model-visible source", async () => {
    const root = await workspace();
    const sourceText = "Table users { id int [pk] }\n";
    await writeFile(join(root, "shop.dbml"), sourceText);
    const handlers = createHandlers(root);
    const imported = await handlers.importDbml({ sourcePath: "shop.dbml", projectPath: "shop.dbcd" });
    const initialRevision = imported.structuredContent.currentRevisionId;
    expect(imported._meta.dbcodex.sourceText).toBe(sourceText);
    const saved = await handlers.saveDbcd({ path: "shop.dbcd", expectedGeneration: 1,
      sourceText: "Table posts { id int [pk] }\n", presentation: emptyPresentation(), label: "next" });
    expect(saved.structuredContent).toMatchObject({ generation: 2 });
    const listed = await handlers.listDbcdRevisions({ path: "shop.dbcd" });
    expect(listed.structuredContent.revisions).toHaveLength(2);
    await handlers.pinDbcdRevision({ path: "shop.dbcd", revisionId: initialRevision, pinned: true });
    const restored = await handlers.restoreDbcdRevision({ path: "shop.dbcd", expectedGeneration: 2, revisionId: initialRevision });
    expect(restored.structuredContent).toMatchObject({ generation: 3 });
    const exported = await handlers.exportDbml({ projectPath: "shop.dbcd", targetPath: "copy.dbml" });
    expect(exported.structuredContent).toMatchObject({ targetPath: "copy.dbml" });
    expect(await readFile(join(root, "copy.dbml"), "utf8")).toBe(sourceText);
    for (const result of [imported, saved, listed, restored, exported]) {
      expect(JSON.stringify(result.content)).not.toContain("Table users");
      expect(JSON.stringify(result.structuredContent)).not.toContain("Table users");
      expect(JSON.stringify(result)).not.toContain(root);
    }
  });

  it("fails closed for project tools when no client root is available", async () => {
    const root = await workspace();
    await createDbcdProject({ workspaceRoot: root, projectPath: "shop.dbcd", sourceText: "Table users { id int [pk] }\n" });
    const handlers = createHandlers(async () => []);
    for (const result of [
      await handlers.openDbcd({ path: "shop.dbcd" }),
      await handlers.importDbml({ sourcePath: "schema.dbml", projectPath: "copy.dbcd" }),
      await handlers.exportDbml({ projectPath: "shop.dbcd", targetPath: "copy.dbml" }),
    ]) {
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain(root);
    }
    await expect(readFile(join(root, "copy.dbml"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
