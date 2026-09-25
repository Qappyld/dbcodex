// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SchemaGraph } from "@dbcodex/core";
import { DiagramApp } from "../src/DiagramApp.js";

afterEach(cleanup);

const graph: SchemaGraph = {
  sourcePath: "fixtures/basic.dbml",
  tables: [
    { id: "public.posts", schema: "public", name: "posts", columns: [{ id: "public.posts.id", name: "id", type: "int", primaryKey: true, nullable: false }] },
    { id: "public.users", schema: "public", name: "users", columns: [{ id: "public.users.id", name: "id", type: "int", primaryKey: true, nullable: false }] },
  ],
  relations: [{
    id: "ref:1",
    source: { tableId: "public.posts", columnNames: ["id"], cardinality: "*" },
    target: { tableId: "public.users", columnNames: ["id"], cardinality: "1" },
  }],
};

describe("DiagramApp", () => {
  it("renders saved positions with accessible controls", () => {
    render(<DiagramApp graph={graph} saved={{ "public.posts": { x: 120, y: 80 } }} save={vi.fn()} />);

    expect(screen.getByText("fixtures/basic.dbml")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Valid DBML");
    expect(screen.getByRole("button", { name: "Recenter" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Table public.posts" }).getAttribute("transform")).toBe("translate(120 80)");
    expect(screen.getByLabelText("DBML diagram").querySelectorAll("line")).toHaveLength(1);
  });

  it("moves a focused table by keyboard and saves once", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<DiagramApp graph={graph} saved={{ "public.posts": { x: 120, y: 80 } }} save={save} />);
    const table = screen.getByRole("group", { name: "Table public.posts" });

    fireEvent.keyDown(table, { key: "ArrowRight" });

    expect(table.getAttribute("transform")).toBe("translate(130 80)");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("public.posts", { x: 130, y: 80 });
  });

  it("moves a table with the pointer and saves on release", () => {
    Object.defineProperty(SVGElement.prototype, "setPointerCapture", { value: vi.fn(), configurable: true });
    const save = vi.fn().mockResolvedValue(undefined);
    render(<DiagramApp graph={graph} saved={{ "public.posts": { x: 120, y: 80 } }} save={save} />);
    const table = screen.getByRole("group", { name: "Table public.posts" });

    fireEvent.pointerDown(table, { pointerId: 1, clientX: 130, clientY: 90 });
    fireEvent.pointerMove(table, { pointerId: 1, clientX: 180, clientY: 140 });
    fireEvent.pointerUp(table, { pointerId: 1, clientX: 180, clientY: 140 });

    expect(table.getAttribute("transform")).toBe("translate(170 130)");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("public.posts", { x: 170, y: 130 });
  });
});
