import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { readSignedManifest, isNewerVersion, type UpdateManifest } from './update-manifest.js';
import { ZodError } from 'zod';

export type UpdateStatus = { phase: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'closing' | 'error'; currentVersion: string; version?: string; notes?: string; progress?: number; message: string };
type Config = { version: string; repository: string; publicKey: string };
export class PortableUpdater {
  status: UpdateStatus;
  private manifest: UpdateManifest | undefined;
  private job: string | undefined;
  private lock: string;
  private busy = false;
  constructor(private config: Config, private root: string, private helper: string, private enabled: boolean) {
    this.status = { phase: 'idle', currentVersion: config.version, message: enabled ? 'Vérifiez si une nouvelle version est disponible.' : 'Mises à jour disponibles dans la version portable Windows.' };
    this.lock = join(root, '.dbcodex-update.lock');
  }
  private set(change: Partial<UpdateStatus>) { this.status = { ...this.status, ...change }; }
  async check() {
    if (this.busy || ['ready', 'closing'].includes(this.status.phase)) return this.status;
    if (!this.enabled) return this.status;
    this.busy = true;
    this.manifest = undefined;
    this.status = { phase: 'checking', currentVersion: this.config.version, message: 'Recherche de mises à jour…' };
    try {
      const response = await fetch(`https://github.com/${this.config.repository}/releases/latest/download/update-manifest.json`, { signal: AbortSignal.timeout(30000) });
      if (response.status === 404) { this.set({ phase: 'idle', message: 'Aucune mise à jour publiée pour le moment.' }); return this.status; }
      if (!response.ok) throw Error('Impossible de joindre GitHub. Réessayez plus tard.');
      const reader = response.body!.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 300000) { await reader.cancel(); throw Error('Manifeste de mise à jour trop volumineux.'); } chunks.push(value); }
      const manifest = readSignedManifest(Buffer.concat(chunks).toString('utf8'), this.config.publicKey, this.config.repository);
      this.manifest = isNewerVersion(manifest.version, this.config.version) ? manifest : undefined;
      this.set(this.manifest ? { phase: 'available', version: manifest.version, notes: manifest.notes, message: `La version ${manifest.version} est disponible.` } : { phase: 'idle', message: 'Vous utilisez la dernière version.' });
    } catch (error) {
      const message = error instanceof ZodError || error instanceof SyntaxError ? 'Les informations de mise à jour reçues sont invalides. Réessayez plus tard.'
        : error instanceof TypeError || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) ? 'Impossible de joindre GitHub. Vérifiez votre connexion puis réessayez.'
        : error instanceof Error ? error.message : 'Vérification impossible.';
      this.set({ phase: 'error', message });
    }
    finally { this.busy = false; }
    return this.status;
  }
  async download() {
    if (this.busy || !this.manifest || !['available', 'error'].includes(this.status.phase)) return this.status;
    this.busy = true;
    this.set({ phase: 'downloading', progress: 0, message: 'Téléchargement de la mise à jour…' });
    const manifest = this.manifest;
    try {
      // Check destination writability before spending time downloading.
      const probe = join(this.root, `.update-probe-${randomUUID()}`);
      await writeFile(probe, '', { flag: 'wx' }); await unlink(probe);
      const staging = join(tmpdir(), `dbcodex-update-${randomUUID()}`); await mkdir(staging);
      const archive = join(staging, 'update.zip');
      const response = await fetch(manifest.url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
      if (!response.ok || !response.body) throw Error('Téléchargement impossible. Réessayez plus tard.');
      let bytes = 0; const hash = createHash('sha256');
      await pipeline(Readable.fromWeb(response.body as any), new Transform({ transform: (chunk: Buffer, _encoding, callback) => {
        bytes += chunk.length; if (bytes > manifest.size) { callback(Error('Taille de téléchargement invalide.')); return; }
        hash.update(chunk); this.set({ progress: Math.floor(bytes * 100 / manifest.size) }); callback(null, chunk);
      } }), createWriteStream(archive, { flags: 'wx' }));
      if (bytes !== manifest.size || hash.digest('hex') !== manifest.sha256) throw Error('La mise à jour est incomplète ou endommagée. Réessayez.');
      const script = join(staging, 'apply-update.ps1'); await copyFile(this.helper, script);
      this.job = join(staging, 'job.json');
      await writeFile(this.job, JSON.stringify({ root: this.root, archive, parentPid: process.pid, manifest }));
      this.set({ phase: 'ready', progress: 100, message: 'Mise à jour prête. Vous pouvez redémarrer quand votre travail est prêt.' });
    } catch (error) { this.set({ phase: 'error', message: error instanceof Error && !('code' in error) ? error.message : 'Téléchargement impossible. Vérifiez la connexion et les droits d’écriture du dossier.' }); }
    finally { this.busy = false; }
    return this.status;
  }
  async prepareRestart() {
    if (this.status.phase !== 'ready' || !this.job) throw Error('Téléchargez la mise à jour avant de redémarrer.');
    // The helper checks all processes after this instance has stopped, including Electron children.
    const handle = await open(this.lock, 'wx');
    try { await handle.writeFile(this.job); } finally { await handle.close(); }
    this.set({ phase: 'closing', message: 'Conservation des brouillons et fermeture…' });
  }
  async cancelRestart() { await unlink(this.lock).catch(() => {}); this.set({ phase: 'ready', message: 'Redémarrage annulé. Résolvez le problème de conservation du brouillon puis réessayez.' }); }
  async launchHelper() {
    if (this.status.phase !== 'closing' || !this.job) return;
    // Start-Process uses Windows' independent launch rather than inheriting Electron's child lifetime.
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference="Stop"; $worker = Start-Process -FilePath powershell.exe -ArgumentList @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", (\'"\' + $env:DBCODEX_UPDATE_HELPER + \'"\'), "-JobPath", (\'"\' + $env:DBCODEX_UPDATE_JOB + \'"\')) -WindowStyle Hidden -PassThru; if ($worker.WaitForExit(500)) { throw "Le programme de mise à jour a quitté prématurément." }'], {
      windowsHide: true,
      env: { ...process.env, DBCODEX_UPDATE_HELPER: join(this.job, '..', 'apply-update.ps1'), DBCODEX_UPDATE_JOB: this.job },
    });
  }
  async recoveryNotice() {
    try { await access(this.lock); return 'Une mise à jour a été interrompue. Consultez docs/UPDATES.md pour la récupération avant de reprendre votre travail.'; } catch { /* No pending update. */ }
    try { const result = JSON.parse(await readFile(join(this.root, '.dbcodex-update-result.json'), 'utf8')); await unlink(join(this.root, '.dbcodex-update-result.json')); return result.message as string; } catch { return ''; }
  }
}
