import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createDbcdProject } from "../../src/dbcd-project-store.js";
import { makeTempWorkspace } from "./temp-workspace.js";

export const fixtureSource = "Table users { id int [pk] }\n";
export const fixtureTimestamp = "2026-09-26T10:00:00.000Z";

export async function makeDbcdFixture(roots: string[]) {
  const root = await makeTempWorkspace(roots);
  const input = {
    workspaceRoot: root,
    projectPath: "shop.dbcd",
    sourceText: fixtureSource,
    now: () => fixtureTimestamp,
    projectId: () => "project-1",
  };
  const snapshot = await createDbcdProject(input);
  return { root, input: { ...input, expectedProjectId: snapshot.projectId,
    expectedRevisionId: snapshot.currentRevisionId, expectedGeneration: snapshot.generation },
    snapshot, path: join(root, input.projectPath) };
}

export function inspectDbcd<T>(path: string, inspect: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path);
  try {
    return inspect(db);
  } finally {
    db.close();
  }
}
