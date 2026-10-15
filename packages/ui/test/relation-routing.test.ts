import { describe, expect, it } from "vitest";
import { automaticRoute, connectionSides, routeBlocked, moveSegment, simplifyRoute, crossingPoints, roundedRoutePath, adaptRoute, repairRoute, routeCrossings } from "../src/relation-routing.js";
import { presentationSchema, emptyPresentation, encodePresentation, decodePresentation } from "../../core/src/presentation.js";

describe("relation routing",()=>{
  it("removes retraced spikes without losing the vertical corridor",()=>{
    expect(simplifyRoute([{x:0,y:100},{x:0,y:-20},{x:0,y:0},{x:160,y:0}])).toEqual([{x:0,y:100},{x:0,y:0},{x:160,y:0}]);
    expect(simplifyRoute([{x:0,y:0},{x:0,y:-20},{x:0,y:0},{x:160,y:0}])).toEqual([{x:0,y:0},{x:160,y:0}]);
  });
  it("does not take a large empty detour just to avoid sharing a short corridor",()=>{
    const source={x:0,y:0},target={x:200,y:0};
    const occupied=[[source,target]];
    const obstacles=[{x:50,y:100,width:40,height:40}];
    expect(automaticRoute(source,target,"right","left",obstacles,occupied)).toEqual([source,target]);
  });
  it("indexes crossings without treating corners or a relation's own segments as junctions",()=>{
    const indexed=routeCrossings([
      {id:"horizontal",points:[{x:0,y:50},{x:200,y:50}]},
      {id:"vertical",points:[{x:100,y:0},{x:100,y:100}]},
      {id:"corner",points:[{x:200,y:0},{x:200,y:50},{x:250,y:50}]},
    ]);
    expect(indexed.get("horizontal")).toEqual([{x:100,y:50}]);
    expect(indexed.get("vertical")).toEqual([]);expect(indexed.get("corner")).toEqual([]);
  });
  it("avoids an intervening table and retains horizontal field attachments",()=>{
    const obstacle={x:140,y:0,width:120,height:160};
    const route=automaticRoute({x:100,y:70},{x:340,y:70},"right","left",[obstacle]);
    expect(routeBlocked(route,[obstacle])).toBe(false);
    expect(route[1]!.y).toBe(70);expect(route.at(-2)!.y).toBe(70);
    expect(route.some(p=>p.y<0||p.y>160)).toBe(true);
  });
  it("gives a second relation a separate corridor",()=>{
    const a={x:100,y:30},b={x:400,y:150};
    const first=automaticRoute(a,b,"right","left",[]);
    const second=automaticRoute(a,b,"right","left",[],[first],1);
    expect(second).not.toEqual(first);
  });
  it("creates a detour without moving either endpoint and removes redundant bends",()=>{
    const initial=[{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:300,y:100}];
    const moved=moveSegment(initial,0,-60);
    expect(moved[0]).toEqual(initial[0]);expect(moved.at(-1)).toEqual(initial.at(-1));
    expect(moved.length).toBeGreaterThan(initial.length);
    expect(moveSegment(moved,2,60)).toEqual(initial);
    const detour=moveSegment(initial,0,-50,0.25);
    expect(detour.length).toBeGreaterThan(initial.length);
    for(let i=1;i<detour.length;i++)expect(detour[i]!.x===detour[i-1]!.x||detour[i]!.y===detour[i-1]!.y).toBe(true);
  });
  it("repairs attachments after moving a table while preserving an interior corridor",()=>{
    const route=adaptRoute({x:10,y:30},{x:300,y:150},[{x:120,y:0},{x:120,y:150}],"right","left");
    expect(route).toEqual([{x:10,y:30},{x:120,y:30},{x:120,y:150},{x:300,y:150}]);
    for(let i=1;i<route.length;i++)expect(route[i]!.x===route[i-1]!.x||route[i]!.y===route[i-1]!.y).toBe(true);
  });
  it("moves the first corner with its field instead of returning to the old field row",()=>{
    const points=[{x:124,y:50},{x:124,y:0},{x:300,y:0},{x:300,y:180},{x:476,y:180},{x:476,y:200}];
    const moved=adaptRoute({x:100,y:80},{x:500,y:200},points,"right","left");
    expect(moved).toEqual([{x:100,y:80},{x:124,y:80},{x:124,y:0},{x:300,y:0},{x:300,y:180},{x:476,y:180},{x:476,y:200},{x:500,y:200}]);
    expect(adaptRoute({x:100,y:50},{x:500,y:200},moved.slice(1,-1),"right","left")).toEqual([{x:100,y:50},...points,{x:500,y:200}]);
  });
  it("collapses a small boundary dogleg when the moved field reaches its neighbour's row",()=>{
    const route=adaptRoute({x:100,y:4},{x:500,y:200},[{x:124,y:50},{x:124,y:0},{x:300,y:0},{x:300,y:180},{x:476,y:180},{x:476,y:200}],"right","left");
    expect(route.slice(0,3)).toEqual([{x:100,y:4},{x:300,y:4},{x:300,y:180}]);
  });
  it("centres an inserted detour around the grabbed point",()=>{
    const route=moveSegment([{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:300,y:100}],0,-60,0.25);
    expect(route).toContainEqual({x:24,y:-60});expect(route).toContainEqual({x:100,y:-60});
    expect(route[0]).toEqual({x:0,y:0});expect(route.at(-1)).toEqual({x:300,y:100});
  });
  it("uses an exterior shared side for stacked tables and switches away from an obstructed corridor",()=>{
    const source={x:100,y:0,width:220,height:120},target={x:100,y:240,width:220,height:120};
    expect(connectionSides(source,target,[])).toEqual({sourceSide:"right",targetSide:"right"});
    expect(connectionSides(source,target,[{x:330,y:120,width:100,height:100}])).toEqual({sourceSide:"left",targetSide:"left"});
    expect(connectionSides(source,{...target,x:500},[])).toEqual({sourceSide:"right",targetSide:"left"});
  });
  it("draws a bridge only at a real interior crossing",()=>{
    const route=[{x:0,y:50},{x:200,y:50}],others=[[{x:100,y:0},{x:100,y:100}]];
    const crossings=crossingPoints(route,others);
    expect(crossings).toEqual([{x:100,y:50}]);
    expect(roundedRoutePath(route,crossings)).toContain("Q 100 41 105 50");
    expect(crossingPoints(route,[[{x:200,y:0},{x:200,y:100}]])).toEqual([]);
  });
  it("round trips manual and automatic modes and still accepts legacy routes",()=>{
    const doc=emptyPresentation();doc.views.all!.edges.r={points:[{x:150,y:50}],format:"orthogonal",mode:"manual",sourceSide:"left",targetSide:"right"};
    expect(decodePresentation(encodePresentation(doc))).toEqual(doc);
    doc.views.all!.edges.legacy={points:[{x:10,y:20}]};
    expect(presentationSchema.safeParse(doc).success).toBe(true);
    expect(simplifyRoute([{x:0,y:0},{x:10,y:0},{x:20,y:0}])).toEqual([{x:0,y:0},{x:20,y:0}]);
  });
  it("repairs an obstructed manual portion without replacing a separate chosen corridor",()=>{
    const obstacle={x:140,y:20,width:100,height:100};
    const route=[{x:0,y:60},{x:300,y:60},{x:300,y:240},{x:400,y:240}];
    const repaired=repairRoute(route,[obstacle],"right","left");
    expect(routeBlocked(repaired,[obstacle])).toBe(false);
    expect(repaired).toContainEqual({x:300,y:240});
    expect(repaired.at(-1)).toEqual({x:400,y:240});
  });
  it("keeps an exterior loop when a self relation uses one field and one side",()=>{
    const obstacle={x:0,y:0,width:220,height:140};
    const route=automaticRoute({x:220,y:70},{x:220,y:70},"right","right",[obstacle]);
    expect(route.length).toBeGreaterThan(5);
    expect(routeBlocked(route,[obstacle])).toBe(false);
  });
});
