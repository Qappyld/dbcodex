import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const psQuote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const windows = process.platform === 'win32';
// Disposable test directories are kept under ignored build/ as evidence; never touch a real portable.
async function prepare(extraEntry = false) {
  const base = resolve('build/update-helper-tests'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'case-')); const stage = join(root, 'package');
  await mkdir(join(stage, 'resources'), { recursive: true }); await mkdir(join(root, 'resources')); await mkdir(join(root, 'data'));
  const exe = await readFile(join(process.env.SystemRoot || 'C:/Windows', 'System32/whoami.exe'));
  await writeFile(join(root, 'DBCodex.exe'), Buffer.concat([exe, Buffer.from('old')])); await writeFile(join(root, 'resources/app.asar'), 'old app');
  await writeFile(join(root, 'data/preferences.json'), 'preferences'); await writeFile(join(root, 'project.dbcd'), 'project');
  await writeFile(join(stage, 'DBCodex.exe'), Buffer.concat([exe, Buffer.from('new')])); await writeFile(join(stage, 'resources/app.asar'), 'new app');
  const archive = join(root, 'update.zip');
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${psQuote(stage)},${psQuote(archive)})`], { windowsHide: true });
  if (extraEntry) execFileSync('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::Open(${psQuote(archive)},'Update'); $s=$z.CreateEntry('../project.dbcd').Open(); $s.WriteByte(65); $s.Dispose(); $z.Dispose()`], { windowsHide: true });
  const manifest = { version: '0.1.2', sha256: hash(await readFile(archive)), files: [{ path: 'DBCodex.exe', sha256: hash(await readFile(join(stage, 'DBCodex.exe'))) }, { path: 'resources/app.asar', sha256: hash(await readFile(join(stage, 'resources/app.asar'))) }] };
  const job = join(root, 'job.json'); await writeFile(job, JSON.stringify({ root, archive, parentPid: 2147483647, manifest })); await writeFile(join(root, '.dbcodex-update.lock'), job);
  return { root, job, exe };
}
function apply(job: string, command?: string) {
  const helper = resolve('packages/desktop/src/apply-update.ps1');
  return spawnSync('powershell.exe', command ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command.replaceAll('{helper}', psQuote(helper)).replaceAll('{job}', psQuote(job))] : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-JobPath', job], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
}
describe.skipIf(!windows)('remplacement Windows réel', () => {
  it('remplace les fichiers applicatifs, préserve les projets et sauvegarde la version précédente', async () => {
    const { root, job } = await prepare(); const result = apply(job);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(await readFile(join(root, 'resources/app.asar'), 'utf8')).toBe('new app');
    expect(await readFile(join(root, 'data/preferences.json'), 'utf8')).toBe('preferences'); expect(await readFile(join(root, 'project.dbcd'), 'utf8')).toBe('project');
    const backup = (await readdir(root)).find(name => name.startsWith('.dbcodex-update-previous-'))!;
    expect(await readFile(join(root, backup, 'resources/app.asar'), 'utf8')).toBe('old app');
  }, 30000);
  it('refuse une archive tentant de sortir du dossier', async () => {
    const { root, job } = await prepare(true); expect(apply(job).status).toBe(1);
    expect(await readFile(join(root, 'resources/app.asar'), 'utf8')).toBe('old app'); expect(await readFile(join(root, 'project.dbcd'), 'utf8')).toBe('project');
  }, 30000);
  it('restaure après un échec de copie au milieu du remplacement', async () => {
    const { root, job, exe } = await prepare();
    const target = psQuote(join(root, 'resources/app.asar'));
    // Allow backups to read the file but deny replacement until the helper finishes.
    const result = apply(job, `$stream=[IO.File]::Open(${target},'Open','Read','Read'); try { & {helper} -JobPath {job} } finally { $stream.Dispose() }; exit $LASTEXITCODE`);
    expect(result.status).toBe(1);
    expect(await readFile(join(root, 'DBCodex.exe'))).toEqual(Buffer.concat([exe, Buffer.from('old')]));
    expect(await readFile(join(root, 'resources/app.asar'), 'utf8')).toBe('old app');
  }, 30000);
  it('récupère une interruption à partir du journal', async () => {
    const { root, job } = await prepare(); const backup = join(root, '.dbcodex-update-backup'); await mkdir(join(backup, 'resources'), { recursive: true });
    await writeFile(join(backup, 'resources/app.asar'), 'old app'); await writeFile(join(root, 'resources/app.asar'), 'interrupted');
    await writeFile(join(backup, 'journal.json'), JSON.stringify({ root, job, changes: [{ path: 'resources/app.asar', existed: true }] }));
    expect(apply(job, '& {helper} -JobPath {job} -Recover').status).toBe(0);
    expect(await readFile(join(root, 'resources/app.asar'), 'utf8')).toBe('old app');
  }, 30000);
});
