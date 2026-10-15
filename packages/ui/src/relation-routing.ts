import type { Point } from "./presentation-commands.js";

export type Bounds = Point & { width: number; height: number };
export type Side = "left" | "right";
export const ROUTE_GAP = 24;
export const LANE_GAP = 12;
const equal = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function simplifyRoute(input: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of input) {
    if (result.length && equal(result.at(-1)!, point)) continue;
    result.push({ ...point });
    while (result.length >= 3) {
      const [a, b, c] = result.slice(-3) as [Point, Point, Point];
      // Retracing the same line adds no useful corridor, even in a manual route.
      if (a.x === b.x && b.x === c.x || a.y === b.y && b.y === c.y) {
        result.splice(result.length - 2, 1);
        if(equal(result.at(-2)!,result.at(-1)!))result.pop();
      }
      else break;
    }
  }
  return result;
}

export function legacyRoute(source: Point, target: Point, points: Point[]): Point[] {
  const route = [source];
  for (const point of [...points, target]) { route.push({ x: point.x, y: route.at(-1)!.y }, point); }
  return simplifyRoute(route);
}

export function segmentBlocked(a: Point, b: Point, obstacles: Bounds[], padding = 8): boolean {
  return obstacles.some(r => a.x === b.x
    ? a.x > r.x - padding && a.x < r.x + r.width + padding && Math.max(a.y, b.y) > r.y - padding && Math.min(a.y, b.y) < r.y + r.height + padding
    : a.y > r.y - padding && a.y < r.y + r.height + padding && Math.max(a.x, b.x) > r.x - padding && Math.min(a.x, b.x) < r.x + r.width + padding);
}
export function routeBlocked(points: Point[], obstacles: Bounds[]): boolean {
  return points.some((p, i) => i > 0 && segmentBlocked(points[i - 1]!, p, obstacles, 0));
}

export function adaptRoute(source: Point, target: Point, points: Point[], sourceSide: Side, targetSide: Side): Point[] {
  if(!points.length)return automaticRoute(source,target,sourceSide,targetSide,[]);
  if(points.length===1)return adaptRoute(source,target,[{x:points[0]!.x,y:source.y},{x:points[0]!.x,y:target.y}],sourceSide,targetSide);
  const interior = points.map(p => ({ ...p }));
  // The first/last corner follows its field's row. Do not insert a second
  // escape back to the field's old row: that created accumulating zigzags.
  if(interior.length===2&&interior[0]!.x===interior[1]!.x){
    const lower=Math.max(sourceSide==="right"?source.x:-Infinity,targetSide==="right"?target.x:-Infinity);
    const upper=Math.min(sourceSide==="left"?source.x:Infinity,targetSide==="left"?target.x:Infinity);
    if(lower>=upper)return automaticRoute(source,target,sourceSide,targetSide,[]);
    let x=interior[0]!.x;
    if(x<=lower)x=lower+ROUTE_GAP;
    if(x>=upper)x=upper-ROUTE_GAP;
    if(x<=lower||x>=upper)x=(lower+upper)/2;
    return simplifyRoute([source,{x,y:source.y},{x,y:target.y},target]);
  }
  const attach=(end:Point,side:Side,chain:Point[])=>{
    const first=chain[0]!,second=chain[1]!,oldX=first.x;
    first.y=end.y;
    if(side==="right"?first.x<=end.x:first.x>=end.x){
      first.x=end.x+(side==="right"?ROUTE_GAP:-ROUTE_GAP);
      if(second.x===oldX)second.x=first.x;
    }
    // Merge a nearly collapsed boundary dogleg instead of keeping two tiny bends.
    if(chain.length>=4&&first.x===second.x&&Math.abs(first.y-second.y)<8&&chain[2]!.y===second.y){
      second.y=first.y;chain[2]!.y=first.y;
    }
  };
  attach(source,sourceSide,interior);interior.reverse();attach(target,targetSide,interior);interior.reverse();
  return simplifyRoute([source,...interior,target]);
}

/** Prefer facing sides for neighbours, an exterior shared side for a vertical stack. */
export function connectionSides(source:Bounds,target:Bounds,obstacles:Bounds[]):{sourceSide:Side;targetSide:Side}{
  if(source.x+source.width<=target.x)return {sourceSide:"right",targetSide:"left"};
  if(target.x+target.width<=source.x)return {sourceSide:"left",targetSide:"right"};
  const left=Math.min(source.x,target.x)-ROUTE_GAP,right=Math.max(source.x+source.width,target.x+target.width)+ROUTE_GAP;
  const top=Math.min(source.y,target.y),bottom=Math.max(source.y+source.height,target.y+target.height);
  const penalty=(x:number)=>obstacles.filter(r=>r!==source&&r!==target&&x>r.x-8&&x<r.x+r.width+8&&bottom>r.y&&top<r.y+r.height).length*600;
  const leftCost=source.x-left+target.x-left+penalty(left);
  const rightCost=right-source.x-source.width+right-target.x-target.width+penalty(right);
  const side:Side=leftCost<rightCost?"left":"right";
  return {sourceSide:side,targetSide:side};
}

