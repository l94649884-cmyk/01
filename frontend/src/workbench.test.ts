import { expect,it } from 'vitest';
import { example,parseModel,validateModel } from './model';
import { distributedGlyph } from './loadGeometry';
import { segmentEndpoints } from './StructureDiagram';

it('partial load JSON roundtrips and invalid intervals prevent solving',()=>{
 const m=example('udl');m.distributedLoads[0]={...m.distributedLoads[0],start:1,end:3,direction:'x'};
 expect(parseModel(JSON.stringify(m))).toEqual(m);expect(validateModel(m)).toEqual([]);
 for(const [start,end] of [[3,3],[4,2],[0,7]]){m.distributedLoads[0].start=start;m.distributedLoads[0].end=end;expect(validateModel(m).join()).toContain('区间');}
});
it.each([[{x:0,y:0},{x:240,y:0},true],[{x:0,y:240},{x:0,y:0},false]] as const)('axial UDL glyph has a visible band and multiple separated arrows', (a,b,horizontal)=>{
 const g=distributedGlyph(a,b,horizontal);expect(g.parallel).toBe(true);expect(g.tips.length).toBeGreaterThanOrEqual(4);
 const area=Math.abs(g.polygon.reduce((acc,p,i)=>{const q=g.polygon[(i+1)%g.polygon.length];return acc+p.x*q.y-p.y*q.x;},0))/2;
 expect(area).toBeGreaterThan(1000);
 const spacing=Math.hypot(g.tips[1].x-g.tips[0].x,g.tips[1].y-g.tips[0].y);
 expect(Math.hypot(g.tails[0].x-g.tips[0].x,g.tails[0].y-g.tips[0].y)).toBeLessThan(spacing);
});
it('overall diagrams retain vertical and horizontal geometry at partial-element stations',()=>{
 const m=example('frame');
 const base={x0:1,x1:2,V0:0,M0:0,q:0,EI:1,dofs:[0,0,0,0],s0:1,s1:2};
 expect(segmentEndpoints(m,{...base,memberId:'B1'})).toEqual([{x:0,y:1},{x:0,y:2}]);
 expect(segmentEndpoints(m,{...base,memberId:'B2'})).toEqual([{x:1,y:3},{x:2,y:3}]);
 expect(segmentEndpoints(m,{...base,memberId:'B1',s0:2,s1:1})).toEqual([{x:0,y:2},{x:0,y:1}]);
});
