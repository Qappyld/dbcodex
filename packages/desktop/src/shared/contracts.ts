import type { DbcdProjectSnapshot } from "@dbcodex/core";

export type ProviderId = "codex" | "claude";
export type ChatMode = "discuss" | "propose";
export interface ChatThread { id: string; title: string; provider: ProviderId; createdAt: string; updatedAt: string }
export interface ChatMessage {
  id: string; threadId: string; role: "user" | "assistant"; content: string; createdAt: string;
  state: "complete" | "interrupted" | "failed"; mode: ChatMode; contextTableIds: string[];
}
export interface TextEdit { search: string; replacement: string }
export interface ProposalInput { title: string; explanation: string; edits: TextEdit[] }
export interface ChatProposal extends ProposalInput {
  id: string; threadId: string; beforeSource: string; afterSource: string;
  baseGeneration: number; baseRevisionId: string; baseSourceHash: string;
  status: "pending" | "applied" | "rejected" | "stale"; createdAt: string; appliedRevisionId?: string;
}
export interface ChatWorkspace { threads: ChatThread[]; messages: ChatMessage[]; proposals: ChatProposal[] }
export interface ProviderStatus { installed: boolean; detail: string }
export interface DesktopState {
  project: { fileName: string; result: unknown } | null;
  chat: ChatWorkspace;
  providers: Record<ProviderId, ProviderStatus>;
  runningThreadId: string | null;
}
export interface SendMessageInput { threadId: string; text: string; mode: ChatMode; tableIds: string[]; shareFullSource: boolean }
export interface ProviderRequest {
  provider: ProviderId; threadId: string; mode: ChatMode; prompt: string; context: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  signal?: AbortSignal; onDelta?: (text: string) => void;
}
export interface ProviderOutput { reply: string; proposal?: ProposalInput }
export interface DesktopApi {
  getState(): Promise<DesktopState>;
  openProject(): Promise<DesktopState>;
  createProject(): Promise<DesktopState>;
  importProject(): Promise<DesktopState>;
  createThread(input: { title: string; provider: ProviderId }): Promise<DesktopState>;
  sendMessage(input: SendMessageInput): Promise<DesktopState>;
  cancelRun(): Promise<void>;
  applyProposal(id: string): Promise<DesktopState>;
  rejectProposal(id: string): Promise<DesktopState>;
  workbenchCall(name: string, args: Record<string, unknown>): Promise<unknown>;
  subscribe(listener: (state: DesktopState) => void): () => void;
  onCloseRequest?(listener: () => Promise<void>): () => void;
}
export type ProjectSnapshot = DbcdProjectSnapshot;
