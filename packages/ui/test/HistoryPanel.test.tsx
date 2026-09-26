// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DbcdRevisionSummary } from "@dbcodex/core";
import { ProjectWorkbench } from "../src/DbcdWorkbench.js";
import { openResult } from "./workbench-fixture.js";
import { setupFlowDom } from "./flow-dom.js";

beforeEach(() => { setupFlowDom(); Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const older: DbcdRevisionSummary = { id: "a1b2c3", parentId: null, createdAt: "2026-09-25T00:00:00.000Z", sourceHash: "old", presentationHash: "p", summary: "Initial revision", label: "Baseline", pinned: false };
const newer = { ...older, id: "r3", parentId: older.id, createdAt: "2026-09-26T00:00:00.000Z", summary: "Saved revision", label: undefined };
function setup(readOnly = false) {
  const opened = openResult();
  const result = { ...opened, structuredContent: { ...opened.structuredContent, revisions: [older, newer], readOnly } };
  const revision = { ...older, sourceText: "Table before { id int [pk] }", presentation: opened.structuredContent.presentation };
  const host = { requestDisplayMode: vi.fn().mockResolvedValue(undefined), callTool: vi.fn(async (name: string) => {
    if (name === "read_dbcd_revision") return { structuredContent: { revision: older }, _meta: { dbcodex: { revision } } };
    if (name === "pin_dbcd_revision") return { structuredContent: { pinned: true } };
    if (name === "restore_dbcd_revision") return { ...result, structuredContent: { ...result.structuredContent, generation: 4, currentRevisionId: "r4", revisions: [{ ...newer, id: "r4", summary: "Restauration de a1b2c3" }, newer, older] }, _meta: { dbcodex: { ...opened._meta.dbcodex, sourceText: revision.sourceText } } };
    throw new Error(`Unexpected tool ${name}`);
  }) };
  const rendered = render(<ProjectWorkbench result={result} bridge={host} />);
  return { host, ...rendered };
}
describe("history workflow", () => {
  it("lists newest first and lazily reads a selected revision with a diff against current work", async () => {
    const { host } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Historique" }));
    const panel = screen.getByRole("region", { name: "Historique des révisions" });
    const entries = within(panel).getAllByRole("button", { name: /^Voir la révision/ });
    expect(entries.map((entry) => entry.textContent)).toEqual([expect.stringContaining("r3"), expect.stringContaining("a1b2c3")]);
    expect(host.callTool).not.toHaveBeenCalled();
    fireEvent.click(entries[1]!);
    expect(await screen.findByText(/1 ligne.*modifiée/)).toBeTruthy();
    expect(host.callTool).toHaveBeenCalledWith("read_dbcd_revision", { path: "demo.dbcd", revisionId: "a1b2c3" });
    expect(within(panel).getByText("Baseline")).toBeTruthy();
  });
  it("pins and unpins without saving, and preserves selection and diff through fullscreen", async () => {
    const { host } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Historique" }));
    fireEvent.click(screen.getByRole("button", { name: "Épingler a1b2c3" }));
    fireEvent.click(await screen.findByRole("button", { name: "Désépingler a1b2c3" }));
    await waitFor(() => expect(host.callTool).toHaveBeenCalledWith("pin_dbcd_revision", { path: "demo.dbcd", revisionId: "a1b2c3", pinned: false }));
    fireEvent.click(screen.getByRole("button", { name: "Voir la révision a1b2c3" }));
    await screen.findByText(/1 ligne.*modifiée/);
    fireEvent.click(screen.getByRole("button", { name: "Plein écran" }));
    fireEvent.click(await screen.findByRole("button", { name: "Quitter le plein écran" }));
    await screen.findByRole("button", { name: "Plein écran" });
    expect(screen.getByRole("button", { name: "Voir la révision a1b2c3" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/1 ligne.*modifiée/)).toBeTruthy();
    expect(host.callTool.mock.calls.filter(([name]) => name === "read_dbcd_revision")).toHaveLength(1);
  });
  it("restores only on a deliberate action and displays the new current revision", async () => {
    const { host, container } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Historique" }));
    fireEvent.click(screen.getByRole("button", { name: "Voir la révision a1b2c3" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restaurer a1b2c3" }));
    await waitFor(() => expect(host.callTool).toHaveBeenCalledWith("restore_dbcd_revision", { path: "demo.dbcd", expectedGeneration: 3, revisionId: "a1b2c3" }));
    expect(await screen.findByText("Restauration de a1b2c3")).toBeTruthy();
    expect(screen.getByText("Enregistré")).toBeTruthy();
    expect(container.querySelector(".cm-editor")?.textContent).toContain("Table before");
  });
  it("disables restore and pin for read-only projects", async () => {
    setup(true);
    fireEvent.click(screen.getByRole("button", { name: "Historique" }));
    expect(screen.getByRole("button", { name: "Épingler a1b2c3" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Voir la révision a1b2c3" }));
    expect(await screen.findByRole("button", { name: "Restaurer a1b2c3" })).toHaveProperty("disabled", true);
  });
});
