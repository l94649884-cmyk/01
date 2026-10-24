import {useState} from 'react';
import {createPortal} from 'react-dom';
export type CanvasSize={mode:'auto'|'custom';width:number;height:number;showRange:boolean;worldWidth:number;worldHeight:number};
export const defaultCanvasSize:CanvasSize={mode:'auto',width:1280,height:720,showRange:false,worldWidth:20,worldHeight:10};
export const canvasSizeKey='ligou-lab-canvas-size-v1';
export function validCanvasSize(value:unknown):value is CanvasSize {
 if(!value||typeof value!=='object')return false;
 const v=value as CanvasSize;
 return (v.mode==='auto'||v.mode==='custom')&&Number.isInteger(v.width)&&v.width>=640&&v.width<=2560&&Number.isInteger(v.height)&&v.height>=320&&v.height<=1600&&typeof v.showRange==='boolean'&&Number.isFinite(v.worldWidth)&&v.worldWidth>=.25&&v.worldWidth<=1000&&Number.isFinite(v.worldHeight)&&v.worldHeight>=.25&&v.worldHeight<=1000;
}
export function loadCanvasSize():CanvasSize {try{const v=JSON.parse(localStorage.getItem(canvasSizeKey)??'null');return validCanvasSize(v)?v:defaultCanvasSize;}catch{return defaultCanvasSize;}}
export default function CanvasSizeDialog({value,onApply,onClose,expanded}:{value:CanvasSize;onApply:(v:CanvasSize)=>void;onClose:()=>void;expanded:boolean}){
 const [mode,setMode]=useState(value.mode),[width,setWidth]=useState(String(value.width)),[height,setHeight]=useState(String(value.height)),[showRange,setShowRange]=useState(value.showRange),[worldWidth,setWorldWidth]=useState(String(value.worldWidth)),[worldHeight,setWorldHeight]=useState(String(value.worldHeight)),[error,setError]=useState('');
 return createPortal(<div className="canvas-size-backdrop" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}><form className="canvas-size-dialog" role="dialog" aria-modal="true" aria-label="设置画布大小" onSubmit={e=>{e.preventDefault();const next={mode,width:mode==='auto'?defaultCanvasSize.width:Number(width),height:mode==='auto'?defaultCanvasSize.height:Number(height),showRange,worldWidth:Number(worldWidth),worldHeight:Number(worldHeight)};if(!validCanvasSize(next)){setError('像素宽高须为范围内的整数；米制宽高须为 0.25–1000 m。');return;}onApply(next);}}>
  <div><h2>画布大小</h2><button type="button" aria-label="关闭画布大小设置" onClick={onClose}>关闭</button></div>
  <p>调整绘图区的显示尺寸，不改变节点坐标或杆件尺寸。</p>
  <label><input autoFocus type="radio" name="canvas-size-mode" checked={mode==='auto'} onChange={()=>setMode('auto')}/>自动适应工作区</label>
  <label><input type="radio" name="canvas-size-mode" checked={mode==='custom'} onChange={()=>setMode('custom')}/>自定义像素尺寸</label>
  <div className="canvas-size-fields"><label>宽度<input aria-label="画布宽度" type="number" min="640" max="2560" step="1" disabled={mode==='auto'} value={width} onChange={e=>setWidth(e.target.value)}/>px</label><label>高度<input aria-label="画布高度" type="number" min="320" max="1600" step="1" disabled={mode==='auto'} value={height} onChange={e=>setHeight(e.target.value)}/>px</label></div>
  <div className="canvas-size-presets">{[[960,540],[1280,720],[1920,1080]].map(([w,h])=><button type="button" key={w} onClick={()=>{setMode('custom');setWidth(String(w));setHeight(String(h));}}>{w} × {h}</button>)}</div>
  <fieldset><legend>模型空间范围</legend><label><input type="checkbox" checked={showRange} onChange={e=>setShowRange(e.target.checked)}/>显示绘图范围并适应视图</label><div className="canvas-size-fields"><label>宽度<input aria-label="模型空间宽度" type="number" min="0.25" max="1000" step="any" value={worldWidth} onChange={e=>setWorldWidth(e.target.value)}/>m</label><label>高度<input aria-label="模型空间高度" type="number" min="0.25" max="1000" step="any" value={worldHeight} onChange={e=>setWorldHeight(e.target.value)}/>m</label></div><p>参考范围从原点 (0, 0) 向右、向上展开；虚线框用于定位，不裁剪或缩放模型，框外仍可绘制。</p></fieldset>
  <p>超过工作区时可使用边缘滚动条。{expanded?'全屏始终铺满窗口，退出全屏后使用这里设置的尺寸。':'全屏时自动铺满窗口，退出后恢复此尺寸。'}</p>
  {error&&<p role="alert">{error}</p>}
  <button type="submit" className="primary">应用画布大小</button>
 </form></div>,document.body);
}
