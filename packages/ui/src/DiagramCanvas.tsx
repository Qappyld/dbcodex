import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, Panel, applyNodeChanges, applyEdgeChanges, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import type { GraphRelation, GraphRelationEnd, PresentationDocument, SchemaGraph } from "@dbcodex/core";
import { TableNode, type TableFlowNode } from "./TableNode.js";
import { DirectedRelationEdge, type RelationEdge } from "./DirectedRelationEdge.js";
import { defaultPosition, searchTables, setNodePosition, setRelationRoute, resetRelationRoute, setViewport, updateGroup } from "./presentation-commands.js";
import "@xyflow/react/dist/style.css";

type GroupFlowNode = Node<{ name: string; collapsed: boolean; color: string; onToggle(): void; readOnly: boolean }, "tableGroup">;
type CanvasNode = TableFlowNode | GroupFlowNode;
function GroupNode({ data }: NodeProps<GroupFlowNode>) {
  return <div className="flow-group" style={{ borderColor: data.color }}><button type="button" className="nodrag nopan" disabled={data.readOnly} aria-expanded={!data.collapsed} onClick={data.onToggle}>{data.name}</button></div>;
}
const nodeTypes = { table: TableNode, tableGroup: GroupNode };
const edgeTypes = { directed: DirectedRelationEdge };

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
  onSelectedTablesChange?(tableIds: string[]): void;
  query?: string;
  focusRequest?: { id: string; nonce: number } | null;
  readOnly?: boolean;
}