type QueueItem = { state: number; cost: number; priority: number };
class MinHeap {
  values: QueueItem[] = [];
  push(item: QueueItem) { let i = this.values.length; this.values.push(item); while (i) { const parent = (i - 1) >> 1; if (this.values[parent]!.priority <= item.priority) break; this.values[i] = this.values[parent]!; i = parent; } this.values[i] = item; }
  pop(): QueueItem | undefined { const first = this.values[0], last = this.values.pop(); if (!this.values.length || !last) return first; let i = 0; while (i * 2 + 1 < this.values.length) { let child = i * 2 + 1; if (child + 1 < this.values.length && this.values[child + 1]!.priority < this.values[child]!.priority) child++; if (last.priority <= this.values[child]!.priority) break; this.values[i] = this.values[child]!; i = child; } this.values[i] = last; return first; }
}

function congestion(a: Point, b: Point, used: Point[][]): number {
  let cost = 0;
  for (const path of used) for (let i = 1; i < path.length; i++) {
    const c = path[i - 1]!, d = path[i]!;
    // Charge by shared length rather than per grid edge: unrelated tables may
    // subdivide a corridor, but must not make it arbitrarily expensive.
    if (a.y === b.y && c.y === d.y && Math.abs(a.y - c.y) < LANE_GAP) cost += Math.max(0,Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))-Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)))*0.35;
    else if (a.x === b.x && c.x === d.x && Math.abs(a.x - c.x) < LANE_GAP) cost += Math.max(0,Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))-Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)))*0.35;
    else if (a.y === b.y && c.x === d.x && c.x > Math.min(a.x, b.x) && c.x < Math.max(a.x, b.x) && a.y > Math.min(c.y, d.y) && a.y < Math.max(c.y, d.y)) cost += 24;
    else if (a.x === b.x && c.y === d.y && c.y > Math.min(a.y, b.y) && c.y < Math.max(a.y, b.y) && a.x > Math.min(c.x, d.x) && a.x < Math.max(c.x, d.x)) cost += 24;
  }
  return cost;
}

