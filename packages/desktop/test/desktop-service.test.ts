import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createDbcdProject, openDbcdProject } from "@dbcodex/core";
import { DesktopService } from "../src/desktop-service.js";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "dbcodex-desktop-")); directories.push(root);
  await createDbcdProject({ workspaceRoot: root, projectPath: "test.dbcd", sourceText: "// keep\nTable users { id int [pk] }" });
  const run = vi.fn(async () => ({ reply: "Discussion only" }));
  const service = new DesktopService({ userDataDir: root, runProvider: run,
    getProviderStatuses: async () => ({ codex: { installed: true, detail: "Ready" }, claude: { installed: false, detail: "Not installed" } }) });
  await service.initialize(); await service.openPath(join(root, "test.dbcd"));
  return { root, run, service };
}
it("keeps opening and discussion read-only, persists messages, and restricts workbench calls to the selected project", async () => {
  const { service, run, root } = await setup();
  await service.createThread({ title: "Clients", provider: "codex" });
  const id = (await service.getState()).chat.threads[0]!.id;
  await service.sendMessage({ threadId: id, text: "Can I use bigint?", mode: "discuss", tableIds: ["public.users"], shareFullSource: false });
  expect(run).toHaveBeenCalledOnce();
  expect((run.mock.calls[0] as unknown as [Record<string, unknown>])[0].context).not.toContain("// keep");
  expect((await service.getState()).chat.messages).toHaveLength(2);
  expect((await openDbcdProject({ workspaceRoot: root, projectPath: "test.dbcd" })).generation).toBe(1);
  await expect(service.workbenchCall("open_dbcd", { path: "../outside.dbcd" })).rejects.toThrow();
  await expect(service.workbenchCall("apply_dbcd_edits", {})).rejects.toThrow();
  service.close();
});
it("prepares a reviewed proposal without writing and applies it only via the explicit action", async () => {
  const { service, run, root } = await setup();
  run.mockResolvedValue({ reply: "Ready", proposal: { title: "Identifier type", explanation: "Use bigint", edits: [{ search: "id int", replacement: "id bigint" }] } } as never);
  await service.createThread({ title: "Types", provider: "codex" });
  const threadId = (await service.getState()).chat.threads[0]!.id;
  const proposed = await service.sendMessage({ threadId, text: "Prepare the type change", mode: "propose", tableIds: ["public.users"], shareFullSource: false });
  expect(proposed.chat.proposals).toHaveLength(1);
  expect((await openDbcdProject({ workspaceRoot: root, projectPath: "test.dbcd" })).generation).toBe(1);
  const saved = await service.applyProposal(proposed.chat.proposals[0]!.id);
  expect(saved.chat.proposals[0]!.status).toBe("applied");
  expect((await openDbcdProject({ workspaceRoot: root, projectPath: "test.dbcd" })).sourceText).toBe("// keep\nTable users { id bigint [pk] }");
  service.close();
});
