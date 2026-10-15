import { describe, expect, it } from 'vitest';
import { evaluate, example, historyReducer, parseModel, removeSelection, snap, validateModel } from './model';
import type { History } from './model';

describe('model documents and editing',()=>{
  it.each(['point','udl','cantilever'] as const)('round-trips the %s benchmark',kind=>{const m=example(kind);expect(parseModel(JSON.stringify(m))).toEqual(m);expect(validateModel(m)).toEqual([]);});
  it('rejects missing references, duplicate IDs, unknown fields, and unsupported schema',()=>{
    const m=example('point');m.pointLoads[0].memberId='missing';expect(()=>parseModel(JSON.stringify(m))).toThrow('无效');
    expect(()=>parseModel(JSON.stringify({...example('point'),schemaVersion:2}))).toThrow();
    expect(()=>parseModel(JSON.stringify({...example('point'),unsupported:true}))).toThrow();
    const dup=example('point');dup.supports[0].id=dup.members[0].id;expect(()=>parseModel(JSON.stringify(dup))).toThrow('重复');
  });
  it('permits incomplete saved drafts but flags them before solving',()=>{const m={...example('point'),supports:[]};expect(parseModel(JSON.stringify(m))).toEqual(m);expect(validateModel(m).join()).toContain('约束不足');});
  it('deleting a node removes dangling members, supports, and loads',()=>{const m=example('point');const next=removeSelection(m,{type:'nodes',id:'N1'});expect(next.members).toEqual([]);expect(next.pointLoads).toEqual([]);expect(next.supports.map(s=>s.nodeId)).toEqual(['N2']);expect(m.members).toHaveLength(1);});
  it('undo/redo restores every dependent entity and editing clears redo',()=>{const a=example('point');let h:History={past:[],present:a,future:[]};h=historyReducer(h,{type:'set',model:removeSelection(a,{type:'nodes',id:'N1'})});const b=h.present;h=historyReducer(h,{type:'undo'});expect(h.present).toEqual(a);h=historyReducer(h,{type:'redo'});expect(h.present).toEqual(b);h=historyReducer(h,{type:'undo'});h=historyReducer(h,{type:'set',model:example('udl')});expect(h.future).toEqual([]);});
  it('allows slopes and flags out-of-span loads and duplicate supports',()=>{
    const m=example('point');m.nodes[1].y=1;expect(validateModel(m)).toEqual([]);m.nodes[1].y=0;
    m.pointLoads[0].at=7;expect(validateModel(m).join()).toContain('超出');m.pointLoads[0].at=3;
    m.supports[1].nodeId='N1';expect(validateModel(m).join()).toContain('一个支座');
  });
  it.each(['vertical','inclined','frame'] as const)('accepts %s geometry and real member distances',kind=>{const m=example(kind);expect(validateModel(m)).toEqual([]);expect(parseModel(JSON.stringify(m))).toEqual(m);});
  it('deleting only a support leaves nodes, members and loads intact',()=>{const m=example('point');expect(removeSelection(m,{type:'supports',id:'S1'})).toEqual({...m,supports:[m.supports[1]]});});
  it('rejects unconnected intersections and geometric overlap',()=>{
    const m=example('cantilever');m.nodes=[{id:'N1',x:0,y:0},{id:'N2',x:2,y:2},{id:'N3',x:0,y:2},{id:'N4',x:2,y:0}];m.pointLoads=[];m.members=[{id:'B1',start:'N1',end:'N2',E:210,I:8000},{id:'B2',start:'N3',end:'N4',E:210,I:8000}];expect(validateModel(m).join()).toContain('交叉');
    m.nodes[2]={id:'N3',x:1,y:1};expect(validateModel(m).join()).toContain('分段');
  });
  it('keeps engineering coordinate snapping predictable',()=>{expect(snap(2.37)).toBe(2.25);expect(snap(-.62)).toBe(-.5);});
});

describe('continuous section readout',()=>{
  it('evaluates an exact uniformly loaded span including its particular deflection',()=>{const r=evaluate({memberId:'B1',x0:0,x1:6,V0:6,M0:0,q:-2,EI:16800,dofs:[0,-2*6**3/(24*16800),0,2*6**3/(24*16800)]},3);expect(r.shear).toBe(0);expect(r.moment).toBe(9);expect(r.displacement).toBeCloseTo(-5*2*6**4/(384*16800),12);});
  it('transforms local axial and bending displacement into global directions',()=>{
    const r=evaluate({memberId:'B1',x0:0,x1:3,V0:0,M0:0,q:0,EI:16800,dofs:[0,0,0,0],N0:-10,qx:0,EA:2100000,axialDofs:[0,-30/2100000],c:0,s:1},3);
    expect(r.axial).toBe(-10);expect(r.displacement).toBeCloseTo(0,12);expect(r.ux).toBeCloseTo(0,12);expect(r.uy).toBeCloseTo(-30/2100000,12);
  });
});
