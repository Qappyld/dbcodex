import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { ChatStore } from '../src/chat-store.js';

const roots: string[] = [];
const stores: ChatStore[] = [];
function path() { const root = mkdtempSync(join(tmpdir(), 'chat-store-')); roots.push(root); return join(root, 'shop.dbcd.chat.sqlite'); }
afterEach(() => { stores.splice(0).forEach(s => s.close()); roots.splice(0).forEach(r => rmSync(r, { recursive: true, force: true })); });
it('persists threads and messages with provider fixed per thread', () => {
  const p = path(); const s = new ChatStore(p, 'project');
  const t = s.createThread('Design', 'codex');
  const message = s.addMessage({ threadId: t.id, role: 'user', content: 'Hello', state: 'complete', mode: 'discuss', contextTableIds: ['public.users'] });
  s.close(); const reopened = new ChatStore(p, 'project'); stores.push(reopened);
  expect(reopened.workspace()).toEqual({ threads: [expect.objectContaining(t)], messages: [message], proposals: [] });
});
it('refuses another project, future versions, corrupt and unrelated databases without deleting them', () => {
  const p = path(); const s = new ChatStore(p, 'project'); s.close();
  expect(() => new ChatStore(p, 'other')).toThrow(/chat/i);
  const db = new DatabaseSync(p); db.exec('PRAGMA user_version=900'); db.close();
  const before = readFileSync(p); expect(() => new ChatStore(p, 'project')).toThrow(/chat/i); expect(readFileSync(p)).toEqual(before);
  const corrupt = path(); writeFileSync(corrupt, 'private path and bad data');
  expect(() => new ChatStore(corrupt, 'project')).toThrow('Unable to open the chat companion.');
  expect(readFileSync(corrupt, 'utf8')).toBe('private path and bad data');
  const unrelated = path(); const other = new DatabaseSync(unrelated); other.exec('CREATE TABLE business(id TEXT)'); other.close();
  const bytes = readFileSync(unrelated); expect(() => new ChatStore(unrelated, 'project')).toThrow(); expect(readFileSync(unrelated)).toEqual(bytes);
});
it('rejects oversized, invalid and cross-thread records before writing', () => {
  const s = new ChatStore(path(), 'project'); stores.push(s);
  expect(() => s.createThread('x'.repeat(501), 'codex')).toThrow();
  expect(() => s.createThread('Design', 'other' as never)).toThrow();
  expect(() => s.addMessage({ threadId: 'missing', role: 'user', content: 'hi', state: 'complete', mode: 'discuss', contextTableIds: [] })).toThrow();
  expect(s.workspace().messages).toEqual([]);
});
it('rejects a companion symlink without changing its target', () => {
  const target = path(); writeFileSync(target, 'private'); const link = path();
  try { symlinkSync(target, link); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') return; throw error; }
  expect(() => new ChatStore(link, 'project')).toThrow(); expect(readFileSync(target, 'utf8')).toBe('private');
});
