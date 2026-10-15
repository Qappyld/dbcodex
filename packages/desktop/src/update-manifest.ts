import { verify } from 'node:crypto';
import { z } from 'zod';

const version = z.string().regex(/^\d+\.\d+\.\d+$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
// Only distribution files may be replaced; data and customer projects are never targets.
export function isApplicationFile(path: string): boolean {
  return /^(DBCodex\.exe|chrome_(100|200)_percent\.pak|d3dcompiler_47\.dll|dxcompiler\.dll|dxil\.dll|ffmpeg\.dll|icudtl\.dat|LICENSE|LICENSES\.chromium\.html|LIRE-MOI\.md|UPDATES\.md|resources\.pak|snapshot_blob\.bin|v8_context_snapshot\.bin|version|vk_swiftshader_icd\.json|vk_swiftshader\.dll|vulkan-1\.dll|resources\/app\.asar|locales\/[a-zA-Z0-9_-]+\.pak)$/.test(path);
}
const common = {
  version, platform: z.literal('win32'), arch: z.literal('x64'),
  url: z.string().url(), size: z.number().int().positive().max(1024 * 1024 * 1024), sha256: digest,
  notes: z.string().max(20000),
};
const legacyManifestSchema = z.object({
  ...common, schema: z.literal(1),
  files: z.array(z.object({ path: z.string().refine(isApplicationFile), sha256: digest }).strict()).min(1).max(500),
}).strict().superRefine((value, ctx) => {
  const paths = value.files.map(file => file.path.toLowerCase());
  if (new Set(paths).size !== paths.length || !paths.includes('dbcodex.exe') || !paths.includes('resources/app.asar')) {
    ctx.addIssue({ code: 'custom', message: 'Inventaire incomplet ou dupliqué.' });
  }
});
const portableManifestSchema = z.object({ ...common, schema: z.literal(2) }).strict();
export const manifestSchema = z.union([legacyManifestSchema, portableManifestSchema]);
export type UpdateManifest = z.infer<typeof manifestSchema>;
export function readSignedManifest(text: string, publicKey: string, repository: string): UpdateManifest {
  const envelope = z.object({ payload: z.string().max(200000), signature: z.string().max(200) }).strict().parse(JSON.parse(text));
  const payload = Buffer.from(envelope.payload, 'base64');
  if (!verify(null, payload, publicKey, Buffer.from(envelope.signature, 'base64'))) throw Error('Signature de mise à jour invalide.');
  const manifest = manifestSchema.parse(JSON.parse(payload.toString('utf8')));
  const expected = `https://github.com/${repository}/releases/download/v${manifest.version}/DBCodex-${manifest.version}-win-x64.${manifest.schema === 2 ? 'exe' : 'zip'}`;
  if (manifest.url !== expected) throw Error('Origine de mise à jour non autorisée.');
  return manifest;
}
export function isNewerVersion(candidate: string, current: string): boolean {
  const left = version.parse(candidate).split('.').map(Number), right = version.parse(current).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (left[i] !== right[i]) return left[i]! > right[i]!; }
  return false;
}
