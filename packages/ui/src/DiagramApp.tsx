import { useEffect, useMemo, useRef, useState } from "react";
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
  warnings?: string[];
}

const TABLE_WIDTH = 220;
const HEADER_HEIGHT = 42;
const ROW_HEIGHT = 24;
const DEFAULT_VIEW_BOX = "0 0 1000 700";

function pointerInSvg(event: PointerEvent<SVGGElement>): Position {
  const svg = event.currentTarget.ownerSVGElement;
  const matrix = svg && typeof svg.getScreenCTM === "function"
    ? svg.getScreenCTM()?.inverse()
    : null;
  if (!matrix) {
    return { x: event.clientX, y: event.clientY };
  }
  return {
    x: matrix.a * event.clientX + matrix.c * event.clientY + matrix.e,
    y: matrix.b * event.clientX + matrix.d * event.clientY + matrix.f,
  };
}

export function DiagramApp({ graph, saved, save, warnings = [] }: DiagramAppProps) {
  const centered = useMemo(
    () =>
      Object.fromEntries(
        graph.tables.map((table, index) => [
          table.id,
          {
            x: 40 + (index % 3) * 280,
            y: 60 + Math.floor(index / 3) * 220,
          },
        ]),
      ),
    [graph],
  );
  const initial = useMemo(
    () => Object.fromEntries(
      graph.tables.map((table) => [table.id, saved[table.id] ?? centered[table.id]]),
    ) as Record<string, Position>,
    [centered, graph, saved],
  );
  const [positions, setPositions] = useState<Record<string, Position>>(initial);
  const [viewBox, setViewBox] = useState(DEFAULT_VIEW_BOX);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingIds = useRef(new Set<string>());
  const [drag, setDrag] = useState<{
    id: string;
    dx: number;
    dy: number;
    start: Position;
  } | null>(null);

  useEffect(() => {
    setPositions(initial);
    setViewBox(DEFAULT_VIEW_BOX);
    setSaveMessage("");
    setSaveError(null);
    pendingIds.current.clear();
  }, [initial]);

  const move = (id: string, position: Position): void => {
    setPositions((current) => ({ ...current, [id]: position }));
  };

  const persist = async (
    id: string,
    position: Position,
    previous: Position,
  ): Promise<void> => {
    if (pendingIds.current.has(id)) {
      return;
    }
    pendingIds.current.add(id);
    setSaveMessage("Saving…");
    setSaveError(null);
    try {
      await save(id, position);
      setSaveMessage("Saved");
    } catch {
      move(id, previous);
      setSaveMessage("");
      setSaveError("Position not saved. Try again.");
    } finally {
      pendingIds.current.delete(id);
    }
  };

  const handlePointerDown = (
    event: PointerEvent<SVGGElement>,
    id: string,
  ): void => {
    if (pendingIds.current.has(id)) {
      return;
    }
    const position = positions[id];
    if (!position) {
      return;
    }
    const pointer = pointerInSvg(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id,
      dx: pointer.x - position.x,
      dy: pointer.y - position.y,
      start: position,
    });
  };

  const handlePointerMove = (event: PointerEvent<SVGGElement>): void => {
    if (!drag) {
      return;
    }
    const pointer = pointerInSvg(event);
    move(drag.id, {
      x: pointer.x - drag.dx,
      y: pointer.y - drag.dy,
    });
  };

  const finishDrag = async (): Promise<void> => {
    if (!drag) {
      return;
    }
    const position = positions[drag.id];
    const previous = drag.start;
    setDrag(null);
    if (position) {
      await persist(drag.id, position, previous);
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
    if (!offset || !current || pendingIds.current.has(id)) {
      return;
    }
    event.preventDefault();
    const next = {
      x: current.x + offset.x,
      y: current.y + offset.y,
    };
    move(id, next);
    await persist(id, next, current);
  };

  const recenter = (): void => {
    const bounds = graph.tables.flatMap((table) => {
      const position = positions[table.id];
      return position ? [{
        left: position.x,
        top: position.y,
        right: position.x + TABLE_WIDTH,
        bottom: position.y + HEADER_HEIGHT + table.columns.length * ROW_HEIGHT,
      }] : [];
    });
    if (bounds.length === 0) {
      setViewBox(DEFAULT_VIEW_BOX);
      return;
    }
    const left = Math.min(...bounds.map((item) => item.left)) - 40;
    const top = Math.min(...bounds.map((item) => item.top)) - 40;
    const right = Math.max(...bounds.map((item) => item.right)) + 40;
    const bottom = Math.max(...bounds.map((item) => item.bottom)) + 40;
    setViewBox(`${left} ${top} ${Math.max(320, right - left)} ${Math.max(240, bottom - top)}`);
  };

  const alerts = [...warnings, ...(saveError ? [saveError] : [])];

  return (
    <main className="diagram-shell">
      <header className="diagram-toolbar">
        <div>
          <strong>{graph.sourcePath}</strong>
          <span role="status" className="validation-status">
            Valid DBML
          </span>
          {saveMessage ? <span className="save-status" aria-live="polite">{saveMessage}</span> : null}
        </div>
        <button type="button" onClick={recenter} title="Fit all tables in the viewport">
          Recenter
        </button>
      </header>
      {alerts.length > 0 ? (
        <div role="alert" className="diagram-alert">
          {alerts.map((message) => <p key={message}>{message}</p>)}
        </div>
      ) : null}
      <svg
        className="diagram-canvas"
        aria-label="DBML diagram"
        viewBox={viewBox}
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
