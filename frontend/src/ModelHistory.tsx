import { useEffect, useRef, useState } from 'react';
import { Archive, Clock3, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { ARCHIVE_LIMIT, hasContent } from './workspace';
import type { ModelArchive } from './workspace';
import type { BeamModel } from './model';

function Preview({model}:{model:BeamModel}){
  if(!model.nodes.length)return null;
  const xs=model.nodes.map(n=>n.x),ys=model.nodes.map(n=>n.y),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const scale=Math.min(128/Math.max(x1-x0,1),50/Math.max(y1-y0,1));
  const at=(id:string)=>{const n=model.nodes.find(n=>n.id===id);return n?{x:80+(n.x-(x0+x1)/2)*scale,y:38-(n.y-(y0+y1)/2)*scale}:null;};
  return <svg viewBox="0 0 160 76" aria-hidden="true">{model.members.map(m=>{const a=at(m.start),b=at(m.end);return a&&b?<line key={m.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>:null;})}{model.nodes.map(n=>{const p=at(n.id)!;return <circle key={n.id} cx={p.x} cy={p.y} r={3}/>;})}</svg>;
}

export default function ModelHistory({archives,model,onClose,onRestore,onSnapshot,onDelete}:{archives:ModelArchive[];model:BeamModel;onClose:()=>void;onRestore:(archive:ModelArchive)=>void;onSnapshot:()=>void;onDelete:(archive:ModelArchive)=>boolean}){
  const dialog=useRef<HTMLElement>(null);
  const [deleteMessage,setDeleteMessage]=useState('');
  useEffect(()=>{const before=document.activeElement as HTMLElement|null;dialog.current?.focus();return()=>before?.focus();},[]);
  return <div className="modal-backdrop history-backdrop" onClick={onClose}><section ref={dialog} tabIndex={-1} className="history-modal" role="dialog" aria-modal="true" aria-label="模型历史" onClick={e=>e.stopPropagation()} onKeyDown={e=>{
    if(e.key==='Escape'){e.stopPropagation();onClose();}
    if(e.key==='Tab'){
      const items=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first=items[0],last=items.at(-1);
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===e.currentTarget)){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===e.currentTarget)){e.preventDefault();first?.focus();}
    }
  }}>
    <div className="history-heading"><div><Archive size={22}/><h2>模型历史</h2><span>{archives.length} 个快照</span></div><button aria-label="关闭模型历史" onClick={onClose}><X size={20}/></button></div>
    <p className="history-intro">新建、清空、载入和切换算例前自动保留当前模型。恢复历史前也会保留当前非空模型，刷新后仍可找回。</p>
    <div className="history-current"><div><span>当前模型</span><strong>{model.name}</strong></div><button disabled={!hasContent(model)} onClick={onSnapshot}><Save size={15}/>保存当前快照</button></div>
    {deleteMessage&&<p className="history-delete-message" role="status">{deleteMessage}</p>}
    <div className="history-list">{archives.map(item=><article className="history-card" key={item.id}><div className="history-preview"><Preview model={item.model}/></div><div className="history-card-info"><h3>{item.model.name}</h3><p><Clock3 size={12}/>{new Date(item.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}<span>{item.reason}</span></p><small>{item.model.nodes.length} 节点 · {item.model.members.length} 杆件 · {item.model.actionPoints.length} 作用点 · {item.model.pointLoads.length+item.model.distributedLoads.length+item.model.moments.length} 荷载</small></div><div className="history-card-actions"><button className="history-restore" aria-label={`恢复模型 ${item.model.name}`} onClick={()=>onRestore(item)}><RotateCcw size={14}/>恢复模型</button><button className="history-delete" aria-label={`删除历史模型 ${item.model.name}`} onClick={()=>{setDeleteMessage(onDelete(item)?`已删除「${item.model.name}」的历史快照。`:'删除未保存，请检查浏览器存储空间后重试。');dialog.current?.focus();}}><Trash2 size={14}/>删除</button></div></article>)}{!archives.length&&<div className="history-empty"><Archive size={30}/><strong>还没有历史快照</strong><p>新建、清空前会自动保留当前模型，也可点击“保存当前快照”。</p></div>}</div>
    <p className="history-footnote">此浏览器保留最近 {ARCHIVE_LIMIT} 个不同模型快照；撤销 / 重做也会自动保存（最多 100 步，大模型会缩短）。清除浏览器数据会清除历史，长期保存请导出 JSON。升级前未保存的旧模型无法补回。</p>
  </section></div>;
}