/** A* on a rectilinear visibility grid; cache each undirected grid edge once. */
export function automaticRoute(source: Point, target: Point, sourceSide: Side, targetSide: Side, obstacles: Bounds[], used: Point[][] = [], lane = 0): Point[] {
  const offset = ROUTE_GAP + lane * LANE_GAP;
  if(equal(source,target)&&sourceSide===targetSide){
    const r=obstacles.find(r=>source.y>=r.y&&source.y<=r.y+r.height&&source.x>=r.x&&source.x<=r.x+r.width);
    if(r){const outside=source.x+(sourceSide==="right"?offset:-offset),opposite=sourceSide==="right"?r.x-offset:r.x+r.width+offset;
      return [source,{x:outside,y:source.y},{x:outside,y:r.y-offset},{x:opposite,y:r.y-offset},{x:opposite,y:r.y+r.height+offset},{x:outside,y:r.y+r.height+offset},{x:outside,y:source.y},target];}
  }
  const start = { x: source.x + (sourceSide === "right" ? offset : -offset), y: source.y };
  const end = { x: target.x + (targetSide === "right" ? offset : -offset), y: target.y };
  const xs = new Set([start.x, end.x]), ys = new Set([start.y, end.y]);
  for (const r of obstacles) { xs.add(r.x - offset); xs.add(r.x + r.width + offset); ys.add(r.y - offset); ys.add(r.y + r.height + offset); }
  // Include neighbouring lanes around occupied corridors, without a dense canvas grid.
  for (const path of used) for (let i = 1; i < path.length; i++) { const a = path[i - 1]!, b = path[i]!; if (a.x === b.x) { xs.add(a.x - LANE_GAP); xs.add(a.x + LANE_GAP); } else { ys.add(a.y - LANE_GAP); ys.add(a.y + LANE_GAP); } }
  const x = [...xs].sort((a,b) => a-b), y = [...ys].sort((a,b) => a-b), width = x.length;
  const startIndex = y.indexOf(start.y) * width + x.indexOf(start.x), endIndex = y.indexOf(end.y) * width + x.indexOf(end.x);
  const position = (index: number): Point => ({ x: x[index % width]!, y: y[Math.floor(index / width)]! });
  const costs = new Map<number, number>(), previous = new Map<number, number>(), queue = new MinHeap();
  const edgeCosts=new Map<number,number>(),cellCount=x.length*y.length;
  for (const axis of [0,1]) { costs.set(startIndex * 2 + axis, 0); queue.push({ state: startIndex * 2 + axis, cost: 0, priority:distance(start,end) }); }
  let found: number | undefined;
  while (queue.values.length) {
    const current = queue.pop()!; if (current.cost !== costs.get(current.state)) continue;
    const index = Math.floor(current.state / 2), axis = current.state % 2;
    if (index === endIndex) { found = current.state; break; }
    const col = index % width, row = Math.floor(index / width), a = position(index);
    const neighbours = [[col-1,row,0],[col+1,row,0],[col,row-1,1],[col,row+1,1]];
    for (const [nx,ny,nextAxis] of neighbours as [number,number,number][]) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= y.length) continue;
      const ni = ny * width + nx, b = position(ni);
      const edgeKey=Math.min(index,ni)*cellCount+Math.max(index,ni);
      let edgeCost=edgeCosts.get(edgeKey);
      if(edgeCost===undefined){edgeCost=segmentBlocked(a,b,obstacles)?Infinity:distance(a,b)+congestion(a,b,used);edgeCosts.set(edgeKey,edgeCost);}
      if(!Number.isFinite(edgeCost))continue;
      const state = ni * 2 + nextAxis, cost = current.cost + edgeCost + (axis === nextAxis ? 0 : 35);
      if (cost >= (costs.get(state) ?? Infinity)) continue;
      costs.set(state,cost); previous.set(state,current.state); queue.push({state,cost,priority:cost+distance(b,end)});
    }
  }
  if (found === undefined) {
    // A cramped/overlapping layout can block the escape; retain a connected fallback.
    const top = Math.min(source.y, target.y, ...obstacles.map(r => r.y)) - offset;
    return simplifyRoute([source,start,{x:start.x,y:top},{x:end.x,y:top},end,target]);
  }
  const path: Point[] = []; let state: number | undefined = found;
  while (state !== undefined) { path.push(position(Math.floor(state/2))); state = previous.get(state); }
  return simplifyRoute([source,...path.reverse(),target]);
}

/** Repair only obstructed runs; preserve the other manually chosen corridors. */
export function repairRoute(route: Point[], obstacles: Bounds[], sourceSide: Side, targetSide: Side): Point[] {
  if(!routeBlocked(route,obstacles))return route;
  const inside=(p:Point)=>obstacles.some(r=>p.x>r.x&&p.x<r.x+r.width&&p.y>r.y&&p.y<r.y+r.height);
  const result=[route[0]!];
  for(let i=1;i<route.length;i++){
    const a=result.at(-1)!,b=route[i]!;
    if(!segmentBlocked(a,b,obstacles,0)){result.push(b);continue;}
    let end=i;while(end<route.length-1&&inside(route[end]!))end++;
    const target=route[end]!;
    const startSide=result.length===1?sourceSide:target.x>=a.x?"right":"left";
    const endSide=end===route.length-1?targetSide:target.x>=a.x?"left":"right";
    result.push(...automaticRoute(a,target,startSide,endSide,obstacles).slice(1));i=end;
  }
  return simplifyRoute(result);
}

