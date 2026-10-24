import {useState} from 'react';
import {MousePointer2,Circle,Minus,CornerDownRight,Spline,Triangle,Square,ArrowDown,ArrowDownToLine,RotateCcw,Diamond,PanelLeftClose,PanelLeftOpen} from 'lucide-react';
import type {Tool} from './model';

const groups=[
 {name:'几何与连接',items:[{tool:'node',label:'节点',Icon:Circle},{tool:'member',label:'杆件',Icon:Minus},{tool:'polyline',label:'直角杆',Icon:CornerDownRight},{tool:'arch',label:'拱形杆',Icon:Spline},{tool:'actionPoint',label:'作用点',Icon:Diamond}]},
 {name:'边界约束',items:[{tool:'pin',label:'铰支座',Icon:Triangle},{tool:'roller',label:'滚动支座',Icon:Circle},{tool:'fixed',label:'固定支座',Icon:Square}]},
 {name:'外部荷载',items:[{tool:'point',label:'集中力',Icon:ArrowDown},{tool:'udl',label:'均布荷载',Icon:ArrowDownToLine},{tool:'moment',label:'集中弯矩',Icon:RotateCcw}]},
];
export default function CanvasTools({tool,onTool,onArch}:{tool:Tool;onTool:(t:Tool)=>void;onArch:()=>void}){
 const [collapsed,setCollapsed]=useState(false);
 return <aside className={`fullscreen-palette ${collapsed?'collapsed':''}`} data-canvas-ui role="toolbar" aria-label="全屏绘图工具">
  <div className="fullscreen-palette-head">{!collapsed&&<strong>绘图工具</strong>}<button aria-label={collapsed?'展开绘图工具':'收起绘图工具'} title={collapsed?'展开绘图工具':'收起绘图工具'} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}>{collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button></div>
  {!collapsed&&<div className="fullscreen-palette-body"><button className={`palette-select ${tool==='select'?'active':''}`} aria-pressed={tool==='select'} onClick={()=>onTool('select')}><MousePointer2 size={17}/><span>选择 / 移动</span><kbd>Esc</kbd></button>
   {groups.map(group=><section key={group.name}><h3>{group.name}</h3><div>{group.items.map(({tool:t,label,Icon})=><button key={t} aria-label={`全屏${label}`} aria-pressed={tool===t} className={tool===t?'active':''} onClick={()=>t==='arch'?onArch():onTool(t as Tool)}><Icon size={19}/><span>{label}</span></button>)}</div></section>)}
  </div>}
 </aside>;
}
