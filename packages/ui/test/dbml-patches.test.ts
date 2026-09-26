import { describe, expect, it } from "vitest";
import { allocateDbmlIdentifier, dbmlIdentifierPattern, dbmlIdentifierToken } from "../src/dbml-identifiers.js";
import { dbmlTableGroups, renameDbmlView, removeDbmlBlock, setDbmlGroupColor } from "../src/dbml-patches.js";
import { parseDbml } from "../../core/src/dbml-adapter.js";

describe("generated DBML identifiers", () => {
  it("patches qualified imported view/group names while retaining comments and nested definitions", () => {
    const source = 'Table sales.users { id int }\nTableGroup "sales.people" {\n sales.users\n Note: \'keep\'\n}\nDiagramView "sales.crm" {\n Tables { sales.users }\n}\n// tail';
    const colored = setDbmlGroupColor(source, "sales.people", "#123456");
    expect(colored).toBe(source.replace('"sales.people" {', '"sales.people" [color: #123456] {'));
    expect(parseDbml(colored, "qualified.dbml").diagnostics).toEqual([]);
    const renamed = renameDbmlView(colored, "sales.crm", "clients");
    expect(renamed).toBe(colored.replace('DiagramView "sales.crm"', "DiagramView clients"));
    expect(removeDbmlBlock(renamed, "DiagramView", "clients")).toBe(colored.slice(0, colored.indexOf("DiagramView")) + "\n// tail");
  });
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
