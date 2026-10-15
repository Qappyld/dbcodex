import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, Panel, SelectionMode, applyNodeChanges, applyEdgeChanges, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import type { GraphRelation, GraphRelationEnd, PresentationDocument, SchemaGraph } from "@dbcodex/core";
import { GroupCreation } from "./GroupCreation.js";
import { ActionIcon } from "./ActionIcon.js";
import { TableNode, fieldHandle, tableHeaderTextColor, type TableFlowNode } from "./TableNode.js";
import { DirectedRelationEdge, type RelationEdge } from "./DirectedRelationEdge.js";
import { defaultPosition, searchTables, setNodePosition, setNodePositions, setRelationRoute, resetRelationRoute, setViewport, updateGroup, setViewDetail } from "./presentation-commands.js";
import { setDbmlGroupColor } from "./dbml-patches.js";
import { allocateDbmlIdentifier } from "./dbml-identifiers.js";
import "@xyflow/react/dist/style.css";
import type { EntitySelection } from "./source-navigation.js";
import { adaptRoute, automaticRoute, connectionSides, routeCrossings, legacyRoute, repairRoute, routeBlocked, type Bounds, type Side } from "./relation-routing.js";
import type { Point } from "./presentation-commands.js";

type GroupFlowNode = Node<{ name: string; collapsed: boolean; color: string; onToggle(): void; readOnly: boolean }, "tableGroup">;
type NoteFlowNode = Node<{ text: string; readOnly: boolean; onChange(text: string): void; onDelete(): void }, "note">;
type CanvasNode = TableFlowNode | GroupFlowNode | NoteFlowNode;
function NoteNode({ data }: NodeProps<NoteFlowNode>) { return <div className="flow-note"><strong>Note</strong><button className="nodrag nopan" disabled={data.readOnly} aria-label="Supprimer la note" onClick={data.onDelete}>×</button><textarea className="nodrag nopan" aria-label="Texte de la note" readOnly={data.readOnly} value={data.text} onChange={event => data.onChange(event.target.value)} /></div>; }
function GroupNode({ data }: NodeProps<GroupFlowNode>) {
  return <div className="flow-group" style={{ borderColor: data.color, background: `color-mix(in srgb, ${data.color} 12%, var(--dbc-surface))` }}><header style={{ background: data.color, color: tableHeaderTextColor(data.color) }}><button type="button" className="nodrag nopan" disabled={data.readOnly} aria-label={`${data.collapsed ? "Développer" : "Réduire"} ${data.name}`} aria-expanded={!data.collapsed} onClick={data.onToggle}><ActionIcon name={data.collapsed ? "chevronRight" : "chevronDown"} /></button><span>{data.name}</span></header></div>;
}
const nodeTypes = { table: TableNode, tableGroup: GroupNode, note: NoteNode };
const edgeTypes = { directed: DirectedRelationEdge };
const EMPTY_POINTS:Point[]=[];
function routingObstacles(nodes: CanvasNode[]): Bounds[] {
  return nodes.filter(node=>!node.hidden&&(node.type==="table"||node.type==="tableGroup")).map(node=>({
    ...node.position,width:node.measured?.width??(typeof node.style?.width==="number"?node.style.width:222),
    height:node.type==="tableGroup"?30:node.measured?.height??140
  }));
}

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
  focusRequest?: { id: string; nonce: number; kind?: EntitySelection["kind"]; tableId?: string } | null;
  selectedEntity?: EntitySelection | null;
  onEntitySelect?(selection: EntitySelection): void;
  readOnly?: boolean;
  source?: string;
  onSourceChange?(source: string): void;
  onQueryChange?(query: string): void;
  onReorganize?(): void;
  onCreateLookup?: ((sourceTableId:string,sourceColumnId:string|undefined,targetTableId:string)=>void)|undefined;
}

