import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDbcdProject, openDbcdProject } from "@dbcodex/core";

// Exercise the current Electron IPC entry point with real storage and MCP
// handlers. Substitute only native windows, preferences and the OS lock.
const host = vi.hoisted(() => ({
  call: null as null | ((event: { sender: { id: number } }, name: string, args?: Record<string, unknown>) => Promise<any>),
  writable: true,
  nextId: 0,
  windows: [] as Array<{ webContents: { id: number } }>,
}));
vi.mock("electron", () => {
  class BrowserWindow {
    webContents = { id: ++host.nextId, setWindowOpenHandler: vi.fn(), on: vi.fn(), send: vi.fn() };
    constructor() { host.windows.push(this); }
    static fromWebContents(sender: { id: number }) { return host.windows.find(window => window.webContents.id === sender.id); }
    static getAllWindows() { return host.windows; }
    on = vi.fn();
    loadFile = vi.fn(async () => {});
    setTitle = vi.fn();
    close = vi.fn();
  }
  return {
    BrowserWindow,
    app: { whenReady: async () => {}, isPackaged: false, getPath: () => tmpdir(), on: vi.fn(), quit: vi.fn() },
    ipcMain: { on: vi.fn(), handle: (_channel: string, handler: typeof host.call) => { host.call = handler; } },
    Menu: { setApplicationMenu: vi.fn() },
    dialog: { showErrorBox: vi.fn() },
  };
});
vi.mock("../src/preferences.js", () => ({ PreferencesStore: class {
  value = { recent: [], theme: "light" }; notice = "";
  add = vi.fn(); remove = vi.fn(); load = vi.fn();
} }));
vi.mock("../src/project-lock.js", () => ({ acquireProjectLock: async () => host.writable ? { close: vi.fn() } : null }));
vi.mock("../src/updater.js", () => ({ PortableUpdater: class { recoveryNotice = async () => ""; } }));

const directories: string[] = [];
beforeEach(() => { vi.resetModules(); host.call = null; host.writable = true; host.nextId = 0; host.windows = []; });
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function setup(writable = true) {
  const root = await mkdtemp(join(tmpdir(), "dbcodex-portable-ipc-")); directories.push(root);
  const input = { workspaceRoot: root, projectPath: "test.dbcd" };
  const initial = await createDbcdProject({ ...input, sourceText: "// keep\nTable users { id int [pk] }" });
  host.writable = writable;
  await import("../src/main.js");
  const sender = host.windows[0]!.webContents;
  const call = (name: string, args?: Record<string, unknown>) => host.call!({ sender }, name, args);
  return { input, initial, call, path: join(root, input.projectPath) };
}

it("opens without creating a revision and restricts IPC to the selected project and allowed commands", async () => {
  const f = await setup();
  await expect(f.call("open_dbcd", { path: "test.dbcd" })).rejects.toThrow("Ouvrez un projet");
  const opened = await f.call("open", { path: f.path });
  expect(opened.structuredContent.generation).toBe(1);
  expect((await openDbcdProject(f.input)).sourceText).toBe(f.initial.sourceText);
  await expect(f.call("open_dbcd", { path: "../outside.dbcd" })).rejects.toThrow("Commande ou projet non autorisé");
  await expect(f.call("apply_dbcd_edits", { path: "test.dbcd" })).rejects.toThrow("Commande ou projet non autorisé");
  expect((await openDbcdProject(f.input)).generation).toBe(1);
});

it("validates without writing, then saves only through the explicit save command", async () => {
  const f = await setup(); await f.call("open", { path: f.path });
  const sourceText = f.initial.sourceText.replace("id int", "id bigint");
  const validation = await f.call("validate_dbcd_draft", { path: "test.dbcd", sourceText });
  expect(validation.structuredContent.diagnostics).toEqual([]);
  expect((await openDbcdProject(f.input)).generation).toBe(1);
  const args = { path: "test.dbcd", sourceText, presentation: f.initial.presentation,
    expectedProjectId: f.initial.projectId, expectedRevisionId: f.initial.currentRevisionId, expectedGeneration: f.initial.generation };
  const saved = await f.call("save_dbcd", args);
  expect(saved.structuredContent.generation).toBe(2);
  expect((await openDbcdProject(f.input)).sourceText).toBe(sourceText);
  const stale = await f.call("save_dbcd", args);
  expect(stale.isError).toBe(true);
  expect((await openDbcdProject(f.input)).generation).toBe(2);
});

it("keeps a window without the project lock read-only across refreshes", async () => {
  const f = await setup(false);
  expect((await f.call("open", { path: f.path })).structuredContent.readOnly).toBe(true);
  expect((await f.call("open_dbcd", { path: "test.dbcd" })).structuredContent.readOnly).toBe(true);
  for (const name of ["save_dbcd", "save_dbcd_draft", "discard_dbcd_draft", "restore_dbcd_revision", "pin_dbcd_revision"]) {
    await expect(f.call(name, { path: "test.dbcd" })).rejects.toThrow("lecture seule");
  }
  expect((await f.call("validate_dbcd_draft", { path: "test.dbcd", sourceText: f.initial.sourceText })).isError).not.toBe(true);
  expect((await openDbcdProject(f.input)).generation).toBe(1);
});

it("opens another project in a separate window while preserving the original session", async () => {
  const f = await setup(); await f.call("open", { path: f.path });
  await createDbcdProject({ ...f.input, projectPath: "other.dbcd", sourceText: "Table other { id int }" });
  await f.call("open", { path: join(f.input.workspaceRoot, "other.dbcd") });
  expect(host.windows).toHaveLength(2);
  expect((await f.call("open_dbcd", { path: "test.dbcd" }))._meta.dbcodex.projectId).toBe(f.initial.projectId);
  await expect(f.call("open_dbcd", { path: "other.dbcd" })).rejects.toThrow("Commande ou projet non autorisé");
});
