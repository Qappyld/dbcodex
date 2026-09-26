import { useState } from "react";
import type { DetailLevel, PresentationDocument, SchemaGraph } from "@dbcodex/core";
import { createView, duplicateView, renameView, deleteView, setActiveView, setViewDetail, setNodeDetail,
  groupTables, updateGroup, setNodeHidden, setNodePosition, defaultPosition, searchTables } from "./presentation-commands.js";
import { applyDbmlPatch, previewDbmlBlock, type DbmlPatch } from "./dbml-patches.js";

export interface ViewInspectorProps {
  graph: SchemaGraph; presentation: PresentationDocument; source: string; selectedIds: string[]; query: string;
  onQueryChange(value: string): void; onSelectTable(id: string): void;
  onPresentationChange(value: PresentationDocument): void; onSourceChange(value: string): void; readOnly?: boolean;
}
const levels = <><option value="names">Noms</option><option value="keys">Clés</option><option value="all">Tous les champs</option></>;
function nextId(name: string, existing: Record<string, unknown>): string {
  const base = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_]/g, "_") || "nouveau";
  let id = /^[a-z_]/.test(base) ? base : `g_${base}`; let index = 2;
  while (Object.hasOwn(existing, id) || ["__proto__", "constructor", "prototype"].includes(id)) id = `${base}_${index++}`;
  return id;
}
const identifier = (id: string): string => id.split(".").map((part) => `"${part.replaceAll('"', '\\"')}"`).join(".");