export function DiagramCanvas({ graph, presentation, onPresentationChange: notifyPresentation, onSelectionChange, onSelectedTablesChange, onEntitySelect, selectedEntity, query = "", focusRequest, readOnly = false, source = "", onSourceChange, onQueryChange, onReorganize, onCreateLookup }: DiagramCanvasProps) {
  const notifyRef=useRef(notifyPresentation);notifyRef.current=notifyPresentation;
  const onPresentationChange=useCallback((value:PresentationDocument)=>notifyRef.current(value),[]);
  const view = presentation.views[presentation.activeViewId]!;
  const [hoveredRelation, setHoveredRelation] = useState<string | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const routeCache = useRef(new Map<string, { key: string; definition: string; positionsKey: string; viewId: string; obstaclesKey: string; vertices: Point[] }>());
  const inputRef=useRef({presentation,graph,readOnly});inputRef.current={presentation,graph,readOnly};
  const routeRequest=useRef(0);
  const [routingBusy,setRoutingBusy]=useState(false);
  useEffect(()=>()=>{routeRequest.current++;},[]);
  const draggingNodes=useRef(false);
  const routeDecorations=useRef<{key:string;crossings:Map<string,Point[]>}|null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null), [palette, setPalette] = useState(false), [grid, setGrid] = useState(true), [relations, setRelations] = useState(true), [toolError, setToolError] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const groupTrigger = useRef<HTMLButtonElement>(null);
  const closeGroup = () => { setGroupOpen(false); groupTrigger.current?.focus(); };
  useEffect(() => { setGroupOpen(false); setPalette(false); }, [presentation.activeViewId, readOnly]);
  const mutate = (action: () => void) => { try { action(); setToolError(""); } catch (error) { setToolError(error instanceof Error ? error.message : "Modification impossible"); } };
  const colorSelection = (color: string) => mutate(() => {
    if (readOnly) return;
    if (selectedGroup) { onSourceChange?.(setDbmlGroupColor(source, selectedGroup, color)); let next = presentation; for (const [id, current] of Object.entries(presentation.views)) if (current.groups[selectedGroup]) next = updateGroup(next, id, selectedGroup, { color }); onPresentationChange(next); }
    else {
      const indices = new Map(graph.tables.map((table, index) => [table.id, index]));
      const next = setNodePositions(presentation, presentation.activeViewId, selected.current.map(id => ({
        id, position: view.nodes[id] ?? defaultPosition(indices.get(id) ?? -1),
      })));
      for (const id of selected.current) next.views[presentation.activeViewId]!.nodes[id]!.color = color;
      onPresentationChange(next);
    }
  });
  const noteChange = (id: string, change: { text?: string; x?: number; y?: number } | null) => { const next = structuredClone(presentation), current = next.views[next.activeViewId]!; current.notes ??= {}; if (change === null) delete current.notes[id]; else current.notes[id] = { ...(current.notes[id] ?? { x: 100, y: 100, text: "" }), ...change }; onPresentationChange(next); };
  const selected = useRef<string[]>([]);
  const reportedSelection = useRef("");
  const selectedEdge = useRef<string | null>(null);
  const activeRelation = hoveredRelation ?? selectedEdge.current;
  const consumedFocus = useRef<number | null>(null);
  const lastEntity = useRef<string | null>(null);
  const selectionCallbacks = useRef({ onEntitySelect, onSelectionChange, onSelectedTablesChange, selectedEntity });
  selectionCallbacks.current = { onEntitySelect, onSelectionChange, onSelectedTablesChange, selectedEntity };
  const graphIndex=useMemo(()=>{
    const foreignKeys=new Map<string,string[]>(),connections=new Map<string,{source:string[];target:string[]}>(),actions=new Map<string,(columnId:string)=>void>();
    for(const table of graph.tables){foreignKeys.set(table.id,[]);connections.set(table.id,{source:[],target:[]});actions.set(table.id,(columnId)=>{selectionCallbacks.current.onSelectionChange?.(table.id);selectionCallbacks.current.onEntitySelect?.({kind:"column",id:columnId,tableId:table.id});});}
    for(const relation of graph.relations){
      const fk=foreignKeyEndpoint(relation);if(fk)foreignKeys.get(fk.tableId)?.push(...fk.columnNames);
      connections.get(relation.source.tableId)?.source.push(...relation.source.columnNames);
      connections.get(relation.target.tableId)?.target.push(...relation.target.columnNames);
    }
    return {foreignKeys,connections,actions};
  },[graph]);
  const selectEntity = useCallback((selection: EntitySelection) => {
    const key = `${selection.kind}:${selection.id}`;
    lastEntity.current = key; selectionCallbacks.current.onEntitySelect?.(selection);
  }, []);
  const [instance, setInstance] = useState<ReactFlowInstance<CanvasNode, RelationEdge> | null>(null);
  const programmaticMoves=useRef(0);
  const programmaticViewports=useRef<Array<{x:number;y:number;zoom:number}>>([]);
  const instanceRef = useRef(instance); instanceRef.current = instance;
  const { x: viewportX, y: viewportY, zoom: viewportZoom } = view.viewport;
  const viewportKey = `${presentation.activeViewId}:${viewportX}:${viewportY}:${viewportZoom}`;
  const appliedViewport = useRef(viewportKey);
  useEffect(() => {
    if (!instance || appliedViewport.current === viewportKey) return;
    appliedViewport.current = viewportKey;
    const live = instance?.getViewport();
    if (instance && live && (live.x !== viewportX || live.y !== viewportY || live.zoom !== viewportZoom)) {
      programmaticMoves.current++;
      programmaticViewports.current.push({x:viewportX,y:viewportY,zoom:viewportZoom});
      void instance.setViewport({ x: viewportX, y: viewportY, zoom: viewportZoom }, { duration: 0 }).finally(()=>{programmaticMoves.current--;});
    }
  }, [instance, viewportKey, viewportX, viewportY, viewportZoom]);
  const [minimap, setMinimap] = useState(graph.tables.length > 25);
  const largeGraph = graph.tables.length > 25;
  useEffect(() => { if (largeGraph) setMinimap(true); }, [largeGraph]);
  const reportSelection = useCallback(({ nodes: selection }: { nodes: CanvasNode[]; edges: RelationEdge[] }) => {
    const { onSelectionChange, onSelectedTablesChange } = selectionCallbacks.current;
    const ids = selection.filter((node) => node.type === "table").map((node) => node.id);
    selected.current = ids;
    if (ids.join("\0") === reportedSelection.current) return;
    reportedSelection.current = ids.join("\0");
    setSelectionVersion(value => value + 1);
    onSelectionChange?.(selected.current[0] ?? null);
    onSelectedTablesChange?.(selected.current);
  }, []);
  const mappedNodes = useMemo<CanvasNode[]>(() => {
    const matches = new Set(searchTables(graph, view, query));
    const active = graph.relations.find(relation => relation.id === activeRelation);
    const relatedTables = new Set(selected.current);
    const relatedRelations = active ? [active] : graph.relations.filter(relation => selected.current.includes(relation.source.tableId) || selected.current.includes(relation.target.tableId));
    for (const relation of relatedRelations) { relatedTables.add(relation.source.tableId); relatedTables.add(relation.target.tableId); }
    const tables: TableFlowNode[] = graph.tables.map((table, index) => {
    const saved = view.nodes[table.id];
    return { id: table.id, type: "table", position: saved ? { x: saved.x, y: saved.y }
      : defaultPosition(index),
    hidden: (!view.system && !saved) || (saved?.hidden ?? false) || Object.values(view.groups).some((group) => group.collapsed && group.tableIds.includes(table.id)),
    ariaLabel: `Table ${table.id}`, selected: selected.current.includes(table.id), style: { opacity: !matches.has(table.id) ? 0.25 : relatedTables.size && !relatedTables.has(table.id) ? 0.4 : 1 },
    data: { table, detail: selectedEntity?.kind === "column" && selectedEntity.tableId === table.id ? "all" : saved?.detail ?? view.defaultDetail,
      nameDisplay:presentation.nameDisplay??"display",connectable:!!onCreateLookup&&!readOnly,
      color: saved?.color ?? table.headerColor ?? Object.values(view.groups).find(group => group.tableIds.includes(table.id))?.color ?? "#326b91",
      selectedColumnId: selectedEntity?.kind === "column" ? selectedEntity.id : undefined,
      highlightedColumns: relatedRelations.flatMap(relation => [relation.source,relation.target].filter(end => end.tableId === table.id).flatMap(end => end.columnNames)),
      onSelectColumn: graphIndex.actions.get(table.id)!,
      connections: graphIndex.connections.get(table.id)!,
      foreignKeys: graphIndex.foreignKeys.get(table.id)! },
    };
    });
    const groups: GroupFlowNode[] = Object.entries(view.groups).flatMap(([id, group]) => {
      const members = tables.filter((table) => group.tableIds.includes(table.id) && (view.system || view.nodes[table.id]) && !view.nodes[table.id]?.hidden);
      if (!members.length) return [];
      const x = Math.min(...members.map((node) => node.position.x)) - 20, y = Math.min(...members.map((node) => node.position.y)) - 50;
      return [{ id: `group:${id}`, type: "tableGroup", position: { x, y }, draggable: !readOnly, selectable: true, ariaLabel: `Groupe ${group.name}`, zIndex: -1,
        style: { width: group.collapsed ? 240 : Math.max(...members.map((node) => node.position.x + 240)) - x,
          height: group.collapsed ? 50 : Math.max(...members.map((node) => node.position.y + 100 + (node.data.detail === "all" ? node.data.table.columns.length : node.data.detail === "names" ? 0 : node.data.table.columns.filter((column) => column.primaryKey || node.data.foreignKeys.includes(column.name)).length) * 28)) - y },
        data: { name: group.name, color: group.color, collapsed: group.collapsed ?? false, readOnly,
          onToggle: () => { if (!readOnly) onPresentationChange(updateGroup(presentation, presentation.activeViewId, id, { collapsed: !group.collapsed })); } } }];
    });
    const notes: NoteFlowNode[] = Object.entries(view.notes ?? {}).map(([id, note]) => ({ id: `note:${id}`, type: "note", position: { x: note.x, y: note.y }, draggable: !readOnly, data: { text: note.text, readOnly, onChange: text => noteChange(id, { text }), onDelete: () => noteChange(id, null) } }));
    return [...groups, ...tables, ...notes];
  }, [graph, view, query, readOnly, presentation, onPresentationChange, selectedEntity, selectEntity, activeRelation, selectionVersion, graphIndex, onCreateLookup]);
  const [nodes, setNodes] = useState(mappedNodes);
  useEffect(() => { setNodes((current) => {
    const byId = new Map(current.map(node => [node.id, node]));
    return mappedNodes.map(node => ({ ...byId.get(node.id), ...node }));
  }); }, [mappedNodes]);
  const mappedEdges = useMemo<RelationEdge[]>(() => {
    const obstacles = routingObstacles(nodes);
    const obstaclesKey=JSON.stringify(obstacles);
    const liveNodes=new Map(nodes.map(node=>[node.id,node])),savedNodes=new Map(mappedNodes.map(node=>[node.id,node]));
    const routes: Point[][] = [];
    const lanes = new Map<string,number>();
    const result = graph.relations.map<RelationEdge>((relation) => {
    const sourceNode = liveNodes.get(relation.source.tableId);
    const targetNode = liveNodes.get(relation.target.tableId);
    const foreignKey = foreignKeyEndpoint(relation);
    const colorTable = foreignKey?.tableId === relation.source.tableId ? relation.target.tableId : relation.source.tableId;
    const color = savedNodes.get(colorTable)?.data as TableFlowNode["data"] | undefined;
    const forward = relation.source.tableId === relation.target.tableId || !sourceNode || !targetNode || sourceNode.position.x <= targetNode.position.x;
    const saved = view.edges[relation.id];
    const hidden = !!(savedNodes.get(relation.source.tableId)?.hidden || savedNodes.get(relation.target.tableId)?.hidden);
    const legacySides:{sourceSide:Side;targetSide:Side}={sourceSide:forward?"right":"left",targetSide:forward?"left":"right"};
    const defaultSides=sourceNode&&targetNode&&sourceNode.id!==targetNode.id&&(!saved||saved.format==="orthogonal"||saved.mode==="automatic") ? connectionSides({...sourceNode.position,width:sourceNode.measured?.width??222,height:sourceNode.measured?.height??140},{...targetNode.position,width:targetNode.measured?.width??222,height:targetNode.measured?.height??140},obstacles) : legacySides;
    const sourceSide: Side = saved?.sourceSide ?? defaultSides.sourceSide, targetSide: Side = saved?.targetSide ?? defaultSides.targetSide;
    const endpoint = (node: CanvasNode | undefined, end: GraphRelationEnd, side: Side, type: "source" | "target"): Point => {
      const handleId=end.columnNames.length?fieldHandle(type,side,end.columnNames[0]!):`${type}-${side}`;
      const handle = instanceRef.current?.getInternalNode(end.tableId)?.internals.handleBounds?.[type]?.find(handle => handle.id === handleId);
      const tableData = node?.type === "table" ? node.data : undefined;
      const columns = tableData?.table.columns.filter(column => tableData.detail === "all" || tableData.detail === "keys" && (column.primaryKey || tableData.foreignKeys.includes(column.name))) ?? [];
      const index = columns.findIndex(column => column.name === end.columnNames[0]);
      const x=(node?.position.x??0)+(side==="right"?(node?.measured?.width??222):0);
      const y=(node?.position.y??0)+(handle ? handle.y+handle.height/2 : !tableData?.table.columns.some(column=>column.name===end.columnNames[0]) ? (node?.measured?.height??140)/2 : tableData.detail==="names" ? 23 : index>=0 ? 46+4+index*42+21 : 46+columns.length*42+22);
      // DOM measurements vary slightly with zoom; do not create microscopic bends.
      return {x:Math.round(x*100)/100,y:Math.round(y*100)/100};
    };
    const sourcePoint=endpoint(sourceNode,relation.source,sourceSide,"source"),targetPoint=endpoint(targetNode,relation.target,targetSide,"target");
    const pair=[relation.source.tableId,relation.target.tableId].sort().join("\0"), lane=lanes.get(pair)??0;if(!hidden)lanes.set(pair,lane+1);
    const manual=!!saved && saved.mode!=="automatic";
    const definition=JSON.stringify(saved)??"";
    const positionsKey=JSON.stringify([sourceNode?.position,targetNode?.position]);
    const key=JSON.stringify([presentation.activeViewId,sourcePoint,targetPoint,sourceSide,targetSide,saved]);
    const cached=routeCache.current.get(relation.id);
    let vertices: Point[];
    if(hidden) vertices=[sourcePoint,{x:targetPoint.x,y:sourcePoint.y},targetPoint];
    else if(cached?.key===key&&cached.obstaclesKey===obstaclesKey)vertices=cached.vertices;
    else if(draggingNodes.current)vertices=cached ? cached.key===key?cached.vertices:adaptRoute(sourcePoint,targetPoint,cached.vertices.slice(1,-1),sourceSide,targetSide) : saved ? saved.format==="orthogonal"?adaptRoute(sourcePoint,targetPoint,saved.points,sourceSide,targetSide):legacyRoute(sourcePoint,targetPoint,saved.points) : adaptRoute(sourcePoint,targetPoint,[],sourceSide,targetSide);
    else if(manual) vertices=saved.format==="orthogonal" ? repairRoute(adaptRoute(sourcePoint,targetPoint,saved.points,sourceSide,targetSide),obstacles,sourceSide,targetSide) : legacyRoute(sourcePoint,targetPoint,saved.points);
    else if(cached?.key===key && !routeBlocked(cached.vertices,obstacles)) vertices=cached.vertices;
    else if(cached&&cached.positionsKey!==positionsKey&&cached.definition===definition&&cached.viewId===presentation.activeViewId&&!routeBlocked(adaptRoute(sourcePoint,targetPoint,cached.vertices.slice(1,-1),sourceSide,targetSide),obstacles))vertices=adaptRoute(sourcePoint,targetPoint,cached.vertices.slice(1,-1),sourceSide,targetSide);
    else if(saved?.format==="orthogonal" && saved.mode==="automatic" && !routeBlocked(adaptRoute(sourcePoint,targetPoint,saved.points,sourceSide,targetSide),obstacles)) vertices=adaptRoute(sourcePoint,targetPoint,saved.points,sourceSide,targetSide);
    else vertices=automaticRoute(sourcePoint,targetPoint,sourceSide,targetSide,obstacles,routes,lane);
    if(!hidden&&!draggingNodes.current)routeCache.current.set(relation.id,{key,definition,positionsKey,viewId:presentation.activeViewId,obstaclesKey,vertices});
    if(!hidden)routes.push(vertices);
    const emphasized=activeRelation ? relation.id===activeRelation : selected.current.includes(relation.source.tableId)||selected.current.includes(relation.target.tableId);
    return {
    id: relation.id, source: relation.source.tableId, target: relation.target.tableId,
    sourceHandle: sourceNode?.type==="table" && sourceNode.data.table.columns.some(column=>column.name===relation.source.columnNames[0]) ? fieldHandle("source",sourceSide,relation.source.columnNames[0]!) : `source-${sourceSide}`,
    targetHandle: targetNode?.type==="table" && targetNode.data.table.columns.some(column=>column.name===relation.target.columnNames[0]) ? fieldHandle("target",targetSide,relation.target.columnNames[0]!) : `target-${targetSide}`,
    type: "directed", reconnectable: false, selected: selectedEdge.current === relation.id,
    hidden,
    data: { sourceCardinality: relation.source.cardinality, targetCardinality: relation.target.cardinality, points: saved?.points ?? [], vertices, sourceSide, targetSide,
      emphasized, dimmed: !!activeRelation || selected.current.length>0, readOnly, motion: relations || emphasized, color: color?.color ?? "#326b91", zoom: viewportZoom,
      ...(sourceNode ? { sourceBounds: { ...sourceNode.position, width: sourceNode.measured?.width ?? 220, height: sourceNode.measured?.height ?? 140 } } : {}),
      screenToFlowPosition: (point) => instanceRef.current?.screenToFlowPosition(point) ?? point,
      onRoute: (points) => { if (!readOnly) onPresentationChange(setRelationRoute(presentation, presentation.activeViewId, relation.id, points, {format:"orthogonal",mode:"manual",sourceSide,targetSide})); },
      onSide: (end,side) => { if(!readOnly) onPresentationChange(setRelationRoute(presentation,presentation.activeViewId,relation.id,vertices.slice(1,-1),{format:"orthogonal",mode:"manual",sourceSide:end==="source"?side:sourceSide,targetSide:end==="target"?side:targetSide})); },
      onReset: () => { if (!readOnly) onPresentationChange(resetRelationRoute(presentation, presentation.activeViewId, relation.id)); } },
  }; });
    const visible=result.filter(edge=>!edge.hidden),decorationKey=JSON.stringify(visible.map(edge=>[edge.id,edge.data!.vertices]));
    if(!draggingNodes.current&&routeDecorations.current?.key!==decorationKey)routeDecorations.current={key:decorationKey,crossings:routeCrossings(visible.map(edge=>({id:edge.id,points:edge.data!.vertices!})))};
    for (const edge of result) if(edge.data) {
      edge.data.crossings=draggingNodes.current?EMPTY_POINTS:routeDecorations.current?.crossings.get(edge.id)??EMPTY_POINTS;
      if(edge.selected)edge.data.alignments=visible.filter(other=>other.id!==edge.id).flatMap(other=>other.data!.vertices!.flatMap(point=>[{x:point.x-12,y:point.y-12},{x:point.x+12,y:point.y+12}]));
    }
    return result;
  }, [graph, view, presentation, readOnly, onPresentationChange, mappedNodes, nodes, relations, viewportZoom, activeRelation, selectionVersion]);
  const [edges, setEdges] = useState(mappedEdges);
  useEffect(() => { setEdges(mappedEdges); }, [mappedEdges]);
  const recalculateRoutes = async (includeManual: boolean, selectedId: string | null = null) => {
    if(readOnly||routingBusy)return;
    const request=++routeRequest.current;
    const valid=()=>request===routeRequest.current&&inputRef.current.presentation===presentation&&inputRef.current.graph===graph&&!inputRef.current.readOnly;
    setRoutingBusy(true);
    try {
    const next=structuredClone(presentation),current=next.views[next.activeViewId]!;
    const obstacles=routingObstacles(nodes);
    const retained=edges.filter(edge=>!edge.hidden && (selectedId ? edge.id!==selectedId : !includeManual && !!view.edges[edge.id] && view.edges[edge.id]!.mode!=="automatic"));
    const occupied=retained.flatMap(edge=>edge.data?.vertices?[edge.data.vertices]:[]);
    const updates=new Map<string,{key:string;definition:string;positionsKey:string;viewId:string;obstaclesKey:string;vertices:Point[]}>();
    let sliceStart=performance.now();
    for(const edge of edges) {
      if(edge.hidden || selectedId && edge.id!==selectedId || !selectedId && !includeManual && !!view.edges[edge.id] && view.edges[edge.id]!.mode!=="automatic")continue;
      const points=edge.data?.vertices;if(!points?.length)continue;
      const sourceNode=nodes.find(node=>node.id===edge.source),targetNode=nodes.find(node=>node.id===edge.target);
      const sides=!selectedId&&sourceNode&&targetNode&&sourceNode.id!==targetNode.id ? connectionSides({...sourceNode.position,width:sourceNode.measured?.width??222,height:sourceNode.measured?.height??140},{...targetNode.position,width:targetNode.measured?.width??222,height:targetNode.measured?.height??140},obstacles) : {sourceSide:edge.data?.sourceSide??"right",targetSide:edge.data?.targetSide??"left"};
      const {sourceSide,targetSide}=sides;
      const start={...points[0]!,x:sourceNode?Math.round((sourceNode.position.x+(sourceSide==="right"?(sourceNode.measured?.width??222):0))*100)/100:points[0]!.x};
      const end={...points.at(-1)!,x:targetNode?Math.round((targetNode.position.x+(targetSide==="right"?(targetNode.measured?.width??222):0))*100)/100:points.at(-1)!.x};
      const vertices=automaticRoute(start,end,sourceSide,targetSide,obstacles,occupied);
      occupied.push(vertices);
      current.edges[edge.id]={points:vertices.slice(1,-1),format:"orthogonal",mode:"automatic",sourceSide,targetSide};
      const saved=current.edges[edge.id]!;
      updates.set(edge.id,{key:JSON.stringify([presentation.activeViewId,start,end,sourceSide,targetSide,saved]),definition:JSON.stringify(saved),positionsKey:JSON.stringify([sourceNode?.position,targetNode?.position]),viewId:presentation.activeViewId,obstaclesKey:JSON.stringify(obstacles),vertices});
      if(!selectedId&&performance.now()-sliceStart>6){
        await new Promise<void>(resolve=>setTimeout(resolve,0));
        if(!valid())return;
        sliceStart=performance.now();
      }
    }
    // One presentation command preserves reset scope and one-step undo.
    if(valid()){for(const [id,value] of updates)routeCache.current.set(id,value);onPresentationChange(next);}
    } finally {if(request===routeRequest.current)setRoutingBusy(false);}
  };

  useEffect(() => {
    if (!focusRequest || !instance || consumedFocus.current === focusRequest.nonce) return;
    const node = mappedNodes.find((item) => item.id === (focusRequest.tableId ?? focusRequest.id) && !item.hidden);
    if (!node) return;
    consumedFocus.current = focusRequest.nonce;
    lastEntity.current = `${focusRequest.kind ?? "table"}:${focusRequest.id}`;
    selected.current = focusRequest.kind === "relation" ? [] : [node.id];
    selectedEdge.current = focusRequest.kind === "relation" ? focusRequest.id : null;
    setSelectionVersion(value => value+1);
    setNodes((current) => current.map((item) => ({ ...item, selected: focusRequest.kind !== "relation" && item.id === node.id })));
    setEdges((current) => current.map((item) => ({ ...item, selected: item.id === selectedEdge.current })));
    programmaticMoves.current++;
    void instance.setCenter(node.position.x + 110, node.position.y + 50, { zoom: 1, duration: 0 }).then(()=>{programmaticViewports.current.push(instance.getViewport());programmaticViewports.current=programmaticViewports.current.slice(-8);}).finally(()=>{programmaticMoves.current--;});
  }, [focusRequest, instance, mappedNodes]);

  const commitPosition = (id: string, position: { x: number; y: number }): void => {
    if (readOnly) return;
    onPresentationChange(setNodePosition(presentation, presentation.activeViewId, id, position));
  };
  const groupPositions = (node: CanvasNode): CanvasNode[] => {
    const origin = mappedNodes.find((item) => item.id === node.id);
    const group = view.groups[node.id.slice(6)];
    if (!origin || !group) return [];
    return mappedNodes.filter((item) => item.type === "table" && group.tableIds.includes(item.id)).map((item) => ({ ...item,
      position: { x: item.position.x + node.position.x - origin.position.x, y: item.position.y + node.position.y - origin.position.y } }));
  };

  return <section className="flow-canvas" aria-label="Diagramme DBML" onKeyDownCapture={(event) => {
    if (readOnly || !(event.target instanceof Element)) return;
    const id = event.target.closest(".react-flow__node")?.getAttribute("data-id");
    const node = nodes.find((item) => item.id === id);
    const delta = event.shiftKey ? 1 : 10;
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
    const offset = offsets[event.key];
    if (!node || !offset || event.target.closest("button, input, select")) return;
    event.preventDefault();
    event.stopPropagation();
    const position = { x: node.position.x + offset[0], y: node.position.y + offset[1] };
    if (node.type === "note") { noteChange(node.id.slice(5), position); return; }
    setNodes((current) => current.map((item) => item.id === node.id ? { ...item, position } : item));
      if (node.type === "tableGroup") onPresentationChange(setNodePositions(presentation, presentation.activeViewId, groupPositions({ ...node, position })));
    else commitPosition(node.id, position);
  }}>
    <ReactFlow<CanvasNode, RelationEdge> key={presentation.activeViewId} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={setInstance}
      nodesConnectable={!!onCreateLookup&&!readOnly} edgesReconnectable={false} nodesDraggable={!readOnly}
      onConnect={connection=>{if(!readOnly&&onCreateLookup&&connection.source&&connection.target){const handle=connection.sourceHandle??"";const name=handle.includes(":")?decodeURIComponent(handle.slice(handle.indexOf(":")+1)):undefined;const c=graph.tables.find(t=>t.id===connection.source)?.columns.find(c=>c.name===name);onCreateLookup(connection.source,c?.id,connection.target);}}}
      deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode="Shift"
      panOnDrag={[1]} selectionOnDrag selectionMode={SelectionMode.Partial} autoPanOnSelection={false}
      elevateNodesOnSelect={false}
      defaultViewport={view.viewport} minZoom={0.1} maxZoom={4}
      onNodesChange={(changes) => {
        for (const change of changes) if (change.type === "select") {
          selected.current = selected.current.filter((id) => id !== change.id);
          if (change.selected && graph.tables.some((table) => table.id === change.id)) selected.current.push(change.id);
        }
        const selection = changes.find((change) => change.type === "select" && change.selected && graph.tables.some((table) => table.id === change.id));
        setNodes((current) => applyNodeChanges(changes, current));
      }}
      onEdgesChange={(changes) => {
        for (const change of changes) if (change.type === "select") {
          if (change.selected) { selectedEdge.current = change.id; }
          else if (selectedEdge.current === change.id) selectedEdge.current = null;
        }
        setEdges((current) => applyEdgeChanges(changes, current));
        if(changes.some(change=>change.type==="select"))setSelectionVersion(value=>value+1);
      }}
      onSelectionChange={reportSelection}
      onNodeDragStart={()=>{draggingNodes.current=true;routeRequest.current++;setRoutingBusy(false);setHoveredRelation(null);}}
      onNodeDrag={(_event, node) => {
        if (node.type !== "tableGroup") return;
        const moved = new Map(groupPositions(node).map((item) => [item.id, item.position]));
        setNodes((current) => current.map((item) => moved.has(item.id) ? { ...item, position: moved.get(item.id)! } : item));
      }}
      onNodeDragStop={(_event, node, moved) => {
        draggingNodes.current=false;
        if (readOnly) return;
        if (node.type === "note") { noteChange(node.id.slice(5), node.position); return; }
        const targets = node.type === "tableGroup" ? groupPositions(node) : moved.length ? moved : [node];
        const next = setNodePositions(presentation, presentation.activeViewId, targets.filter((item) => item.type === "table"));
        onPresentationChange(next);
      }}
      onNodeClick={(_event, node) => { setSelectedGroup(node.type === "tableGroup" ? node.id.slice(6) : null); if (node.type === "table") onSelectionChange?.(node.id); }}
      onNodeDoubleClick={(_event, node) => { if (node.type === "table") selectEntity({ kind: "table", id: node.id, tableId: node.id }); else if (node.type === "tableGroup") { const id = node.id.slice(6); selectEntity({ kind: "group", id, tableId: view.groups[id]?.tableIds[0] ?? "" }); } }}
      onEdgeDoubleClick={(_event, edge) => selectEntity({ kind: "relation", id: edge.id, tableId: edge.source })}
      onEdgeMouseEnter={(_event,edge)=>{if(!draggingNodes.current)setHoveredRelation(edge.id);}}
      onEdgeMouseLeave={()=>{if(!draggingNodes.current)setHoveredRelation(null);}}
      onMoveEnd={(_event, viewport) => {
        const index=programmaticViewports.current.findIndex(v=>Math.abs(v.x-viewport.x)<.1&&Math.abs(v.y-viewport.y)<.1&&Math.abs(v.zoom-viewport.zoom)<.001);
        if(index>=0){programmaticViewports.current.splice(index,1);return;}
        if (!readOnly && !programmaticMoves.current && (viewport.x !== view.viewport.x || viewport.y !== view.viewport.y || viewport.zoom !== view.viewport.zoom))
          onPresentationChange(setViewport(presentation, presentation.activeViewId, viewport));
      }}
      onPaneClick={() => { selected.current = []; selectedEdge.current=null;setHoveredRelation(null);setSelectionVersion(value=>value+1);lastEntity.current = null; onSelectionChange?.(null); onSelectedTablesChange?.([]); }}>
      {grid && <Background />}
      <Panel position="bottom-center"><div className="floating-tools" role="group" aria-label="Outils du diagramme">
        <button disabled={readOnly} onClick={onReorganize} title="Disposition" aria-label="Disposition"><ActionIcon name="layout" /><span className="tool-label">Disposition</span></button><button aria-pressed={relations} onClick={() => setRelations(!relations)} title={relations ? "Animer uniquement la relation sélectionnée" : "Animer toutes les relations"} aria-label="Relations"><ActionIcon name="relations" /><span className="tool-label">Relations</span></button>
        <button aria-pressed={grid} onClick={() => setGrid(!grid)} title="Grille" aria-label="Grille"><ActionIcon name="grid" /><span className="tool-label">Grille</span></button>
        <button type="button" className="icon-tool" aria-label={minimap ? "Masquer la mini-carte" : "Afficher la mini-carte"} title={minimap ? "Masquer la mini-carte" : "Afficher la mini-carte"} aria-pressed={minimap} onClick={() => setMinimap(!minimap)}><ActionIcon name="minimap" /></button>
        {!readOnly && <div className="relation-route-tools" aria-busy={routingBusy}>
          <button type="button" aria-label="Routage automatique" disabled={routingBusy} title={routingBusy ? "Calcul du routage…" : selectedEdge.current ? "Recalculer la relation sélectionnée" : "Recalculer les relations automatiques, conserver les tracés manuels"} onClick={() => void recalculateRoutes(false, selectedEdge.current)}><ActionIcon name="route" /><span className="tool-label">Routage</span></button>
          <details><summary aria-label="Options de routage automatique" title="Options de routage automatique"><ActionIcon name="chevronDown" /></summary><button type="button" disabled={routingBusy} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); void recalculateRoutes(true); }}>Recalculer toutes les relations, y compris les tracés manuels</button></details>
        </div>}
        <select aria-label="Niveau de détail" disabled={readOnly} value={view.defaultDetail} onChange={event => onPresentationChange(setViewDetail(presentation, presentation.activeViewId, event.target.value as "all" | "keys" | "names"))}><option value="all">Tous les champs</option><option value="keys">Clés seulement</option><option value="names">Noms seulement</option></select>
        <input type="search" aria-label="Recherche dans le diagramme" placeholder="Rechercher…" value={query} onChange={event => onQueryChange?.(event.target.value)} />
        <button ref={groupTrigger} aria-expanded={groupOpen} aria-haspopup="dialog" disabled={readOnly || !selected.current.length || !onSourceChange} onClick={() => { setGroupOpen(!groupOpen); setPalette(false); }} title="Groupe" aria-label="Groupe"><ActionIcon name="group" /><span className="tool-label">Groupe</span></button>
        {groupOpen && onSourceChange && <GroupCreation graph={graph} presentation={presentation} source={source} selectedIds={selected.current} onSourceChange={onSourceChange} onPresentationChange={onPresentationChange} onClose={closeGroup} readOnly={readOnly} />}
        <button disabled={readOnly || (!selected.current.length && !selectedGroup)} aria-expanded={palette} onClick={() => { setPalette(!palette); setGroupOpen(false); }} title="Couleur" aria-label="Couleur"><ActionIcon name="color" /><span className="tool-label">Couleur</span></button>
        <button disabled={readOnly} onClick={() => noteChange(crypto.randomUUID(), { text: "Nouvelle note", x: instance ? instance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }).x : 100, y: instance ? instance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }).y : 100 })} title="Note" aria-label="Note"><ActionIcon name="note" /><span className="tool-label">Note</span></button>
        {palette && <div className="palette">{["#326b91", "#16a34a", "#b87e26", "#b44c5b", "#8258ae", "#5f6c7a"].map(color => <button key={color} aria-label={`Couleur ${color}`} style={{ background: color }} onClick={() => colorSelection(color)} />)}<label>Personnalisée <input type="color" aria-label="Couleur personnalisée" onChange={event => colorSelection(event.target.value)} /></label></div>}
      </div>{toolError && <p role="alert">{toolError}</p>}</Panel>
      <Controls showInteractive={false} />
      {minimap && <MiniMap pannable zoomable />}
    </ReactFlow>
    {!mappedNodes.some(node => (node.type === "table" && !node.hidden) || node.type === "tableGroup") && <div className="view-empty-state"><strong>Cette vue est vide</strong><p>Affichez des tables depuis le panneau des vues.</p></div>}
  </section>;
}
