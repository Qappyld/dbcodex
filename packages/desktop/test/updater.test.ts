import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PortableUpdater } from '../src/updater.js';
const folders: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }); });
async function setup(body = Buffer.from('download'), archive = body) {
  const root = await mkdtemp(join(tmpdir(), 'dbcodex-updater-test-')); folders.push(root);
  await mkdir(join(root, 'data')); await writeFile(join(root, 'data/preferences.json'), 'preferences'); await writeFile(join(root, 'project.dbcd'), 'project');
  const helper = join(root, 'helper.ps1'); await writeFile(helper, '# test');
  const keys = generateKeyPairSync('ed25519'), repository = 'Qappyld/dbcodex-releases';
  const payload = Buffer.from(JSON.stringify({ schema: 1, version: '0.1.2', platform: 'win32', arch: 'x64', url: `https://github.com/${repository}/releases/download/v0.1.2/DBCodex-0.1.2-win-x64.zip`, size: body.length, sha256: createHash('sha256').update(body).digest('hex'), notes: 'Nouvelle version', files: [{ path: 'DBCodex.exe', sha256: 'a'.repeat(64) }, { path: 'resources/app.asar', sha256: 'b'.repeat(64) }] }));
  const envelope = JSON.stringify({ payload: payload.toString('base64'), signature: sign(null, payload, keys.privateKey).toString('base64') });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(envelope)).mockResolvedValueOnce(new Response(archive)));
  const updater = new PortableUpdater({ version: '0.1.1', repository, publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, root, helper, true);
  return { updater, root };
}
describe('téléchargement portable', () => {
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
