import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { resolve, join } from 'node:path';
const config = JSON.parse(await readFile('release-config.json', 'utf8'));
const out = resolve(process.env.DBCODEX_RELEASE_OUT || 'release');
const folder = join(out, 'DBCodex-win32-x64');
const files = [];
const allowed = /^(DBCodex\.exe|chrome_(100|200)_percent\.pak|d3dcompiler_47\.dll|dxcompiler\.dll|dxil\.dll|ffmpeg\.dll|icudtl\.dat|LICENSE|LICENSES\.chromium\.html|LIRE-MOI\.md|UPDATES\.md|resources\.pak|snapshot_blob\.bin|v8_context_snapshot\.bin|version|vk_swiftshader_icd\.json|vk_swiftshader\.dll|vulkan-1\.dll|resources\/app\.asar|locales\/[a-zA-Z0-9_-]+\.pak)$/;
const hash = data => createHash('sha256').update(data).digest('hex');
async function inventory(prefix = '') {
  for (const entry of await readdir(join(folder, prefix), { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (path === 'data') continue;
    if (entry.isDirectory()) { if (!['locales', 'resources'].includes(path)) throw Error(`Dossier inattendu : ${path}`); await inventory(path + '/'); }
    else { if (!entry.isFile() || !allowed.test(path)) throw Error(`Fichier inattendu : ${path}`); files.push({ path, sha256: hash(await readFile(join(folder, path))) }); }
  }
}
await inventory();
const privateKey = createPrivateKey(process.env.UPDATE_SIGNING_PRIVATE_KEY || await readFile('.update-signing/private.pem', 'utf8'));
if (createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }) !== config.publicKey) throw Error('La clé de signature ne correspond pas à la clé publique embarquée.');
const name = `DBCodex-${config.version}-win-x64.zip`, archive = await readFile(join(out, name));
const notes = process.env.UPDATE_RELEASE_NOTES || 'Améliorations et corrections de DBCodex.';
const payload = Buffer.from(JSON.stringify({ schema: 1, version: config.version, platform: 'win32', arch: 'x64', url: `https://github.com/${config.repository}/releases/download/v${config.version}/${name}`, size: archive.length, sha256: hash(archive), notes, files }));
await writeFile(join(out, 'update-manifest.json'), JSON.stringify({ payload: payload.toString('base64'), signature: sign(null, payload, privateKey).toString('base64') }));
console.log(`Manifeste signé : ${join(out, 'update-manifest.json')}`);
