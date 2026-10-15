import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { parseDbml, hashDocument, saveDbcdProject, saveDbcdDraft, openDbcdProject } from '@dbcodex/core';
import { makeDbcdFixture } from '../../core/test/support/dbcd-fixture.js';
import { removeTempWorkspace } from '../../core/test/support/temp-workspace.js';
import { ChatStore } from '../src/chat-store.js';
import { buildChatContext, prepareProposal, applyChatProposal, reconcileProposals } from '../src/chat-service.js';
const roots: string[] = []; const stores: ChatStore[] = [];
afterEach(async () => { stores.splice(0).forEach(s => s.close()); await Promise.all(roots.splice(0).map(removeTempWorkspace)); });
async function fixture() { const f = await makeDbcdFixture(roots); const store = new ChatStore(join(f.root, 'shop.dbcd.chat.sqlite'), f.snapshot.projectId); stores.push(store); const thread = store.createThread('Design', 'codex'); const proposal = store.addProposal(prepareProposal(f.snapshot, { title: 'Rename', explanation: 'Use bigint', edits: [{ search: 'id int', replacement: 'id bigint' }] }, thread.id)); return { ...f, store, proposal, thread }; }
it('shares only selected structural fields unless full source is explicitly enabled', async () => {
  const { snapshot } = await makeDbcdFixture(roots);
  const sourceText = "// SECRET\nTable users { id int [pk, default: 7, note: 'PRIVATE'] }\nTable hidden { id int [pk] }\nRef: users.id > hidden.id";
  const s = { ...snapshot, sourceText, graph: parseDbml(sourceText, 'shop.dbcd').graph };
  const context = buildChatContext(s, ['public.users'], false);
  expect(context).toContain('primaryKey'); expect(context).toContain('nullable'); expect(context).not.toMatch(/SECRET|PRIVATE|default|hidden|sourceRange/);
  expect(buildChatContext(s, ['public.users'], true)).toContain(sourceText);
  expect(() => buildChatContext(s, ['missing'], false)).toThrow();
});
it('prepares exact unique patches preserving unrelated text and rejects invalid edits', async () => {
  const { snapshot } = await makeDbcdFixture(roots); const s = { ...snapshot, sourceText: '// preserve\n' + snapshot.sourceText };
  const prepared = prepareProposal(s, { title: 'Rename', explanation: '', edits: [{ search: 'id int', replacement: 'id bigint' }] }, 'thread');
  expect(prepared.afterSource).toBe('// preserve\nTable users { id bigint [pk] }\n');
  for (const edits of [[{ search: 'absent', replacement: '' }], [{ search: '', replacement: '' }], [{ search: 'id int', replacement: 'broken [' }], [{ search: 'id int', replacement: 'id int' }], [{ search: 'id int', replacement: 'id bigint' }, { search: 'id int', replacement: 'id uuid' }]]) {
    expect(() => prepareProposal(s, { title: 'Change', explanation: '', edits }, 'thread')).toThrow();
  }
});
it('applies atomically with stable label and is idempotent', async () => {
  const f = await fixture(); const args = { workspaceRoot: f.root, projectPath: 'shop.dbcd', store: f.store, proposalId: f.proposal.id };
  const saved = await applyChatProposal(args); expect(saved.generation).toBe(2); expect(saved.sourceText).toContain('bigint');
  expect(saved.revisions.some(r => r.label === `DBCodex proposal:${f.proposal.id}`)).toBe(true);
  expect(f.store.workspace().proposals[0]).toMatchObject({ status: 'applied', appliedRevisionId: saved.currentRevisionId });
  expect((await applyChatProposal(args)).generation).toBe(2);
});
it('refuses stale and rejected proposals without saving', async () => {
  const f = await fixture(); const changed = await saveDbcdProject({ ...f.input, sourceText: 'Table users { id uuid [pk] }', presentation: f.snapshot.presentation });
  await expect(applyChatProposal({ workspaceRoot: f.root, projectPath: 'shop.dbcd', store: f.store, proposalId: f.proposal.id })).rejects.toThrow();
  expect(f.store.workspace().proposals[0]?.status).toBe('stale');
  const rejected = f.store.addProposal(prepareProposal(changed, { title: 'Change', explanation: '', edits: [{ search: 'uuid', replacement: 'int' }] }, f.thread.id));
  f.store.setProposalStatus(rejected.id, 'rejected');
  await expect(applyChatProposal({ workspaceRoot: f.root, projectPath: 'shop.dbcd', store: f.store, proposalId: rejected.id })).rejects.toThrow();
});
it('recovers a project saved before chat status was written', async () => {
  const f = await fixture(); const saved = await saveDbcdProject({ ...f.input, sourceText: f.proposal.afterSource, presentation: f.snapshot.presentation, label: `DBCodex proposal:${f.proposal.id}` });
  reconcileProposals(f.store, saved);
  expect(f.store.workspace().proposals[0]).toMatchObject({ status: 'applied', appliedRevisionId: saved.currentRevisionId });
  expect((await applyChatProposal({ workspaceRoot: f.root, projectPath: 'shop.dbcd', store: f.store, proposalId: f.proposal.id })).generation).toBe(2);
});
it('refuses recoverable drafts without clearing them', async () => {
  const f = await fixture(); await saveDbcdDraft({ ...f.input, baseGeneration: f.snapshot.generation, sourceText: 'Table draft { id int }', presentation: f.snapshot.presentation });
  await expect(applyChatProposal({ workspaceRoot: f.root, projectPath: 'shop.dbcd', store: f.store, proposalId: f.proposal.id })).rejects.toThrow(/draft/i);
  const unchanged = await openDbcdProject({ workspaceRoot: f.root, projectPath: 'shop.dbcd' });
  expect(unchanged.draft?.sourceText).toBe('Table draft { id int }');
  expect(unchanged.generation).toBe(f.snapshot.generation);
  expect(unchanged.sourceText).toBe(f.snapshot.sourceText);
});
it('marks hash changes stale even when revision and generation match', async () => {
  const f = await fixture(); reconcileProposals(f.store, { ...f.snapshot, sourceHash: hashDocument('changed') });
  expect(f.store.workspace().proposals[0]?.status).toBe('stale');
});
