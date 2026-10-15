import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Palette } from 'lucide-react';
import { palettes, themes } from './themes';
import type { ThemeId } from './themes';

export default function ThemePicker({ theme, onChange }: { theme: ThemeId; onChange: (theme: ThemeId) => void }) {
  const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const current=themes.find(item=>item.id===theme)!;
  useEffect(()=>{
    if(!open)return;
    const outside=(e:MouseEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};
    document.addEventListener('mousedown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  return <div className="theme-picker" ref={root}>
    <button ref={trigger} className="theme-trigger" aria-label="切换主题" aria-expanded={open} aria-controls="theme-panel" onClick={()=>setOpen(!open)}><Palette size={17}/><span>{current.name}</span><ChevronDown size={14}/></button>
    {open&&<div className="theme-panel" id="theme-panel" role="dialog" aria-label="界面主题">
      <div className="theme-panel-title"><strong>选择工作台外观</strong><span>五种配色 · 自动记住偏好</span></div>
      <div className="theme-options">{themes.map(item=>{const p=palettes[item.id];return <button key={item.id} aria-label={`使用${item.name}`} aria-pressed={theme===item.id} className="theme-option" onClick={()=>{onChange(item.id);setOpen(false);trigger.current?.focus();}}>
        <span className="theme-preview" style={{background:p.bg,borderColor:p.majorGrid}}><span style={{background:p.majorGrid}}/><svg viewBox="0 0 120 48" aria-hidden="true"><path d="M26 37V12H93" fill="none" stroke={p.ink} strokeWidth="2"/><path d="M26 37H42V12L93 25V12" fill={p.accent} fillOpacity=".16" stroke={p.accent} strokeWidth="1.5"/><circle cx="26" cy="37" r="3" fill={p.bg} stroke={p.ink}/></svg><i style={{background:p.accent}}/></span>
        <span className="theme-option-name">{item.name}{theme===item.id&&<Check size={14}/>}</span><small>{item.description}</small>
      </button>;})}</div>
    </div>}
  </div>;
}
