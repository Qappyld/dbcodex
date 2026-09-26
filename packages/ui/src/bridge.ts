import type { DbcdProjectSnapshot } from "@dbcodex/core";

export type DisplayMode = "inline" | "fullscreen";
export interface WorkbenchBridge {
  callTool(name: string, input: Record<string, unknown>): Promise<unknown>;
  requestDisplayMode(mode: DisplayMode): Promise<void>;
  subscribeToDisplayMode?(listener: (mode: DisplayMode) => void): () => void;
}

/** Reads the private app payload without copying it into structuredContent. */
export function readDbcdProjectResult(value: unknown): DbcdProjectSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as Record<string, unknown>;
  if (envelope.isError === true || !envelope.structuredContent || typeof envelope.structuredContent !== "object") return null;
  const visible = envelope.structuredContent as Record<string, unknown>;
  if ("sourceText" in visible || "projectId" in visible || "draft" in visible) return null;
  const meta = envelope._meta && typeof envelope._meta === "object"
    ? (envelope._meta as Record<string, unknown>).dbcodex : null;
  if (!meta || typeof meta !== "object") return null;
  const privateData = meta as Record<string, unknown>;
  if (typeof privateData.sourceText !== "string" || typeof privateData.projectId !== "string"
    || typeof visible.projectPath !== "string" || typeof visible.generation !== "number"
    || !Array.isArray(visible.diagnostics) || !Array.isArray(visible.revisions)
    || !visible.presentation || typeof visible.presentation !== "object") return null;
  return {
    ...(visible as unknown as Omit<DbcdProjectSnapshot, "sourceText" | "projectId" | "draft">),
    sourceText: privateData.sourceText,
    projectId: privateData.projectId,
    draft: (privateData.draft ?? null) as DbcdProjectSnapshot["draft"],
  };
}

type RpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: unknown;
};

type RpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

interface PendingRequest {
  resolve(value: unknown): void;
  reject(reason: unknown): void;
}

export class McpAppsBridge {
  private nextId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly listeners = new Set<(result: unknown) => void>();
  private readonly displayListeners = new Set<(mode: DisplayMode) => void>();
  private displayMode: DisplayMode = "inline";
  private ready: Promise<void> | null = null;

  private readonly onMessage = (
    event: MessageEvent<RpcResponse | RpcNotification>,
  ): void => {
    if (event.source !== window.parent || event.data?.jsonrpc !== "2.0") {
      return;
    }

    const message = event.data;
    if ("id" in message) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(message.error);
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method === "ui/notifications/tool-result") {
      for (const listener of this.listeners) {
        listener(message.params);
      }
    }
    if (message.method === "ui/notifications/host-context-changed") {
      this.updateDisplayMode((message.params as { displayMode?: unknown } | undefined)?.displayMode);
    }
  };

  private request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    });
  }

  start(): Promise<void> {
    if (this.ready) {
      return this.ready;
    }

    window.addEventListener("message", this.onMessage);
    this.ready = this.request("ui/initialize", {
      appInfo: {
        name: "dbcodex-diagram",
        version: "0.1.0-dev.0",
      },
      appCapabilities: {},
      protocolVersion: "2026-01-26",
    }).then((result) => {
      this.updateDisplayMode((result as { hostContext?: { displayMode?: unknown } } | undefined)?.hostContext?.displayMode);
      window.parent.postMessage(
        {
          jsonrpc: "2.0",
          method: "ui/notifications/initialized",
          params: {},
        },
        "*",
      );
    });
    return this.ready;
  }

  subscribeToToolResults(listener: (result: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private updateDisplayMode(mode: unknown): void {
    if (mode !== "inline" && mode !== "fullscreen") return;
    this.displayMode = mode;
    for (const listener of this.displayListeners) listener(mode);
  }

  subscribeToDisplayMode(listener: (mode: DisplayMode) => void): () => void {
    this.displayListeners.add(listener);
    listener(this.displayMode);
    return () => this.displayListeners.delete(listener);
  }

  async requestDisplayMode(mode: DisplayMode): Promise<void> {
    await this.start();
    const result = await this.request("ui/request-display-mode", { mode });
    const actual = (result as { mode?: unknown } | undefined)?.mode;
    this.updateDisplayMode(actual);
    if (actual !== mode) throw new Error("The host declined the requested display mode.");
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    await this.start();
    return this.request("tools/call", { name, arguments: args });
  }

  dispose(): void {
    window.removeEventListener("message", this.onMessage);
    for (const { reject } of this.pending.values()) {
      reject(new Error("MCP Apps bridge disposed."));
    }
    this.pending.clear();
    this.listeners.clear();
    this.displayListeners.clear();
  }
}
