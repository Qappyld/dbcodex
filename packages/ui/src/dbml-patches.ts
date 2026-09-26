import type { GraphTable } from "@dbcodex/core";

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
      const word = /^[\p{L}_][\p{L}\p{N}_$]*/u.exec(source.slice(i)); i += word?.[0].length ?? 1;
    }
    result.push({ text: source.slice(from, i), from, to: i });
  }
  return { tokens: result, incomplete };
}

type TableReference = Pick<GraphTable, "schema" | "name">;
const membershipError = (): Error => new Error("Impossible de vérifier les groupes du DBML. Corrigez la déclaration avant de grouper.");
function identifier(token: Token | undefined): string | null {
  if (!token) return null;
  if (/^[\p{L}_][\p{L}\p{N}_$]*$/u.test(token.text)) return token.text;
  if (token.text.startsWith('"') && token.text.endsWith('"')) {
    return token.text.slice(1, -1).replace(/\\([\s\S])/g, (_match, char: string) => ({ n: "\n", r: "\r", t: "\t" }[char] ?? char));
  }
  return null;
}
function reference(all: Token[], index: number): TableReference & { next: number; qualified: boolean } {
  const first = identifier(all[index]);
  if (first === null) throw membershipError();
  if (all[index + 1]?.text !== ".") return { schema: "public", name: first, next: index + 1, qualified: false };
  const second = identifier(all[index + 2]);
  if (second === null || all[index + 3]?.text === ".") throw membershipError();
  return { schema: first, name: second, next: index + 3, qualified: true };
}
function closingToken(all: Token[], open: number): number {
  const closing = all[open]?.text === "[" ? "]" : "}";
  let depth = 0;
  for (let index = open; index < all.length; index++) {
    if (all[index]!.text === all[open]!.text) depth++;
    if (all[index]!.text === closing && --depth === 0) return index;
  }
  throw membershipError();
}

/** Read functional membership from current source, independently of presentation views. */
export function dbmlTableGroups(source: string): Array<{ name: string; tables: TableReference[] }> {
  const parsed = tokens(source), all = parsed.tokens;
  if (parsed.incomplete) throw membershipError();
  const aliases = new Map<string, TableReference>();
  const groups: Array<{ name: string; open: number; close: number }> = [];
  for (let index = 0; index < all.length; index++) {
    const keyword = all[index]!.text.toLowerCase();
    if (keyword === "table") {
      const table = reference(all, index + 1);
      if (all[table.next]?.text.toLowerCase() === "as") {
        const alias = identifier(all[table.next + 1]);
        if (alias === null || aliases.has(alias)) throw membershipError();
        aliases.set(alias, table);
      }
    }
    if (keyword === "tablegroup") {
      const name = identifier(all[index + 1]); let open = index + 2;
      if (all[open]?.text === "[") open = closingToken(all, open) + 1;
      if (name === null || all[open]?.text !== "{") throw membershipError();
      const close = closingToken(all, open);
      groups.push({ name, open, close }); index = close;
    } else if (all[index]!.text === "{") index = closingToken(all, index);
    else if (all[index]!.text === "}") throw membershipError();
  }
  return groups.map(({ name, open, close }) => {
    const tables: TableReference[] = [];
    for (let index = open + 1; index < close;) {
      const item = reference(all, index);
      if (all[item.next]?.text === ":") {
        // Notes and metadata values are atomic literals or bracketed blocks;
        // neither their identifiers nor their text are table memberships.
        const value = item.next + 1;
        if (value >= close) throw membershipError();
        index = ["{", "["].includes(all[value]!.text) ? closingToken(all, value) + 1 : value + 1;
      } else if (!item.qualified && item.name.toLowerCase() === "note" && all[item.next]?.text === "{") {
        index = closingToken(all, item.next) + 1;
      } else {
        tables.push(!item.qualified ? aliases.get(item.name) ?? item : item);
        index = item.next;
      }
    }
    return { name, tables };
  });
}

export function assertTablesUngrouped(source: string, tables: TableReference[]): ReturnType<typeof dbmlTableGroups> {
  const groups = dbmlTableGroups(source);
  for (const table of tables) {
    const group = groups.find((group) => group.tables.some((member) => member.schema === table.schema && member.name === table.name));
    if (group) throw new Error(`La table « ${table.schema}.${table.name} » appartient déjà au groupe DBML « ${group.name} ». Retirez-la de ce groupe avant de la regrouper.`);
  }
  return groups;
}

export function dbmlTableReference(table: TableReference): string {
  const quote = (value: string): string => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  return `${quote(table.schema)}.${quote(table.name)}`;
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
