import { useId, type CSSProperties } from "react";
import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";
import type { Point } from "./presentation-commands.js";

export type RelationEdge = Edge<{ sourceCardinality: string; targetCardinality: string; points: Point[];
  onRoute(points: Point[]): void; onReset(): void; readOnly?: boolean }, "directed">;
export function orthogonalPath(source: Point, target: Point, points: Point[]): string {
  let path = `M ${source.x} ${source.y}`, previous = source;
  for (const point of [...points, target]) { path += ` L ${point.x} ${previous.y} L ${point.x} ${point.y}`; previous = point; }
  return path;
}
export function DirectedRelationEdge({ id, sourceX, sourceY, targetX, targetY, selected, data }: EdgeProps<RelationEdge>) {
  const markerId = `direction-${useId().replaceAll(":", "")}`;
  const points = data?.points.length ? data.points : [{ x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 }];
  const path = orthogonalPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, points);
  return <g className={`directed-relation${selected ? " is-selected" : ""}`}>
    <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="var(--dbc-relation)" /></marker></defs>
    <BaseEdge id={id} path={path} />
    <path className="relation-static-arrow" d={path} markerEnd={`url(#${markerId})`} fill="none" stroke="var(--dbc-relation)" />
    <circle r="3" className="relation-direction-dot" style={{ offsetPath: `path('${path}')` } as CSSProperties} />
    <text className="relation-cardinality" x={sourceX + 10} y={sourceY - 9}>{data?.sourceCardinality}</text>
    <text className="relation-cardinality" x={targetX - 16} y={targetY - 9}>{data?.targetCardinality}</text>
    {selected && !data?.readOnly && <>
      {points.map((point, index) => <circle key={index} className="relation-control nodrag nopan" cx={point.x} cy={point.y} r="7" role="button" tabIndex={0} aria-label={`Point de routage ${index + 1}`}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 1 : 10;
          const offsets: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
          const offset = offsets[event.key]; if (!offset) return; event.preventDefault(); event.stopPropagation();
          data?.onRoute(points.map((value, i) => i === index ? { x: value.x + offset.x, y: value.y + offset.y } : value));
        }} />)}
      <foreignObject x={(sourceX + targetX) / 2 - 80} y={(sourceY + targetY) / 2 + 15} width="180" height="40">
        <button type="button" className="nodrag nopan" onClick={(event) => { event.stopPropagation(); data?.onReset(); }}>Routage automatique</button>
      </foreignObject>
    </>}
  </g>;
}
