import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function makeTempWorkspace(roots: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dbcodex-test-"));
  roots.push(root);
  return root;
}

export async function removeTempWorkspace(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}
