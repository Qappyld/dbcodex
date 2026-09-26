// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { McpAppsBridge } from "../src/bridge.js";

function hostMessage(data: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { data, source: window.parent }));
}

describe("McpAppsBridge", () => {
  it("uses the host display protocol, observes host exits, and rejects declined modes", async () => {
    const post = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    const bridge = new McpAppsBridge();
    const listener = vi.fn();
    bridge.subscribeToDisplayMode(listener);
    const ready = bridge.start();
    hostMessage({ jsonrpc: "2.0", id: 1, result: { hostContext: { displayMode: "inline" } } });
    await ready;
    const entering = bridge.requestDisplayMode("fullscreen");
    await Promise.resolve();
    expect(post).toHaveBeenCalledWith({ jsonrpc: "2.0", id: 2, method: "ui/request-display-mode", params: { mode: "fullscreen" } }, "*");
    hostMessage({ jsonrpc: "2.0", id: 2, result: { mode: "fullscreen" } });
    await entering;
    expect(listener).toHaveBeenLastCalledWith("fullscreen");
    hostMessage({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { displayMode: "inline" } });
    expect(listener).toHaveBeenLastCalledWith("inline");
    const declined = bridge.requestDisplayMode("fullscreen");
    await Promise.resolve();
    hostMessage({ jsonrpc: "2.0", id: 3, result: { mode: "inline" } });
    await expect(declined).rejects.toThrow();
    bridge.dispose();
    post.mockRestore();
  });
  it("initializes, announces readiness, and receives tool results", async () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    const bridge = new McpAppsBridge();
    const listener = vi.fn();
    bridge.subscribeToToolResults(listener);

    const ready = bridge.start();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      jsonrpc: "2.0",
      id: 1,
      method: "ui/initialize",
    }), "*");
    hostMessage({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2026-01-26" } });
    await ready;
    expect(postMessage).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      method: "ui/notifications/initialized",
      params: {},
    }, "*");

    hostMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { ok: true } } });
    expect(listener).toHaveBeenCalledWith({ structuredContent: { ok: true } });
    bridge.dispose();
    postMessage.mockRestore();
  });

  it("calls MCP tools after initialization", async () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    const bridge = new McpAppsBridge();

    const ready = bridge.start();
    hostMessage({ jsonrpc: "2.0", id: 1, result: {} });
    await ready;

    const resultPromise = bridge.callTool("save_layout", { tableId: "public.users" });
    await Promise.resolve();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: 2,
      method: "tools/call",
      params: { name: "save_layout", arguments: { tableId: "public.users" } },
    }), "*");
    hostMessage({ jsonrpc: "2.0", id: 2, result: { structuredContent: { saved: true } } });
    await expect(resultPromise).resolves.toEqual({ structuredContent: { saved: true } });
    bridge.dispose();
    postMessage.mockRestore();
  });
});
