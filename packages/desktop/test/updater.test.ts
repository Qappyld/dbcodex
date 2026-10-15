import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PortableUpdater } from '../src/updater.js';
const folders: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }); });
async function setup(body = Buffer.from('download'), archive = body, portable = false) {
  const root = await mkdtemp(join(tmpdir(), 'dbcodex-updater-test-')); folders.push(root);
  await mkdir(join(root, 'data')); await writeFile(join(root, 'data/preferences.json'), 'preferences'); await writeFile(join(root, 'project.dbcd'), 'project');
  const helper = join(root, 'helper.ps1'); await writeFile(helper, '# test');
  const keys = generateKeyPairSync('ed25519'), repository = 'Qappyld/dbcodex-releases';
  const payload = Buffer.from(JSON.stringify({ schema: portable ? 2 : 1, version: '0.1.2', platform: 'win32', arch: 'x64', url: `https://github.com/${repository}/releases/download/v0.1.2/DBCodex-0.1.2-win-x64.${portable ? 'exe' : 'zip'}`, size: body.length, sha256: createHash('sha256').update(body).digest('hex'), notes: 'Nouvelle version', ...(!portable ? { files: [{ path: 'DBCodex.exe', sha256: 'a'.repeat(64) }, { path: 'resources/app.asar', sha256: 'b'.repeat(64) }] } : {}) }));
  const envelope = JSON.stringify({ payload: payload.toString('base64'), signature: sign(null, payload, keys.privateKey).toString('base64') });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(envelope)).mockResolvedValueOnce(new Response(archive)));
  const updater = new PortableUpdater({ version: '0.1.1', repository, publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, root, helper, true, portable ? join(root, 'Mon DBCodex.exe') : undefined);
  return { updater, root };
}
describe('téléchargement portable', () => {
  it('télécharge un EXE et conserve le nom choisi par l’utilisateur', async () => {
    const { updater, root } = await setup(Buffer.from('download'), Buffer.from('download'), true);
    expect((await updater.check()).phase).toBe('available');
    expect(vi.mocked(fetch).mock.calls[0]![0]).toContain('portable-update-manifest.json');
    expect((await updater.download()).phase).toBe('ready');
    const jobPath = (updater as any).job as string; folders.push(join(jobPath, '..'));
    const job = JSON.parse(await readFile(jobPath, 'utf8'));
    expect(job.executable).toBe('Mon DBCodex.exe'); expect(job.root).toBe(root);
    expect(job.archive).toMatch(/update\.exe$/); expect(job.manifest.schema).toBe(2);
    await updater.prepareRestart();
    expect(await readFile(join(root, '.dbcodex-update.lock'), 'utf8')).toBe(jobPath);
    await updater.cancelRestart();
    expect(await readFile(join(root, 'data/preferences.json'), 'utf8')).toBe('preferences');
  });
  it('prépare une mise à jour valide sans modifier les données', async () => {
    const { updater, root } = await setup(); expect((await updater.check()).phase).toBe('available'); expect((await updater.download()).phase).toBe('ready');
    expect(await readFile(join(root, 'project.dbcd'), 'utf8')).toBe('project'); expect(await readFile(join(root, 'data/preferences.json'), 'utf8')).toBe('preferences');
    const job = (updater as any).job as string; folders.push(join(job, '..')); expect(JSON.parse(await readFile(job, 'utf8')).root).toBe(root);
  });
  it.each([Buffer.from('short'), Buffer.from('changed!'), Buffer.from('too long download')])('refuse les téléchargements incomplets, altérés ou trop longs', async archive => {
    const { updater } = await setup(Buffer.from('download'), archive); await updater.check(); expect((await updater.download()).phase).toBe('error');
  });
  it('une absence de release ne bloque pas le portable', async () => { const { updater } = await setup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 }))); expect((await updater.check()).message).toContain('Aucune mise à jour'); });
  it('une erreur réseau reste récupérable', async () => { const { updater } = await setup(); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('Réseau indisponible'))); expect((await updater.check()).phase).toBe('error'); });
  it('un manifeste malformé affiche un message compréhensible', async () => { const { updater } = await setup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}'))); expect((await updater.check()).message).toBe('Les informations de mise à jour reçues sont invalides. Réessayez plus tard.'); });
});
