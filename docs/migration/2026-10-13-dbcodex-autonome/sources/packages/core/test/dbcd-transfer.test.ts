import { mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportDbmlProject, importDbmlProject } from "../src/dbcd-transfer.js";
import { saveDbcdProject } from "../src/dbcd-project-store.js";
import { emptyPresentation } from "../src/presentation.js";
import { makeTempWorkspace, removeTempWorkspace } from "./support/temp-workspace.js";

const readBoundary = vi.hoisted(() => ({
  afterProjectRead: undefined as undefined | (() => Promise<void>),
}));
const writeBoundary = vi.hoisted(() => ({
  beforeWrite: undefined as undefined | (() => void),
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    writeSync: (...args: Parameters<typeof actual.writeSync>) => {
      writeBoundary.beforeWrite?.();
      return actual.writeSync(...args);
    },
  };
});
vi.mock("../src/dbcd-project-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/dbcd-project-store.js")>();
  return {
    ...actual,
    openDbcdProject: async (...args: Parameters<typeof actual.openDbcdProject>) => {
      const snapshot = await actual.openDbcdProject(...args);
      await readBoundary.afterProjectRead?.();
      return snapshot;
    },
  };
});

describe("lossless DBML transfer", () => {
  const roots: string[] = [];
  afterEach(async () => {
    readBoundary.afterProjectRead = undefined;
    writeBoundary.beforeWrite = undefined;
    await Promise.all(roots.splice(0).map(removeTempWorkspace));
  });

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
      expectedProjectId: initial.projectId, expectedRevisionId: initial.currentRevisionId,
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

  it("rejects a destination parent replaced with a junction during project reading", async () => {
    const workspaceRoot = await makeTempWorkspace(roots);
    const outsideRoot = await makeTempWorkspace(roots);
    const source = "Table users { id int [pk] }\n";
    await writeFile(join(workspaceRoot, "shop.dbml"), source);
    await importDbmlProject({ workspaceRoot, sourcePath: "shop.dbml", projectPath: "shop.dbcd" });
    await mkdir(join(workspaceRoot, "exports"));
    const projectBefore = await readFile(join(workspaceRoot, "shop.dbcd"));
    let signalRead!: () => void;
    const readReached = new Promise<void>((resolve) => { signalRead = resolve; });
    let resumeRead!: () => void;
    const paused = new Promise<void>((resolve) => { resumeRead = resolve; });
    readBoundary.afterProjectRead = async () => { signalRead(); await paused; };

    const exporting = exportDbmlProject({ workspaceRoot, projectPath: "shop.dbcd", targetPath: "exports/copy.dbml" });
    try {
      await readReached;
      await rename(join(workspaceRoot, "exports"), join(workspaceRoot, "exports-original"));
      await symlink(outsideRoot, join(workspaceRoot, "exports"), process.platform === "win32" ? "junction" : "dir");
      resumeRead();
      await expect(exporting).rejects.toMatchObject({ code: "OUTSIDE_WORKSPACE" });
      await expect(readFile(join(outsideRoot, "copy.dbml"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(join(workspaceRoot, "shop.dbml"), "utf8")).toBe(source);
      expect(await readFile(join(workspaceRoot, "shop.dbcd"))).toEqual(projectBefore);
    } finally {
      resumeRead();
      readBoundary.afterProjectRead = undefined;
    }
  });

  it("preserves a replacement target when an export write fails", async () => {
    const workspaceRoot = await makeTempWorkspace(roots);
    await writeFile(join(workspaceRoot, "shop.dbml"), "Table users { id int [pk] }\n");
    await importDbmlProject({ workspaceRoot, sourcePath: "shop.dbml", projectPath: "shop.dbcd" });
    const target = join(workspaceRoot, "copy.dbml");
    writeBoundary.beforeWrite = () => {
      writeBoundary.beforeWrite = undefined;
      renameSync(target, join(workspaceRoot, "reserved-original.dbml"));
      writeFileSync(target, "replacement");
      throw new Error("injected write failure");
    };
    await expect(exportDbmlProject({ workspaceRoot, projectPath: "shop.dbcd", targetPath: "copy.dbml" }))
      .rejects.toThrow("injected write failure");
    expect(await readFile(target, "utf8")).toBe("replacement");
    expect(await readFile(join(workspaceRoot, "reserved-original.dbml"), "utf8")).toBe("");
  });
});
