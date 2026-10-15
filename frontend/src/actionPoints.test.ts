import {expect,it} from 'vitest';
import {example,parseModel,removeSelection,validateModel} from './model';
import {momentAnchor,momentTargets,nearestMomentTarget,pointOnMember,resolveMomentTarget} from './momentGeometry';
import {loadWorkspace,saveWorkspace,workspaceReducer, type Workspace} from './workspace';

function fixture(){const model=example('point');model.actionPoints=[{id:'A1',memberId:'B1',at:2.17}];model.moments=[{id:'M1',pointId:'A1',value:10,side:'center'}];return model;}
it('positions action points along horizontal, vertical, diagonal and reversed members',()=>{
  for(const [x,y] of [[6,0],[0,6],[3.6,4.8],[-6,0]]){
    const model=fixture();model.nodes[1]={id:'N2',x,y};
    expect(pointOnMember(model,model.actionPoints[0])).toEqual({x:x*2.17/6,y:y*2.17/6});
    expect(resolveMomentTarget(model,model.moments[0])).toEqual(pointOnMember(model,model.actionPoints[0]));
  }
});
it('snaps to the center and both sides at different zooms without adding connection nodes',()=>{
  const model=fixture(),targets=momentTargets(model),point=targets[0];
  for(const scale of [25,80,200])for(const side of ['center','left','right'] as const){
    const hit=nearestMomentTarget(targets,momentAnchor(point,side,scale),scale)!;
    expect(hit.node.id).toBe('A1');expect(hit.side).toBe(side);
  }
  expect(nearestMomentTarget(targets,{x:2,y:100},80)).toBeNull();
  model.actionPoints[0].at=0;expect(nearestMomentTarget(momentTargets(model),{x:0,y:0},80)?.node.kind).toBe('actionPoint');
  expect(model.nodes).toHaveLength(2);expect(model.members).toHaveLength(1);
});
it('keeps old JSON compatible and checks references, exclusive targets and point positions',()=>{
  const model=fixture();expect(parseModel(JSON.stringify(model))).toEqual(model);expect(validateModel(model)).toEqual([]);
  model.actionPoints[0].at=7;expect(validateModel(model).join()).toContain('超出杆件长度');
  model.actionPoints[0].memberId='missing';expect(()=>parseModel(JSON.stringify(model))).toThrow('无效');
  const both=fixture();both.moments[0].nodeId='N1';expect(()=>parseModel(JSON.stringify(both))).toThrow('规范');
  const legacy={...example('point')};delete (legacy as Partial<typeof legacy>).actionPoints;
  expect(parseModel(JSON.stringify(legacy)).actionPoints).toEqual([]);
});
it('deletes point moments with their point or member but leaves geometry when only the point is deleted',()=>{
  const model=fixture(),removed=removeSelection(model,{type:'actionPoints',id:'A1'});
  expect(removed.actionPoints).toEqual([]);expect(removed.moments).toEqual([]);expect(removed.nodes).toEqual(model.nodes);expect(removed.members).toEqual(model.members);
  for(const selection of [{type:'members',id:'B1'},{type:'nodes',id:'N1'}] as const){
    const next=removeSelection(model,selection);expect(next.actionPoints).toEqual([]);expect(next.moments).toEqual([]);
  }
  expect(removeSelection(model,{type:'moments',id:'M1'}).actionPoints).toEqual(model.actionPoints);
});
it('persists action points, archives and undo through browser storage reload',()=>{
  const model=fixture(),initial:Workspace={version:1,history:{past:[],present:model,future:[]},archives:[]};
  let state=workspaceReducer(initial,{type:'snapshot',id:'archive',createdAt:'2026-10-16T00:00:00Z',reason:'手动快照'});
  state=workspaceReducer(state,{type:'set',model:removeSelection(model,{type:'actionPoints',id:'A1'})});
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  saveWorkspace(storage,state);state=loadWorkspace(storage);
  expect(state.archives[0].model).toEqual(model);expect(workspaceReducer(state,{type:'undo'}).history.present).toEqual(model);
});
