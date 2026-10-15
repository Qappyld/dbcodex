import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { isApplicationFile, isNewerVersion, readSignedManifest } from '../src/update-manifest.js';
const key = generateKeyPairSync('ed25519');
const publicKey = key.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const repo = 'Qappyld/dbcodex-releases';
const manifest = { schema: 1, version: '0.1.2', platform: 'win32', arch: 'x64', url: `https://github.com/${repo}/releases/download/v0.1.2/DBCodex-0.1.2-win-x64.zip`, size: 100, sha256: 'a'.repeat(64), notes: 'Corrections', files: [{ path: 'DBCodex.exe', sha256: 'b'.repeat(64) }, { path: 'resources/app.asar', sha256: 'c'.repeat(64) }] };
function envelope(value: unknown) { const payload = Buffer.from(JSON.stringify(value)); return JSON.stringify({ payload: payload.toString('base64'), signature: sign(null, payload, key.privateKey).toString('base64') }); }
describe('mises à jour signées', () => {
  it('accepte le canal EXE signé et refuse ses inventaires ou liens ZIP', () => {
    const { files, ...base } = manifest;
    const portable = { ...base, schema: 2, url: base.url.replace('.zip', '.exe') };
    expect(readSignedManifest(envelope(portable), publicKey, repo)).toEqual(portable);
    expect(() => readSignedManifest(envelope({ ...portable, files }), publicKey, repo)).toThrow();
    expect(() => readSignedManifest(envelope({ ...portable, url: base.url }), publicKey, repo)).toThrow('Origine');
  });
  it('accepte une publication signée de la bonne origine', () => { expect(readSignedManifest(envelope(manifest), publicKey, repo)).toEqual(manifest); });
  it('refuse un contenu modifié après signature et une autre clé', () => {
    const tampered = JSON.parse(envelope(manifest)); tampered.payload = Buffer.from(JSON.stringify({ ...manifest, version: '9.0.0' })).toString('base64');
    expect(() => readSignedManifest(JSON.stringify(tampered), publicKey, repo)).toThrow('Signature');
    expect(() => readSignedManifest(envelope(manifest), generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString(), repo)).toThrow('Signature');
  });
  it('refuse une autre origine même signée', () => { expect(() => readSignedManifest(envelope({ ...manifest, url: 'https://example.org/update.zip' }), publicKey, repo)).toThrow('Origine'); });
  it.each(['../DBCodex.exe', 'data/preferences.json', 'schema.dbcd', 'resources/project.dbcd', 'locales/../project.dbcd', 'C:/DBCodex.exe', 'resources\\app.asar'])('protège les fichiers personnels : %s', path => {
    expect(isApplicationFile(path)).toBe(false);
    expect(() => readSignedManifest(envelope({ ...manifest, files: [...manifest.files, { path, sha256: 'a'.repeat(64) }] }), publicKey, repo)).toThrow();
  });
  it('refuse les doublons et les publications incomplètes', () => {
    expect(() => readSignedManifest(envelope({ ...manifest, files: [manifest.files[0]] }), publicKey, repo)).toThrow();
    expect(() => readSignedManifest(envelope({ ...manifest, files: [...manifest.files, { ...manifest.files[0], path: 'DBCodex.exe' }] }), publicKey, repo)).toThrow();
  });
  it('compare numériquement et interdit les retours à une ancienne version', () => {
    expect(isNewerVersion('0.1.10', '0.1.9')).toBe(true); expect(isNewerVersion('0.1.1', '0.1.1')).toBe(false); expect(isNewerVersion('0.1.0', '0.1.1')).toBe(false);
  });
});
