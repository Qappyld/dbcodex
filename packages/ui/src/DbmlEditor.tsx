import { useEffect, useRef } from "react";
import type { Diagnostic } from "@dbcodex/core";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { lintGutter, lintKeymap, setDiagnostics } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { dbmlLanguage, diagnosticsToLint } from "./dbml-language.js";

export interface DbmlEditorProps {
  value: string;
  diagnostics: Diagnostic[];
  readOnly: boolean;
  onChange(value: string): void;
  onSave(): void;
}

export function DbmlEditor({ value, diagnostics, readOnly, onChange, onSave }: DbmlEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onSave });
  const readOnlyCompartment = useRef(new Compartment());
  callbacks.current = { onChange, onSave };

  useEffect(() => {
    if (!container.current) return;
    const editor = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), history(), dbmlLanguage, syntaxHighlighting(defaultHighlightStyle),
          lintGutter(),
          readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
          EditorView.contentAttributes.of({ "aria-label": "DBML source" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
          keymap.of([{ key: "Mod-s", preventDefault: true, run: () => { callbacks.current.onSave(); return true; } },
            ...defaultKeymap, ...historyKeymap, ...lintKeymap]),
        ],
      }),
    });
    view.current = editor;
    editor.dispatch(setDiagnostics(editor.state, diagnosticsToLint(editor.state.doc, diagnostics)));
    return () => { view.current = null; editor.destroy(); };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const editor = view.current;
    if (editor) editor.dispatch(setDiagnostics(editor.state, diagnosticsToLint(editor.state.doc, diagnostics)));
  }, [diagnostics, value]);

  useEffect(() => {
    view.current?.dispatch({ effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly]);

  return <div ref={container} className="dbml-editor" />;
}
