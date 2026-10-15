import { memo, useLayoutEffect } from "react";
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import type { DetailLevel, GraphTable } from "@dbcodex/core";

export type TableFlowNode = Node<{
  table: GraphTable;
  detail: DetailLevel;
  foreignKeys: string[];
  selectedColumnId?: string | undefined;
  highlightedColumns?: string[];
  connections?: {source: string[]; target: string[]};
  color?: string | undefined;
  nameDisplay?: "display"|"technical"|"both";
  connectable?: boolean;
  onSelectColumn?(id: string): void;
}, "table">;

export function tableHeaderTextColor(color: string): string {
  const linear = (channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const channels = [1, 3, 5].map(offset => linear(parseInt(color.slice(offset, offset + 2), 16) / 255));
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return luminance > 0.179 ? "#111827" : "#ffffff";
}

export const fieldHandle = (type: "source" | "target", side: "left" | "right", name: string) => `${type}-${side}:${encodeURIComponent(name)}`;
function TableNodeComponent({ id, data, selected }: NodeProps<TableFlowNode>) {
  const updateInternals = useUpdateNodeInternals();
  const connectionKey=JSON.stringify(data.connections);
  useLayoutEffect(() => { updateInternals(id); }, [id, data.detail, data.table.columns, data.foreignKeys.join("\0"), connectionKey, updateInternals]);
  const protectedColumns=new Set(data.table.columns.filter(c=>c.system).map(c=>c.name));
  const columnHandles=(name:string)=> (["source","target"] as const).filter(type=>type==="source"&&data.connectable&&!protectedColumns.has(name)||!data.connections || data.connections[type].includes(name)).flatMap(type=>(["left","right"] as const).map(side=><Handle key={`${name}-${type}-${side}`} id={fieldHandle(type,side,name)} type={type} position={side==="left"?Position.Left:Position.Right} isConnectable={type==="source"&&!!data.connectable&&!protectedColumns.has(name)} className={data.connectable&&type==="source"&&!protectedColumns.has(name)?"lookup-handle":undefined}/>));
  const display=(technical:string,name?:string)=>data.nameDisplay==="technical"?technical:data.nameDisplay==="both"&&name&&name!==technical?`${name} · ${technical}`:name??technical;
  const columns = data.detail === "names" ? [] : data.table.columns.filter((column) =>
    data.detail === "all" || column.primaryKey || data.foreignKeys.includes(column.name));
  const hidden = data.table.columns.length - columns.length;
  const color = data.color ?? "#326b91";
  const titleColor = tableHeaderTextColor(color);
  return <article className={`flow-table${selected ? " is-selected" : ""}`}>
    <Handle id="target-left" type="target" position={Position.Left} isConnectable={!!data.connectable} className={data.connectable?"lookup-target":undefined}/>
    <Handle id="target-right" type="target" position={Position.Right} isConnectable={false} />
    <header style={{ background: color, color: titleColor }}>{display(data.table.id,data.table.displayName)}</header>
    {columns.length > 0 && <ul>{columns.map((column) => <li key={column.id} className={data.highlightedColumns?.includes(column.name) ? "is-related-field" : undefined}>
      {columnHandles(column.name)}
      <span className="column-key">{column.primaryKey ? "PK" : data.foreignKeys.includes(column.name) ? "FK" : ""}</span>
      <button type="button" className="nodrag nopan column-select" aria-label={`Champ ${column.id}`} aria-pressed={data.selectedColumnId === column.id}
        onClick={(event) => { event.stopPropagation(); data.onSelectColumn?.(column.id); }}>{display(column.name,column.displayName)}{column.lookup?.unresolved&&<small className="lookup-unresolved">À résoudre</small>}</button><span className="column-type">{column.semanticType??column.type}</span>
    </li>)}</ul>}
    {hidden > 0 && <footer title={`Champs masqués : ${data.table.columns.filter(column=>!columns.includes(column)).map(column=>column.name).join(", ")}`} className={`${data.detail==="names"?"hidden-field-anchors ":""}${data.highlightedColumns?.some(name => !columns.some(column => column.name === name)) ? "is-related-field" : ""}`}>{data.detail!=="names" && `+${hidden} champs masqués`}
      {data.table.columns.filter(column => !columns.includes(column)).flatMap(column => columnHandles(column.name))}
    </footer>}
    <Handle id="source-left" type="source" position={Position.Left} isConnectable={false} />
    <Handle id="source-right" type="source" position={Position.Right} isConnectable={!!data.connectable} className={data.connectable?"lookup-handle":undefined}/>
  </article>;
}
// Position changes are owned by React Flow's wrapper, not the table's content.
export const TableNode=memo(TableNodeComponent,(a,b)=>a.id===b.id&&a.selected===b.selected&&a.data.table===b.data.table&&a.data.detail===b.data.detail&&a.data.color===b.data.color&&a.data.nameDisplay===b.data.nameDisplay&&a.data.connectable===b.data.connectable&&a.data.selectedColumnId===b.data.selectedColumnId&&a.data.connections===b.data.connections&&a.data.foreignKeys===b.data.foreignKeys&&a.data.onSelectColumn===b.data.onSelectColumn&&JSON.stringify(a.data.highlightedColumns)===JSON.stringify(b.data.highlightedColumns));
