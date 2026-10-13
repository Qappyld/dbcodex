import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, lstatSync, openSync } from 'node:fs';
import { dirname, parse, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { ChatMessage, ChatProposal, ChatThread, ChatWorkspace, ProviderId } from './shared/contracts.js';

const failure = () => new Error('Unable to open the chat companion.');
const id = z.string().min(1).max(200);
const source = z.string().max(4 * 1024 * 1024);
const proposalSchema = z.object({
  id, threadId: id, title: z.string().min(1).max(500), explanation: z.string().max(64 * 1024),
  edits: z.array(z.object({ search: source.min(1), replacement: source })).min(1).max(100),
  beforeSource: source, afterSource: source, baseGeneration: z.number().int().positive(),
  baseRevisionId: id, baseSourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['pending', 'applied', 'rejected', 'stale']), createdAt: z.iso.datetime(), appliedRevisionId: id.optional(),
}).strict();
const threadSchema = z.object({ id, title: z.string().trim().min(1).max(500), provider: z.enum(['codex', 'claude']), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() }).strict();
const messageSchema = z.object({ id, threadId: id, role: z.enum(['user', 'assistant']), content: z.string().max(1024 * 1024), createdAt: z.iso.datetime(), state: z.enum(['complete', 'interrupted', 'failed']), mode: z.enum(['discuss', 'propose']), contextTableIds: z.array(id).max(1000) }).strict();
const schemas = { threads: threadSchema, messages: messageSchema, proposals: proposalSchema };
const tableSql = {
  meta: 'CREATE TABLE meta (project_id TEXT NOT NULL) STRICT',
  threads: 'CREATE TABLE threads (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT',
  messages: 'CREATE TABLE messages (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT',
  proposals: 'CREATE TABLE proposals (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT',
};
const APPLICATION_ID = 0x44424348;
function safePath(path: string) {
  let part = path;
  while (part !== parse(part).root) {
    if (existsSync(part)) { const stat = lstatSync(part); if (stat.isSymbolicLink() || (part === path && (!stat.isFile() || stat.nlink > 1 || stat.size > 128 * 1024 * 1024))) throw failure(); }
    const parent = dirname(part); if (parent === part) break; part = parent;
  }
}
function validate(db: DatabaseSync, projectId: string) {
  if (db.prepare('PRAGMA user_version').get()?.user_version !== 1 || db.prepare('PRAGMA application_id').get()?.application_id !== APPLICATION_ID) throw failure();
  const rows = db.prepare("SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
  if (rows.length !== 4 || rows.some(row => !(row.name as string in tableSql) || row.sql !== tableSql[row.name as keyof typeof tableSql])) throw failure();
  const meta = db.prepare('SELECT project_id FROM meta').all();
  if (meta.length !== 1 || meta[0]?.project_id !== projectId || db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw failure();
}

/** Local companion storage. The companion is never replaced or removed on failure. */
export class ChatStore {
  private db: DatabaseSync;
  private closed = false;
  readonly companionPath: string;
  readonly projectId: string;
  constructor(companionPath: string, projectId: string) {
    this.companionPath = resolve(companionPath); this.projectId = projectId;
    let db: DatabaseSync | undefined;
    try {
      id.parse(projectId); if (!this.companionPath.endsWith('.dbcd.chat.sqlite')) throw failure(); safePath(this.companionPath);
      if (!existsSync(this.companionPath)) {
        closeSync(openSync(this.companionPath, 'wx', 0o600));
        db = new DatabaseSync(this.companionPath, { allowExtension: false });
        db.exec('BEGIN IMMEDIATE');
        for (const sql of Object.values(tableSql)) db.exec(sql);
        db.prepare('INSERT INTO meta VALUES (?)').run(projectId);
        db.exec(`PRAGMA user_version=1; PRAGMA application_id=${APPLICATION_ID}; COMMIT`);
      } else {
        const read = new DatabaseSync(this.companionPath, { readOnly: true, allowExtension: false });
        try { validate(read, projectId); } finally { read.close(); }
        safePath(this.companionPath);
        db = new DatabaseSync(this.companionPath, { allowExtension: false });
      }
      validate(db, projectId);
      db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=2000');
      this.db = db;
      this.workspace();
    } catch { db?.close(); throw failure(); }
  }
  private guard() { if (this.closed) throw new Error('The chat companion is closed.'); safePath(this.companionPath); }
  workspace(): ChatWorkspace {
    try {
      this.guard();
      const result = {} as ChatWorkspace;
      for (const name of ['threads', 'messages', 'proposals'] as const) {
        const summary = this.db.prepare(`SELECT count(*) AS count, max(length(CAST(payload AS BLOB))) AS size FROM ${name}`).get()!;
        if (Number(summary.count) > (name === 'messages' ? 10000 : 1000) || Number(summary.size) > 20 * 1024 * 1024) throw failure();
        const records = this.db.prepare(`SELECT id, payload FROM ${name} ORDER BY rowid`).all().map(row => { const value = schemas[name].parse(JSON.parse(String(row.payload))); if (value.id !== row.id) throw failure(); return value; });
        Object.assign(result, { [name]: records });
      }
      const threads = new Set(result.threads.map(t => t.id));
      if ([...result.messages, ...result.proposals].some(r => !threads.has(r.threadId))) throw failure();
      return result;
    } catch { throw failure(); }
  }
  private insert(name: keyof typeof schemas, value: ChatThread | ChatMessage | ChatProposal) {
    this.guard(); const payload = JSON.stringify(value);
    if (Buffer.byteLength(payload) > 20 * 1024 * 1024) throw new Error('The chat record exceeds its size limit.');
    if (Number(this.db.prepare(`SELECT count(*) AS count FROM ${name}`).get()?.count) >= (name === 'messages' ? 10000 : 1000)) throw new Error('The chat companion has reached its record limit.');
    this.db.prepare(`INSERT INTO ${name} (id, payload) VALUES (?, ?)`).run(value.id, payload);
  }
  createThread(title: string, provider: ProviderId): ChatThread {
    try { const now = new Date().toISOString(); const value = threadSchema.parse({ id: randomUUID(), title, provider, createdAt: now, updatedAt: now }); this.insert('threads', value); return value; }
    catch { throw new Error('Unable to create the chat thread.'); }
  }
  private assertThread(threadId: string) { if (!this.db.prepare('SELECT id FROM threads WHERE id=?').get(threadId)) throw new Error('Unknown chat thread.'); }
  addMessage(input: Omit<ChatMessage, 'id' | 'createdAt'>): ChatMessage {
    try { this.guard(); const value = messageSchema.parse({ ...input, id: randomUUID(), createdAt: new Date().toISOString() }); this.assertThread(value.threadId); this.insert('messages', value); return value; }
    catch { throw new Error('Unable to store the chat message.'); }
  }
  addProposal(input: Omit<ChatProposal, 'id' | 'createdAt' | 'status'>): ChatProposal {
    try { this.guard(); const value = proposalSchema.parse({ ...input, id: randomUUID(), createdAt: new Date().toISOString(), status: 'pending' }); this.assertThread(value.threadId); this.insert('proposals', value); return value; }
    catch { throw new Error('Unable to store the chat proposal.'); }
  }
  setProposalStatus(proposalId: string, status: ChatProposal['status'], appliedRevisionId?: string): void {
    try {
      this.guard(); const row = this.db.prepare('SELECT payload FROM proposals WHERE id=?').get(proposalId); if (!row) throw failure();
      const previous = proposalSchema.parse(JSON.parse(String(row.payload)));
      if (previous.status !== 'pending' && previous.status !== status) throw failure();
      const value = proposalSchema.parse({ ...previous, status, ...(appliedRevisionId ? { appliedRevisionId } : {}) });
      if (status === 'applied' && !value.appliedRevisionId) throw failure();
      this.db.prepare('UPDATE proposals SET payload=? WHERE id=?').run(JSON.stringify(value), proposalId);
    } catch { throw new Error('Unable to update the chat proposal.'); }
  }
  close(): void { if (!this.closed) { this.db.close(); this.closed = true; } }
}
