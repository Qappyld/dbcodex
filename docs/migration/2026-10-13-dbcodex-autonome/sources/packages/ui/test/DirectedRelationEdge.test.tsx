// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DirectedRelationEdge, orthogonalPath } from "../src/DirectedRelationEdge.js";
import { Position } from "@xyflow/react";
import { useState } from "react";
import { parseDbml } from "../../core/src/dbml-adapter.js";
afterEach(cleanup);
describe("DirectedRelationEdge", () => {
  it("drags a relation control in diagram coordinates and commits once on release", () => {
    const route = vi.fn();
    const { container } = render(<svg><DirectedRelationEdge id="ref:1" source="a" target="b" sourceX={0} sourceY={0} targetX={100} targetY={80}
      sourcePosition={Position.Right} targetPosition={Position.Left} selected data={{ sourceCardinality: "*", targetCardinality: "1", points: [{ x: 30, y: 40 }], onRoute: route, onReset: vi.fn(),
        screenToFlowPosition: ({ x, y }) => ({ x: x / 2 - 10, y: y / 2 - 20 }) }} /></svg>);
    const point = screen.getByRole("button", { name: "Point de routage 1" });
    const capture = vi.fn(), release = vi.fn();
    Object.defineProperties(point, { setPointerCapture: { value: capture }, releasePointerCapture: { value: release } });
    fireEvent.pointerDown(point, { pointerId: 4, clientX: 80, clientY: 120 });
    fireEvent.pointerMove(point, { pointerId: 4, clientX: 120, clientY: 160 });
    expect(route).not.toHaveBeenCalled();
    expect(container.querySelector(".relation-control")!.getAttribute("cx")).toBe("50");
    fireEvent.pointerUp(point, { pointerId: 4, clientX: 120, clientY: 160 });
    expect(capture).toHaveBeenCalledWith(4); expect(release).toHaveBeenCalledWith(4);
    expect(route).toHaveBeenCalledExactlyOnceWith([{ x: 50, y: 60 }]);
  });
  it("keeps reset accessible for a self relation with a single saved control point", () => {
    const reset = vi.fn();
    render(<svg><DirectedRelationEdge id="self" source="public.users" target="public.users" sourceX={220} sourceY={70} targetX={0} targetY={70}
      sourcePosition={Position.Right} targetPosition={Position.Left} selected data={{ sourceCardinality: "*", targetCardinality: "1", points: [{ x: 300, y: 200 }],
        sourceBounds: { x: 0, y: 0, width: 220, height: 140 }, onRoute: vi.fn(), onReset: reset }} /></svg>);
    fireEvent.click(screen.getByRole("button", { name: "Routage automatique" })); expect(reset).toHaveBeenCalled();
  });
  it.each([
    [Position.Right, Position.Left, { x: 220, y: 70 }, { x: 0, y: 70 }],
    [Position.Left, Position.Right, { x: 0, y: 70 }, { x: 220, y: 70 }],
    [Position.Top, Position.Bottom, { x: 110, y: 0 }, { x: 110, y: 140 }],
    [Position.Bottom, Position.Top, { x: 110, y: 140 }, { x: 110, y: 0 }],
    [Position.Right, Position.Top, { x: 220, y: 70 }, { x: 110, y: 0 }],
    [Position.Right, Position.Right, { x: 220, y: 70 }, { x: 220, y: 70 }],
  ])("routes a self relation outside its 220px node from %s to %s and restores the loop on reset", (sourcePosition, targetPosition, sourcePoint, targetPoint) => {
    const parsed = parseDbml("Table users {\n id int [pk]\n manager_id int\n}\nRef: users.manager_id > users.id", "self.dbml");
    expect(parsed.diagnostics).toEqual([]);
    const relation = parsed.graph!.relations[0]!;
    function SelfEdge() {
      const [points, setPoints] = useState<Array<{ x: number; y: number }>>([]);
      return <svg><DirectedRelationEdge id={relation.id} source={relation.source.tableId} target={relation.target.tableId}
        sourceX={sourcePoint.x} sourceY={sourcePoint.y} targetX={targetPoint.x} targetY={targetPoint.y}
        sourcePosition={sourcePosition} targetPosition={targetPosition} selected data={{ sourceCardinality: "*", targetCardinality: "1", points,
          sourceBounds: { x: 0, y: 0, width: 220, height: 140 }, onRoute: setPoints, onReset: () => setPoints([]) }} /></svg>;
    }
    const { container } = render(<SelfEdge />);
    const assertExternalLoop = () => {
      const controls = screen.getAllByRole("button", { name: /Point de routage/ });
      expect(controls.length).toBeGreaterThan(1);
      for (const point of controls) {
        const x = Number(point.getAttribute("cx")), y = Number(point.getAttribute("cy"));
        expect(x < 0 || x > 220 || y < 0 || y > 140).toBe(true);
      }
      const path = container.querySelector(".react-flow__edge-path")!.getAttribute("d")!;
      const vertices = [...path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
      for (let i = 1; i < vertices.length; i++) {
        const a = vertices[i - 1]!, b = vertices[i]!;
        expect(a.x === b.x || a.y === b.y).toBe(true);
        const crossesInterior = a.x === b.x ? a.x > 0 && a.x < 220 && Math.min(a.y, b.y) < 140 && Math.max(a.y, b.y) > 0
          : a.y > 0 && a.y < 140 && Math.min(a.x, b.x) < 220 && Math.max(a.x, b.x) > 0;
        expect(crossesInterior).toBe(false);
      }
      return path;
    };
    const automatic = assertExternalLoop();
    fireEvent.keyDown(screen.getByRole("button", { name: "Point de routage 1" }), { key: "ArrowRight" });
    expect(container.querySelector(".react-flow__edge-path")!.getAttribute("d")).not.toBe(automatic);
    fireEvent.click(screen.getByRole("button", { name: "Routage automatique" }));
    expect(assertExternalLoop()).toBe(automatic);
  });
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
