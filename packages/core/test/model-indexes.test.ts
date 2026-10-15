import { describe, expect, it } from "vitest";
import { parseDbml } from "../src/dbml-adapter.js";
import { emptyProjectModel, lookupDisplayColumns, modelDiagnostics, reconcileProjectModel } from "../src/project-model.js";

describe("indexed model relations", () => {
  it("counts a self-reference once and preserves ambiguous and missing lookup recovery", () => {
    const graph = parseDbml("Table node { id int [pk]\n parent int }\nRef: node.parent > node.id", "self.dbml").graph!;
    const model = emptyProjectModel({ mode: "sharepoint" });
    model.tables["public.node"] = { displayName: "Node", kind: "list", columns: {
      parent: { displayName: "Parent", lookup: { targetTableId: "missing" } },
    } };
    const before = structuredClone(model);
    const resolved = reconcileProjectModel(graph, model)!;
    expect(resolved.tables["public.node"]!.columns.parent!.lookup).toMatchObject({ targetTableId: "public.node", targetColumn: "id", unresolved: false });
    expect(model).toEqual(before);
    const duplicate = { ...graph, relations: [...graph.relations, { ...graph.relations[0]!, id: "another" }] };
    expect(reconcileProjectModel(duplicate, model)!.tables["public.node"]!.columns.parent!.lookup!.unresolved).toBe(true);
    expect(reconcileProjectModel({ ...graph, relations: [] }, model)!.tables["public.node"]!.columns.parent!.lookup!.unresolved).toBe(true);
  });
  it("uses the same display-column rules in diagnostics and the lookup picker", () => {
    const graph = parseDbml("Table target { label Text\n count Number\n multi Lookup }\nTable owner { good Lookup\n bad Lookup }", "display.dbml").graph!;
    const model = emptyProjectModel({ mode: "sharepoint" });
    model.tables["public.target"] = { displayName: "Target", kind: "list", columns: {
      multi: { displayName: "Multiple", lookup: { targetTableId: "public.owner", multiple: true } },
    } };
    model.tables["public.owner"] = { displayName: "Owner", kind: "list", columns: {
      good: { displayName: "Good", lookup: { targetTableId: "public.target", displayColumn: "label" } },
      bad: { displayName: "Bad", lookup: { targetTableId: "public.target", displayColumn: "multi" } },
    } };
    expect(lookupDisplayColumns(graph, model, "public.target").map(c => c.name)).toEqual(["count", "label"]);
    expect(modelDiagnostics(graph, model)).toEqual([{ severity: "warning", message: "Bad : colonne affichée introuvable ou incompatible." }]);
  });
});
