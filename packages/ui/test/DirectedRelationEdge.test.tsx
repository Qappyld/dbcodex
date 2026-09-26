// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DirectedRelationEdge, orthogonalPath } from "../src/DirectedRelationEdge.js";
import { Position } from "@xyflow/react";
afterEach(cleanup);
describe("DirectedRelationEdge", () => {
  it("routes orthogonally through saved points", () => {
    expect(orthogonalPath({ x: 0, y: 0 }, { x: 100, y: 80 }, [{ x: 30, y: 40 }])).toBe("M 0 0 L 30 0 L 30 40 L 100 40 L 100 80");
  });
  it("labels both ends, moves selected points at 10/1px and resets routes", () => {
    const route = vi.fn(), reset = vi.fn();
    render(<svg><DirectedRelationEdge id="ref:1" source="a" target="b" sourceX={0} sourceY={0} targetX={100} targetY={80}
      sourcePosition={Position.Right} targetPosition={Position.Left} selected data={{ sourceCardinality: "*", targetCardinality: "1", points: [{ x: 30, y: 40 }], onRoute: route, onReset: reset }} /></svg>);
    expect(screen.getByText("*")).toBeTruthy(); expect(screen.getByText("1")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "Point de routage 1" }), { key: "ArrowRight" });
    expect(route).toHaveBeenLastCalledWith([{ x: 40, y: 40 }]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Point de routage 1" }), { key: "ArrowDown", shiftKey: true });
    expect(route).toHaveBeenLastCalledWith([{ x: 30, y: 41 }]);
    fireEvent.click(screen.getByRole("button", { name: "Routage automatique" })); expect(reset).toHaveBeenCalled();
  });
  it("has motion disabled by default, enabled only on interaction, and a reduced-motion arrow", () => {
    const css = readFileSync("packages/ui/src/styles.css", "utf8");
    expect(css).toContain("offset-path");
    expect(css).toMatch(/\.directed-relation:hover[^}]*animation-play-state:\s*running/s);
    expect(css).toMatch(/prefers-reduced-motion: reduce[^]*animation:\s*none/);
    expect(css).toContain(".relation-static-arrow");
  });
});
