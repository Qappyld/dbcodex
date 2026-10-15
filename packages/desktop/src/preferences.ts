import { mkdirSync, readFileSync, existsSync, renameSync, writeFileSync, unlinkSync, openSync, closeSync, statSync } from "node:fs";
import { resolve, relative, isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
export type Preferences = { version: 1; theme: "light" | "dark"; recent: string[] };
export class PreferencesStore {
  value: Preferences = { version: 1, theme: "light", recent: [] };
  notice = "";
  file: string | null = null;
  protectedOriginal = false;
  constructor(readonly root: string, fallback: string) {
    for (const folder of [join(root, "data"), fallback]) {
      try { mkdirSync(folder, { recursive: true }); const probe = join(folder, `.probe-${randomUUID()}`); writeFileSync(probe, "");
        unlinkSync(probe); this.file = join(folder, "preferences.json");
        if (folder === fallback) this.notice = "Préférences enregistrées dans le dossier local du compte."; break;
      } catch { /* Try the local fallback. */ }
    }
    if (!this.file) this.notice = "Préférences conservées pour cette session seulement.";
    this.load();
  }
  load() {
    if (!this.file || !existsSync(this.file)) return;
    try { const value = JSON.parse(readFileSync(this.file, "utf8"));
      if (value.version !== 1 || !["light", "dark"].includes(value.theme) || !Array.isArray(value.recent) || !value.recent.every((x: unknown) => typeof x === "string")) throw Error();
      this.value = value;
    } catch { this.protectedOriginal = true; this.notice = "Préférences illisibles ou incompatibles : valeurs par défaut, original préservé."; }
  }
  path(entry: string) { return resolve(this.root, entry); }
  entry(path: string) { const result = relative(this.root, path); return isAbsolute(result) || result === ".." || result.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ? path : result; }
  update(change: Partial<Preferences>, recentOperation?: { add?: string; remove?: string }) {
    if (!this.file || this.protectedOriginal) { this.value = { ...this.value, ...change }; return; }
    const lock = `${this.file}.lock`, deadline = Date.now() + 2000;
    let handle: number | undefined;
    while (handle === undefined && Date.now() < deadline) {
      try { handle = openSync(lock, "wx"); writeFileSync(handle, String(process.pid)); }
      catch {
        try { const pid = Number(readFileSync(lock, "utf8")); if (pid > 0) { try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") unlinkSync(lock); } } else if (Date.now() - statSync(lock).mtimeMs > 10000) unlinkSync(lock); } catch { /* The other process may have released the lock. */ }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      }
    }
    if (handle === undefined) { this.value = { ...this.value, ...change }; this.notice = "Préférences conservées pour la session ; fichier occupé."; return; }
    try {
    this.load(); this.value = { ...this.value, ...change };
    if (recentOperation?.add) this.value.recent = [recentOperation.add, ...this.value.recent.filter(x => x !== recentOperation.add)].slice(0,30);
    if (recentOperation?.remove) this.value.recent = this.value.recent.filter(x => x !== recentOperation.remove);
    if (this.protectedOriginal) return;
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(this.value, null, 2)); renameSync(temporary, this.file); }
    catch { this.notice = "Préférences conservées pour la session ; écriture indisponible."; }
    } finally { closeSync(handle); try { unlinkSync(lock); } catch { /* No data file is removed. */ } }
  }
  add(path: string) { const entry = this.entry(path); if (!this.file || this.protectedOriginal) this.update({recent:[entry,...this.value.recent.filter(x=>x!==entry)].slice(0,30)}); else this.update({}, { add: entry }); }
  remove(entry: string) { if (!this.file || this.protectedOriginal) this.update({recent:this.value.recent.filter(x=>x!==entry)}); else this.update({}, { remove: entry }); }
}