/** Move a complete segment or insert a rectangular detour at a point along it. */
export function moveSegment(route: Point[], index: number, delta: number, insertion?: number): Point[] {
  const a = route[index]!, b = route[index + 1]!, horizontal = a.y === b.y;
  if (!delta) return route.map(p => ({...p}));
  const move = (p: Point): Point => horizontal ? {x:p.x,y:p.y+delta} : {x:p.x+delta,y:p.y};
  if (insertion !== undefined) {
    const fraction=Math.max(0.05,Math.min(0.95,insertion)),half=Math.min(fraction,1-fraction,0.25);
    const at=(t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
    const before=at(fraction-half),after=at(fraction+half);
    if(fraction-half===0&&index===0){const stub=Math.min(ROUTE_GAP,distance(before,after)/3);if(horizontal)before.x+=Math.sign(b.x-a.x)*stub;else before.y+=Math.sign(b.y-a.y)*stub;}
    if(fraction+half===1&&index+1===route.length-1){const stub=Math.min(ROUTE_GAP,distance(before,after)/3);if(horizontal)after.x-=Math.sign(b.x-a.x)*stub;else after.y-=Math.sign(b.y-a.y)*stub;}
    return simplifyRoute([...route.slice(0,index+1),before,move(before),move(after),after,...route.slice(index+1)]);
  }
  const result = route.map(p => ({...p}));
  if (index > 0) result[index] = move(a);
  if (index+1 < route.length-1) result[index+1] = move(b);
  // End segments keep a horizontal escape before the new turn.
  if (index === 0) { const stub = horizontal ? {x:a.x+Math.sign(b.x-a.x)*Math.min(ROUTE_GAP,Math.abs(b.x-a.x)/3),y:a.y} : {x:a.x,y:a.y+Math.sign(b.y-a.y)*Math.min(ROUTE_GAP,Math.abs(b.y-a.y)/3)}; result.splice(1,0,stub,move(stub)); }
  if (index+1 === route.length-1) { const stub = horizontal ? {x:b.x-Math.sign(b.x-a.x)*Math.min(ROUTE_GAP,Math.abs(b.x-a.x)/3),y:b.y} : {x:b.x,y:b.y-Math.sign(b.y-a.y)*Math.min(ROUTE_GAP,Math.abs(b.y-a.y)/3)}; result.splice(result.length-1,0,move(stub),stub); }
  return simplifyRoute(result);
}

export function roundedRoutePath(points: Point[], crossings: Point[] = [], radius = 6): string {
  if (!points.length) return "";
  let path = `M ${points[0]!.x} ${points[0]!.y}`, cursor = points[0]!;
  const line = (end: Point) => {
    if (cursor.y === end.y) {
      const direction = Math.sign(end.x-cursor.x);
      const bridges = crossings.filter(p => p.y === end.y && p.x > Math.min(cursor.x,end.x)+7 && p.x < Math.max(cursor.x,end.x)-7).sort((a,b) => direction*(a.x-b.x));
      for (const p of bridges) path += ` L ${p.x-direction*5} ${p.y} Q ${p.x} ${p.y-9} ${p.x+direction*5} ${p.y}`;
    }
    path += ` L ${end.x} ${end.y}`; cursor=end;
  };
  for (let i=1;i<points.length-1;i++) {
    const a=points[i-1]!,b=points[i]!,c=points[i+1]!,r=Math.min(radius,distance(a,b)/2,distance(b,c)/2);
    const before={x:b.x+Math.sign(a.x-b.x)*r,y:b.y+Math.sign(a.y-b.y)*r};
    const after={x:b.x+Math.sign(c.x-b.x)*r,y:b.y+Math.sign(c.y-b.y)*r};
    line(before);path+=` Q ${b.x} ${b.y} ${after.x} ${after.y}`;cursor=after;
  }
  line(points.at(-1)!); return path;
}

export function crossingPoints(route: Point[], others: Point[][]): Point[] {
  return routeCrossings([{id:"route",points:route},...others.map((points,i)=>({id:String(i),points}))]).get("route")!;
}

/** Index vertical segments once, then query only the x range of each horizontal. */
export function routeCrossings(routes: Array<{id:string;points:Point[]}>): Map<string,Point[]> {
  const vertical:Array<{id:string;x:number;top:number;bottom:number}>=[];
  const horizontal:Array<{id:string;y:number;left:number;right:number}>=[];
  const result=new Map(routes.map(route=>[route.id,new Map<string,Point>()]));
  for(const route of routes)for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1]!,b=route.points[i]!;
    if(a.x===b.x&&a.y!==b.y)vertical.push({id:route.id,x:a.x,top:Math.min(a.y,b.y)+10,bottom:Math.max(a.y,b.y)-10});
    else if(a.y===b.y&&a.x!==b.x)horizontal.push({id:route.id,y:a.y,left:Math.min(a.x,b.x)+10,right:Math.max(a.x,b.x)-10});
  }
  vertical.sort((a,b)=>a.x-b.x);
  for(const h of horizontal){
    let low=0,high=vertical.length;
    while(low<high){const middle=(low+high)>>1;if(vertical[middle]!.x<=h.left)low=middle+1;else high=middle;}
    for(let i=low;i<vertical.length&&vertical[i]!.x<h.right;i++){
      const v=vertical[i]!;
      if(v.id!==h.id&&h.y>v.top&&h.y<v.bottom)result.get(h.id)!.set(`${v.x}:${h.y}`,{x:v.x,y:h.y});
    }
  }
  return new Map([...result].map(([id,points])=>[id,[...points.values()]]));
}
