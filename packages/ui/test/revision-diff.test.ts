import { describe, expect, it } from "vitest";
import { presentation } from "./workbench-fixture.js";
import { summarizeRevisionDiff } from "../src/revision-diff.js";

describe("revision diff", () => {
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
