import {describe,expect,it} from 'vitest';
import {example} from './model';
import {ARCHIVE_LIMIT,DRAFT_KEY,WORKSPACE_KEY,loadWorkspace,saveWorkspace,workspaceReducer} from './workspace';
import type {Workspace,WorkspaceAction} from './workspace';

const memory=()=>{const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};};
const blank={schemaVersion:1 as const,name:'未命名梁',nodes:[],members:[],supports:[],pointLoads:[],distributedLoads:[],moments:[],actionPoints:[]};
const metadata={id:'archive-1',createdAt:'2026-10-14T00:00:00.000Z',reason:'新建前' as const};
const initial=():Workspace=>({version:1,history:{past:[],present:example('point'),future:[]},archives:[]});

describe('durable workspace and model snapshots',()=>{
 it('migrates the existing draft without changing its parameters',()=>{const storage=memory(),model=example('frame');storage.setItem(DRAFT_KEY,JSON.stringify(model));expect(loadWorkspace(storage)).toEqual({...initial(),history:{past:[],present:model,future:[]}});});
 it('archives the old model before creating blank and survives reload',()=>{
  const storage=memory();const state=workspaceReducer(initial(),{type:'replace',model:blank,...metadata});saveWorkspace(storage,state);
  const reloaded=loadWorkspace(storage);expect(reloaded).toEqual(state);expect(reloaded.archives[0].model).toEqual(example('point'));
  expect(workspaceReducer(reloaded,{type:'undo'}).history.present).toEqual(example('point'));
 });
 it('persists both undo and redo after normal edits',()=>{
  const model=example('point');model.pointLoads[0].value=20;
  let state=workspaceReducer(initial(),{type:'set',model});state=workspaceReducer(state,{type:'undo'});
  const storage=memory();saveWorkspace(storage,state);state=loadWorkspace(storage);
  expect(workspaceReducer(state,{type:'redo'}).history.present.pointLoads[0].value).toBe(20);
 });
 it('restoring a snapshot preserves the current model and returns an independent editable copy',()=>{
  let state=workspaceReducer(initial(),{type:'replace',model:example('udl'),...metadata});
  const previous=state.archives[0];state=workspaceReducer(state,{type:'replace',model:previous.model,...metadata,id:'restoration',reason:'恢复历史前'});
  expect(state.archives[0].model).toEqual(example('udl'));state.history.present.pointLoads[0].value=100;
  expect(previous.model.pointLoads[0].value).toBe(10);expect(state.archives.find(x=>x.id==='archive-1')!.model.pointLoads[0].value).toBe(10);
 });
 it('keeps recent unique snapshots and skips repeated empty new documents',()=>{
  let state=initial();
  for(let i=0;i<30;i++){state=workspaceReducer(state,{type:'replace',model:{...example('point'),name:`模型 ${i}`},...metadata,id:String(i)});}
  expect(state.archives).toHaveLength(ARCHIVE_LIMIT);expect(state.archives[0].model.name).toBe('模型 28');
  state=workspaceReducer(state,{type:'replace',model:blank,...metadata});const n=state.archives.length;
  state=workspaceReducer(state,{type:'replace',model:blank,...metadata});expect(state.archives).toHaveLength(n);
  expect(state.archives.every(a=>a.model.nodes.length>0)).toBe(true);
 });
 it('deduplicates manual snapshots without mutating existing records',()=>{
  const one=workspaceReducer(initial(),{type:'snapshot',...metadata});
  const two=workspaceReducer(one,{type:'snapshot',...metadata,id:'second'});
  expect(two.archives).toHaveLength(1);expect(one.archives[0].id).toBe('archive-1');expect(two.archives[0].id).toBe('second');
 });
 it('recovers a valid draft when canonical storage is corrupt',()=>{
  const storage=memory();storage.setItem(WORKSPACE_KEY,'not-json');storage.setItem(DRAFT_KEY,JSON.stringify(example('udl')));
  expect(loadWorkspace(storage).history.present).toEqual(example('udl'));
 });
 it('skips one broken archive without losing other snapshots or the current model',()=>{
  const storage=memory(),state=workspaceReducer(initial(),{type:'snapshot',...metadata});
  storage.setItem(WORKSPACE_KEY,JSON.stringify({...state,archives:[{...state.archives[0],model:{}},...state.archives]}));
  const loaded=loadWorkspace(storage);expect(loaded.archives).toHaveLength(1);expect(loaded.history.present).toEqual(state.history.present);
 });
 it('failed atomic write leaves the previously persisted document intact',()=>{
  const storage=memory(),before=initial();saveWorkspace(storage,before);
  const action:WorkspaceAction={type:'replace',model:blank,...metadata};
  const next=workspaceReducer(before,action);
  const blocked={setItem:()=>{throw new Error('QuotaExceededError');}};
  expect(()=>saveWorkspace(blocked,next)).toThrow();expect(loadWorkspace(storage)).toEqual(before);
 });
 it('failure of the legacy draft mirror does not lose a saved canonical workspace',()=>{
  const storage=memory(),next=workspaceReducer(initial(),{type:'replace',model:blank,...metadata});
  saveWorkspace({setItem:(key,value)=>{if(key===DRAFT_KEY)throw new Error('QuotaExceededError');storage.setItem(key,value);}},next);
  expect(loadWorkspace(storage)).toEqual(next);
 });
 it('clearing persists every empty collection and keeps the complete model available to undo',()=>{
  const before=initial();before.history.present.distributedLoads=[{id:'qClear',memberId:'B1',value:2}];
  before.history.present.moments=[{id:'mClear',nodeId:'N2',value:10,side:'left'}];
  const cleared=workspaceReducer(before,{type:'replace',model:{...blank,name:before.history.present.name},...metadata,reason:'清空前'});
  const storage=memory();saveWorkspace(storage,cleared);const reloaded=loadWorkspace(storage);
  expect(reloaded.history.present).toEqual({...blank,name:before.history.present.name});
  expect(reloaded.archives[0].reason).toBe('清空前');expect(reloaded.archives[0].model).toEqual(before.history.present);
  expect(workspaceReducer(reloaded,{type:'undo'}).history.present).toEqual(before.history.present);
  expect(workspaceReducer(workspaceReducer(reloaded,{type:'undo'}),{type:'redo'}).history.present).toEqual(reloaded.history.present);
 });
 it('deleting a selected archive persists and preserves the current model, undo chain and other archives',()=>{
  let state=workspaceReducer(initial(),{type:'snapshot',...metadata});
  state=workspaceReducer(state,{type:'set',model:example('udl')});
  state=workspaceReducer(state,{type:'snapshot',...metadata,id:'keep-me'});
  const next=workspaceReducer(state,{type:'deleteArchive',id:'archive-1'});
  const storage=memory();saveWorkspace(storage,next);const reloaded=loadWorkspace(storage);
  expect(reloaded.archives.map(a=>a.id)).toEqual(['keep-me']);expect(reloaded.history).toEqual(state.history);
  expect(state.archives).toHaveLength(2);
  const empty=workspaceReducer(reloaded,{type:'deleteArchive',id:'keep-me'});saveWorkspace(storage,empty);
  expect(loadWorkspace(storage).archives).toEqual([]);expect(loadWorkspace(storage).history).toEqual(state.history);
 });
});

it('large undo chains are shortened without dropping archived documents or the current model',()=>{
 const ids=Array.from({length:80},(_,i)=>`N${i}-${'x'.repeat(70)}`);
 const large={...example('point'),nodes:ids.map((id,i)=>({id,x:i,y:0})),members:ids.slice(1).map((id,i)=>({id:`B${i}-${'x'.repeat(70)}`,start:ids[i],end:id,E:210,I:8000})),supports:[],pointLoads:[],distributedLoads:[],moments:[],actionPoints:[]};
 const archives=[{...metadata,model:structuredClone(large)}];
 const state:Workspace={version:1,archives,history:{present:large,past:Array.from({length:100},(_,i)=>({...large,name:`编辑 ${i}`})),future:[]}};
 const compacted=workspaceReducer(state,{type:'set',model:{...large,name:'最后编辑'}});
 expect(compacted.history.past.length).toBeLessThan(100);expect(compacted.history.past.length).toBeGreaterThan(0);
 expect(compacted.archives).toEqual(archives);expect(compacted.history.present.name).toBe('最后编辑');
 const storage=memory();saveWorkspace(storage,compacted);expect(loadWorkspace(storage)).toEqual(compacted);
});

