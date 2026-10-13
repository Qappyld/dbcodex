import assert from "node:assert/strict";
import { access, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const entry = path.join(root, "packages/core/dist/index.js");
try { await access(entry); }
catch { throw new Error("Build output missing: run npm run build --workspace @dbcodex/core first."); }
const { createDbcdProject, emptyPresentation, hashDocument, openDbcdProject } = await import(pathToFileURL(entry).href);
const sourceText = await readFile(path.join(root, "fixtures/demo-shop.dbml"), "utf8");
const projectPath = "fixtures/demo-shop.dbcd";
// This generator owns exactly this tracked demo artifact; it never touches user projects.
await unlink(path.join(root, projectPath)).catch((error) => { if (error.code !== "ENOENT") throw error; });
await createDbcdProject({ workspaceRoot: root, projectPath, sourceText, presentation: emptyPresentation(),
  projectId: () => "demo-shop", now: () => "2026-09-26T00:00:00.000Z" });
const opened = await openDbcdProject({ workspaceRoot: root, projectPath });
assert.equal(opened.sourceHash, hashDocument(sourceText));
assert.equal(opened.projectId, "demo-shop");
assert.equal(opened.generation, 1);
assert.equal(opened.revisions.length, 1);
assert.equal(opened.revisions[0].createdAt, "2026-09-26T00:00:00.000Z");
process.stdout.write(`Generated ${projectPath}; source hash ${opened.sourceHash}.\n`);
