import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { readSignedManifest, isNewerVersion, type UpdateManifest } from './update-manifest.js';
import { ZodError } from 'zod';
import { DiagnosticLog, diagnosticError, diagnosticText, type UpdateResult } from './diagnostic-log.js';

export type UpdateStatus = { phase: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'closing' | 'error'; currentVersion: string; version?: string; notes?: string; progress?: number; message: string; logDirectory?: string | null; lastFailure?: UpdateResult | null };
type Config = { version: string; repository: string; publicKey: string };
export class PortableUpdater {
  private state: UpdateStatus;
  private attemptId: string | undefined;
  private lastFailure: UpdateResult | null = null;
  readonly diagnostics: DiagnosticLog;
  get status(): UpdateStatus { return { ...this.state, logDirectory: this.diagnostics.directory, lastFailure: this.lastFailure }; }
  private manifest: UpdateManifest | undefined;
  private job: string | undefined;
  private lock: string;
  private busy = false;
  constructor(private config: Config, private root: string, private helper: string, private enabled: boolean, private portableExecutable?: string, diagnostics?: DiagnosticLog) {
    this.diagnostics = diagnostics ?? new DiagnosticLog(join(root, 'data', 'logs'), config.version);
    const previous = this.diagnostics.lastResult();
    this.lastFailure = previous?.detail ? previous : null;
    this.state = { phase: 'idle', currentVersion: config.version, message: enabled ? 'Vérifiez si une nouvelle version est disponible.' : 'Mises à jour disponibles dans la version portable Windows.' };
    this.lock = join(root, '.dbcodex-update.lock');
  }
  private set(change: Partial<UpdateStatus>) { this.state = { ...this.state, ...change }; }
  async check() {
    if (this.busy || ['ready', 'closing'].includes(this.status.phase)) return this.status;
    if (!this.enabled) return this.status;
    this.busy = true;
    this.manifest = undefined;
    this.state = { phase: 'checking', currentVersion: this.config.version, message: 'Recherche de mises à jour…' };
    this.diagnostics.write('update.check.started', { edition: this.portableExecutable ? 'exe' : 'zip' });
    try {
      const response = await fetch(`https://github.com/${this.config.repository}/releases/latest/download/${this.portableExecutable ? 'portable-update-manifest.json' : 'update-manifest.json'}`, { signal: AbortSignal.timeout(30000) });
      this.diagnostics.write('update.check.response', { httpStatus: response.status });
      if (response.status === 404) { this.set({ phase: 'idle', message: 'Aucune mise à jour publiée pour le moment.' }); return this.status; }
      if (!response.ok) throw Error('Impossible de joindre GitHub. Réessayez plus tard.');
      const reader = response.body!.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 300000) { await reader.cancel(); throw Error('Manifeste de mise à jour trop volumineux.'); } chunks.push(value); }
      const manifest = readSignedManifest(Buffer.concat(chunks).toString('utf8'), this.config.publicKey, this.config.repository);
      if ((manifest.schema === 2) !== Boolean(this.portableExecutable)) throw Error('Format de mise à jour incompatible avec cette édition.');
      this.manifest = isNewerVersion(manifest.version, this.config.version) ? manifest : undefined;
      this.diagnostics.write('update.check.verified', { targetVersion: manifest.version, available: !!this.manifest });
      this.set(this.manifest ? { phase: 'available', version: manifest.version, notes: manifest.notes, message: `La version ${manifest.version} est disponible.` } : { phase: 'idle', message: 'Vous utilisez la dernière version.' });
    } catch (error) {
      this.diagnostics.write('update.check.failed', diagnosticError(error));
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
    this.attemptId = randomUUID();
    this.diagnostics.write('update.download.started', { attemptId: this.attemptId, targetVersion: this.manifest.version });
    this.set({ phase: 'downloading', progress: 0, message: 'Téléchargement de la mise à jour…' });
    const manifest = this.manifest;
    try {
      // Check destination writability before spending time downloading.
      const probe = join(this.root, `.update-probe-${randomUUID()}`);
      await writeFile(probe, '', { flag: 'wx' }); await unlink(probe);
      const staging = join(tmpdir(), `dbcodex-update-${randomUUID()}`); await mkdir(staging);
      this.diagnostics.write('update.download.staging', { attemptId: this.attemptId, staging });
      const archive = join(staging, manifest.schema === 2 ? 'update.exe' : 'update.zip');
      const response = await fetch(manifest.url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
      if (!response.ok || !response.body) throw Error('Téléchargement impossible. Réessayez plus tard.');
      let bytes = 0; const hash = createHash('sha256');
      await pipeline(Readable.fromWeb(response.body as any), new Transform({ transform: (chunk: Buffer, _encoding, callback) => {
        bytes += chunk.length; if (bytes > manifest.size) { callback(Error('Taille de téléchargement invalide.')); return; }
        hash.update(chunk); this.set({ progress: Math.floor(bytes * 100 / manifest.size) }); callback(null, chunk);
      } }), createWriteStream(archive, { flags: 'wx' }));
      if (bytes !== manifest.size || hash.digest('hex') !== manifest.sha256) throw Error('La mise à jour est incomplète ou endommagée. Réessayez.');
      this.diagnostics.write('update.download.verified', { attemptId: this.attemptId, bytes, targetVersion: manifest.version });
      const script = join(staging, 'apply-update.ps1'); await copyFile(this.helper, script);
      this.job = join(staging, 'job.json');
      await writeFile(this.job, JSON.stringify({ root: this.root, archive, parentPid: process.pid, manifest, attemptId: this.attemptId, logPath: this.diagnostics.attemptPath(this.attemptId), ...(this.portableExecutable ? { executable: basename(this.portableExecutable), runtimeRoot: process.execPath } : {}) }));
      this.diagnostics.write('update.download.ready', { attemptId: this.attemptId, jobPath: this.job });
      this.set({ phase: 'ready', progress: 100, message: 'Mise à jour prête. Vous pouvez redémarrer quand votre travail est prêt.' });
    } catch (error) { this.diagnostics.write('update.download.failed', { attemptId: this.attemptId, ...diagnosticError(error) }); this.set({ phase: 'error', message: error instanceof Error && !('code' in error) ? error.message : 'Téléchargement impossible. Vérifiez la connexion et les droits d’écriture du dossier.' }); }
    finally { this.busy = false; }
    return this.status;
  }
  async prepareRestart() {
    if (this.status.phase !== 'ready' || !this.job) throw Error('Téléchargez la mise à jour avant de redémarrer.');
    // The helper checks all processes after this instance has stopped, including Electron children.
    try {
      const handle = await open(this.lock, 'wx');
      try { await handle.writeFile(this.job); } finally { await handle.close(); }
    } catch (error) { this.diagnostics.write('update.restart.failed', { attemptId: this.attemptId, ...diagnosticError(error) }); throw error; }
    this.diagnostics.write('update.restart.prepared', { attemptId: this.attemptId });
    this.set({ phase: 'closing', message: 'Conservation des brouillons et fermeture…' });
  }
  async cancelRestart() { this.diagnostics.write('update.restart.cancelled', { attemptId: this.attemptId }); await unlink(this.lock).catch(() => {}); this.set({ phase: 'ready', message: 'Redémarrage annulé. Résolvez le problème de conservation du brouillon puis réessayez.' }); }
  async launchHelper() {
    if (this.status.phase !== 'closing' || !this.job) return;
    this.diagnostics.write('update.helper.launching', { attemptId: this.attemptId, jobPath: this.job });
    try {
    // Start-Process uses Windows' independent launch rather than inheriting Electron's child lifetime.
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference="Stop"; $worker = Start-Process -FilePath powershell.exe -ArgumentList @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", (\'"\' + $env:DBCODEX_UPDATE_HELPER + \'"\'), "-JobPath", (\'"\' + $env:DBCODEX_UPDATE_JOB + \'"\')) -WindowStyle Hidden -PassThru; if ($worker.WaitForExit(500)) { throw "Le programme de mise à jour a quitté prématurément." }'], {
      windowsHide: true,
      env: { ...process.env, DBCODEX_UPDATE_HELPER: join(this.job, '..', 'apply-update.ps1'), DBCODEX_UPDATE_JOB: this.job },
    });
    this.diagnostics.write('update.helper.launched', { attemptId: this.attemptId });
    } catch (error) { this.diagnostics.write('update.helper.failed', { attemptId: this.attemptId, ...diagnosticError(error) }); throw error; }
  }
  async recoveryNotice() {
    try { await access(this.lock); this.diagnostics.write('update.interrupted'); return 'Une mise à jour a été interrompue. Consultez docs/UPDATES.md pour la récupération avant de reprendre votre travail.'; } catch { /* No pending update. */ }
    try {
      const result = JSON.parse(await readFile(join(this.root, '.dbcodex-update-result.json'), 'utf8')) as UpdateResult;
      if (typeof result.message !== 'string') return '';
      const preserved = this.diagnostics.preserveResult(result);
      this.lastFailure = typeof result.detail === 'string' ? { message: diagnosticText(result.message), detail: diagnosticText(result.detail),
        ...(typeof result.stage === 'string' ? { stage: result.stage.slice(0, 80) } : {}),
        ...(typeof result.attemptId === 'string' ? { attemptId: result.attemptId.slice(0, 80) } : {}) } : null;
      this.diagnostics.write('update.previous-result', { stage: result.stage, attemptId: result.attemptId, message: result.message, detail: result.detail });
      // Never discard the only remaining copy of the failure diagnostic.
      if (preserved) await unlink(join(this.root, '.dbcodex-update-result.json'));
      return result.message;
    } catch { return ''; }
  }
}
