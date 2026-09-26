import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, Controls, applyNodeChanges, type Edge } from "@xyflow/react";
import type { GraphRelation, GraphRelationEnd, PresentationDocument, SchemaGraph } from "@dbcodex/core";
import { TableNode, type TableFlowNode } from "./TableNode.js";
import "@xyflow/react/dist/style.css";

const nodeTypes = { table: TableNode };

function foreignKeyEndpoint(relation: GraphRelation): GraphRelationEnd | null {
  const one = (cardinality: string): boolean => cardinality === "1" || cardinality === "0..1";
  const many = (cardinality: string): boolean => cardinality === "*" || cardinality.endsWith("..*");
  if (many(relation.source.cardinality) && one(relation.target.cardinality)) return relation.source;
  if (one(relation.source.cardinality) && many(relation.target.cardinality)) return relation.target;
  // DBML uses the second endpoint for one-to-one FKs. The parser also
  // normalizes inline one-to-one refs into this order before the adapter runs.
  if (one(relation.source.cardinality) && one(relation.target.cardinality)) return relation.target;
  // A many-to-many relationship does not define an FK on either table.
  return null;
}

export interface DiagramCanvasProps {
  graph: SchemaGraph;
  presentation: PresentationDocument;
  onPresentationChange(value: PresentationDocument): void;
  onSelectionChange?(tableId: string | null): void;
  readOnly?: boolean;
}

export function DiagramCanvas({ graph, presentation, onPresentationChange, onSelectionChange, readOnly = false }: DiagramCanvasProps) {
  const view = presentation.views[presentation.activeViewId]!;
  const selected = useRef<string | null>(null);
  const mappedNodes = useMemo<TableFlowNode[]>(() => graph.tables.map((table, index) => {
    const saved = view.nodes[table.id];
    return { id: table.id, type: "table", position: saved ? { x: saved.x, y: saved.y }
      : { x: 40 + (index % 3) * 280, y: 60 + Math.floor(index / 3) * 220 },
    hidden: saved?.hidden ?? false, ariaLabel: `Table ${table.id}`, selected: selected.current === table.id,
    data: { table, detail: saved?.detail ?? view.defaultDetail,
      foreignKeys: graph.relations.map(foreignKeyEndpoint)
        .flatMap((endpoint) => endpoint?.tableId === table.id ? endpoint.columnNames : []) },
    };
  }), [graph, view]);
  const [nodes, setNodes] = useState(mappedNodes);
  useEffect(() => { setNodes(mappedNodes); }, [mappedNodes]);
  const edges = useMemo<Edge[]>(() => graph.relations.map((relation) => ({
    id: relation.id, source: relation.source.tableId, target: relation.target.tableId,
    reconnectable: false, selectable: false,
  })), [graph]);

  const commitPosition = (id: string, position: { x: number; y: number }): void => {
    if (readOnly) return;
    onPresentationChange({ ...presentation, views: { ...presentation.views,
      [presentation.activeViewId]: { ...view, nodes: { ...view.nodes, [id]: { ...view.nodes[id], ...position } } },
    } });
  };

  return <section className="flow-canvas" aria-label="Diagramme DBML" onKeyDownCapture={(event) => {
    if (readOnly || !(event.target instanceof Element)) return;
    const id = event.target.closest(".react-flow__node")?.getAttribute("data-id");
    const node = nodes.find((item) => item.id === id);
    const delta = event.shiftKey ? 1 : 10;
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
    const offset = offsets[event.key];
    if (!node || !offset) return;
    event.preventDefault();
    event.stopPropagation();
    const position = { x: node.position.x + offset[0], y: node.position.y + offset[1] };
    setNodes((current) => current.map((item) => item.id === node.id ? { ...item, position } : item));
    commitPosition(node.id, position);
  }}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      nodesConnectable={false} edgesReconnectable={false} nodesDraggable={!readOnly}
      deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null}
      defaultViewport={view.viewport} minZoom={0.1} maxZoom={4}
      onNodesChange={(changes) => setNodes((current) => applyNodeChanges(changes, current))}
      onSelectionChange={({ nodes: selection }) => {
        selected.current = selection[0]?.id ?? null;
        onSelectionChange?.(selected.current);
      }}
      onNodeDragStop={(_event, node) => commitPosition(node.id, node.position)}
      onNodeClick={(_event, node) => { selected.current = node.id; onSelectionChange?.(node.id); }}
      onPaneClick={() => { selected.current = null; onSelectionChange?.(null); }}>
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  </section>;
}
