import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHandlers } from "../src/handlers.js";

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
});
