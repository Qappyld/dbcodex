import { mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveExistingDbcd, resolveNewDbcd } from "../src/dbcd-path-policy.js";
import { makeTempWorkspace, removeTempWorkspace } from "./support/temp-workspace.js";

describe("dbcd path policy", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeTempWorkspace));
  });

  it("resolves an existing regular project below the canonical workspace root", async () => {
    const root = await makeTempWorkspace(roots);
    await mkdir(join(root, "projects"));
    await writeFile(join(root, "projects", "schema.DBCD"), "project");
    await expect(resolveExistingDbcd(root, "projects\\schema.DBCD")).resolves.toEqual({
      workspaceRoot: await realpath(root),
      relativePath: "projects/schema.DBCD",
      absolutePath: join(await realpath(root), "projects", "schema.DBCD"),
    });
  });

  it("resolves a new project only beneath an existing parent", async () => {
    const root = await makeTempWorkspace(roots);
    await mkdir(join(root, "projects"));
    await expect(resolveNewDbcd(root, "projects/new.dbcd")).resolves.toEqual({
      workspaceRoot: await realpath(root),
      relativePath: "projects/new.dbcd",
      absolutePath: join(await realpath(root), "projects", "new.dbcd"),
    });
    await expect(resolveNewDbcd(root, "missing/new.dbcd")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([
    [join(parse(process.cwd()).root, "absolute.dbcd"), "ABSOLUTE_PATH"],
    ["C:relative.dbcd", "ABSOLUTE_PATH"],
    ["../outside.dbcd", "OUTSIDE_WORKSPACE"],
    ["a/../inside.dbcd", "OUTSIDE_WORKSPACE"],
    ["a//inside.dbcd", "INVALID_PATH"],
    ["a/", "INVALID_PATH"],
    ["schema.dbml", "NOT_DBCD"],
  ])("rejects malformed path %s", async (input, code) => {
    const root = await makeTempWorkspace(roots);
    await expect(resolveExistingDbcd(root, input)).rejects.toMatchObject({ code });
    await expect(resolveNewDbcd(root, input)).rejects.toMatchObject({ code });
  });

  it("requires a regular file for an existing project", async () => {
    const root = await makeTempWorkspace(roots);
    await mkdir(join(root, "folder.dbcd"));
    await expect(resolveExistingDbcd(root, "folder.dbcd")).rejects.toMatchObject({ code: "NOT_FILE" });
    await expect(resolveExistingDbcd(root, "missing.dbcd")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an existing target for a new project", async () => {
    const root = await makeTempWorkspace(roots);
    await writeFile(join(root, "taken.dbcd"), "project");
    await expect(resolveNewDbcd(root, "taken.dbcd")).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
  });

  it("rejects a junction or symbolic link in an existing path segment", async () => {
    const root = await makeTempWorkspace(roots);
    const outside = await makeTempWorkspace(roots);
    await writeFile(join(outside, "escape.dbcd"), "project");
    await symlink(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    await expect(resolveExistingDbcd(root, "linked/escape.dbcd")).rejects.toMatchObject({ code: "OUTSIDE_WORKSPACE" });
    await expect(resolveNewDbcd(root, "linked/new.dbcd")).rejects.toMatchObject({ code: "OUTSIDE_WORKSPACE" });
  });
});
