import { describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
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

async function prepareSingle() {
  const value = await prepare();
  const executable = 'Mon DBCodex portable.exe';
  const previous = await readFile(join(value.root, 'DBCodex.exe'));
  const next = Buffer.concat([value.exe, Buffer.from('single new')]);
  await writeFile(join(value.root, executable), previous);
  const archive = join(value.root, 'update.exe'); await writeFile(archive, next);
  const attemptId = randomUUID(); await mkdir(join(value.root, 'data/logs'));
  await writeFile(value.job, JSON.stringify({ root: value.root, archive, executable, parentPid: 2147483647,
    attemptId, logPath: join(value.root, 'data/logs', `update-${attemptId}.jsonl`),
    manifest: { schema: 2, version: '0.1.2', size: next.length, sha256: hash(next) } }));
  return { ...value, executable, previous, next, archive };
}
describe.skipIf(!windows)('remplacement Windows réel', () => {
  it('accepte uniquement les tags Cloud Files connus et inspecte les chemins sans redirection', async () => {
    const { root } = await prepareSingle();
    const helper = resolve('packages/desktop/src/apply-update.ps1');
    const command = `$source = Get-Content -LiteralPath ${psQuote(helper)} -Raw; $match = [Regex]::Match($source, "(?s)Add-Type -TypeDefinition @'\\r?\\n(.*?)\\r?\\n'@"); Add-Type -TypeDefinition $match.Groups[1].Value; for ($index = 0; $index -lt 16; $index++) { $tag = [uint32](2415919130 + 4096 * $index); if (-not [DbcodexUpdatePaths]::IsCloudTag($tag)) { throw 'Cloud tag rejected' } }; foreach ($tag in @([uint32]2684354563, [uint32]2684354572, [uint32]2147483681, [uint32]0)) { if ([DbcodexUpdatePaths]::IsCloudTag($tag)) { throw 'Unsafe tag accepted' } }; if ([DbcodexUpdatePaths]::ReadTag(${psQuote(root)}) -ne 0) { throw 'Unexpected local tag' }`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  }, 30000);
  it('refuse toujours une vraie jonction Windows sans modifier sa cible', async () => {
    const { root, job, executable, previous } = await prepareSingle();
    const junction = join(root, 'linked');
    const created = spawnSync('powershell.exe', ['-NoProfile', '-Command', `New-Item -ItemType Junction -Path ${psQuote(junction)} -Target ${psQuote(root)} | Out-Null`], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
    expect(created.status, created.stderr).toBe(0);
    const data = JSON.parse(await readFile(job, 'utf8')); data.root = junction;
    await writeFile(job, JSON.stringify(data));
    expect(apply(job).status).toBe(1);
    expect(await readFile(join(root, executable))).toEqual(previous);
    const failure = JSON.parse(await readFile(join(root, '.dbcodex-update-result.json'), 'utf8'));
    expect(failure.stage).toBe('verification-dossiers'); expect(failure.detail).toMatch(/junctions|reparse|different location/i);
  }, 30000);
  it('remplace uniquement le portable renommé et sauvegarde son ancienne version', async () => {
    const { root, job, executable, next, previous } = await prepareSingle();
    const result = apply(job); expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(await readFile(join(root, executable))).toEqual(next);
    const backup = (await readdir(root)).find(name => name.startsWith('.dbcodex-update-previous-'))!;
    expect(await readFile(join(root, backup, executable))).toEqual(previous);
    expect(await readFile(join(root, 'data/preferences.json'), 'utf8')).toBe('preferences');
    expect(await readFile(join(root, 'project.dbcd'), 'utf8')).toBe('project');
    expect(await readFile(join(root, 'resources/app.asar'), 'utf8')).toBe('old app');
  }, 30000);
  it('refuse un EXE altéré avant tout remplacement', async () => {
    const { root, job, executable, previous, archive } = await prepareSingle();
    await writeFile(archive, 'corrupted'); expect(apply(job).status).toBe(1);
    expect(await readFile(join(root, executable))).toEqual(previous);
    const result = JSON.parse(await readFile(join(root, '.dbcodex-update-result.json'), 'utf8'));
    expect(result).toMatchObject({ detail: 'Archive integrity check failed.', stage: 'verification-telechargement' });
    const jobData = JSON.parse(await readFile(job, 'utf8'));
    const persistent = (await readFile(jobData.logPath, 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
    expect(persistent).toContainEqual(expect.objectContaining({ event: 'update.failed', attemptId: jobData.attemptId, detail: result.detail, stage: result.stage }));
    expect(await readFile(join(root, 'update-helper.jsonl'), 'utf8')).toContain('Archive integrity check failed.');
  }, 30000);
  it('conserve un diagnostic temporaire même si le job ne peut pas être lu', async () => {
    const { root, job } = await prepareSingle(); await writeFile(job, '{invalid');
    expect(apply(job).status).toBe(1);
    const records = (await readFile(join(root, 'update-helper.jsonl'), 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
    expect(records).toContainEqual(expect.objectContaining({ event: 'update.bootstrap.failed', stage: 'initialisation' }));
  }, 30000);
  it('préserve l’EXE occupé et restaure après échec', async () => {
    const { root, job, executable, previous } = await prepareSingle();
    const target = psQuote(join(root, executable));
    const result = apply(job, `$stream=[IO.File]::Open(${target},'Open','Read','Read'); try { & {helper} -JobPath {job} } finally { $stream.Dispose() }; exit $LASTEXITCODE`);
    expect(result.status).toBe(1); expect(await readFile(join(root, executable))).toEqual(previous);
  }, 30000);
  it('récupère le portable seul depuis son journal après interruption', async () => {
    const { root, job, executable, previous, next } = await prepareSingle();
    const backup = join(root, '.dbcodex-update-backup'); await mkdir(backup);
    await writeFile(join(backup, executable), previous); await writeFile(join(root, executable), next);
    await writeFile(join(backup, 'journal.json'), JSON.stringify({ root, job, changes: [{ path: executable, existed: true }] }));
    expect(apply(job, '& {helper} -JobPath {job} -Recover').status).toBe(0);
    expect(await readFile(join(root, executable))).toEqual(previous);
  }, 30000);
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
