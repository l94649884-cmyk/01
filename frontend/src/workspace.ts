import { example, historyReducer, parseModel } from './model';
import type { BeamModel, History } from './model';

export const WORKSPACE_KEY='ligou-lab-workspace-v1';
export const DRAFT_KEY='ligou-lab-draft-v1';
export const ARCHIVE_LIMIT=20;
export type ArchiveReason='新建前'|'清空前'|'载入前'|'切换算例前'|'恢复历史前'|'手动快照';
export type ModelArchive={id:string;createdAt:string;reason:ArchiveReason;model:BeamModel};
export type Workspace={version:1;history:History;archives:ModelArchive[]};
export type WorkspaceAction={type:'set';model:BeamModel}|{type:'undo'|'redo'}|{type:'replace';model:BeamModel;id:string;createdAt:string;reason:ArchiveReason}|{type:'snapshot';id:string;createdAt:string;reason:ArchiveReason}|{type:'deleteArchive';id:string};
export const hasContent=(model:BeamModel)=>model.nodes.length+model.members.length+model.supports.length+model.pointLoads.length+model.distributedLoads.length+model.moments.length+model.actionPoints.length>0;

function archiveCurrent(workspace:Workspace,action:{id:string;createdAt:string;reason:ArchiveReason}){
  const model=workspace.history.present;
  if(!hasContent(model))return workspace.archives;
  const serialized=JSON.stringify(model);
  // Identical snapshots share one entry. Editing the restored copy cannot mutate it.
  return [{id:action.id,createdAt:action.createdAt,reason:action.reason,model:structuredClone(model)},...workspace.archives.filter(item=>JSON.stringify(item.model)!==serialized)].slice(0,ARCHIVE_LIMIT);
}

function compact(workspace:Workspace):Workspace{
  const history={...workspace.history,past:[...workspace.history.past],future:[...workspace.history.future]};
  const result={...workspace,history};
  // Keep all model snapshots and the current draft; shorten only distant undo
  // states for large documents before hitting the browser's storage quota.
  while((history.past.length||history.future.length)&&JSON.stringify(result).length>1_500_000){
    if(history.past.length)history.past.shift();else history.future.pop();
  }
  return result;
}

export function workspaceReducer(workspace:Workspace,action:WorkspaceAction):Workspace{
  if(action.type==='deleteArchive')return {...workspace,archives:workspace.archives.filter(item=>item.id!==action.id)};
  if(action.type==='snapshot')return compact({...workspace,archives:archiveCurrent(workspace,action)});
  if(action.type==='replace')return compact({...workspace,archives:archiveCurrent(workspace,action),history:historyReducer(workspace.history,{type:'set',model:structuredClone(action.model)})});
  return compact({...workspace,history:historyReducer(workspace.history,action)});
}

export function loadWorkspace(storage:Pick<Storage,'getItem'>):Workspace{
  try{
    const raw=storage.getItem(WORKSPACE_KEY);
    if(raw){
      const data=JSON.parse(raw);
      if(data.version!==1||!data.history||!Array.isArray(data.history.past)||!Array.isArray(data.history.future)||!Array.isArray(data.archives))throw new Error('Invalid workspace');
      const read=(value:unknown)=>parseModel(JSON.stringify(value));
      const validModels=(values:unknown[])=>values.flatMap(value=>{try{return [read(value)];}catch{return [];}});
      const archives:ModelArchive[]=data.archives.slice(0,ARCHIVE_LIMIT).flatMap((entry:ModelArchive)=>{
        try{
          if(typeof entry.id!=='string'||typeof entry.createdAt!=='string'||!Number.isFinite(Date.parse(entry.createdAt))||!['新建前','清空前','载入前','切换算例前','恢复历史前','手动快照'].includes(entry.reason))return [];
          return [{id:entry.id,createdAt:entry.createdAt,reason:entry.reason,model:read(entry.model)}];
        }catch{return [];}
      });
      return compact({version:1,history:{present:read(data.history.present),past:validModels(data.history.past.slice(-100)),future:validModels(data.history.future.slice(0,100))},archives});
    }
  }catch{ /* A damaged workspace can still recover the previous-format draft. */ }
  let present=example('point');
  try{const raw=storage.getItem(DRAFT_KEY);if(raw)present=parseModel(raw);}catch{ /* Keep the application usable. */ }
  return {version:1,history:{past:[],present,future:[]},archives:[]};
}

export function saveWorkspace(storage:Pick<Storage,'setItem'>,workspace:Workspace){
  // One atomic write preserves current draft, undo/redo and archived documents.
  // Callers can abort document replacement if this write fails.
  storage.setItem(WORKSPACE_KEY,JSON.stringify(workspace));
  try{storage.setItem(DRAFT_KEY,JSON.stringify(workspace.history.present));}catch{ /* Canonical workspace is already safely saved. */ }
}

