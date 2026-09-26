import { StreamLanguage, type StringStream } from "@codemirror/language";
import type { Diagnostic } from "@dbcodex/core";
import type { Text } from "@codemirror/state";
import type { Diagnostic as LintDiagnostic } from "@codemirror/lint";

interface TokenState { inBlockComment: boolean }

function token(stream: StringStream, state: TokenState): string | null {
  if (state.inBlockComment) {
    if (stream.skipTo("*/")) { stream.match("*/"); state.inBlockComment = false; }
    else stream.skipToEnd();
    return "comment";
  }
  if (stream.eatSpace()) return null;
  if (stream.match("//") || stream.match("#")) { stream.skipToEnd(); return "comment"; }
  if (stream.match("/*")) { state.inBlockComment = true; return token(stream, state); }
  if (stream.match(/^(?:TableGroup|Table|Ref|Enum|Project|Note)\b/)) return "keyword";
  if (stream.match(/^\[[^\]\n]*\]/)) return "meta";
  if (stream.match(/^(?:'[^']*'|"[^"]*"|`[^`]*`)/)) return "string";
  if (stream.match(/^-?\d+(?:\.\d+)?\b/)) return "number";
  if (stream.match(/^(?:<>|<|>|-|~|:)/)) return "operator";
  if (stream.match(/^[A-Za-z_][\w.]*/)) return "typeName";
  stream.next();
  return null;
}

export const dbmlLanguage = StreamLanguage.define<TokenState>({
  startState: () => ({ inBlockComment: false }),
  token,
});

function position(doc: Text, lineNumber: number, column: number): number {
  const safeLine = doc.line(Math.max(1, Math.min(doc.lines, Number.isFinite(lineNumber) ? lineNumber : 1)));
  const offset = Math.max(0, Math.min(safeLine.length, (Number.isFinite(column) ? column : 1) - 1));
  return safeLine.from + offset;
}

export function diagnosticsToLint(doc: Text, diagnostics: Diagnostic[]): LintDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    const start = diagnostic.location?.start;
    const end = diagnostic.location?.end;
    const from = start ? position(doc, start.line, start.column) : 0;
    const to = end ? Math.max(from, position(doc, end.line, end.column)) : Math.min(doc.length, from + 1);
    return { from, to, severity: diagnostic.severity, message: diagnostic.message };
  });
}
