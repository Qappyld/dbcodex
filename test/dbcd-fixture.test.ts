import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyPresentation, hashDocument, openDbcdProject } from "../packages/core/src/index.js";

describe("tracked demo project", () => {
  it("has fixed identity, time, source bytes and one initial revision", async () => {
    const workspaceRoot = path.resolve(import.meta.dirname, "..");
    const source = await readFile(path.join(workspaceRoot, "fixtures/demo-shop.dbml"), "utf8");
    expect(source).not.toContain("\r");
    const project = await openDbcdProject({ workspaceRoot, projectPath: "fixtures/demo-shop.dbcd" });
    expect(project.projectId).toBe("demo-shop");
    expect(project.sourceText).toBe(source);
    expect(project.sourceHash).toBe(hashDocument(source));
    expect(project.presentation).toEqual(emptyPresentation());
    expect(project.generation).toBe(1);
    expect(project.revisions).toHaveLength(1);
    expect(project.revisions[0]?.createdAt).toBe("2026-09-26T00:00:00.000Z");
    expect(project.draft).toBeNull();
  });
});
