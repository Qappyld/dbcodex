import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, realpathSync } from "node:fs";
import { createDbcdProject, openDbcdProject, parseDbml, newProjectTemplate, projectProfileSchema } from "@dbcodex/core";
import { createHandlers } from "../../mcp/src/handlers.js";
import { PreferencesStore } from "./preferences.js";
import { acquireProjectLock } from "./project-lock.js";
import type { Server } from "node:net";
import { PortableUpdater } from "./updater.js";
import releaseConfig from "../../../release-config.json" with { type: "json" };
import { existsSync } from "node:fs";
const here = dirname(fileURLToPath(import.meta.url));
const portableExecutable = app.isPackaged ? process.env.PORTABLE_EXECUTABLE_FILE : undefined;
const portableRoot = portableExecutable ? dirname(portableExecutable) : dirname(process.execPath);
type Session = { path?: string; root?: string; lock?: Server | null; closing?: boolean };
const sessions = new Map<number, Session>();
let preferences: PreferencesStore;
let updater: PortableUpdater;
let updateClosing = false;
function windowFor(path?: string) {
  const window = new BrowserWindow({ width: 1440, height: 940, minWidth: 850, minHeight: 580, title: "DBCodex", webPreferences: { preload: join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  sessions.set(window.webContents.id, {});
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.on("close", event => { if (!sessions.get(window.webContents.id)?.closing) { event.preventDefault(); window.webContents.send("dbcodex:closing"); } });
  const id = window.webContents.id;
  window.on("closed", () => { sessions.get(id)?.lock?.close(); sessions.delete(id); });
  void window.loadFile(join(here, "index.html"), path ? { query: { project: path } } : undefined);
  return window;
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  preferences = new PreferencesStore(app.isPackaged ? portableRoot : resolve(here, "../../.."), join(app.getPath("userData"), "preferences"));
  updater = new PortableUpdater(releaseConfig, portableRoot, join(here, "apply-update.ps1"), app.isPackaged && process.platform === "win32" && process.arch === "x64", portableExecutable);
  if (app.isPackaged && existsSync(join(portableRoot, '.dbcodex-update.lock'))) {
    dialog.showErrorBox('Mise à jour interrompue', 'Une mise à jour est en cours ou a été interrompue. Fermez les autres instances. Si le problème persiste, suivez la récupération décrite dans UPDATES.md, à côté de DBCodex.exe.');
    app.quit(); return;
  }
  void updater.recoveryNotice().then(notice => { if (notice) preferences.notice = notice; });
  ipcMain.on("dbcodex:closed", async (event, success) => {
    const window = BrowserWindow.fromWebContents(event.sender); const session = sessions.get(event.sender.id);
    if (!window || !session) return;
    if (!success) {
      if (updateClosing) { updateClosing = false; await updater.cancelRestart(); dialog.showErrorBox('Mise à jour reportée', 'Le brouillon n’a pas pu être conservé. Résolvez le conflit ou enregistrez une copie avant de réessayer.'); return; }
      const choice = await dialog.showMessageBox(window, { type: "warning", message: "Le brouillon n’a pas pu être conservé.", detail: "Restez dans l’atelier pour résoudre le conflit ou enregistrer une copie. Fermer abandonne les modifications qui n’ont pas été conservées.", buttons: ["Rester dans l’atelier", "Fermer sans conserver"], defaultId: 0, cancelId: 0 });
      if (choice.response !== 1) return;
    }
    session.closing = true; window.close();
  });
  ipcMain.handle("dbcodex:call", async (event, name: string, args: Record<string, unknown> = {}) => {
    const window = BrowserWindow.fromWebContents(event.sender)!; const session = sessions.get(event.sender.id)!;
    if (!session) throw Error("Fenêtre inconnue.");
    if (name === 'update_status') return updater.status;
    if (name === 'update_check') return updater.check();
    if (name === 'update_download') return updater.download();
    if (name === 'update_restart') {
      if (updateClosing) return updater.status;
      const choice = await dialog.showMessageBox(window, { type: 'question', message: 'Redémarrer pour mettre à jour DBCodex ?', detail: 'Toutes les fenêtres vont se fermer après conservation des brouillons. Vos projets et préférences seront conservés.', buttons: ['Redémarrer', 'Plus tard'], defaultId: 0, cancelId: 1 });
      if (choice.response !== 0) return updater.status;
      await updater.prepareRestart(); updateClosing = true;
      for (const current of BrowserWindow.getAllWindows()) current.close();
      return updater.status;
    }
    if (name === "preferences") { preferences.load(); return { ...preferences.value, notice: preferences.notice, recent: preferences.value.recent.map(entry => ({ entry, path: preferences.path(entry), name: basename(entry) })) }; }
    if (name === "theme") { if (!["light", "dark"].includes(String(args.theme))) throw Error("Thème invalide"); preferences.update({ theme: args.theme as "light" | "dark" }); return null; }
    if (name === "remove_recent") { preferences.remove(String(args.entry)); return null; }
    if (["open", "create", "import", "locate"].includes(name)) {
      let path = typeof args.path === "string" ? args.path : undefined;
      if (name === "create" || name === "import") {
        const template = name === "create" ? newProjectTemplate(projectProfileSchema.parse(args.profile)) : null;
        let sourceText = template?.sourceText ?? "";
        if (name === "import") { const input = await dialog.showOpenDialog(window, { filters: [{ name: "DBML", extensions: ["dbml"] }], properties: ["openFile"] }); if (input.canceled) return null; sourceText = readFileSync(input.filePaths[0]!, "utf8"); if (!parseDbml(sourceText, input.filePaths[0]!).graph) throw Error("DBML invalide : import annulé."); }
        const output = await dialog.showSaveDialog(window, { filters: [{ name: "Projet DBCodex", extensions: ["dbcd"] }] }); if (output.canceled || !output.filePath) return null;
        path = output.filePath; await createDbcdProject({ workspaceRoot: dirname(path), projectPath: basename(path), sourceText, ...(template ? {presentation:template.presentation} : {}) });
      } else if (!path) { const result = await dialog.showOpenDialog(window, { filters: [{ name: "Projet DBCodex", extensions: ["dbcd"] }], properties: ["openFile"] }); if (result.canceled) return null; path = result.filePaths[0]!; }
      path = realpathSync(path!);
      await openDbcdProject({ workspaceRoot: dirname(path), projectPath: basename(path) });
      if (name === "locate" && typeof args.entry === "string") preferences.remove(args.entry);
      if (session.path) { windowFor(path); return name === "create" ? { openedInNewWindow: true } : null; }
      session.path = path; session.root = dirname(path); session.lock = await acquireProjectLock(path);
      window.setTitle(`${basename(path)} — DBCodex${session.lock ? "" : " · Lecture seule"}`); preferences.add(path);
      const result = await createHandlers(session.root).openDbcd({ path: basename(path) });
      if (!session.lock && "structuredContent" in result) (result.structuredContent as any).readOnly = true;
      return result;
    }
    if (!session.path || !session.root) throw Error("Ouvrez un projet.");
    if (name === "save_copy") {
      if (typeof args.sourceText !== "string") throw Error("Source absente.");
      const output = await dialog.showSaveDialog(window, { title: "Enregistrer une copie récupérée", filters: [{ name: "Projet DBCodex", extensions: ["dbcd"] }] });
      if (output.canceled || !output.filePath) return null;
      await createDbcdProject({workspaceRoot:dirname(output.filePath),projectPath:basename(output.filePath),sourceText:args.sourceText,presentation:args.presentation as any});
      preferences.add(output.filePath); return null;
    }
    if (name === "export") { const target = await dialog.showSaveDialog(window, { filters: [{ name: "DBML", extensions: ["dbml"] }] }); if (target.canceled || !target.filePath) return null;
      const snapshot = await openDbcdProject({ workspaceRoot: session.root, projectPath: basename(session.path) });
      const { writeFile } = await import("node:fs/promises"); await writeFile(target.filePath, snapshot.sourceText, "utf8"); return null; }
    const map = { open_dbcd: "openDbcd", validate_dbcd_draft: "validateDbcdDraft", save_dbcd_draft: "saveDbcdDraft", discard_dbcd_draft: "discardDbcdDraft", save_dbcd: "saveDbcd", list_dbcd_revisions: "listDbcdRevisions", read_dbcd_revision: "readDbcdRevision", restore_dbcd_revision: "restoreDbcdRevision", pin_dbcd_revision: "pinDbcdRevision" } as const;
    if (!Object.hasOwn(map, name) || args.path !== basename(session.path)) throw Error("Commande ou projet non autorisé.");
    if (!session.lock && !["open_dbcd", "validate_dbcd_draft", "list_dbcd_revisions", "read_dbcd_revision"].includes(name)) throw Error("Projet ouvert en lecture seule dans cette fenêtre.");
    const handlers = createHandlers(session.root); const result = await (handlers[map[name as keyof typeof map]] as any)(args);
    if (!session.lock && name === "open_dbcd" && result.structuredContent) result.structuredContent.readOnly = true;
    return result;
  });
  windowFor(process.argv.find(value => value.toLowerCase().endsWith(".dbcd")));
});
app.on("window-all-closed", () => {
  if (!updateClosing) { app.quit(); return; }
  void updater.launchHelper().then(() => app.quit()).catch(async () => { updateClosing = false; await updater.cancelRestart(); dialog.showErrorBox('Mise à jour impossible', 'Le programme de mise à jour n’a pas pu démarrer. Réessayez.'); windowFor(); });
});