export function ViewInspector({ graph, presentation, source, selectedIds, query, onQueryChange, onSelectTable, onPresentationChange, onSourceChange, readOnly = false }: ViewInspectorProps) {
  const viewId = presentation.activeViewId, current = presentation.views[viewId]!;
  const [name, setName] = useState(""); const [groupName, setGroupName] = useState(""); const [color, setColor] = useState("#16a34a");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ patch: DbmlPatch; presentation: PresentationDocument; before: string } | null>(null);
  const run = (operation: () => void): void => { if (readOnly) return; try { operation(); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Modification impossible."); } };
  const change = (operation: () => PresentationDocument): void => run(() => onPresentationChange(operation()));
  // Materialize default positions before a control changes a previously unsaved table.
  const materialized = (): PresentationDocument => graph.tables.reduce((value, table, index) => current.nodes[table.id] || !current.system ? value : setNodePosition(value, viewId, table.id, defaultPosition(index)), presentation);
  const matches = new Set(searchTables(graph, current, query));
  const visible = graph.tables.filter((table) => current.system || Object.hasOwn(current.nodes, table.id));
  const selected = visible.filter((table) => selectedIds.includes(table.id));
  const previewGroup = (): void => run(() => {
    if (!groupName.trim()) throw new Error("Saisissez un nom de groupe.");
    const id = nextId(groupName, current.groups);
    const tableIds = selected.map((table) => table.id);
    const next = groupTables(materialized(), viewId, { id, name: groupName.trim(), color, tableIds });
    const block = `TableGroup ${id} [color: ${color}] {\n${tableIds.map((tableId) => `  ${identifier(tableId)}`).join("\n")}\n}`;
    setPending({ patch: previewDbmlBlock(source, "TableGroup", id, block), presentation: next, before: JSON.stringify(presentation) });
  });
  return <div className="view-inspector">
    <label>Vue<select aria-label="Vue" value={viewId} disabled={readOnly} onChange={(event) => change(() => setActiveView(presentation, event.target.value))}>
      {Object.entries(presentation.views).sort(([a], [b]) => a === "all" ? -1 : b === "all" ? 1 : 0).map(([id, value]) => <option key={id} value={id}>{id === "all" ? "Toutes les tables" : value.name}</option>)}
    </select></label>
    <label>Nom de la vue<input aria-label="Nom de la vue" value={name} disabled={readOnly} onChange={(event) => setName(event.target.value)} /></label>
    <div className="inspector-actions">
      <button type="button" disabled={readOnly || !name.trim()} onClick={() => change(() => createView(materialized(), { id: nextId(name, presentation.views), name: name.trim(), tableIds: selected.length ? selected.map((table) => table.id) : visible.map((table) => table.id) }))}>Nouvelle vue</button>
      <button type="button" disabled={readOnly} onClick={() => change(() => duplicateView(materialized(), viewId, nextId(name || `${current.name}_copie`, presentation.views), name.trim() || `${current.name} — copie`))}>Dupliquer</button>
      <button type="button" disabled={readOnly || current.system || !name.trim()} onClick={() => change(() => renameView(presentation, viewId, name.trim()))}>Renommer</button>
      <button type="button" disabled={readOnly || current.system} onClick={() => change(() => deleteView(presentation, viewId))}>Supprimer</button>
    </div>
    <label>Rechercher<input type="search" aria-label="Rechercher tables, colonnes, groupes et schémas" value={query} onChange={(event) => onQueryChange(event.target.value)} /></label>
    <label>Détail de la vue<select aria-label="Détail de la vue" value={current.defaultDetail} disabled={readOnly} onChange={(event) => change(() => setViewDetail(presentation, viewId, event.target.value as DetailLevel))}>{levels}</select></label>
    {selected.map((table) => <label key={table.id}>Détail de {table.id}<select aria-label={`Détail de ${table.id}`} disabled={readOnly} value={current.nodes[table.id]?.detail ?? "inherit"}
      onChange={(event) => change(() => setNodeDetail(materialized(), viewId, table.id, event.target.value === "inherit" ? null : event.target.value as DetailLevel))}><option value="inherit">Hériter de la vue</option>{levels}</select></label>)}
    <ul className="table-tree" aria-label="Tables de la vue">{[...new Set(visible.map((table) => table.schema ?? "public"))].map((schema) => <li key={schema}><details open><summary>{schema}</summary><ul>{visible.filter((table) => (table.schema ?? "public") === schema && matches.has(table.id)).map((table) => <li key={table.id}>
      <input type="checkbox" aria-label={`Afficher ${table.id}`} disabled={readOnly} checked={!current.nodes[table.id]?.hidden} onChange={(event) => change(() => setNodeHidden(materialized(), viewId, table.id, !event.target.checked))} />
      <button type="button" aria-label={`Centrer ${table.id}`} aria-pressed={selectedIds.includes(table.id)} onClick={() => onSelectTable(table.id)}>{table.name}</button>
    </li>)}</ul></details></li>)}</ul>
    <fieldset disabled={readOnly}><legend>Groupes</legend>
      <label>Nom du groupe<input aria-label="Nom du groupe" value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label>
      <label>Couleur du groupe<input type="color" aria-label="Couleur du groupe" value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <button type="button" disabled={readOnly || !selected.length || !groupName.trim()} onClick={previewGroup}>Grouper</button>
      {Object.entries(current.groups).map(([id, group]) => <div key={id} className="group-control"><span>{group.name}</span>
        <button type="button" aria-expanded={!group.collapsed} onClick={() => change(() => updateGroup(presentation, viewId, id, { collapsed: !group.collapsed }))}>{group.collapsed ? "Développer" : "Réduire"} {group.name}</button>
        <input type="color" aria-label={`Couleur de ${group.name}`} value={group.color} onChange={(event) => change(() => updateGroup(presentation, viewId, id, { color: event.target.value }))} />
      </div>)}
    </fieldset>
    {pending && <section aria-label="Modification DBML proposée"><p>{pending.patch.ambiguous ? "Plage ambiguë : ajout proposé. Vérifiez le diff avant application." : "Vérifiez le groupe proposé dans le DBML."}</p>
      <pre aria-label="Aperçu du patch DBML">{pending.patch.diff}</pre>
      <button type="button" disabled={readOnly} onClick={() => run(() => {
        if (JSON.stringify(presentation) !== pending.before) throw new Error("La présentation a été modifiée. Recréez l’aperçu.");
        const nextSource = applyDbmlPatch(source, pending.patch, true);
        onSourceChange(nextSource); onPresentationChange(pending.presentation); setPending(null);
      })}>Appliquer</button><button type="button" onClick={() => setPending(null)}>Annuler</button>
    </section>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
