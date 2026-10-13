// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { emptyPresentation } from "@dbcodex/core";
import { SessionRecoveryPanel } from "../src/SessionRecoveryPanel.js";
import type { DocumentSession } from "../src/useDocumentSession.js";

afterEach(cleanup);
it("offers explicit draft comparison, resume and discard", () => {
  const resume = vi.fn(), discard = vi.fn();
  render(<SessionRecoveryPanel session={{ source: "saved", recovery: { draft: { sourceText: "draft", presentation: emptyPresentation(), baseGeneration: 1, updatedAt: "today" }, resume, discard } } as unknown as DocumentSession} />);
  expect(screen.getByText("draft")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reprendre le brouillon" }));
  fireEvent.click(screen.getByRole("button", { name: "Écarter le brouillon" }));
  expect(resume).toHaveBeenCalledOnce(); expect(discard).toHaveBeenCalledOnce();
});
it("presents base/local/disk and applies an explicitly edited merge", () => {
  const merge = vi.fn(), retain = vi.fn(), reload = vi.fn();
  render(<SessionRecoveryPanel session={{ conflict: { baseSource: "base", localSource: "local", localPresentation: emptyPresentation(),
    disk: { sourceText: "disk", presentation: emptyPresentation() }, merge, retain, reload } } as unknown as DocumentSession} />);
  for (const value of ["base", "local", "disk"]) expect(screen.getByText(value)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Conserver le brouillon local" }));
  fireEvent.click(screen.getByRole("button", { name: "Recharger le disque" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Fusion DBML" }), { target: { value: "Table merged {}" } });
  fireEvent.click(screen.getByRole("button", { name: "Appliquer la fusion" }));
  expect(retain).toHaveBeenCalledOnce(); expect(reload).toHaveBeenCalledOnce();
  expect(merge).toHaveBeenCalledWith("Table merged {}", emptyPresentation());
});
