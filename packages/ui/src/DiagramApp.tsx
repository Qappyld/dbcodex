import { useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { SchemaGraph } from "@dbcodex/core";

export interface Position {
  x: number;
  y: number;
}

export type SavePosition = (
  tableId: string,
  position: Position,
) => Promise<void>;

export interface DiagramAppProps {
  graph: SchemaGraph;
  saved: Record<string, Position>;
  save: SavePosition;
}

const TABLE_WIDTH = 220;
const HEADER_HEIGHT = 42;
const ROW_HEIGHT = 24;

export function DiagramApp({ graph, saved, save }: DiagramAppProps) {
  const initial = useMemo(
    () =>
      Object.fromEntries(
        graph.tables.map((table, index) => [
          table.id,
          saved[table.id] ?? {
            x: 40 + (index % 3) * 280,
            y: 60 + Math.floor(index / 3) * 220,
          },
        ]),
      ),
    [graph, saved],
  );
  const [positions, setPositions] = useState<Record<string, Position>>(initial);
  const [drag, setDrag] = useState<{
    id: string;
    dx: number;
    dy: number;
  } | null>(null);

  const move = (id: string, position: Position): void => {
    setPositions((current) => ({ ...current, [id]: position }));
  };

  const handlePointerDown = (
    event: PointerEvent<SVGGElement>,
    id: string,
  ): void => {
    const position = positions[id];
    if (!position) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id,
      dx: event.clientX - position.x,
      dy: event.clientY - position.y,
    });
  };

  const handlePointerMove = (event: PointerEvent<SVGGElement>): void => {
    if (!drag) {
      return;
    }
    move(drag.id, {
      x: event.clientX - drag.dx,
      y: event.clientY - drag.dy,
    });
  };

  const finishDrag = async (): Promise<void> => {
    if (!drag) {
      return;
    }
    const position = positions[drag.id];
    setDrag(null);
    if (position) {
      await save(drag.id, position);
    }
  };

  const handleKeyDown = async (
    event: KeyboardEvent<SVGGElement>,
    id: string,
  ): Promise<void> => {
    const delta = event.shiftKey ? 1 : 10;
    const offsets: Record<string, Position> = {
      ArrowLeft: { x: -delta, y: 0 },
      ArrowRight: { x: delta, y: 0 },
      ArrowUp: { x: 0, y: -delta },
      ArrowDown: { x: 0, y: delta },
    };
    const offset = offsets[event.key];
    const current = positions[id];
    if (!offset || !current) {
      return;
    }
    event.preventDefault();
    const next = {
      x: current.x + offset.x,
      y: current.y + offset.y,
    };
    move(id, next);
    await save(id, next);
  };

  return (
    <main className="diagram-shell">
      <header className="diagram-toolbar">
        <div>
          <strong>{graph.sourcePath}</strong>
          <span role="status" className="validation-status">
            Valid DBML
          </span>
        </div>
        <button type="button" disabled title="The prototype starts centered">
          Recenter
        </button>
      </header>
      <svg
        className="diagram-canvas"
        aria-label="DBML diagram"
        viewBox="0 0 1000 700"
      >
        <g className="relations" aria-hidden="true">
          {graph.relations.map((relation) => {
            const source = positions[relation.source.tableId];
            const target = positions[relation.target.tableId];
            return source && target ? (
              <line
                key={relation.id}
                x1={source.x + TABLE_WIDTH}
                y1={source.y + 30}
                x2={target.x}
                y2={target.y + 30}
              />
            ) : null;
          })}
        </g>
        {graph.tables.map((table) => {
          const position = positions[table.id];
          if (!position) {
            return null;
          }
          return (
            <g
              key={table.id}
              role="group"
              aria-label={`Table ${table.id}`}
              tabIndex={0}
              className="table-node"
              transform={`translate(${position.x} ${position.y})`}
              onPointerDown={(event) => handlePointerDown(event, table.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onKeyDown={(event) => handleKeyDown(event, table.id)}
            >
              <rect
                width={TABLE_WIDTH}
                height={HEADER_HEIGHT + table.columns.length * ROW_HEIGHT}
                rx="6"
              />
              <text x="12" y="26" className="table-title">
                {table.id}
              </text>
              {table.columns.map((column, index) => (
                <text key={column.id} x="12" y={54 + index * ROW_HEIGHT}>
                  {column.primaryKey ? "PK " : ""}
                  {column.name}: {column.type}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </main>
  );
}
