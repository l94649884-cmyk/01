import type { BeamModel, BeamNode } from './model';

type Point = { x: number; y: number };
export const distance = (a: Point, b: Point) => Math.hypot(b.x-a.x, b.y-a.y);
const cross = (a: Point, b: Point, c: Point) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);

export function pointInsideMember(p: Point, a: Point, b: Point): boolean {
  const length=distance(a,b);
  if(length<1e-4)return false;
  const t=((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/(length*length);
  return t>1e-8&&t<1-1e-8&&Math.abs(cross(a,b,p))/length<1e-6;
}

export function connectionError(model: BeamModel, a: BeamNode, b: BeamNode, excludeMember?: string): string | null {
  if(distance(a,b)<1e-4)return '杆件两端不能重合。';
  if(model.nodes.some(n=>n.id!==a.id&&n.id!==b.id&&pointInsideMember(n,a,b)))return '杆件不能跨过中间节点，请在该节点处分段连接。';
  const nodes=new Map(model.nodes.map(n=>[n.id,n]));
  for(const m of model.members){
    if(m.id===excludeMember)continue;
    const c=nodes.get(m.start),d=nodes.get(m.end);if(!c||!d)continue;
    if((a.id===c.id&&b.id===d.id)||(a.id===d.id&&b.id===c.id))return '这两个节点之间已经有杆件。';
    if(pointInsideMember(c,a,b)||pointInsideMember(d,a,b)||pointInsideMember(a,c,d)||pointInsideMember(b,c,d))return '杆件不能重叠或在未分段的位置连接，请添加公共节点并分段。';
    if(new Set([a.id,b.id,c.id,d.id]).size<4)continue;
    const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
    if(ab1*ab2<0&&cd1*cd2<0)return '交叉杆件需要在交点建立公共节点并分别连接。';
  }
  return null;
}
