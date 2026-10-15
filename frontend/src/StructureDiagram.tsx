import { useState } from 'react';
import { evaluate, fmt } from './model';
import type { BeamModel, Segment, Solution } from './model';
import type { ThemePalette } from './themes';

export type DiagramMode='moment'|'shear'|'axial'|'displacement'|'ux'|'uy';

export function segmentEndpoints(model:BeamModel,segment:Segment){
  const member=model.members.find(m=>m.id===segment.memberId)!;
  const a=model.nodes.find(n=>n.id===member.start)!,b=model.nodes.find(n=>n.id===member.end)!;
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  const at=(s:number)=>({x:a.x+(b.x-a.x)*s/length,y:a.y+(b.y-a.y)*s/length});
  return [at(segment.s0??0),at(segment.s1??length)];
}

export default function StructureDiagram({model,solution,mode,color,symbol,unit,palette}:{model:BeamModel;solution:Solution;mode:DiagramMode;color:string;symbol:string;unit:string;palette:ThemePalette}){
  const [hover,setHover]=useState<{index:number;t:number}|null>(null);
  const factor=['displacement','ux','uy'].includes(mode)?1000:1;
  const maximum=Math.max(...solution.samples.map(p=>Math.abs(p[mode]??0)),1e-12);
  const xs=model.nodes.map(n=>n.x),ys=model.nodes.map(n=>n.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min(570/Math.max(maxX-minX,1),210/Math.max(maxY-minY,1));
  const project=(p:{x:number;y:number})=>({x:400+(p.x-(minX+maxX)/2)*scale,y:190-(p.y-(minY+maxY)/2)*scale});
  const diagrams=solution.segments.map(segment=>{
    const [a,b]=segmentEndpoints(model,segment),start=project(a),end=project(b);
    const c=segment.c??(b.x-a.x)/Math.hypot(b.x-a.x,b.y-a.y),s=segment.s??(b.y-a.y)/Math.hypot(b.x-a.x,b.y-a.y);
    const normal={x:-s,y:-c},sign=mode==='moment'?-1:1;
    const at=(t:number)=>{
      const sample=evaluate(segment,segment.x0+t*(segment.x1-segment.x0));
      const base={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t};
      const offset=sign*(sample[mode]??0)/maximum*64;
      return {base,point:{x:base.x+normal.x*offset,y:base.y+normal.y*offset},sample};
    };
    const points=Array.from({length:61},(_,i)=>at(i/60).point);
    return {segment,start,end,at,points,path:points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')};
  });
  const active=hover&&diagrams[hover.index]?diagrams[hover.index]:null;
  const readout=active&&hover?active.at(hover.t):null;
  return <div className="structure-diagram" data-testid="structure-diagram">
    <div className="structure-legend"><span><i style={{background:palette.ink}}/>结构轴线</span><span><i style={{background:color}}/>{symbol} · {unit}</span><span>全结构统一比例 · 数值已放大</span></div>
    <svg viewBox="0 0 800 380" role="img" aria-label={`整体结构${symbol}图，保留杆件实际方向`} onMouseLeave={()=>setHover(null)}>
      {diagrams.map((d,index)=>{
        const last=d.points.at(-1)!;
        function inspect(e:React.MouseEvent<SVGElement>){
          const svg=e.currentTarget.ownerSVGElement!,matrix=svg.getScreenCTM();if(!matrix)return;
          const mouse=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
          const dx=d.end.x-d.start.x,dy=d.end.y-d.start.y;
          setHover({index,t:Math.max(0,Math.min(1,((mouse.x-d.start.x)*dx+(mouse.y-d.start.y)*dy)/(dx*dx+dy*dy)))});
        }
        return <g key={index} data-member-id={d.segment.memberId} onMouseMove={inspect}>
          <path d={`M${d.start.x},${d.start.y} L${d.points[0].x},${d.points[0].y} ${d.path.replace(/^M/,'L')} L${d.end.x},${d.end.y} Z`} fill={color} fillOpacity={.14}/>
          <line data-testid="structure-axis" x1={d.start.x} y1={d.start.y} x2={d.end.x} y2={d.end.y} stroke={palette.ink} strokeWidth={3}/>
          <path data-testid="structure-force" d={d.path} fill="none" stroke={color} strokeWidth={2.3}/>
          <path d={`M${d.start.x},${d.start.y} L${d.points[0].x},${d.points[0].y} M${d.end.x},${d.end.y} L${last.x},${last.y}`} stroke={color} strokeDasharray="3 3" fill="none"/>
          <line x1={d.start.x} y1={d.start.y} x2={d.end.x} y2={d.end.y} stroke="transparent" strokeWidth={24}/>
          <text x={d.points[0].x+8} y={d.points[0].y-10} fill={color} fontSize={16}>{fmt((d.at(0).sample[mode]??0)*factor,2)}</text>
        </g>;
      })}
      {model.nodes.map(n=>{const p=project(n);return <g key={n.id} pointerEvents="none"><circle cx={p.x} cy={p.y} r={4} fill={palette.bg} stroke={palette.ink} strokeWidth={2}/><text x={p.x+10} y={p.y+19} fill={palette.muted} fontSize={14}>{n.id.slice(0,8)}</text></g>;})}
      {active&&readout&&<g pointerEvents="none"><line x1={readout.base.x} y1={readout.base.y} x2={readout.point.x} y2={readout.point.y} stroke={color} strokeDasharray="3 3"/><circle cx={readout.point.x} cy={readout.point.y} r={5} fill={palette.bg} stroke={color} strokeWidth={2}/></g>}
    </svg>
    <div className="structure-readout" data-testid="structure-readout">{active&&readout&&hover?<><b>{active.segment.memberId.slice(0,8)}</b> · s = {fmt((active.segment.s0??0)+hover.t*((active.segment.s1??0)-(active.segment.s0??0)))} m <strong>{symbol} = {fmt((readout.sample[mode]??0)*factor)} {unit}</strong></>:<>悬停梁或柱，查看该截面数值。{mode==='moment'?'弯矩画在对应受拉侧。':'正值沿杆件局部横向正方向展开。'}</>}</div>
  </div>;
}
