import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { BaseEdge, Position, type Edge, type EdgeProps } from "@xyflow/react";
import type { Point } from "./presentation-commands.js";
import { automaticRoute, legacyRoute, moveSegment, roundedRoutePath, simplifyRoute, type Bounds, type Side } from "./relation-routing.js";

export type RelationEdge = Edge<{ sourceCardinality: string; targetCardinality: string; points: Point[]; sourceBounds?: Bounds;
  vertices?: Point[]; crossings?: Point[]; alignments?: Point[]; emphasized?: boolean; dimmed?: boolean;
  sourceSide?: Side; targetSide?: Side; onSide?(end: "source" | "target", side: Side): void;
  onRoute(points: Point[]): void; onReset(): void; screenToFlowPosition?(point: Point): Point; readOnly?: boolean; motion?: boolean; color?: string; zoom?: number }, "directed">;

export function orthogonalPath(source: Point, target: Point, points: Point[]): string {
  let path = `M ${source.x} ${source.y}`, previous = source;
  for (const point of [...points, target]) { path += ` L ${point.x} ${previous.y} L ${point.x} ${point.y}`; previous = point; }
  return path;
}
type Control = { index: number; point: Point; horizontal: boolean; insertion?: number };
type Drag = { pointerId: number; control: Control; start: Point; route: Point[]; element: SVGCircleElement };
function selfRoute(source: Point,target: Point,sourceSide: Position,targetSide: Position,bounds: Bounds): Point[] {
  const left=bounds.x-40,right=bounds.x+bounds.width+40,top=bounds.y-40,bottom=bounds.y+bounds.height+40;
  const escape=(point:Point,side:Position):Point=>side===Position.Left?{x:left,y:point.y}:side===Position.Right?{x:right,y:point.y}:{x:point.x,y:side===Position.Top?top:bottom};
  const sides=[Position.Top,Position.Right,Position.Bottom,Position.Left],corners=[{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom},{x:left,y:top}];
  const route=[source,escape(source,sourceSide)];let side=sides.indexOf(sourceSide);
  do{route.push(corners[side]!);side=(side+1)%4;}while(sides[side]!==targetSide);
  route.push(escape(target,targetSide),target);return simplifyRoute(route);
}
type DrawingProps=EdgeProps<RelationEdge>&{callbacks:RefObject<RelationEdge["data"]|undefined>};
export function DirectedRelationEdge(props:EdgeProps<RelationEdge>){
  const callbacks=useRef(props.data);callbacks.current=props.data;
  return <RelationDrawing {...props} callbacks={callbacks}/>;
}
function RelationDrawingComponent({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data, callbacks }: DrawingProps) {
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Point[] | null>(null), [guide, setGuide] = useState<Point | null>(null), [dragDelta,setDragDelta] = useState(0);
  const markerId = `direction-${useId().replaceAll(":", "")}`;
  const sourcePoint = {x:sourceX,y:sourceY}, targetPoint = {x:targetX,y:targetY};
  const sourceSide = data?.sourceSide ?? (sourcePosition === Position.Left ? "left" : "right");
  const targetSide = data?.targetSide ?? (targetPosition === Position.Right ? "right" : "left");
  const base = data?.vertices ?? (data?.points.length ? legacyRoute(sourcePoint,targetPoint,data.points) : data?.sourceBounds && source===target ? selfRoute(sourcePoint,targetPoint,sourcePosition,targetPosition,data.sourceBounds) : automaticRoute(sourcePoint,targetPoint,sourceSide,targetSide,[]));
  const route = preview ?? base, zoom = data?.zoom ?? 1;
  const path = useMemo(()=>roundedRoutePath(route, preview ? [] : data?.crossings),[route,preview,data?.crossings]);
  const animate = data?.motion !== false || !!selected, emphasized = selected || data?.emphasized;
  const color = data?.color ?? "var(--dbc-relation)";
  const controlsRoute = drag.current?.route ?? route;
  const controls: Control[] = [];
  for(let i=0;selected&&!data?.readOnly&&i<controlsRoute.length-1;i++) {
    const a=controlsRoute[i]!,b=controlsRoute[i+1]!,length=Math.abs(a.x-b.x)+Math.abs(a.y-b.y),horizontal=a.y===b.y;
    if(length*zoom<32)continue;
    controls.push({index:i,point:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},horizontal});
    if(length*zoom>=80 && zoom>=0.35)for(const fraction of [0.25,0.75])controls.push({index:i,point:{x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction},horizontal,insertion:fraction});
  }
  const flowPoint = (x:number,y:number) => callbacks.current?.screenToFlowPosition?.({x,y}) ?? {x,y};
  const nextRoute = (x:number,y:number,alt:boolean) => {
    const current=drag.current!,p=flowPoint(x,y),horizontal=current.control.horizontal;
    let delta=horizontal?p.y-current.start.y:p.x-current.start.x;
    let aligned: Point | null=null;
    if(!alt){ const value=(horizontal?current.control.point.y:current.control.point.x)+delta;
      const candidates=[...current.route,...(data?.alignments??[])];
      const nearest=candidates.filter(c=>Math.abs((horizontal?c.y:c.x)-value)<6/zoom).sort((a,b)=>Math.abs((horizontal?a.y:a.x)-value)-Math.abs((horizontal?b.y:b.x)-value))[0];
      if(nearest){delta=horizontal?nearest.y-current.control.point.y:nearest.x-current.control.point.x;aligned=nearest;}
    }
    setGuide(aligned);setDragDelta(delta); return moveSegment(current.route,current.control.index,delta,current.control.insertion);
  };
  const cancel = () => { const current=drag.current;drag.current=null;if(current)current.element.releasePointerCapture?.(current.pointerId);setPreview(null);setGuide(null); };
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&drag.current){event.preventDefault();cancel();}};
    window.addEventListener("keydown",escape);
    return ()=>window.removeEventListener("keydown",escape);
  },[]);
  let number=0;
  return <g data-route={JSON.stringify(route)} className={`directed-relation${selected ? " is-selected" : ""}${emphasized ? " is-emphasized" : ""}${data?.dimmed && !emphasized ? " is-dimmed" : ""}${!animate ? " motion-paused" : ""}${zoom<0.45 ? " overview" : ""}`}
    style={data?.color ? { "--dbc-relation": data.color, "--dbc-accent": data.color } as CSSProperties : undefined}>
    <defs><marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M 0 0 L 6 3 L 0 6 z" fill="var(--dbc-relation)" /></marker></defs>
    <BaseEdge id={id} path={path} style={{ stroke: color, strokeWidth: emphasized ? 2.2 : 1.25 }} />
    <path className="relation-static-arrow" d={path} markerEnd={`url(#${markerId})`} fill="none" stroke="var(--dbc-relation)" />
    {animate && [0,1,2].map(index => <circle key={index} r="3" className="relation-direction-dot" aria-hidden="true"><animateMotion path={path} dur="3s" begin={`${-index}s`} repeatCount="indefinite" calcMode="paced" key={path} /></circle>)}
    <text className="relation-cardinality" x={sourceX+(sourceSide==="left"?-12:12)} textAnchor={sourceSide==="left"?"end":"start"} y={sourceY-9}>{data?.sourceCardinality}</text>
    <text className="relation-cardinality" x={targetX+(targetSide==="left"?-12:12)} textAnchor={targetSide==="left"?"end":"start"} y={targetY-9}>{data?.targetCardinality}</text>
    {selected && !data?.readOnly && <>
      {guide && <path className="relation-alignment-guide" d={drag.current?.control.horizontal ? `M ${Math.min(...route.map(p=>p.x))-30} ${guide.y} H ${Math.max(...route.map(p=>p.x))+30}` : `M ${guide.x} ${Math.min(...route.map(p=>p.y))-30} V ${Math.max(...route.map(p=>p.y))+30}`} />}
      {controls.slice().sort((a,b)=>Number(b.insertion!==undefined)-Number(a.insertion!==undefined)).map(control => {
        const insertion=control.insertion!==undefined,label=insertion?`Créer un détour sur le segment ${control.index+1} à ${Math.round(control.insertion!*100)} %`:`Déplacer le segment ${++number} ${control.horizontal?"verticalement":"horizontalement"}`;
        const active=drag.current?.control;
        const currentPoint=preview&&active?.index===control.index&&active.insertion===control.insertion ? {x:control.point.x+(control.horizontal?0:dragDelta),y:control.point.y+(control.horizontal?dragDelta:0)} : control.point;
        return <g key={`${control.index}:${control.insertion??"move"}`} className={`route-handle${insertion?" insertion":""}`}>
          <circle className="relation-control nodrag nopan" cx={currentPoint.x} cy={currentPoint.y} r={(insertion?10:14)/zoom} role="button" tabIndex={0} aria-label={label} style={{cursor:control.horizontal?"ns-resize":"ew-resize"}}
            onPointerDown={event=>{event.preventDefault();event.stopPropagation();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);drag.current={pointerId:event.pointerId,control,start:flowPoint(event.clientX,event.clientY),route:base,element:event.currentTarget};setDragDelta(0);setPreview(base);}}
            onPointerMove={event=>{if(drag.current?.pointerId===event.pointerId){event.stopPropagation();setPreview(nextRoute(event.clientX,event.clientY,event.altKey));}}}
            onPointerUp={event=>{if(drag.current?.pointerId!==event.pointerId)return;event.stopPropagation();const next=nextRoute(event.clientX,event.clientY,event.altKey),original=drag.current.route;drag.current=null;setPreview(null);setGuide(null);event.currentTarget.releasePointerCapture?.(event.pointerId);if(JSON.stringify(next)!==JSON.stringify(original))callbacks.current?.onRoute(simplifyRoute(next).slice(1,-1));}}
            onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}}
            onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();cancel();return;}const step=event.shiftKey?1:10;const delta=control.horizontal?(event.key==="ArrowUp"?-step:event.key==="ArrowDown"?step:0):(event.key==="ArrowLeft"?-step:event.key==="ArrowRight"?step:0);if(!delta)return;event.preventDefault();event.stopPropagation();callbacks.current?.onRoute(moveSegment(base,control.index,delta,control.insertion).slice(1,-1));}} />
          <circle className="relation-handle-visible" cx={currentPoint.x} cy={currentPoint.y} r={(insertion?1.8:4)/zoom} vectorEffect="non-scaling-stroke" />
        </g>;
      })}
      {data?.onSide && (["source","target"] as const).map(end=><circle key={end} className="relation-end-control nodrag nopan" cx={end==="source"?sourceX:targetX} cy={end==="source"?sourceY:targetY} r={6/zoom} role="button" tabIndex={0} aria-label={`Changer le côté ${end==="source"?"de départ":"d’arrivée"}`}
        onPointerDown={event=>{event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);}}
        onPointerUp={event=>{event.stopPropagation();event.currentTarget.releasePointerCapture?.(event.pointerId);const p=flowPoint(event.clientX,event.clientY),origin=end==="source"?sourcePoint:targetPoint,side=end==="source"?sourceSide:targetSide;if(Math.abs(p.x-origin.x)>24)callbacks.current?.onSide?.(end,p.x<origin.x?"left":"right");else if(Math.abs(p.x-origin.x)<4)callbacks.current?.onSide?.(end,side==="left"?"right":"left");}}
        onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();const side=end==="source"?sourceSide:targetSide;callbacks.current?.onSide?.(end,side==="left"?"right":"left");}}} />)}
    </>}
  </g>;
}
const RelationDrawing=memo(RelationDrawingComponent,(a,b)=>{
  if(a.id!==b.id||a.source!==b.source||a.target!==b.target||a.selected!==b.selected||a.sourceX!==b.sourceX||a.sourceY!==b.sourceY||a.targetX!==b.targetX||a.targetY!==b.targetY||a.sourcePosition!==b.sourcePosition||a.targetPosition!==b.targetPosition)return false;
  const x=a.data,y=b.data;
  if(!x||!y)return x===y;
  return x.vertices===y.vertices&&(x.vertices!==undefined||x.points===y.points&&JSON.stringify(x.sourceBounds)===JSON.stringify(y.sourceBounds))&&x.crossings===y.crossings&&x.alignments===y.alignments&&x.sourceCardinality===y.sourceCardinality&&x.targetCardinality===y.targetCardinality&&x.sourceSide===y.sourceSide&&x.targetSide===y.targetSide&&x.color===y.color&&x.zoom===y.zoom&&x.motion===y.motion&&x.readOnly===y.readOnly&&x.emphasized===y.emphasized&&x.dimmed===y.dimmed&&!!x.onSide===!!y.onSide;
});
