import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { DetailLevel, GraphTable } from "@dbcodex/core";

export type TableFlowNode = Node<{
  table: GraphTable;
  detail: DetailLevel;
  foreignKeys: string[];
  selectedColumnId?: string | undefined;
  onSelectColumn?(id: string): void;
}, "table">;

export function TableNode({ data, selected }: NodeProps<TableFlowNode>) {
  const columns = data.detail === "names" ? [] : data.table.columns.filter((column) =>
    data.detail === "all" || column.primaryKey || data.foreignKeys.includes(column.name));
  const hidden = data.table.columns.length - columns.length;
  return <article className={`flow-table${selected ? " is-selected" : ""}`}>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <header>{data.table.id}</header>
    {columns.length > 0 && <ul>{columns.map((column) => <li key={column.id}>
      <span className="column-key">{column.primaryKey ? "PK" : data.foreignKeys.includes(column.name) ? "FK" : ""}</span>
      <button type="button" className="nodrag nopan column-select" aria-label={`Champ ${column.id}`} aria-pressed={data.selectedColumnId === column.id}
        onClick={(event) => { event.stopPropagation(); data.onSelectColumn?.(column.id); }}>{column.name}</button><span className="column-type">{column.type}</span>
    </li>)}</ul>}
    {data.detail === "keys" && hidden > 0 && <footer>+{hidden} champs masqués</footer>}
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </article>;
}
