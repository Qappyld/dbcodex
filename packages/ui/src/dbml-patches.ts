export interface DbmlPatch { source: string; from: number; to: number; insert: string; diff: string; ambiguous: boolean }
interface Token { text: string; from: number; to: number }

// A lossless declaration-range parser. Comments and quoted strings are atomic
// tokens so their braces and declaration-like contents never define source ranges.
function tokens(source: string): { tokens: Token[]; incomplete: boolean } {
  const result: Token[] = []; let incomplete = false;
  for (let i = 0; i < source.length;) {
    if (/\s/.test(source[i]!)) { i++; continue; }
    if (source.startsWith("//", i)) { const end = source.indexOf("\n", i + 2); i = end < 0 ? source.length : end; continue; }
    if (source.startsWith("/*", i)) { const end = source.indexOf("*/", i + 2); if (end < 0) { incomplete = true; break; } i = end + 2; continue; }
    const from = i;
    const quote = source.startsWith("'''", i) ? "'''" : ["'", '"', "`"].includes(source[i]!) ? source[i]! : null;
    if (quote) {
      i += quote.length;
      while (i < source.length && !source.startsWith(quote, i)) { if (source[i] === "\\") i++; i++; }
      if (i >= source.length) { incomplete = true; break; }
      i += quote.length;
    } else {
      const word = /^[A-Za-z_][\w.]*/.exec(source.slice(i)); i += word?.[0].length ?? 1;
    }
    result.push({ text: source.slice(from, i), from, to: i });
  }
  return { tokens: result, incomplete };
}
export function previewDbmlBlock(source: string, kind: "TableGroup" | "DiagramView", name: string, block: string): DbmlPatch {
  const parsed = tokens(source), all = parsed.tokens; const ranges: Array<{ from: number; to: number }> = [];
  let depth = 0; let incomplete = parsed.incomplete;
  for (let i = 0; i < all.length; i++) {
    const token = all[i]!;
    if (depth === 0 && token.text === kind && all[i + 1]?.text.replace(/^"|"$/g, "") === name) {
      let open = i + 2;
      if (all[open]?.text === "[") {
        open++; while (open < all.length && !["[", "]", "{", "}"].includes(all[open]!.text)) open++;
        if (all[open]?.text === "]") open++;
      }
      if (all[open]?.text !== "{") { incomplete = true; continue; }
      let close = open, nesting = 0;
      for (; close < all.length; close++) { if (all[close]!.text === "{") nesting++; if (all[close]!.text === "}" && --nesting === 0) break; }
      if (close < all.length && all[open]?.text === "{") ranges.push({ from: token.from, to: all[close]!.to }); else incomplete = true;
    }
    if (token.text === "{") depth++; if (token.text === "}") depth--;
  }
  const ambiguous = incomplete || depth !== 0 || ranges.length > 1;
  const range = !ambiguous && ranges.length === 1 ? ranges[0]! : { from: source.length, to: source.length };
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const insert = (range.from === source.length ? (source.endsWith("\n") || !source ? "" : newline) + newline : "") + block.replace(/\r?\n/g, newline);
  const removed = source.slice(range.from, range.to);
  return { source, ...range, insert, ambiguous, diff: `${removed ? removed.split(/\r?\n/).map((line) => `-${line}`).join("\n") + "\n" : ""}${insert.split(/\r?\n/).map((line) => `+${line}`).join("\n")}` };
}
export function applyDbmlPatch(source: string, patch: DbmlPatch, explicitApply = false): string {
  if (source !== patch.source) throw new Error("Le DBML a été modifié. Recréez l’aperçu.");
  if (patch.ambiguous && !explicitApply) throw new Error("Une application explicite du patch est nécessaire.");
  return source.slice(0, patch.from) + patch.insert + source.slice(patch.to);
}
