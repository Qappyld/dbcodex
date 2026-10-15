import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDbcdProject, openDbcdProject } from "@dbcodex/core";
import type { LiveRequest } from "../../mcp/src/live-session.js";

// Exercise the current Electron IPC entry point with real storage and MCP
// handlers. Substitute only native windows, preferences and the OS lock.
const host = vi.hoisted(() => ({
  call: null as null | ((event: { sender: { id: number } }, name: string, args?: Record<string, unknown>) => Promise<any>),
  writable: true,
  nextId: 0,
  windows: [] as Array<{ id: number; webContents: { id: number; send: ReturnType<typeof vi.fn> } }>,
  live: null as null | ((request: LiveRequest) => Promise<unknown>),
  events: new Map<string, (...args: any[]) => void>(),
  saveDialog: vi.fn(),
}));
vi.mock("electron", () => {
  class BrowserWindow {
    webContents = { id: ++host.nextId, setWindowOpenHandler: vi.fn(), on: vi.fn(), send: vi.fn() };
    get id() { return this.webContents.id; }
    constructor() { host.windows.push(this); }
    static fromWebContents(sender: { id: number }) { return host.windows.find(window => window.webContents.id === sender.id); }
    static getAllWindows() { return host.windows; }
    static fromId(id: number) { return host.windows.find(window => window.id === id); }
    isDestroyed = () => false;
    on = vi.fn();
    loadFile = vi.fn(async () => {});
    setTitle = vi.fn();
    close = vi.fn();
  }
  return {
    BrowserWindow,
    app: { whenReady: async () => {}, isPackaged: false, getPath: () => tmpdir(), on: vi.fn(), quit: vi.fn() },
    ipcMain: { on: (channel: string, handler: (...args: any[]) => void) => host.events.set(channel, handler), handle: (_channel: string, handler: typeof host.call) => { host.call = handler; } },
    Menu: { setApplicationMenu: vi.fn() },
    dialog: { showErrorBox: vi.fn(), showSaveDialog: host.saveDialog },
  };
});
vi.mock("../src/preferences.js", () => ({ PreferencesStore: class {
  value = { recent: [], theme: "light" }; notice = "";
  add = vi.fn(); remove = vi.fn(); load = vi.fn();
} }));
vi.mock("../src/project-lock.js", () => ({ acquireProjectLock: async () => host.writable ? { close: vi.fn() } : null }));
vi.mock("../src/updater.js", () => ({ PortableUpdater: class { recoveryNotice = async () => ""; } }));
vi.mock("../../mcp/src/live-session.js", () => ({
  liveEndpoint: () => "test-pipe", liveToken: async () => "test-token",
  serveLive: async (_endpoint: string, handle: typeof host.live) => { host.live = handle; return { close: vi.fn() }; },
  writeLiveConnection: vi.fn(),
}));

const directories: string[] = [];
beforeEach(() => { vi.resetModules(); host.call = null; host.live = null; host.events.clear(); host.writable = true; host.nextId = 0; host.windows = []; host.saveDialog.mockReset(); });
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
it("routes live reads to the selected window and rejects responses from a different renderer", async () => {
  const f = await setup(); await f.call("open", { path: f.path });
  expect(await host.live!({ action: "list" })).toEqual({ sessions: [{ sessionId: "1", path: f.path, readOnly: false }] });
  let resolved = false;
  const pending = host.live!({ action: "read", sessionId: "1" }).then(value => { resolved = true; return value; });
  const [, message] = host.windows[0]!.webContents.send.mock.calls.at(-1)!;
  host.events.get("dbcodex:live-response")!({ sender: { id: 99 } }, { id: message.id, result: "wrong window" });
  await Promise.resolve(); expect(resolved).toBe(false);
  host.events.get("dbcodex:live-response")!({ sender: { id: 1 } }, { id: message.id, result: { sourceText: "// unsaved" } });
  expect(await pending).toEqual({ sessionId: "1", path: f.path, state: { sourceText: "// unsaved" } });
  await expect(host.live!({ action: "read", sessionId: "missing" })).rejects.toThrow("introuvable");
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

it("saves the current unsaved document under a new name and continues in that project", async () => {
  const f = await setup(); await f.call("open", { path: f.path });
  const path = join(f.input.workspaceRoot, "renamed.dbcd");
  host.saveDialog.mockResolvedValue({ canceled: false, filePath: path });
  const presentation = structuredClone(f.initial.presentation);
  presentation.views.all!.nodes["public.users"] = { x: 222, y: 333 };
  const sourceText = f.initial.sourceText.replace("id int", "id bigint");
  const result = await f.call("save_as", { sourceText, presentation });
  expect(result.structuredContent.projectPath).toBe("renamed.dbcd");
  const copy = await openDbcdProject({ ...f.input, projectPath: "renamed.dbcd" });
  expect(copy.sourceText).toBe(sourceText);
  expect(copy.presentation.views.all!.nodes["public.users"]).toEqual({ x: 222, y: 333 });
  expect(copy.projectId).not.toBe(f.initial.projectId);
  expect((await f.call("open_dbcd", { path: "renamed.dbcd" }))._meta.dbcodex.sourceText).toBe(sourceText);
  expect((await openDbcdProject(f.input)).sourceText).toBe(f.initial.sourceText);
  await expect(f.call("save_dbcd_draft", { path: "test.dbcd" })).rejects.toThrow("Commande ou projet non autorisé");
});

it("preserves the active project on save-as cancellation, invalid input, or an existing destination", async () => {
  const f = await setup(); await f.call("open", { path: f.path });
  const args = { sourceText: f.initial.sourceText, presentation: f.initial.presentation };
  host.saveDialog.mockResolvedValueOnce({ canceled: true });
  expect(await f.call("save_as", args)).toBeNull();
  host.saveDialog.mockResolvedValueOnce({ canceled: false, filePath: f.path });
  await expect(f.call("save_as", args)).rejects.toThrow("existe déjà");
  host.saveDialog.mockResolvedValueOnce({ canceled: false, filePath: join(f.input.workspaceRoot, "invalid.dbcd") });
  await expect(f.call("save_as", { ...args, sourceText: "Table broken {" })).rejects.toThrow();
  expect((await f.call("open_dbcd", { path: "test.dbcd" }))._meta.dbcodex.sourceText).toBe(f.initial.sourceText);
  expect((await openDbcdProject(f.input)).generation).toBe(1);
});
