import {useEffect,useRef,useState} from 'react';

const layoutKey='ligou-lab-panel-layout-v1';
export const defaultLayout={left:188,right:284,canvas:384};
type Layout=typeof defaultLayout;
export function useWorkspaceLayout(){
 const [layout,setLayout]=useState<Layout>(()=>{try{const v=JSON.parse(localStorage.getItem(layoutKey)??'null');if(v&&Object.keys(defaultLayout).every(k=>Number.isFinite(v[k])&&v[k]>=100&&v[k]<=2000))return v;}catch{/* Use defaults when storage is unavailable. */}return defaultLayout;});
 useEffect(()=>{try{localStorage.setItem(layoutKey,JSON.stringify(layout));}catch{/* Layout still works without persistence. */}},[layout]);
 return {layout,resize:(key:keyof Layout,value:number)=>setLayout(prev=>({...prev,[key]:value})),reset:()=>setLayout(defaultLayout)};
}

/** Pointer capture keeps a drag active when the pointer crosses the canvas. */
export default function PanelSplitter({label,axis,value,min,max,reverse=false,onChange,onReset}:{label:string;axis:'x'|'y';value:number;min:number;max:()=>number;reverse?:boolean;onChange:(value:number)=>void;onReset:()=>void}){
 const drag=useRef<{pointer:number;start:number;size:number}|null>(null);
 const [active,setActive]=useState(false);
 const clamp=(n:number)=>Math.round(Math.max(min,Math.min(max(),n)));
 return <div className={`panel-splitter ${axis==='x'?'vertical':'horizontal'}${active?' dragging':''}`} role="separator" tabIndex={0} aria-label={label} aria-orientation={axis==='x'?'vertical':'horizontal'} aria-valuenow={Math.round(value)} aria-valuemin={min} title={`${label}：拖动调整，双击恢复；方向键微调`}
  onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();const parent=e.currentTarget.parentElement!;const size=axis==='y'?parent.querySelector('.canvas-viewport')!.getBoundingClientRect().height:(reverse?e.currentTarget.nextElementSibling:e.currentTarget.previousElementSibling)!.getBoundingClientRect().width;drag.current={pointer:e.pointerId,start:axis==='x'?e.clientX:e.clientY,size};e.currentTarget.setPointerCapture(e.pointerId);setActive(true);}}
  onPointerMove={e=>{const d=drag.current;if(d?.pointer!==e.pointerId)return;onChange(clamp(d.size+((axis==='x'?e.clientX:e.clientY)-d.start)*(reverse?-1:1)));}}
  onPointerUp={e=>{if(drag.current?.pointer===e.pointerId){drag.current=null;setActive(false);e.currentTarget.releasePointerCapture(e.pointerId);}}}
  onPointerCancel={()=>{drag.current=null;setActive(false);}} onLostPointerCapture={()=>{drag.current=null;setActive(false);}}
  onDoubleClick={onReset} onKeyDown={e=>{const direction=axis==='x'?(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0):(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0);if(direction){e.preventDefault();onChange(clamp(value+direction*(reverse?-1:1)*(e.shiftKey?40:10)));}else if(e.key==='Home'){e.preventDefault();onReset();}}}><span/></div>;
}
