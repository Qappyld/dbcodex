import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportDbmlProject, importDbmlProject } from "../src/dbcd-transfer.js";
import { saveDbcdProject } from "../src/dbcd-project-store.js";
import { emptyPresentation } from "../src/presentation.js";
import { makeTempWorkspace, removeTempWorkspace } from "./support/temp-workspace.js";

describe("lossless DBML transfer", () => {
  const roots: string[] = [];
  afterEach(async () => { await Promise.all(roots.splice(0).map(removeTempWorkspace)); });

  it("imports and exports the exact UTF-8 source bytes", async () => {
    const workspaceRoot = await makeTempWorkspace(roots);
    const source = "// café\r\nTable users { id int [pk] }\r\n";
    await mkdir(join(workspaceRoot, "nested"));
    await writeFile(join(workspaceRoot, "nested", "shop.dbml"), source, "utf8");
    const snapshot = await importDbmlProject({ workspaceRoot, sourcePath: "nested/shop.dbml", projectPath: "nested/shop.dbcd" });
    expect(snapshot.sourceText).toBe(source);
    const exported = await exportDbmlProject({ workspaceRoot, projectPath: "nested/shop.dbcd", targetPath: "nested/copy.dbml" });
    expect(exported).toEqual({ targetPath: "nested/copy.dbml", sourceHash: snapshot.sourceHash });
    expect(await readFile(join(workspaceRoot, "nested", "copy.dbml"))).toEqual(Buffer.from(source, "utf8"));
  });

  it("exports the requested revision rather than the current source", async () => {
    const workspaceRoot = await makeTempWorkspace(roots);
    const original = "Table users { id int [pk] }\n";
    await writeFile(join(workspaceRoot, "shop.dbml"), original);
    const initial = await importDbmlProject({ workspaceRoot, sourcePath: "shop.dbml", projectPath: "shop.dbcd" });
    await saveDbcdProject({ workspaceRoot, projectPath: "shop.dbcd", expectedGeneration: 1,
      sourceText: "Table posts { id int [pk] }\n", presentation: emptyPresentation() });
    const exported = await exportDbmlProject({ workspaceRoot, projectPath: "shop.dbcd",
      targetPath: "old.dbml", revisionId: initial.currentRevisionId });
    expect(exported.sourceHash).toBe(initial.sourceHash);
    expect(await readFile(join(workspaceRoot, "old.dbml"), "utf8")).toBe(original);
  });

  it("rejects existing project and export targets without changing their bytes", async () => {
    const workspaceRoot = await makeTempWorkspace(roots);
    const source = "Table users { id int [pk] }\n";
    await writeFile(join(workspaceRoot, "shop.dbml"), source);
    const initial = await importDbmlProject({ workspaceRoot, sourcePath: "shop.dbml", projectPath: "shop.dbcd" });
    const before = await readFile(join(workspaceRoot, "shop.dbcd"));
    await expect(importDbmlProject({ workspaceRoot, sourcePath: "shop.dbml", projectPath: "shop.dbcd" }))
      .rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(await readFile(join(workspaceRoot, "shop.dbcd"))).toEqual(before);
    await expect(exportDbmlProject({ workspaceRoot, projectPath: "shop.dbcd", targetPath: "shop.dbml" }))
      .rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(await readFile(join(workspaceRoot, "shop.dbml"), "utf8")).toBe(source);
    expect(initial.generation).toBe(1);
  });

  it("rejects paths outside the workspace and does not create an export", async () => {
    const workspaceRoot = await makeTempWorkspace(roots);
    await writeFile(join(workspaceRoot, "shop.dbml"), "Table users { id int [pk] }\n");
    await importDbmlProject({ workspaceRoot, sourcePath: "shop.dbml", projectPath: "shop.dbcd" });
    await expect(exportDbmlProject({ workspaceRoot, projectPath: "shop.dbcd", targetPath: "../escape.dbml" }))
      .rejects.toMatchObject({ code: "OUTSIDE_WORKSPACE" });
  });
});
