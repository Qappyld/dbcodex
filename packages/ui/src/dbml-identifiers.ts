// One bare-identifier grammar for source tokens and generated identifiers.
export const dbmlIdentifierToken = /^[\p{L}_][\p{L}\p{N}_$]*/u;
export const dbmlIdentifierPattern = new RegExp(`${dbmlIdentifierToken.source}$`, "u");

function normalizeDbmlIdentifier(name: string): string {
  const candidate = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_]/g, "_") || "nouveau";
  return dbmlIdentifierPattern.test(candidate) ? candidate : `g_${candidate}`;
}

export function allocateDbmlIdentifier(name: string, existing: Readonly<Record<string, unknown>>): string {
  const base = normalizeDbmlIdentifier(name);
  let id = base, suffix = 2;
  while (Object.hasOwn(existing, id) || ["__proto__", "constructor", "prototype"].includes(id)) id = `${base}_${suffix++}`;
  return id;
}