export function DiagramCanvas({ graph, presentation, onPresentationChange, onSelectionChange, onSelectedTablesChange, query = "", focusRequest, readOnly = false }: DiagramCanvasProps) {
  const view = presentation.views[presentation.activeViewId]!;
  const selected = useRef<string[]>([]);
  const selectedEdge = useRef<string | null>(null);
  const consumedFocus = useRef<number | null>(null);
  const [instance, setInstance] = useState<ReactFlowInstance<CanvasNode, RelationEdge> | null>(null);
  const [minimap, setMinimap] = useState(graph.tables.length > 25);
  const largeGraph = graph.tables.length > 25;
  useEffect(() => { if (largeGraph) setMinimap(true); }, [largeGraph]);
  const reportSelection = useCallback(({ nodes: selection }: { nodes: CanvasNode[] }) => {
    selected.current = selection.filter((node) => node.type === "table").map((node) => node.id);
    onSelectionChange?.(selected.current[0] ?? null);
    onSelectedTablesChange?.(selected.current);
  }, [onSelectionChange, onSelectedTablesChange]);
  const mappedNodes = useMemo<CanvasNode[]>(() => {
    const matches = new Set(searchTables(graph, view, query));
    const tables: TableFlowNode[] = graph.tables.map((table, index) => {
    const saved = view.nodes[table.id];
    return { id: table.id, type: "table", position: saved ? { x: saved.x, y: saved.y }
      : defaultPosition(index),
    hidden: (!view.system && !saved) || (saved?.hidden ?? false) || Object.values(view.groups).some((group) => group.collapsed && group.tableIds.includes(table.id)),
    ariaLabel: `Table ${table.id}`, selected: selected.current.includes(table.id), style: { opacity: matches.has(table.id) ? 1 : 0.25 },
    data: { table, detail: saved?.detail ?? view.defaultDetail,
      foreignKeys: graph.relations.map(foreignKeyEndpoint)
        .flatMap((endpoint) => endpoint?.tableId === table.id ? endpoint.columnNames : []) },
    };
    });
    const groups: GroupFlowNode[] = Object.entries(view.groups).flatMap(([id, group]) => {
      const members = tables.filter((table) => group.tableIds.includes(table.id) && (view.system || view.nodes[table.id]) && !view.nodes[table.id]?.hidden);
      if (!members.length) return [];
      const x = Math.min(...members.map((node) => node.position.x)) - 20, y = Math.min(...members.map((node) => node.position.y)) - 50;
      return [{ id: `group:${id}`, type: "tableGroup", position: { x, y }, draggable: false, selectable: false, zIndex: -1,
        style: { width: group.collapsed ? 240 : Math.max(...members.map((node) => node.position.x + 240)) - x,
          height: group.collapsed ? 50 : Math.max(...members.map((node) => node.position.y + 100 + (node.data.detail === "all" ? node.data.table.columns.length : node.data.detail === "names" ? 0 : node.data.table.columns.filter((column) => column.primaryKey || node.data.foreignKeys.includes(column.name)).length) * 28)) - y },
        data: { name: group.name, color: group.color, collapsed: group.collapsed ?? false, readOnly,
          onToggle: () => { if (!readOnly) onPresentationChange(updateGroup(presentation, presentation.activeViewId, id, { collapsed: !group.collapsed })); } } }];
    });
    return [...groups, ...tables];
  }, [graph, view, query, readOnly, presentation, onPresentationChange]);
  const [nodes, setNodes] = useState(mappedNodes);
  useEffect(() => { setNodes(mappedNodes); }, [mappedNodes]);
  const mappedEdges = useMemo<RelationEdge[]>(() => graph.relations.map((relation) => ({
    id: relation.id, source: relation.source.tableId, target: relation.target.tableId,
    type: "directed", reconnectable: false, selected: selectedEdge.current === relation.id,
    hidden: mappedNodes.some((node) => (node.id === relation.source.tableId || node.id === relation.target.tableId) && node.hidden),
    data: { sourceCardinality: relation.source.cardinality, targetCardinality: relation.target.cardinality, points: view.edges[relation.id]?.points ?? [], readOnly,
      onRoute: (points) => { if (!readOnly) onPresentationChange(setRelationRoute(presentation, presentation.activeViewId, relation.id, points)); },
      onReset: () => { if (!readOnly) onPresentationChange(resetRelationRoute(presentation, presentation.activeViewId, relation.id)); } },
  })), [graph, view, presentation, readOnly, onPresentationChange, mappedNodes]);
  const [edges, setEdges] = useState(mappedEdges);
  useEffect(() => { setEdges(mappedEdges); }, [mappedEdges]);

  useEffect(() => {
    if (!focusRequest || !instance || consumedFocus.current === focusRequest.nonce) return;
    const node = mappedNodes.find((item) => item.id === focusRequest.id && !item.hidden);
    if (!node) return;
    consumedFocus.current = focusRequest.nonce;
    selected.current = [node.id];
    setNodes((current) => current.map((item) => ({ ...item, selected: item.id === node.id })));
    void instance.setCenter(node.position.x + 110, node.position.y + 50, { zoom: 1, duration: 0 });
  }, [focusRequest, instance, mappedNodes]);

  const commitPosition = (id: string, position: { x: number; y: number }): void => {
    if (readOnly) return;
    onPresentationChange(setNodePosition(presentation, presentation.activeViewId, id, position));
  };

  return <section className="flow-canvas" aria-label="Diagramme DBML" onKeyDownCapture={(event) => {
    if (readOnly || !(event.target instanceof Element)) return;
    const id = event.target.closest(".react-flow__node")?.getAttribute("data-id");
    const node = nodes.find((item) => item.id === id);
    const delta = event.shiftKey ? 1 : 10;
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
    const offset = offsets[event.key];
    if (!node || node.type !== "table" || !offset || event.target.closest("button, input, select")) return;
    event.preventDefault();
    event.stopPropagation();
    const position = { x: node.position.x + offset[0], y: node.position.y + offset[1] };
    setNodes((current) => current.map((item) => item.id === node.id ? { ...item, position } : item));
    commitPosition(node.id, position);
  }}>
    <ReactFlow<CanvasNode, RelationEdge> key={presentation.activeViewId} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={setInstance}
      nodesConnectable={false} edgesReconnectable={false} nodesDraggable={!readOnly}
      deleteKeyCode={null} selectionKeyCode="Shift" multiSelectionKeyCode="Shift"
      defaultViewport={view.viewport} minZoom={0.1} maxZoom={4}
      onNodesChange={(changes) => setNodes((current) => applyNodeChanges(changes, current))}
      onEdgesChange={(changes) => setEdges((current) => {
        const next = applyEdgeChanges(changes, current);
        selectedEdge.current = next.find((edge) => edge.selected)?.id ?? null;
        return next;
      })}
      onSelectionChange={reportSelection}
      onNodeDragStop={(_event, node, moved) => {
        if (readOnly) return;
        const targets = moved.length ? moved : [node];
        const next = targets.filter((item) => item.type === "table").reduce((value, item) => setNodePosition(value, presentation.activeViewId, item.id, item.position), presentation);
        onPresentationChange(next);
      }}
      onNodeClick={(_event, node) => { if (node.type === "table") onSelectionChange?.(node.id); }}
      onMoveEnd={(_event, viewport) => {
        if (!readOnly && (viewport.x !== view.viewport.x || viewport.y !== view.viewport.y || viewport.zoom !== view.viewport.zoom))
          onPresentationChange(setViewport(presentation, presentation.activeViewId, viewport));
      }}
      onPaneClick={() => { selected.current = []; onSelectionChange?.(null); onSelectedTablesChange?.([]); }}>
      <Background />
      <Controls showInteractive={false} />
      <Panel position="top-right"><button type="button" aria-expanded={minimap} onClick={() => setMinimap(!minimap)}>{minimap ? "Masquer la mini-carte" : "Afficher la mini-carte"}</button></Panel>
      {minimap && <MiniMap pannable zoomable />}
    </ReactFlow>
  </section>;
}
