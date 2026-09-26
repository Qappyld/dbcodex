import { describe, expect, it } from "vitest";
import {
  decodePresentation,
  emptyPresentation,
  encodePresentation,
  type PresentationDocument,
} from "../src/presentation.js";

const presentation: PresentationDocument = {
  version: 1,
  activeViewId: "all",
  views: {
    all: {
      name: "Toutes les tables",
      system: true,
      defaultDetail: "keys",
      nodes: { "public.users": { x: 20, y: 30, detail: "all" } },
      groups: {},
      edges: {},
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  },
  panels: { editor: 320, inspector: 280, editorCollapsed: false, inspectorCollapsed: false },
};

describe("presentation codec", () => {
  it("round trips a complete version-1 presentation", () => {
    expect(decodePresentation(encodePresentation(presentation))).toEqual(presentation);
  });

  it("creates the default all-tables presentation", () => {
    expect(emptyPresentation()).toEqual({
      ...presentation,
      views: { all: { ...presentation.views.all, nodes: {} } },
    });
  });

  it("serializes equivalent objects in the same key order", () => {
    const first = { ...presentation, views: { z: presentation.views.all, a: presentation.views.all } };
    const second = { ...presentation, views: { a: presentation.views.all, z: presentation.views.all } };
    expect(encodePresentation(first)).toBe(encodePresentation(second));
    expect(encodePresentation(first).indexOf('"a"')).toBeLessThan(encodePresentation(first).indexOf('"z"'));
  });

  it("rejects unknown detail levels", () => {
    const invalid = structuredClone(presentation) as unknown as Record<string, unknown>;
    const views = invalid.views as Record<string, Record<string, unknown>>;
    views.all!.defaultDetail = "summary";
    expect(() => decodePresentation(JSON.stringify(invalid))).toThrow();
  });

  it.each([Infinity, -Infinity, NaN])("rejects non-finite node coordinate %s", (coordinate) => {
    const invalid = structuredClone(presentation);
    invalid.views.all!.nodes["public.users"]!.x = coordinate;
    expect(() => encodePresentation(invalid)).toThrow();
  });

  it.each([0.09, 4.01])("rejects viewport zoom %s outside 0.1..4", (zoom) => {
    const invalid = structuredClone(presentation);
    invalid.views.all!.viewport.zoom = zoom;
    expect(() => encodePresentation(invalid)).toThrow();
  });

  it("rejects unexpected fields and empty IDs", () => {
    const extra = JSON.parse(encodePresentation(presentation)) as Record<string, unknown>;
    extra.unexpected = true;
    expect(() => decodePresentation(JSON.stringify(extra))).toThrow();

    const invalid = structuredClone(presentation);
    invalid.views.all!.nodes[""] = { x: 0, y: 0 };
    expect(() => encodePresentation(invalid)).toThrow();
  });
});
