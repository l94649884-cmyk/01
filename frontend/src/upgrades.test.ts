import {expect,it} from 'vitest';
import {boxItems,copyItems,createPolarMember,moveItems,toggleSelection} from './editing';
import {example,parseModel,removeSelection,resolvePointLoad,type Solution} from './model';
import {deformationPoints} from './DeformedShape';
import {sectionValues} from './CalculationExplanation';

function fixture(){const m=example('point');m.actionPoints=[{id:'A1',memberId:'B1',at:3}];m.pointLoads=[{id:'P1',pointId:'A1',value:10}];m.moments=[{id:'M1',pointId:'A1',value:6,side:'center'}];return m;}
it('linked forces follow the action point, roundtrip JSON, and are removed with it',()=>{
 const m=fixture();expect(parseModel(JSON.stringify(m))).toEqual(m);m.actionPoints[0].at=1.73;
 expect(resolvePointLoad(m,m.pointLoads[0]).at).toBe(1.73);expect(removeSelection(m,{type:'actionPoints',id:'A1'}).pointLoads).toEqual([]);
 m.pointLoads[0].pointId='missing';expect(()=>parseModel(JSON.stringify(m))).toThrow('无效');
});
it('marquee contains whole members and all attached object anchors, shift toggles one item',()=>{
 const m=fixture(),items=boxItems(m,{x:-1,y:-1},{x:7,y:1});expect(items).toHaveLength(8);
 expect(boxItems(m,{x:2,y:-1},{x:4,y:1}).map(s=>s.type)).toEqual(['actionPoints','pointLoads','moments']);
 expect(toggleSelection(toggleSelection([],{type:'members',id:'B1'}),{type:'members',id:'B1'})).toEqual([]);
});
it('moves selected beam endpoints once and keeps its point and forces linked',()=>{
 const m=fixture(),next=moveItems(m,[{type:'members',id:'B1'},{type:'nodes',id:'N1'},{type:'actionPoints',id:'A1'}],2,1);
 expect(next.nodes.map(n=>[n.x,n.y])).toEqual([[2,1],[8,1]]);expect(next.actionPoints).toEqual(m.actionPoints);expect(next.pointLoads).toEqual(m.pointLoads);
 const point=moveItems(m,[{type:'actionPoints',id:'A1'}],-1,0);expect(point.actionPoints[0].at).toBe(2);expect(resolvePointLoad(point,point.pointLoads[0]).at).toBe(2);
 expect(()=>moveItems(m,[{type:'nodes',id:'N1'}],6,0)).toThrow('重合');
});
it('copies a complete beam with new IDs and remaps all attached references',()=>{
 const m=fixture(),result=copyItems(m,[{type:'members',id:'B1'}],0,2),copy=result.model;
 expect(copy.nodes).toHaveLength(4);expect(copy.members).toHaveLength(2);expect(copy.actionPoints).toHaveLength(2);expect(copy.pointLoads).toHaveLength(2);
 expect(copy.members[1].start).toBe(copy.nodes[2].id);expect(copy.actionPoints[1].memberId).toBe(copy.members[1].id);expect(copy.pointLoads[1].pointId).toBe(copy.actionPoints[1].id);expect(copy.moments[1].pointId).toBe(copy.actionPoints[1].id);
 expect(parseModel(JSON.stringify(copy))).toEqual(copy);expect(()=>copyItems(m,[{type:'members',id:'B1'}],0,0)).toThrow('重合');
});
it('creates a member by exact length and angle, snaps an existing endpoint and rejects crossing',()=>{
 const m=example('point'),next=createPolarMember(m,'N2',3,90),n=next.nodes.at(-1)!;
 expect(n.x).toBeCloseTo(6);expect(n.y).toBeCloseTo(3);expect(next.members.at(-1)!.end).toBe(n.id);
 expect(()=>createPolarMember(m,'N1',6,0)).toThrow('已经有杆件');expect(()=>createPolarMember(m,'N1',Number.NaN,45)).toThrow('有效');
});
const solution={segments:[{memberId:'B1',x0:0,x1:3,s0:0,s1:3,M0:0,V0:5,q:0,EI:16800,dofs:[0,0,-.002,0],axialDofs:[0,.001],c:1,s:0},{memberId:'B1',x0:3,x1:6,s0:3,s1:6,M0:15,V0:-5,q:0,EI:16800,dofs:[-.002,0,0,0],axialDofs:[.001,0],c:1,s:0}],samples:[]} as unknown as Solution;
it('draws actual ux and uy with the requested factor and preserves original geometry at zero',()=>{
 const m=example('point'),zero=deformationPoints(m,solution,0),amplified=deformationPoints(m,solution,100);
 expect(zero[0].at(-1)!.x).toBe(3);expect(zero[0].at(-1)!.y).toBe(0);
 expect(amplified[0].at(-1)!.x).toBeCloseTo(3.1);expect(amplified[0].at(-1)!.y).toBeCloseTo(-.2);
 expect(amplified[1][0].x).toBe(amplified[0].at(-1)!.x);expect(amplified[1][0].y).toBe(amplified[0].at(-1)!.y);
});
it('section explanation retains both sides at concentrated load jumps',()=>{
 const sides=sectionValues(solution,'B1',3);expect(sides.map(s=>s.sample.shear)).toEqual([5,-5]);expect(sides.map(s=>s.sample.moment)).toEqual([15,15]);
 expect(sectionValues(solution,'B1',1)).toHaveLength(1);expect(sectionValues(solution,'B1',7)).toEqual([]);
});
