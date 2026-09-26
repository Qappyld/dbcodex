import { describe, expect, it } from "vitest";
import { emptyPresentation } from "../../core/src/presentation.js";
import { graph, presentation } from "./workbench-fixture.js";
import { summarizeRevisionDiff } from "../src/revision-diff.js";

describe("revision diff", () => {
  it("counts the first saved move from the implicit canvas position", () => {
    const previous = emptyPresentation(), next = emptyPresentation();
    next.views.all!.nodes["public.users"] = { x: 50, y: 60 };
    expect(summarizeRevisionDiff({ sourceText: "", presentation: previous }, { sourceText: "", presentation: next }, graph))
      .toMatchObject({ movedNodes: 1, changedDetailLevels: 0 });
  });
  it("counts the first detail override without a move when position is the default", () => {
    const previous = emptyPresentation(), next = emptyPresentation();
    next.views.all!.nodes["public.users"] = { x: 40, y: 60, detail: "all" };
    expect(summarizeRevisionDiff({ sourceText: "", presentation: previous }, { sourceText: "", presentation: next }, graph))
      .toMatchObject({ movedNodes: 0, changedDetailLevels: 1 });
  });
  it("counts removing position and detail overrides back to implicit defaults", () => {
    const previous = emptyPresentation(), next = emptyPresentation();
    previous.views.all!.nodes["public.users"] = { x: 50, y: 60, detail: "names" };
    expect(summarizeRevisionDiff({ sourceText: "", presentation: previous }, { sourceText: "", presentation: next }, graph))
      .toMatchObject({ movedNodes: 1, changedDetailLevels: 1 });
  });
  it("does not count serializing or removing effective defaults, using graph table order", () => {
    const implicit = emptyPresentation(), explicit = emptyPresentation();
    explicit.views.all!.nodes["public.teams"] = { x: 320, y: 60, detail: "keys" };
    for (const [previous, next] of [[implicit, explicit], [explicit, implicit]]) {
      expect(summarizeRevisionDiff({ sourceText: "", presentation: previous! }, { sourceText: "", presentation: next! }, graph))
        .toMatchObject({ movedNodes: 0, changedDetailLevels: 0 });
    }
  });
  it("compares the union when each side has a different explicit node", () => {
    const previous = emptyPresentation(), next = emptyPresentation();
    previous.views.all!.nodes["public.teams"] = { x: 320, y: 70, detail: "names" };
    next.views.all!.nodes["public.users"] = { x: 50, y: 60, detail: "all" };
    expect(summarizeRevisionDiff({ sourceText: "", presentation: previous }, { sourceText: "", presentation: next }, graph))
      .toMatchObject({ movedNodes: 2, changedDetailLevels: 2 });
  });
  it("uses stable sorted union fallback positions without graph context", () => {
    const previous = emptyPresentation(), next = emptyPresentation();
    previous.views.all!.nodes.z = { x: 320, y: 60, detail: "keys" };
    next.views.all!.nodes.a = { x: 40, y: 60, detail: "keys" };
    expect(summarizeRevisionDiff({ sourceText: "", presentation: previous }, { sourceText: "", presentation: next }))
      .toMatchObject({ movedNodes: 0, changedDetailLevels: 0 });
    next.views.all!.nodes.a!.x = 50;
    expect(summarizeRevisionDiff({ sourceText: "", presentation: previous }, { sourceText: "", presentation: next }))
      .toMatchObject({ movedNodes: 1, changedDetailLevels: 0 });
  });
  it("handles long shared prefixes without recursive stack growth", () => {
    const prefix = "same\n".repeat(15000), p = presentation();
    expect(summarizeRevisionDiff({ sourceText: prefix + "before", presentation: p }, { sourceText: prefix + "after", presentation: p }).changedLines).toBe(1);
  });
  it("counts line additions, removals and replacements without counting shifted lines", () => {
    const p = presentation();
    expect(summarizeRevisionDiff({ sourceText: "a\nb\nc\nd", presentation: p },
      { sourceText: "intro\na\nB\nc", presentation: p })).toMatchObject({ addedLines: 1, removedLines: 1, changedLines: 1 });
    expect(summarizeRevisionDiff({ sourceText: "a\na\nb", presentation: p },
      { sourceText: "a\nb", presentation: p })).toMatchObject({ addedLines: 0, removedLines: 1, changedLines: 0 });
  });
  it("counts per-view node moves, effective detail changes, routes and view additions/removals", () => {
    const previous = presentation(), next = structuredClone(previous);
    previous.views.old = structuredClone(previous.views.all!);
    next.views.new = structuredClone(next.views.all!);
    next.views.all!.nodes["public.users"] = { x: 100, y: 50, detail: "all" };
    next.views.all!.edges.ref = { points: [{ x: 1, y: 2 }] };
    expect(summarizeRevisionDiff({ sourceText: "", presentation: previous }, { sourceText: "", presentation: next }))
      .toEqual({ addedLines: 0, removedLines: 0, changedLines: 0, movedNodes: 1, changedDetailLevels: 1, changedRoutes: 1, addedViews: 1, removedViews: 1 });
    next.views.all!.nodes["public.users"]!.detail = "keys";
    expect(summarizeRevisionDiff({ sourceText: "", presentation: previous }, { sourceText: "", presentation: next }).changedDetailLevels).toBe(0);
  });
  it("counts default detail changes even in an empty view", () => {
    const previous = presentation(), next = structuredClone(previous);
    previous.views.all!.nodes = {}; next.views.all!.nodes = {}; next.views.all!.defaultDetail = "names";
    expect(summarizeRevisionDiff({ sourceText: "", presentation: previous }, { sourceText: "", presentation: next }).changedDetailLevels).toBe(1);
  });
});
