// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { DbmlEditor } from "../src/DbmlEditor.js";
import { diagnosticsToLint } from "../src/dbml-language.js";

afterEach(cleanup);

describe("DbmlEditor", () => {
  it("updates an existing editor from an external value and invokes save once", () => {
    const onSave = vi.fn();
    const { rerender, container } = render(<DbmlEditor value="Table users {}" diagnostics={[]} readOnly={false} onChange={vi.fn()} onSave={onSave} />);
    const editor = container.querySelector(".cm-editor");
    expect(editor?.textContent).toContain("Table users {}");
    rerender(<DbmlEditor value="Table orders {}" diagnostics={[]} readOnly={false} onChange={vi.fn()} onSave={onSave} />);
    expect(container.querySelector(".cm-editor")).toBe(editor);
    expect(editor?.textContent).toContain("Table orders {}");
    const saveEvent = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("textbox"), saveEvent);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(saveEvent.defaultPrevented).toBe(true);
  });

  it("reconfigures read-only state and destroys the view on unmount", () => {
    const props = { value: "Table users {}", diagnostics: [], onChange: vi.fn(), onSave: vi.fn() };
    const { container, rerender, unmount } = render(<DbmlEditor {...props} readOnly={false} />);
    const editorElement = container.querySelector(".cm-editor") as HTMLElement;
    const view = EditorView.findFromDOM(editorElement);
    expect(view?.state.readOnly).toBe(false);
    rerender(<DbmlEditor {...props} readOnly={true} />);
    expect(EditorView.findFromDOM(editorElement)).toBe(view);
    expect(view?.state.readOnly).toBe(true);
    const destroy = vi.spyOn(view!, "destroy");
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(editorElement.isConnected).toBe(false);
  });

  it("clamps diagnostic positions to valid CodeMirror ranges", () => {
    const doc = EditorState.create({ doc: "Table users {\n id int\n}" }).doc;
    const ranges = diagnosticsToLint(doc, [{
      severity: "error", message: "Bad type", location: { start: { line: 99, column: 99 }, end: { line: 100, column: 200 } },
    }]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.from).toBeLessThanOrEqual(doc.length);
    expect(ranges[0]?.to).toBeLessThanOrEqual(doc.length);
    expect(ranges[0]?.to).toBeGreaterThanOrEqual(ranges[0]!.from);
  });
});
