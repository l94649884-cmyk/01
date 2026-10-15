import type { BeamModel } from './model';
type Point={x:number;y:number};
type Target=Point&{id:string;kind?:'node'|'actionPoint'};
export type MomentSide=BeamModel['moments'][number]['side'];
export const momentSideLabel=(side:MomentSide)=>side==='center'?'中心':side==='left'?'左侧':'右侧';
export function pointOnMember(model:BeamModel,point:BeamModel['actionPoints'][number]):Point|null {
  const member=model.members.find(m=>m.id===point.memberId);
  const a=model.nodes.find(n=>n.id===member?.start),b=model.nodes.find(n=>n.id===member?.end);
  if(!a||!b)return null;
  const length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)return null;
  return {x:a.x+(b.x-a.x)*point.at/length,y:a.y+(b.y-a.y)*point.at/length};
}
export function momentTargets(model:BeamModel):Target[]{
  // Explicit action points take priority when they coincide with a node.
  return [...model.actionPoints.flatMap(point=>{const p=pointOnMember(model,point);return p?[{...p,id:point.id,kind:'actionPoint' as const}]:[];}),...model.nodes.map(n=>({...n,kind:'node' as const}))];
}
export function momentAttachment(target:Target){
  return target.kind==='actionPoint'?{pointId:target.id}:{nodeId:target.id};
}
export function resolveMomentTarget(model:BeamModel,moment:BeamModel['moments'][number]):Point|null {
  if(moment.nodeId!==undefined)return model.nodes.find(n=>n.id===moment.nodeId)??null;
  const point=model.actionPoints.find(p=>p.id===moment.pointId);
  return point?pointOnMember(model,point):null;
}
export function momentAnchor(node:Point,side:MomentSide,scale:number):Point {
  return {x:node.x+(side==='center'?0:side==='left'?-42:42)/scale,y:node.y};
}
export function nearestMomentTarget(nodes:readonly Target[],point:Point,scale:number){
  return nodes.flatMap(node=>(['center','left','right'] as const).map(side=>{
    const p=momentAnchor(node,side,scale),distance=Math.hypot(point.x-p.x,point.y-p.y)*scale;
    return {node,side,p,distance};
  })).filter(hit=>hit.distance<=28).sort((a,b)=>a.distance-b.distance)[0]??null;
}
export function momentArrowPoints(value:number):number[]{
  return Array.from({length:31},(_,i)=>{
    const angle=Math.PI/3+(value>=0?1:-1)*5*Math.PI/3*i/30;
    return [16*Math.cos(angle),-16*Math.sin(angle)];
  }).flat();
}
