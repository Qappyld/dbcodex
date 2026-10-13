import { boundedUtf8Length, DBCD_MAX_SOURCE_BYTES, hashDocument, openDbcdProject, parseDbml, saveDbcdProject } from '@dbcodex/core';
import type { DbcdProjectSnapshot } from '@dbcodex/core';
import type { ChatProposal, ProposalInput } from './shared/contracts.js';
import type { ChatStore } from './chat-store.js';

export function buildChatContext(snapshot: DbcdProjectSnapshot, tableIds: string[], shareFullSource: boolean): string {
  if (!Array.isArray(tableIds) || tableIds.length > 1000 || typeof shareFullSource !== 'boolean') throw new Error('Invalid chat context selection.');
  const selected = new Set(tableIds);
  if (selected.size !== tableIds.length || tableIds.some(id => !snapshot.graph?.tables.some(t => t.id === id))) throw new Error('Invalid chat context selection.');
  if (shareFullSource) { boundedUtf8Length(snapshot.sourceText, DBCD_MAX_SOURCE_BYTES); return snapshot.sourceText; }
  return JSON.stringify({
    tables: snapshot.graph?.tables.filter(t => selected.has(t.id)).map(t => ({ id: t.id, schema: t.schema, name: t.name, columns: t.columns.map(c => ({ name: c.name, type: c.type, primaryKey: c.primaryKey, nullable: c.nullable })) })) ?? [],
    relations: snapshot.graph?.relations.filter(r => selected.has(r.source.tableId) && selected.has(r.target.tableId)).map(r => ({ source: r.source, target: r.target })) ?? [],
  });
}

export function prepareProposal(snapshot: DbcdProjectSnapshot, input: ProposalInput, threadId: string): Omit<ChatProposal, 'id' | 'createdAt' | 'status'> {
  try {
    if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500 || typeof input.explanation !== 'string' || input.explanation.length > 65536 || typeof threadId !== 'string' || !threadId || threadId.length > 200 || !Array.isArray(input.edits) || !input.edits.length || input.edits.length > 100) throw new Error();
    boundedUtf8Length(snapshot.sourceText, DBCD_MAX_SOURCE_BYTES);
    const edits = input.edits.map(edit => {
      if (!edit || typeof edit.search !== 'string' || !edit.search || typeof edit.replacement !== 'string' || edit.search === edit.replacement) throw new Error();
      boundedUtf8Length(edit.search, DBCD_MAX_SOURCE_BYTES); boundedUtf8Length(edit.replacement, DBCD_MAX_SOURCE_BYTES);
      const offset = snapshot.sourceText.indexOf(edit.search);
      if (offset < 0 || snapshot.sourceText.indexOf(edit.search, offset + 1) >= 0) throw new Error();
      return { ...edit, offset, end: offset + edit.search.length };
    }).sort((a, b) => a.offset - b.offset);
    if (edits.some((edit, i) => i > 0 && edit.offset < edits[i - 1]!.end)) throw new Error();
    let afterSource = snapshot.sourceText;
    for (const edit of [...edits].reverse()) afterSource = afterSource.slice(0, edit.offset) + edit.replacement + afterSource.slice(edit.end);
    boundedUtf8Length(afterSource, DBCD_MAX_SOURCE_BYTES);
    if (afterSource === snapshot.sourceText || !parseDbml(afterSource, snapshot.projectPath).graph) throw new Error();
    return { title: input.title, explanation: input.explanation, edits: input.edits.map(e => ({ search: e.search, replacement: e.replacement })), threadId, beforeSource: snapshot.sourceText, afterSource, baseGeneration: snapshot.generation, baseRevisionId: snapshot.currentRevisionId, baseSourceHash: snapshot.sourceHash };
  } catch { throw new Error('The proposed edits are invalid or do not match the project uniquely.'); }
}

export function reconcileProposals(store: ChatStore, snapshot: DbcdProjectSnapshot): void {
  if (store.projectId !== snapshot.projectId) throw new Error('The chat companion belongs to another project.');
  for (const proposal of store.workspace().proposals.filter(p => p.status === 'pending')) {
    const applied = snapshot.revisions.find(r => r.label === `DBCodex proposal:${proposal.id}` && r.sourceHash === hashDocument(proposal.afterSource) && r.parentId === proposal.baseRevisionId);
    if (applied) store.setProposalStatus(proposal.id, 'applied', applied.id);
    else if (proposal.baseGeneration !== snapshot.generation || proposal.baseRevisionId !== snapshot.currentRevisionId || proposal.baseSourceHash !== snapshot.sourceHash) store.setProposalStatus(proposal.id, 'stale');
  }
}

export async function applyChatProposal(input: { workspaceRoot: string; projectPath: string; store: ChatStore; proposalId: string }): Promise<DbcdProjectSnapshot> {
  const snapshot = await openDbcdProject({ workspaceRoot: input.workspaceRoot, projectPath: input.projectPath });
  reconcileProposals(input.store, snapshot);
  const proposal = input.store.workspace().proposals.find(p => p.id === input.proposalId);
  if (!proposal) throw new Error('Unknown chat proposal.');
  if (proposal.status === 'applied') return snapshot;
  if (proposal.status !== 'pending') throw new Error('The chat proposal cannot be applied.');
  if (snapshot.draft) throw new Error('Resolve the project draft before applying a proposal.');
  const verified = prepareProposal(snapshot, proposal, proposal.threadId);
  if (proposal.beforeSource !== snapshot.sourceText || proposal.baseSourceHash !== hashDocument(snapshot.sourceText) || verified.afterSource !== proposal.afterSource) throw new Error('The chat proposal no longer matches the project.');
  let saved: DbcdProjectSnapshot;
  try {
    saved = await saveDbcdProject({ workspaceRoot: input.workspaceRoot, projectPath: input.projectPath, expectedProjectId: snapshot.projectId, expectedGeneration: proposal.baseGeneration, expectedRevisionId: proposal.baseRevisionId, sourceText: verified.afterSource, presentation: snapshot.presentation, rejectDraft: true, label: `DBCodex proposal:${proposal.id}` });
  } catch { throw new Error('Unable to apply the chat proposal. Reload the project and resolve any draft or conflict.'); }
  input.store.setProposalStatus(proposal.id, 'applied', saved.currentRevisionId);
  return saved;
}
