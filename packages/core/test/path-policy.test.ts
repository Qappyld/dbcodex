import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PathPolicyError, resolveWorkspaceDbml } from "../src/path-policy.js";
import { makeTempWorkspace, removeTempWorkspace } from "./support/temp-workspace.js";

describe("resolveWorkspaceDbml", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeTempWorkspace));
  });

  it("resolves an existing DBML file below the workspace", async () => {
    const root = await makeTempWorkspace(roots);
    await mkdir(join(root, "schemas"));
    await writeFile(join(root, "schemas", "main.dbml"), "Table users { id int [pk] }");

    await expect(resolveWorkspaceDbml(root, "schemas/main.dbml")).resolves.toEqual({
      absolutePath: await realpath(join(root, "schemas", "main.dbml")),
      relativePath: "schemas/main.dbml",
    });
  });

  it.each([
    [resolve(parse(process.cwd()).root, "absolute.dbml"), "ABSOLUTE_PATH"],
    ["../outside.dbml", "OUTSIDE_WORKSPACE"],
    ["schema.sql", "NOT_DBML"],
    ["missing.dbml", "NOT_FOUND"],
  ])("rejects %s with %s", async (input, code) => {
    const root = await makeTempWorkspace(roots);

    await expect(resolveWorkspaceDbml(root, input)).rejects.toMatchObject({ code });
  });

  it("exposes stable error codes", () => {
    expect(new PathPolicyError("NOT_DBML", "message")).toMatchObject({
      name: "PathPolicyError",
      code: "NOT_DBML",
    });
  });
});
