import {connectionError, distance} from './geometry';
import {modelSchema, uid, type BeamModel} from './model';

export type XY = {x:number;y:number};
export function orthogonalPoint(a:XY,b:XY):XY {
  return Math.abs(b.x-a.x)>=Math.abs(b.y-a.y)?{x:b.x,y:a.y}:{x:a.x,y:b.y};
}
/** Shared corner nodes have one rotation DOF: the segments form a rigid continuous member. */
export function createPolyline(model:BeamModel,points:XY[]) {
  if(points.length<2)throw Error('至少需要两个折杆端点。');
  const next=structuredClone(model), added:string[]=[];
  const nodes=points.map(p=>{
    let n=next.nodes.find(n=>distance(n,p)<1e-6);
    if(!n){n={id:uid('N'),...p};next.nodes.push(n);}return n;
  });
  for(let i=1;i<nodes.length;i++){
    const a=nodes[i-1],b=nodes[i],error=connectionError(next,a,b);
    if(error)throw Error(error);
    const id=uid('B');next.members.push({id,start:a.id,end:b.id,E:210,I:8000,A:100});added.push(id);
  }
  if(!modelSchema.safeParse(next).success)throw Error('坐标或模型规模超出范围（最多 80 节点、79 杆件）。');
  return {model:next,selection:added.map(id=>({type:'members' as const,id}))};
}

/** Parabolic axis approximated by straight, rigidly connected frame elements. */
export function createArch(span:number,rise:number,segments:number,load:number):BeamModel {
  if(![span,rise,segments,load].every(Number.isFinite)||span<.1||span>1000||rise<.1||rise>1000||!Number.isInteger(segments)||segments<8||segments>64||segments%2||Math.abs(load)>1e6)throw Error('跨度、矢高为 0.1–1000 m；分段数为 8–64 的偶数；荷载绝对值不超过 10⁶ kN。');
  const nodes=Array.from({length:segments+1},(_,i)=>({id:`AN${i}`,x:span*i/segments,y:4*rise*(i/segments)*(1-i/segments)}));
  return modelSchema.parse({schemaVersion:1,name:`抛物线双铰拱 · ${segments} 段近似`,nodes,
    members:nodes.slice(1).map((n,i)=>({id:`AB${i}`,start:nodes[i].id,end:n.id,E:210,I:8000,A:100})),
    supports:[{id:'AS0',nodeId:nodes[0].id,kind:'pin'},{id:'AS1',nodeId:nodes[segments].id,kind:'pin'}],
    pointLoads:[{id:'AP',memberId:`AB${segments/2-1}`,at:distance(nodes[segments/2-1],nodes[segments/2]),value:load,direction:'y'}],distributedLoads:[],moments:[],actionPoints:[]});
}
