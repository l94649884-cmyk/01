import {useEffect,useState} from 'react';
import {evaluate,fmt,type BeamModel,type Selection,type Solution} from './model';

export type SectionLocation={memberId:string;station:number};
export function sectionValues(solution:Solution,memberId:string,station:number){
 return solution.segments.filter(s=>s.memberId===memberId&&station>=Math.min(s.s0??s.x0,s.s1??s.x1)-1e-8&&station<=Math.max(s.s0??s.x0,s.s1??s.x1)+1e-8)
  .map(segment=>{const lo=segment.s0??segment.x0,hi=segment.s1??segment.x1;const x=segment.x0+(station-lo)/(hi-lo)*(segment.x1-segment.x0);return {segment,sample:evaluate(segment,x)};});
}
export default function CalculationExplanation({model,solution,selection,location}:{model:BeamModel;solution:Solution;selection:Selection;location:SectionLocation|null}){
 const [memberId,setMemberId]=useState(model.members[0]?.id??''),[station,setStation]=useState('0');
 useEffect(()=>{if(location){setMemberId(location.memberId);setStation(String(location.station));}},[location]);
 useEffect(()=>{if(!model.members.some(m=>m.id===memberId))setMemberId(model.members[0]?.id??'');},[model,memberId]);
 const member=model.members.find(m=>m.id===memberId),a=model.nodes.find(n=>n.id===member?.start),b=model.nodes.find(n=>n.id===member?.end),length=a&&b?Math.hypot(b.x-a.x,b.y-a.y):0;
 const valid=station.trim()!==''&&Number.isFinite(Number(station))&&Number(station)>=0&&Number(station)<=length;
 const sections=valid?sectionValues(solution,memberId,Number(station)):[];
 const calc=solution.calculation,labels:Record<string,string>={reaction:'支座反力',point:'集中力',udl:'均布荷载合力',moment:'集中弯矩'};
 const terms=calc?.terms??[],sum=(field:'fx'|'fy'|'moment')=>terms.reduce((v,t)=>v+t[field],0),signed=(n:number)=>n<0?`(${fmt(n,6)})`:fmt(n,6);
 return <details className="calculation-explanation" open={location!==null||selection?.type==='supports'||undefined}>
  <summary>计算过程与截面解释</summary><div className="calculation-body">
   <p>采用二维梁／刚架刚度法：组装 K·u = F，施加支座位移约束后求解位移，按 R = K·u − F 恢复反力。</p>
   {calc&&<><p>{calc.dofs} 个计算自由度，约束 {calc.constrainedDofs} 个，自由 {calc.freeDofs} 个。取矩点 O = ({fmt(calc.origin[0])}, {fmt(calc.origin[1])}) m。</p>
   <div className="equilibrium-equations" data-testid="equilibrium-equations"><p>ΣFx = {terms.map(t=>signed(t.fx)).join(' + ')} = {sum('fx').toExponential(2)} kN</p><p>ΣFy = {terms.map(t=>signed(t.fy)).join(' + ')} = {sum('fy').toExponential(2)} kN</p><p>ΣMₒ = Σ[(x−xₒ)·Fy − (y−yₒ)·Fx + C] = {sum('moment').toExponential(2)} kN·m</p></div>
   <div className="calculation-table"><table><thead><tr><th>对象</th><th>位置 x / y (m)</th><th>Fx / Fy (kN)</th><th>力偶 C (kN·m)</th><th>对 O 力矩 (kN·m)</th></tr></thead><tbody>{terms.map(t=><tr key={t.id} className={selection?.type==='supports'&&selection.id===t.id?'selected-reaction':''}><td>{labels[t.kind]}<code>{t.id.slice(0,8)}</code></td><td>{fmt(t.x)} / {fmt(t.y)}</td><td>{fmt(t.fx)} / {fmt(t.fy)}</td><td>{fmt(t.couple)}</td><td>{fmt(t.moment)}</td></tr>)}</tbody></table></div><p className="field-help">均布荷载合力 = 强度 × 实际作用长度，位于区间中点；力偶直接计入力矩和。上述整体平衡用于复核，超静定结构的反力由刚度法求得。</p></>}
   <div className="section-controls"><label>截面所在杆件<select aria-label="解释截面杆件" value={memberId} onChange={e=>{setMemberId(e.target.value);setStation('0');}}>{model.members.map(m=><option key={m.id} value={m.id}>{m.id.slice(0,8)}</option>)}</select></label><label>沿起点距离 s (m)<input aria-label="解释截面位置" type="number" step="any" min="0" max={length} value={station} onChange={e=>setStation(e.target.value)}/></label></div>
   {!valid?<p role="status">请输入 0–{fmt(length)} m 内的截面位置。</p>:<div data-testid="section-explanation">{sections.map(({segment,sample},i)=>{
    const delta=sample.x-segment.x0;
    return <div className="section-value" key={i}><b>{sections.length>1?`${i===0?'图轴较小侧（−）':'图轴较大侧（＋）'}截面`:'当前截面'} · s = {fmt(Number(station))} m</b><p>N = N₀ − qₓ·ξ = {fmt(segment.N0??0)} − ({fmt(segment.qx??0)}) × {fmt(delta)} = <strong>{fmt(sample.axial??0)} kN</strong></p><p>V = V₀ + q·ξ = {fmt(segment.V0)} + ({fmt(segment.q)}) × {fmt(delta)} = <strong>{fmt(sample.shear)} kN</strong></p><p>M = M₀ + V₀·ξ + q·ξ²/2 = {fmt(segment.M0)} + ({fmt(segment.V0)}) × {fmt(delta)} + ({fmt(segment.q)}) × {fmt(delta)}²/2 = <strong>{fmt(sample.moment)} kN·m</strong></p></div>;
   })}{sections.length>1&&<p>此处保留两侧截面值：集中力使剪力突变，集中弯矩使弯矩突变；单元交界处无集中荷载时内力连续。</p>}</div>}
   <p className="field-help">ξ 从当前计算子单元起点量取，可能不同于杆件距离 s。N 拉为正；局部 x 沿图轴方向、局部 y 为其逆时针 90°。V、M 按该局部轴定义，正 M 表示局部下缘受拉；全局 ux 向右、uy 向上为正。曲线图点击截面可固定查看，点击支座可高亮其平衡贡献。</p>
  </div>
 </details>;
}
