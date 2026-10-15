import { useId, useState } from "react";
import type { PresentationDocument, SchemaGraph } from "@dbcodex/core";
import { groupTables, setNodePosition, defaultPosition } from "./presentation-commands.js";
import { applyDbmlPatch, assertTablesUngrouped, dbmlTableReference, previewDbmlBlock } from "./dbml-patches.js";
import { allocateDbmlIdentifier } from "./dbml-identifiers.js";

export function GroupCreation({ graph, presentation, source, selectedIds, onPresentationChange, onSourceChange, onClose, readOnly = false }: {
  graph: SchemaGraph; presentation: PresentationDocument; source: string; selectedIds: string[];
  onPresentationChange(value: PresentationDocument): void; onSourceChange(value: string): void;
  onClose(): void; readOnly?: boolean;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#326b91");
  const [error, setError] = useState("");
  const titleId = useId();
  const viewId = presentation.activeViewId, view = presentation.views[viewId]!;
  const tables = graph.tables.filter(table => selectedIds.includes(table.id) && (view.system || view.nodes[table.id]));
  return <form className="group-create-popover nodrag nopan" role="dialog" aria-labelledby={titleId} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
  }} onSubmit={event => {
    event.preventDefault();
    if (readOnly || !name.trim() || !tables.length) return;
    try {
      const existing = assertTablesUngrouped(source, tables);
      const id = allocateDbmlIdentifier(name, { ...Object.fromEntries(existing.map(group => [group.name, true])), ...view.groups });
      const positioned = tables.reduce((value, table) => view.nodes[table.id] ? value : setNodePosition(value, viewId, table.id, defaultPosition(graph.tables.findIndex(item => item.id === table.id))), presentation);
      const next = groupTables(positioned, viewId, { id, name: name.trim(), color, tableIds: tables.map(table => table.id) });
      const block = `TableGroup ${id} [color: ${color}] {\n${tables.map(table => `  ${dbmlTableReference(table)}`).join("\n")}\n}`;
      const text = applyDbmlPatch(source, previewDbmlBlock(source, "TableGroup", id, block));
      onSourceChange(text); onPresentationChange(next); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Création impossible."); }
  }}>
    <header><strong id={titleId}>Créer un groupe</strong><span>{tables.length} {tables.length === 1 ? "table sélectionnée" : "tables sélectionnées"}</span></header>
    <label>Nom du groupe<input autoFocus aria-label="Nom du groupe" placeholder="Ex. Gestion clients" value={name} maxLength={120} disabled={readOnly} onChange={event => setName(event.target.value)} /></label>
    <label className="group-create-color">Couleur du groupe<input type="color" aria-label="Couleur du groupe" value={color} disabled={readOnly} onChange={event => setColor(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <footer><button type="button" onClick={onClose}>Annuler</button><button className="group-create-submit" type="submit" disabled={readOnly || !name.trim() || !tables.length}>Créer le groupe</button></footer>
  </form>;
}
