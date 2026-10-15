import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DiagnosticLog } from '../src/diagnostic-log.js';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function folder() { const root = await mkdtemp(join(tmpdir(), 'dbcodex-log-test-')); roots.push(root); return root; }
it('records bounded structured diagnostics, omitting document fields and credentials', async () => {
  const root = await folder(), log = new DiagnosticLog(root, '0.1.6');
  log.write('test.failed', { message: 'Authorization=Bearer sensitive token=other', sourceText: 'Table secret {}', model: 'private model', code: 'EPERM' });
  const text = await readFile(join(root, 'application.jsonl'), 'utf8');
  expect(text).not.toMatch(/sensitive|other|Table secret|private model/);
  expect(JSON.parse(text)).toMatchObject({ event: 'test.failed', version: '0.1.6', code: 'EPERM' });
  expect(log.attemptPath('../../outside')).toBeUndefined();
});
it('rotates application logs and keeps only twenty recognized attempt logs', async () => {
  const root = await folder(); new DiagnosticLog(root, '1');
  await writeFile(join(root, 'application.jsonl'), 'x'.repeat(1024 * 1024));
  for (let i = 0; i < 22; i++) await writeFile(join(root, `update-${randomUUID()}.jsonl`), '');
  await writeFile(join(root, 'personal.txt'), 'keep');
  const log = new DiagnosticLog(root, '1'); log.write('app.started');
  expect((await readdir(root)).filter(name => name.startsWith('update-'))).toHaveLength(20);
  expect(await readFile(join(root, 'application.1.jsonl'), 'utf8')).toHaveLength(1024 * 1024);
  expect(await readFile(join(root, 'personal.txt'), 'utf8')).toBe('keep');
});
it('falls back to another directory and tolerates unavailable storage', async () => {
  const root = await folder(), blocked = join(root, 'file'); await writeFile(blocked, 'not a directory');
  const log = new DiagnosticLog(blocked, '1', join(root, 'fallback')); expect(log.directory).toBe(join(root, 'fallback'));
  const unavailable = new DiagnosticLog(blocked, '1'); expect(unavailable.directory).toBeNull();
  expect(() => unavailable.write('test')).not.toThrow(); expect(unavailable.preserveResult({ message: 'failure' })).toBe(false);
});
it('keeps the last update result across logger instances without copying unrelated fields', async () => {
  const root = await folder(), log = new DiagnosticLog(root, '1');
  expect(log.preserveResult({ message: 'Annulée', detail: 'Archive integrity check failed.', stage: 'verification' })).toBe(true);
  expect(new DiagnosticLog(root, '2').lastResult()).toMatchObject({ detail: 'Archive integrity check failed.', stage: 'verification' });
});
