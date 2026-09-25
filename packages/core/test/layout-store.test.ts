import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LayoutStoreError,
  loadLayout,
  saveNodePosition,
} from "../src/layout-store.js";
import { makeTempWorkspace, removeTempWorkspace } from "./support/temp-workspace.js";

describe("layout store", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeTempWorkspace));
  });

  it("returns an empty writable document when no sidecar exists", async () => {
    const root = await makeTempWorkspace(roots);

    await expect(loadLayout(root, "schemas/main.dbml")).resolves.toEqual({
      document: { version: 1, source: "schemas/main.dbml", views: {} },
      warnings: [],
      writable: true,
    });
  });

  it("stores sorted positions without timestamps", async () => {
    const root = await makeTempWorkspace(roots);

    await saveNodePosition(root, "schemas/main.dbml", "View All", "public.users", { x: 20, y: 30 });
    await saveNodePosition(root, "schemas/main.dbml", "View All", "public.posts", { x: 10, y: 15 });

    const sidecar = join(root, ".dbcodex", "layouts", "schemas", "main.dbml.layout.json");
    const serialized = await readFile(sidecar, "utf8");
    expect(serialized).toBe(`{
  "source": "schemas/main.dbml",
  "version": 1,
  "views": {
    "View All": {
      "nodes": {
        "public.posts": {
          "x": 10,
          "y": 15
        },
        "public.users": {
          "x": 20,
          "y": 30
        }
      }
    }
  }
}\n`);
    expect(serialized).not.toMatch(/timestamp|updated/i);
  });

  it("does not overwrite a corrupt sidecar", async () => {
    const root = await makeTempWorkspace(roots);
    const sidecar = join(root, ".dbcodex", "layouts", "main.dbml.layout.json");
    await mkdir(join(root, ".dbcodex", "layouts"), { recursive: true });
    await writeFile(sidecar, "{ invalid", "utf8");

    await expect(loadLayout(root, "main.dbml")).resolves.toMatchObject({
      warnings: ["Layout sidecar is invalid."],
      writable: false,
    });
    await expect(saveNodePosition(root, "main.dbml", "View All", "public.users", { x: 1, y: 2 }))
      .rejects.toMatchObject({ code: "INVALID_LAYOUT" });
    await expect(readFile(sidecar, "utf8")).resolves.toBe("{ invalid");
  });

  it.each([
    [{ x: Number.NaN, y: 0 }, "INVALID_POSITION"],
    [{ x: 0, y: Number.POSITIVE_INFINITY }, "INVALID_POSITION"],
  ])("rejects invalid position %j", async (position, code) => {
    const root = await makeTempWorkspace(roots);
    await expect(saveNodePosition(root, "main.dbml", "View All", "public.users", position))
      .rejects.toMatchObject({ code });
  });

  it("rejects invalid sources and empty table IDs", async () => {
    const root = await makeTempWorkspace(roots);
    await expect(loadLayout(root, "../outside.dbml")).rejects.toBeInstanceOf(LayoutStoreError);
    await expect(saveNodePosition(root, "main.dbml", "View All", "", { x: 0, y: 0 }))
      .rejects.toMatchObject({ code: "INVALID_POSITION" });
  });
});
