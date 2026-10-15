// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DesktopApi, DesktopState } from "../src/shared/contracts.js";
import { DesktopApp } from "../src/renderer/DesktopApp.js";
import { openResult } from "../../ui/test/workbench-fixture.js";

vi.mock("../../ui/src/DbcdWorkbench.js", () => ({ ProjectWorkbench: () => <div>Atelier</div> }));
afterEach(cleanup);
function fixture() {
  let state: DesktopState = { project: { fileName: "demo.dbcd", result: openResult() },
    providers: { codex: { installed: true, detail: "Prêt" }, claude: { installed: false, detail: "Claude Code absent" } },
    runningThreadId: null, chat: { threads: [{ id: "a", title: "Modèle", provider: "codex", createdAt: "", updatedAt: "" },
      { id: "b", title: "Relations", provider: "codex", createdAt: "", updatedAt: "" }],
      messages: [{ id: "m", threadId: "b", role: "assistant", content: "Autre discussion", createdAt: "", state: "complete", mode: "discuss", contextTableIds: [] }],
      proposals: [] } };
  let listener: (state: DesktopState) => void = () => {};
  const api: DesktopApi = { getState: vi.fn(async () => state), subscribe: (fn) => { listener = fn; return () => {}; },
    openProject: vi.fn(async () => state), createProject: vi.fn(async () => state), importProject: vi.fn(async () => state),
    createThread: vi.fn(async () => state), sendMessage: vi.fn(async () => state), cancelRun: vi.fn(async () => {}),
    applyProposal: vi.fn(async () => state), rejectProposal: vi.fn(async () => state), workbenchCall: vi.fn(async () => ({})) };
  return { api, state, emit: (next: DesktopState) => { state = next; act(() => listener(next)); } };
}
it("discusses by default with structural context, never applying from chat text", async () => {
  const { api } = fixture(); render(<DesktopApp api={api} />);
  await screen.findByText("Atelier");
  expect(await screen.findByLabelText("Partager le DBML source complet")).toHaveProperty("checked", false);
  fireEvent.change(screen.getByLabelText("Votre message"), { target: { value: "Applique cette modification" } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await act(async () => {});
  expect(api.sendMessage).toHaveBeenCalledWith({ threadId: "a", text: "Applique cette modification", mode: "discuss", tableIds: [], shareFullSource: false });
  expect(api.applyProposal).not.toHaveBeenCalled();
});
it("prepares explicitly and applies only by clicking a proposal", async () => {
  const f = fixture(); f.state.chat.proposals.push({ id: "p", threadId: "a", title: "Ajouter un index", explanation: "Accélérer les recherches", edits: [], beforeSource: "avant", afterSource: "après", baseGeneration: 3, baseRevisionId: "r3", baseSourceHash: "hash", status: "pending", createdAt: "" });
  render(<DesktopApp api={f.api} />); await screen.findByText("Ajouter un index");
  expect(screen.getByText("avant")).toBeTruthy(); expect(screen.getByText("après")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Votre message"), { target: { value: "Ajouter un index" } });
  fireEvent.click(screen.getByRole("button", { name: "Préparer une proposition" })); await act(async () => {});
  expect(f.api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ mode: "propose" }));
  expect(f.api.applyProposal).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Appliquer" })); await act(async () => {});
  expect(f.api.applyProposal).toHaveBeenCalledWith("p");
});
it("disables stale proposals and unavailable assistants, preserving isolated thread drafts", async () => {
  const f = fixture(); f.state.chat.proposals.push({ id: "p", threadId: "a", title: "Ancienne proposition", explanation: "", edits: [], beforeSource: "avant", afterSource: "après", baseGeneration: 2, baseRevisionId: "r2", baseSourceHash: "old", status: "pending", createdAt: "" });
  render(<DesktopApp api={f.api} />); await screen.findByText("Ancienne proposition");
  expect(screen.getByRole("button", { name: "Appliquer" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("option", { name: /Claude/ })).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByLabelText("Votre message"), { target: { value: "Brouillon A" } });
  fireEvent.click(screen.getByRole("tab", { name: /Relations/ }));
  expect(screen.getByText("Autre discussion")).toBeTruthy();
  expect(screen.getByLabelText("Votre message")).toHaveProperty("value", "");
  f.emit({ ...f.state });
  expect(screen.getByRole("tab", { name: /Relations/ }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: /Modèle/ }));
  expect(screen.getByLabelText("Votre message")).toHaveProperty("value", "Brouillon A");
});
