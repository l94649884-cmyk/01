import {describe,it,expect} from 'vitest';
import {createArch,createPolyline,orthogonalPoint} from './construction';
import {example,parseModel,validateModel,type BeamModel} from './model';
const empty=():BeamModel=>({...example('point'),nodes:[],members:[],supports:[],pointLoads:[]});
describe('continuous construction',()=>{
 it('creates shared rigid corners atomically and reuses an existing endpoint',()=>{
  const model=empty();model.nodes=[{id:'N',x:0,y:0}];
  const result=createPolyline(model,[{x:0,y:0},{x:3,y:0},{x:3,y:2}]);
  expect(result.model.nodes).toHaveLength(3);expect(result.selection).toHaveLength(2);
  expect(result.model.members[0].end).toBe(result.model.members[1].start);
  expect(result.model.members[0].start).toBe('N');expect(model.members).toHaveLength(0);
 });
 it('rejects overlapping and out of bounds paths without modifying the original',()=>{
  const model=empty();expect(()=>createPolyline(model,[{x:0,y:0},{x:3,y:0},{x:1,y:0}])).toThrow();
  expect(()=>createPolyline(model,[{x:0,y:0},{x:1001,y:0}])).toThrow();expect(model.nodes).toEqual([]);
 });
 it('snaps to horizontal and vertical directions',()=>{
  expect(orthogonalPoint({x:1,y:1},{x:4,y:2})).toEqual({x:4,y:1});
  expect(orthogonalPoint({x:1,y:1},{x:2,y:4})).toEqual({x:1,y:4});
 });
 it.each([8,16,32,64])('generates a valid symmetric arch with %i segments and survives JSON roundtrip',n=>{
  const m=createArch(6,2,n,10);expect(validateModel(m)).toEqual([]);expect(parseModel(JSON.stringify(m))).toEqual(m);
  expect(m.nodes[n/2]).toMatchObject({x:3,y:2});expect(m.members).toHaveLength(n);
  expect(m.supports.map(s=>s.kind)).toEqual(['pin','pin']);
 });
 it.each([[0,2,32,10],[6,0,32,10],[6,2,33,10],[6,2,80,10],[6,2,32,Infinity]])('rejects invalid arch inputs',(...v)=>expect(()=>createArch(...v as [number,number,number,number])).toThrow());
});
