import {useState} from 'react';
import {fmt,type BeamModel,type Selection} from './model';
import {pointOnMember} from './momentGeometry';
import type {XY} from './construction';
export type CoordinatePreview=Record<string,XY>|null;
export default function Coordinates({model,selection,preview}:{model:BeamModel;selection:Selection;preview:CoordinatePreview}){
  const [reference,setReference]=useState('origin');
  const nodes=model.nodes.map(n=>({...n,...preview?.[n.id]}));
  const current={...model,nodes};
  const choices=[{id:'origin',x:0,y:0,label:'全局原点 (0, 0)'},...nodes.map(n=>({...n,label:`节点 ${n.id}`})),...model.actionPoints.flatMap(p=>{const xy=pointOnMember(current,p);return xy?[{id:p.id,...xy,label:`作用点 ${p.id}`}]:[];})];
  const ref=choices.find(p=>p.id===reference)??choices[0];
  const member=selection?.type==='members'?model.members.find(m=>m.id===selection.id):undefined;
  const points=member?[{...nodes.find(n=>n.id===member.start)!,label:'起点'},{...nodes.find(n=>n.id===member.end)!,label:'终点'}]:nodes.filter(n=>selection?.type==='nodes'&&n.id===selection.id).map(n=>({...n,label:'节点'}));
  if(!points.length)return null;
  return <section className="coordinate-panel" data-testid="coordinates"><strong>实时坐标 <small>m{preview?' · 拖动预览':''}</small></strong>
    <label>相对参考点<select aria-label="坐标参考点" value={ref.id} onChange={e=>setReference(e.target.value)}>{choices.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    {points.map(p=><div key={p.id} data-testid={`coordinates-${p.id}`}><b>{p.label}</b><span>绝对 X {fmt(p.x)} · Y {fmt(p.y)}</span><span>相对 ΔX {fmt(p.x-ref.x)} · ΔY {fmt(p.y-ref.y)}</span></div>)}
    {member&&<small>杆长 {fmt(Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y))} m · 角度 {fmt(Math.atan2(points[1].y-points[0].y,points[1].x-points[0].x)*180/Math.PI)}°</small>}
    <small>绝对坐标以全局原点为基准；相对坐标为当前点减去参考点。拖动期间显示当前位置，松开后显示吸附位置。</small>
  </section>;
}
