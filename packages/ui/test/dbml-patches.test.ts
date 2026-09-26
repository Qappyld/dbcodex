import { describe, expect, it } from "vitest";
import { allocateDbmlIdentifier, dbmlIdentifierPattern, dbmlIdentifierToken } from "../src/dbml-identifiers.js";
import { dbmlTableGroups } from "../src/dbml-patches.js";
import { parseDbml } from "../../core/src/dbml-adapter.js";

describe("generated DBML identifiers", () => {
  it.each([
    ["2026", "g_2026"], ["2026.09", "g_2026_09"], ["Équipe", "equipe"], ["", "nouveau"], ["__proto__", "__proto___2"],
  ])("allocates collision suffixes from the valid normalized base for %j", (name, first) => {
    const existing: Record<string, unknown> = {};
    const a = allocateDbmlIdentifier(name, existing);
    expect(a).toBe(first); existing[a] = true;
    const b = allocateDbmlIdentifier(name, existing); existing[b] = true;
    const c = allocateDbmlIdentifier(name, existing);
    if (name !== "__proto__") { expect(b).toBe(`${first}_2`); expect(c).toBe(`${first}_3`); }
    for (const id of [a, b, c]) {
      expect(dbmlIdentifierPattern.test(id)).toBe(true);
      expect(dbmlIdentifierToken.exec(id)?.[0]).toBe(id);
      const source = `Table users { id int }\nTableGroup ${id} { users }`;
      expect(parseDbml(source, "id.dbml").diagnostics).toEqual([]);
      expect(dbmlTableGroups(source)[0]?.name).toBe(id);
    }
  });
});
