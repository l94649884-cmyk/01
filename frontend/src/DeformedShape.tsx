import {useState} from 'react';
import {evaluate,fmt,type BeamModel,type Solution} from './model';
import {segmentEndpoints} from './StructureDiagram';
import type {ThemePalette} from './themes';

export function deformationPoints(model:BeamModel,solution:Solution,factor:number){
 return solution.segments.map(segment=>{const [a,b]=segmentEndpoints(model,segment);return Array.from({length:61},(_,i)=>{const t=i/60,sample=evaluate(segment,segment.x0+t*(segment.x1-segment.x0));return {x:a.x+(b.x-a.x)*t+factor*(sample.ux??0),y:a.y+(b.y-a.y)*t+factor*(sample.uy??0),sample};});});
}
export default function DeformedShape({model,solution,palette}:{model:BeamModel;solution:Solution;palette:ThemePalette}){
 const [factor,setFactor]=useState<number|null>(null),[overlay,setOverlay]=useState(true),[hover,setHover]=useState<{ux:number;uy:number}|null>(null);
 const span=Math.max(...model.nodes.map(n=>n.x))-Math.min(...model.nodes.map(n=>n.x)),rise=Math.max(...model.nodes.map(n=>n.y))-Math.min(...model.nodes.map(n=>n.y));
 const maxD=Math.max(...solution.samples.map(p=>Math.hypot(p.ux??0,p.uy??0)),0);
 const automatic=maxD>1e-12?Math.min(1e6,.15*Math.max(span,rise,1)/maxD):1,actual=factor??automatic;
 const paths=deformationPoints(model,solution,actual),all=[...model.nodes,...paths.flat()];
 const xs=all.map(p=>p.x),ys=all.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const scale=Math.min(620/Math.max(maxX-minX,1),235/Math.max(maxY-minY,1));
 const project=(p:{x:number;y:number})=>({x:400+(p.x-(minX+maxX)/2)*scale,y:170-(p.y-(minY+maxY)/2)*scale});
 return <div className="deformation-panel" data-testid="deformation-panel">
  <div className="deformation-controls"><label>变形放大倍数<input aria-label="变形放大倍数" type="number" min="0" max="1000000" step="any" value={Number(actual.toFixed(3))} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n)&&n>=0&&n<=1e6)setFactor(n);}}/></label><button onClick={()=>setFactor(null)}>自动放大</button><label><input type="checkbox" checked={overlay} onChange={e=>setOverlay(e.target.checked)}/>叠加原始结构</label></div>
  <svg viewBox="0 0 800 340" role="img" aria-label="结构实际位移变形图" onMouseLeave={()=>setHover(null)}>
   {overlay&&model.members.map(m=>{const a=project(model.nodes.find(n=>n.id===m.start)!),b=project(model.nodes.find(n=>n.id===m.end)!);return <line key={m.id} data-testid="undeformed-member" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={palette.muted} strokeDasharray="6 5" strokeWidth={2}/>;})}
   {paths.map((points,index)=><g key={index}><path data-testid="deformed-member" d={points.map((p,i)=>{const v=project(p);return `${i?'L':'M'}${v.x},${v.y}`;}).join(' ')} fill="none" stroke={palette.accent} strokeWidth={3}/>{points.map((p,i)=>{const v=project(p);return <circle key={i} cx={v.x} cy={v.y} r={7} fill="transparent" onMouseMove={()=>setHover({ux:p.sample.ux??0,uy:p.sample.uy??0})}/>;})}</g>)}
   {solution.nodalDisplacements?.map(d=>{const n=model.nodes.find(n=>n.id===d.nodeId)!;const p=project({x:n.x+actual*d.ux,y:n.y+actual*d.uy});return <circle key={d.nodeId} cx={p.x} cy={p.y} r={4} fill={palette.bg} stroke={palette.accent} strokeWidth={2} onMouseMove={()=>setHover({ux:d.ux,uy:d.uy})}/>;})}
  </svg><p data-testid="deformation-readout">{hover?`真实位移 ux = ${fmt(hover.ux*1000)} mm，uy = ${fmt(hover.uy*1000)} mm`:`显示放大 ${fmt(actual,1)} 倍 · 实线为变形轮廓，虚线为原始结构；悬停查看真实位移。`}</p>
 </div>;
}
