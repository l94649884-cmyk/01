import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Check, MoveVertical } from 'lucide-react';
import { evaluate, fmt, resolvePointLoad } from './model';
import type { BeamModel, Sample, Selection, Solution } from './model';
import type { ThemePalette } from './themes';
import StructureDiagram from './StructureDiagram';
import DeformedShape from './DeformedShape';
import CalculationExplanation from './CalculationExplanation';
import type {SectionLocation} from './CalculationExplanation';

type Mode = 'moment' | 'shear' | 'axial' | 'displacement' | 'ux' | 'uy';
const value = (sample:Sample,mode:Mode) => sample[mode]??0;
export default function Results({solution,status,errors,model,selection,palette}:{solution:Solution|null;status:string;errors:string[];model:BeamModel;selection:Selection;palette:ThemePalette}) {
  const [mode,setMode]=useState<Mode>('moment');
  const [hover,setHover]=useState<number|null>(null);
  const [chosenMember,setChosenMember]=useState('');
  const [view,setView]=useState<'structure'|'curve'|'deformation'>('curve');
  const [inspection,setInspection]=useState<SectionLocation|null>(null);
  useEffect(()=>setInspection(null),[solution]);
  const previousAxis=useRef<string | undefined>(undefined);
  useEffect(()=>{if(solution&&solution.axis!==previousAxis.current){previousAxis.current=solution.axis;setView(solution.axis==='member-s'?'structure':'curve');}},[solution?.axis]);
  const settings={
    moment:{label:'弯矩图',symbol:'M',unit:'kN·m',color:palette.chartMoment},
    shear:{label:'剪力图',symbol:'V',unit:'kN',color:palette.chartShear},
    axial:{label:'轴力图',symbol:'N',unit:'kN',color:palette.accent},
    displacement:{label:'挠度图',symbol:'w',unit:'mm',color:palette.chartDisplacement},
    ux:{label:'水平位移',symbol:'ux',unit:'mm',color:palette.chartShear},
    uy:{label:'竖向位移',symbol:'uy',unit:'mm',color:palette.chartDisplacement},
  };
  const local=solution?.axis==='member-s',memberIds=[...new Set(solution?.segments.map(s=>s.memberId)??[])];
  const memberId=memberIds.includes(chosenMember)?chosenMember:memberIds[0];
  const segments=(solution?.segments??[]).filter(s=>!local||s.memberId===memberId);
  useEffect(()=>{
    if(selection?.type==='members')setChosenMember(selection.id);
    else if(selection?.type==='pointLoads')setChosenMember((()=>{const load=model.pointLoads.find(l=>l.id===selection.id);return load?resolvePointLoad(model,load).memberId:'';})());
    else if(selection?.type==='distributedLoads')setChosenMember(model.distributedLoads.find(l=>l.id===selection.id)?.memberId??'');
    setHover(null);
  },[selection?.id]);
  const cfg=settings[mode],factor=['displacement','ux','uy'].includes(mode)?1000:1;
  const left=55,right=750,baseline=132,amplitude=72;
  const x0=segments.length?Math.min(...segments.map(s=>s.x0)):0,x1=segments.length?Math.max(...segments.map(s=>s.x1)):6;
  const X=(x:number)=>left+(x-x0)/(x1-x0)*(right-left);
  const samples=(solution?.samples??[]).filter(s=>!local||s.memberId===memberId);
  const maximum=Math.max(...samples.map(s=>Math.abs(value(s,mode)*factor)),1e-10);
  const Y=(v:number)=>baseline-v*factor/maximum*amplitude;
  const hoverX=hover===null?null:Math.max(x0,Math.min(x1,hover));
  const at=hoverX===null?[]:segments.filter(s=>hoverX>=s.x0-1e-8&&hoverX<=s.x1+1e-8).map(s=>evaluate(s,hoverX));
  const paths=segments.map(s=>{
    const points=Array.from({length:61},(_,i)=>evaluate(s,s.x0+(s.x1-s.x0)*i/60));
    return {line:points.map((p,i)=>`${i?'L':'M'}${X(p.x)},${Y(value(p,mode))}`).join(' '),fill:`M${X(s.x0)},${baseline} `+points.map(p=>`L${X(p.x)},${Y(value(p,mode))}`).join(' ')+` L${X(s.x1)},${baseline} Z`};
  });
  const location=(sample:Sample)=>local?`${sample.memberId??''} · s = ${fmt(sample.x)} m`:`x = ${fmt(sample.x)} m`;
  const legend=mode==='moment'?(local?'弯矩按杆件局部轴定义，正值对应局部下缘受拉':'正弯矩：下缘受拉（下挠弯曲）'):mode==='shear'?'局部正剪力 · 荷载处保留跃变':mode==='axial'?'轴力以受拉为正，受压为负':mode==='displacement'?(local?'局部横向位移 w · 局部 y 为杆轴逆时针 90°':'正挠度向上 · 图形已放大显示'):mode==='ux'?'全局水平位移 ux · 向右为正':'全局竖向位移 uy · 向上为正';
  return <section className="results-panel" aria-label="分析结果">
    <div className="panel-heading"><div><Activity size={17}/><h2>分析结果</h2>{solution&&<span className="tiny-badge"><Check size={11}/>平衡校验通过</span>}</div><span className="muted">{solution?'悬停图线，读取任意截面':'等待有效模型'}</span></div>
    <div className="metric-grid">
      <div className="metric"><span>最大绝对弯矩<ArrowUpRight size={15}/></span><strong data-testid="max-moment">{solution?fmt(Math.abs(solution.extrema.moment.moment)):'—'}<small>kN·m</small></strong><p>{solution?location(solution.extrema.moment):'由真实计算结果生成'}</p></div>
      <div className="metric"><span>最大绝对剪力<MoveVertical size={14}/></span><strong data-testid="max-shear">{solution?fmt(Math.abs(solution.extrema.shear.shear)):'—'}<small>kN</small></strong><p>{solution?location(solution.extrema.shear):'集中力处显示剪力跃变'}</p></div>
      <div className="metric"><span>{local?'最大局部横向位移':'最大绝对挠度'}<Activity size={14}/></span><strong data-testid="max-displacement">{solution?fmt(Math.abs(solution.extrema.displacement.displacement)*1000):'—'}<small>mm</small></strong><p>{solution?`极值 · ${location(solution.extrema.displacement)}`:'考虑材料与截面刚度'}</p></div>
    </div>
    {solution&&<div className="diagram-view-switch" role="group" aria-label="结果显示方式"><button aria-pressed={view==='structure'} onClick={()=>setView('structure')}>整体结构图</button><button aria-pressed={view==='curve'} onClick={()=>setView('curve')}>截面曲线</button><button aria-pressed={view==='deformation'} onClick={()=>setView('deformation')}>变形图</button><span>{view==='deformation'?'真实位移 · 可调放大倍数':view==='structure'?'梁、柱按真实方向同时显示':'沿杆件长度展开，便于精确读数'}</span></div>}
    {local&&view==='curve'&&<div className="result-scope"><label>查看杆件 <select className="diagram-member-select" aria-label="查看杆件内力" value={memberId} onChange={e=>{setChosenMember(e.target.value);setHover(null);}}>{memberIds.map(id=>{const m=model.members.find(m=>m.id===id);return <option key={id} value={id}>{id.slice(0,8)} · {m?.start.slice(0,8)} → {m?.end.slice(0,8)}</option>;})}</select></label><span>横轴 s：沿本杆起点量取的实际距离</span></div>}
    {view!=='deformation'&&<div className="chart-head"><div className="segmented">{(Object.keys(settings) as Mode[]).map(key=><button key={key} className={mode===key?'active':''} onClick={()=>{setMode(key);setHover(null);}}>{settings[key].label}<em>{settings[key].symbol}</em></button>)}</div><span className="chart-unit">{cfg.symbol} / {cfg.unit}</span></div>}
    {solution&&view==='deformation'?<DeformedShape model={model} solution={solution} palette={palette}/>:solution&&view==='structure'?<StructureDiagram onInspect={setInspection} model={model} solution={solution} mode={mode} color={cfg.color} symbol={cfg.symbol} unit={cfg.unit} palette={palette}/>:solution?<div className="chart" data-testid="result-chart">
      <svg viewBox="0 0 800 240" role="img" aria-label={`${cfg.label}，可悬停查看数值`} onClick={e=>{const r=e.currentTarget.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*800;let x=Math.max(x0,Math.min(x1,x0+(px-left)/(right-left)*(x1-x0)));const near=segments.flatMap(s=>[s.x0,s.x1]).find(v=>Math.abs(X(v)-px)<5);if(near!==undefined)x=near;const seg=segments.find(s=>x>=s.x0-1e-8&&x<=s.x1+1e-8);if(seg)setInspection({memberId:seg.memberId,station:(seg.s0??seg.x0)+(x-seg.x0)/(seg.x1-seg.x0)*((seg.s1??seg.x1)-(seg.s0??seg.x0))});}} onMouseLeave={()=>setHover(null)} onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*800;let x=x0+(px-left)/(right-left)*(x1-x0);const near=segments.flatMap(s=>[s.x0,s.x1]).find(v=>Math.abs(X(v)-px)<5);if(near!==undefined)x=near;setHover(x);}}>
        {[baseline-amplitude,baseline,baseline+amplitude].map((y,i)=><g key={y}><line x1={left} y1={y} x2={right} y2={y} stroke={i===1?palette.axis:palette.majorGrid} strokeDasharray={i===1?'':'4 5'}/><text x={left-11} y={y+4} textAnchor="end" fill={palette.muted} fontSize={15}>{fmt(i===0?maximum:i===1?0:-maximum,2)}</text></g>)}
        {Array.from({length:7},(_,i)=>x0+(x1-x0)*i/6).map(x=><g key={x}><line x1={X(x)} y1={baseline-amplitude} x2={X(x)} y2={baseline+amplitude} stroke={palette.grid}/><text x={X(x)} y={224} textAnchor="middle" fill={palette.muted} fontSize={15}>{fmt(x,2)}</text></g>)}
        {paths.map((p,i)=><g key={i}><path d={p.fill} fill={cfg.color} opacity=".12"/><path d={p.line} fill="none" stroke={cfg.color} strokeWidth="2.5"/></g>)}
        {segments.slice(1).map((s,i)=>{const prev=segments[i];if(Math.abs(prev.x1-s.x0)>1e-8)return null;return <line key={i} x1={X(s.x0)} y1={Y(value(evaluate(prev,prev.x1),mode))} x2={X(s.x0)} y2={Y(value(evaluate(s,s.x0),mode))} stroke={cfg.color} strokeWidth="2.5"/>;})}
        {hoverX!==null&&<g><line x1={X(hoverX)} y1={45} x2={X(hoverX)} y2={207} stroke={cfg.color} strokeDasharray="4 4"/>{at.map((v,i)=><circle key={i} cx={X(hoverX)} cy={Y(value(v,mode))} r={4} fill={palette.bg} stroke={cfg.color} strokeWidth={2}/>)}</g>}
        <text x={right+15} y={224} fill={palette.muted} fontSize={15}>{local?'s':'x'} / m</text>
      </svg>
      <div className="chart-readout" data-testid="chart-readout">{hoverX!==null&&at.length?<>{local?'s':'x'} = {fmt(hoverX)} m <b>{cfg.symbol}{at.length>1?'⁻':''} = {fmt(value(at[0],mode)*factor)} {cfg.unit}</b>{at.length>1&&<b>{cfg.symbol}⁺ = {fmt(value(at[1],mode)*factor)} {cfg.unit}</b>}</>:<><span className="legend-line" style={{background:cfg.color}}/>{legend}</>}</div>
    </div>:<div className="chart-empty"><Activity size={26}/><strong>{status==='solving'?'正在组装并求解结构模型…':errors.length?'完善模型后，即可查看内力图':'点击「求解模型」开始分析'}</strong><p>{errors[0]??'结果来自本地 Python 求解器，当前没有可显示的计算结果。'}</p></div>}
    {solution&&<CalculationExplanation model={model} solution={solution} selection={selection} location={inspection}/>}
  </section>;
}
