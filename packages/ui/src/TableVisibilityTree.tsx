import { useEffect, useRef, useState } from "react";
import type { GraphTable, PresentationDocument } from "@dbcodex/core";
import { tableHeaderTextColor } from "./TableNode.js";

function GroupVisibility({ label, shown, total, disabled, onChange }: { label: string; shown: number; total: number; disabled: boolean; onChange(show: boolean): void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = shown > 0 && shown < total; }, [shown, total]);
  return <input ref={input} type="checkbox" aria-label={`Afficher ${label}`} checked={shown === total} disabled={disabled} onChange={event => onChange(event.target.checked)} />;
}

export function TableVisibilityTree({ tables, view, matches, selectedIds, readOnly, onVisibility, onSelect }: {
  tables: GraphTable[]; view: PresentationDocument["views"][string]; matches: Set<string>; selectedIds: string[]; readOnly: boolean;
  onVisibility(ids: string[], show: boolean): void; onSelect(id: string): void;
}) {
  const [groupBy, setGroupBy] = useState("schemas");
  const hidden = (id: string) => view.nodes[id]?.hidden ?? (!view.system && !Object.hasOwn(view.nodes, id));
  const buckets = groupBy === "groups"
    ? [...Object.entries(view.groups).map(([id, group]) => ({ id, name: group.name, color: group.color, tables: tables.filter(table => group.tableIds.includes(table.id)) })),
      { id: "ungrouped", name: "Sans groupe", color: "#68788b", tables: tables.filter(table => !Object.values(view.groups).some(group => group.tableIds.includes(table.id))) }]
    : [...new Set(tables.map(table => table.schema))].map(schema => ({ id: schema, name: schema, color: "#68788b", tables: tables.filter(table => table.schema === schema) }));
  return <><div className="tree-grouping"><label>Regrouper les tables<select aria-label="Regrouper les tables" value={groupBy} onChange={event => setGroupBy(event.target.value)}><option value="groups">Groupes de tables</option><option value="schemas">Schémas</option></select></label><GroupVisibility label="toutes les tables" shown={tables.filter(table => !hidden(table.id)).length} total={tables.length} disabled={readOnly || !tables.length} onChange={show => onVisibility(tables.map(table => table.id), show)} /></div>
    {!tables.some(table => matches.has(table.id)) && <p>Aucune table ne correspond à la recherche.</p>}
    <ul className="table-tree" aria-label="Tables de la vue">{buckets.filter(bucket => bucket.tables.some(table => matches.has(table.id))).map(bucket => {
      const filtered = bucket.tables.filter(table => matches.has(table.id));
      const shown = filtered.filter(table => !hidden(table.id)).length;
      const allShown = bucket.tables.filter(table => !hidden(table.id)).length;
      return <li key={bucket.id}><details open><summary><span className="tree-group-name" style={{ color: bucket.color }}>{bucket.name}</span><span className="tree-count">{shown}/{filtered.length}</span><span onClick={event => event.stopPropagation()}><GroupVisibility label={`le groupe ${bucket.name}`} shown={allShown} total={bucket.tables.length} disabled={readOnly} onChange={show => onVisibility(bucket.tables.map(table => table.id), show)} /></span></summary>
        <ul>{bucket.tables.filter(table => matches.has(table.id)).map(table => {
          const color = view.nodes[table.id]?.color ?? table.headerColor ?? Object.values(view.groups).find(group => group.tableIds.includes(table.id))?.color ?? "#326b91";
          const isHidden = hidden(table.id);
          return <li key={table.id} className={isHidden ? "tree-table-hidden" : ""}><input type="checkbox" aria-label={`Afficher ${table.id}`} disabled={readOnly} checked={!isHidden} onChange={event => onVisibility([table.id], event.target.checked)} /><button type="button" aria-label={`Centrer ${table.id}`} aria-pressed={selectedIds.includes(table.id)} onClick={() => onSelect(table.id)}><span className="tree-table-icon" style={{ background: color, color: tableHeaderTextColor(color) }} aria-hidden="true">▤</span><span title={table.id}>{table.name}</span></button></li>;
        })}</ul></details></li>;
    })}</ul></>;
}
