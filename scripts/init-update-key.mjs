import { generateKeyPairSync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
// The private key is deliberately outside the application and all public artifacts.
const config = JSON.parse(await readFile('release-config.json', 'utf8'));
if (config.publicKey) throw Error('Une clé publique existe déjà. Ne pas remplacer la clé des applications distribuées.');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
await mkdir('.update-signing', { recursive: true });
await writeFile('.update-signing/private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
config.publicKey = publicKey.export({ type: 'spki', format: 'pem' });
await writeFile('release-config.json', JSON.stringify(config, null, 2) + '\n');
console.log('Clé de signature créée dans .update-signing/private.pem (ignorée par Git). Sauvegarder cette clé dans un emplacement sûr.');
