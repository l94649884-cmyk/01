import {useState} from 'react';
import {createArch} from './construction';
import type {BeamModel,Tool} from './model';

export default function ConstructionTools({tool,onTool,onArch,onMessage}:{tool:Tool;onTool:(t:Tool)=>void;onArch:(m:BeamModel)=>void;onMessage:(m:string)=>void}){
  const [open,setOpen]=useState(false),[span,setSpan]=useState('6'),[rise,setRise]=useState('2'),[segments,setSegments]=useState('32'),[load,setLoad]=useState('10');
  return <div className="construction-tools">
    <button aria-pressed={tool==='polyline'} onClick={()=>onTool(tool==='polyline'?'select':'polyline')}>连续直角折杆</button>
    <button aria-expanded={open} onClick={()=>setOpen(!open)}>拱形建模</button>
    <small>折杆共用刚接转角 · 拱形分段近似</small>
    {open&&<form onSubmit={e=>{e.preventDefault();try{if([span,rise,segments,load].some(s=>!s.trim()))throw Error('请填写所有拱形参数。');onArch(createArch(+span,+rise,+segments,+load));setOpen(false);}catch(err){onMessage((err as Error).message);}}}>
      <strong>抛物线双铰拱</strong>
      {([{label:'拱跨度',unit:'m',value:span,set:setSpan},{label:'拱矢高',unit:'m',value:rise,set:setRise},{label:'拱分段数',unit:'段',value:segments,set:setSegments},{label:'拱顶集中力',unit:'kN ↓',value:load,set:setLoad}]).map(f=><label key={f.label}>{f.label}<input aria-label={f.label} type="number" step="any" value={f.value} onChange={e=>f.set(e.target.value)}/><small>{f.unit}</small></label>)}
      <p>生成新模型并保留当前历史。两端铰支座，拱顶无内铰；E = 210 GPa，I = 8000 cm⁴，A = 100 cm²，可选杆件修改。直杆分段近似曲线；建议比较 16 / 32 / 64 段结果，尚非曲梁单元分析。</p>
      <button type="submit">生成拱形模型</button>
    </form>}
  </div>;
}
