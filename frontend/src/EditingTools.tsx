import {useState} from 'react';
import {copyItems,createPolarMember,moveItems,type Item} from './editing';
import type {BeamModel} from './model';

export default function EditingTools({model,items,onChange,onSelection,onMessage}:{model:BeamModel;items:Item[];onChange:(m:BeamModel)=>void;onSelection:(s:Item[])=>void;onMessage:(s:string)=>void}){
 const [dx,setDx]=useState('0'),[dy,setDy]=useState('1'),[open,setOpen]=useState(false),[start,setStart]=useState(''),[length,setLength]=useState('3'),[angle,setAngle]=useState('0');
 const execute=(copy:boolean)=>{try{if(!dx.trim()||!dy.trim())throw Error('请输入移动距离。');if(copy){const result=copyItems(model,items,Number(dx),Number(dy));onChange(result.model);onSelection(result.selection);}else onChange(moveItems(model,items,Number(dx),Number(dy)));onMessage(copy?'所选对象已复制；引用关系一并复制，可撤销。':'所选对象已整体移动，可撤销。');}catch(e){onMessage((e as Error).message);}};
 return <div className="editing-tools">
  <span data-testid="selection-count">已选 {items.length} 项</span><span className="edit-help">空白处拖动框选 · Shift 多选</span>
  <label>ΔX<input aria-label="整体移动 X" type="number" step="any" value={dx} onChange={e=>setDx(e.target.value)}/></label><label>ΔY<input aria-label="整体移动 Y" type="number" step="any" value={dy} onChange={e=>setDy(e.target.value)}/></label><small>m</small>
  <button disabled={!items.length} onClick={()=>execute(false)}>整体移动</button><button disabled={!items.length} onClick={()=>execute(true)}>复制所选</button><button onClick={()=>setOpen(!open)} aria-expanded={open}>长度 / 角度建杆</button>
  {open&&<form className="polar-member" onSubmit={e=>{e.preventDefault();try{if(!length.trim()||!angle.trim())throw Error('请输入长度与角度。');onChange(createPolarMember(model,start||model.nodes[0]?.id,Number(length),Number(angle)));onMessage('已按长度和角度创建杆件；角度从全局 X 正方向逆时针量取。');}catch(err){onMessage((err as Error).message);}}}>
   <label>起点<select aria-label="精确建杆起点" value={model.nodes.some(n=>n.id===start)?start:model.nodes[0]?.id??''} onChange={e=>setStart(e.target.value)}>{model.nodes.map(n=><option key={n.id} value={n.id}>{n.id.slice(0,8)}</option>)}</select></label>
   <label>长度 m<input aria-label="精确杆长" type="number" min="0.0001" step="any" value={length} onChange={e=>setLength(e.target.value)}/></label><label>角度 °<input aria-label="精确杆件角度" type="number" step="any" value={angle} onChange={e=>setAngle(e.target.value)}/></label><button disabled={!model.nodes.length} type="submit">创建杆件</button><small>先放置起点节点；0°向右，90°向上</small>
  </form>}
 </div>;
}
