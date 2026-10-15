import { readFile } from 'node:fs/promises';
import { createHash, verify } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const asar = createRequire(require.resolve('@electron/packager'))('@electron/asar');
const config = JSON.parse(await readFile('release-config.json', 'utf8'));
const out = resolve(process.env.DBCODEX_RELEASE_OUT || 'build/update-release');
const envelope = JSON.parse(await readFile(join(out, 'update-manifest.json'), 'utf8'));
const payload = Buffer.from(envelope.payload, 'base64');
if (!verify(null, payload, config.publicKey, Buffer.from(envelope.signature, 'base64'))) throw Error('Signature invalide.');
const manifest = JSON.parse(payload.toString('utf8'));
const zip = await readFile(join(out, `DBCodex-${config.version}-win-x64.zip`));
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
if (zip.length !== manifest.size || hash(zip) !== manifest.sha256 || manifest.version !== config.version) throw Error('Archive ou version invalide.');
for (const file of manifest.files) if (hash(await readFile(join(out, 'DBCodex-win32-x64', file.path))) !== file.sha256) throw Error(`Fichier non conforme : ${file.path}`);
const path = join(out, 'DBCodex-win32-x64/resources/app.asar');
const allowed = new Set(['/dist', '/dist/apply-update.ps1', '/dist/index.html', '/dist/main.js', '/dist/preload.cjs', '/dist/renderer.css', '/dist/renderer.js', '/package.json']);
for (const file of asar.listPackage(path)) if (!allowed.has(file.replaceAll('\\', '/'))) throw Error(`Fichier inattendu dans le bundle : ${file}`);
const main = asar.extractFile(path, 'dist/main.js').toString('utf8');
if (main.includes('Unexpected test network request')) throw Error('Adaptateur de test dans le bundle public.');
// The exact local private key must never be present, even in a dependency bundle.
try { const key = await readFile('.update-signing/private.pem', 'utf8'); if (main.includes(key)) throw Error('Clé privée dans le bundle.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log(JSON.stringify({ version: manifest.version, files: manifest.files.length, bytes: manifest.size, signature: 'valide', audit: 'valide' }, null, 2));
