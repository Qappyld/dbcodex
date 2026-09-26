// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
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
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
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
