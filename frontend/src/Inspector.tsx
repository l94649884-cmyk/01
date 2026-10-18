import { useEffect, useState } from 'react';
import { Settings2, Trash2 } from 'lucide-react';
import { fmt, removeSelection, resolvePointLoad } from './model';
import { distance } from './geometry';
import { inferLoadDirection } from './loadDirection';
import type { BeamModel, Selection, Solution } from './model';

function NumberField({label,value,unit,onChange,min,max}:{label:string;value:number;unit:string;onChange:(v:number)=>void;min?:number;max?:number}){
  const [draft,setDraft]=useState(String(value)),[error,setError]=useState(false);
  useEffect(()=>{setDraft(String(value));setError(false);},[value]);
  function commit(){const n=Number(draft);if(!draft.trim()||!Number.isFinite(n)||(min!==undefined&&n<min)||(max!==undefined&&n>max)){setError(true);return;}setError(false);onChange(n);}
  return <label className="field"><span>{label}</span><div className={error?'input-unit invalid':'input-unit'}><input aria-label={label} type="number" step="any" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>{unit}</span></div>{error&&<small className="error-text">请输入有效数值{min!==undefined?`（≥ ${min}）`:''}。</small>}</label>;
}

export default function Inspector({model,selection,onChange,onSelect,solution}:{model:BeamModel;selection:Selection;onChange:(m:BeamModel)=>void;onSelect:(s:Selection)=>void;solution:Solution|null}){
  const object=selection?model[selection.type].find(o=>o.id===selection.id):undefined;
  function update(patch:Record<string,unknown>){if(!selection)return;onChange({...model,[selection.type]:model[selection.type].map(o=>o.id===selection.id?{...o,...patch}:o)} as BeamModel);}
  const node=selection?.type==='nodes'?model.nodes.find(n=>n.id===selection.id):undefined;
  const member=selection?.type==='members'?model.members.find(n=>n.id===selection.id):undefined;
  const support=selection?.type==='supports'?model.supports.find(n=>n.id===selection.id):undefined;
  const rawPoint=selection?.type==='pointLoads'?model.pointLoads.find(n=>n.id===selection.id):undefined;
  const point=rawPoint?resolvePointLoad(model,rawPoint):undefined;
  const udl=selection?.type==='distributedLoads'?model.distributedLoads.find(n=>n.id===selection.id):undefined;
  const moment=selection?.type==='moments'?model.moments.find(n=>n.id===selection.id):undefined;
  const actionPoint=selection?.type==='actionPoints'?model.actionPoints.find(p=>p.id===selection.id):undefined;
  const pointMember=actionPoint?model.members.find(m=>m.id===actionPoint.memberId):undefined;
  const pointLength=pointMember?distance(model.nodes.find(n=>n.id===pointMember.start)!,model.nodes.find(n=>n.id===pointMember.end)!):0;
  const attached=node?model.supports.find(s=>s.nodeId===node.id):undefined;
  const loadedMember=(point||udl)?model.members.find(m=>m.id===(point??udl)?.memberId):undefined;
  const length=loadedMember?distance(model.nodes.find(n=>n.id===loadedMember.end)!,model.nodes.find(n=>n.id===loadedMember.start)!):0;
  const titles={nodes:'节点',members:'杆件',supports:'支座',pointLoads:'集中力',distributedLoads:'均布荷载',moments:'集中弯矩',actionPoints:'作用点'};
  const supportTitles={pin:'铰支座',roller:'滚动支座',fixed:'固定支座'};
  return <aside className="inspector">
    <div className="aside-heading"><Settings2 size={16}/><h2>属性面板</h2></div>
    <div className="inspector-body" key={selection?.id??'empty'}>
      {object&&selection?<><div className="object-title"><span>{titles[selection.type]}</span><code>{object.id.length>8?object.id.slice(0,8):object.id}</code></div>
        {node&&<><NumberField label="X 坐标" value={node.x} unit="m" min={-1000} max={1000} onChange={x=>update({x})}/><NumberField label="Y 坐标" value={node.y} unit="m" min={-1000} max={1000} onChange={y=>update({y})}/><p className="field-help">相连杆件、支座与集中弯矩会随节点移动。水平、竖向与斜向节点均可连接。</p>
          {attached&&<div className="support-attachment"><strong>此节点的支座 · {supportTitles[attached.kind]}</strong><p>支座可独立编辑或删除，保留节点和杆件。</p><button onClick={()=>onSelect({type:'supports',id:attached.id})}>编辑此节点的支座</button><button className="delete-button" onClick={()=>onChange(removeSelection(model,{type:'supports',id:attached.id}))}><Trash2 size={13}/>删除此节点的支座</button></div>}
        </>}
        {member&&<><div className="property-pair"><span>起点 → 终点</span><b>{member.start.slice(0,8)} → {member.end.slice(0,8)}</b></div><NumberField label="弹性模量 E" value={member.E} unit="GPa" min={.000001} max={10000} onChange={E=>update({E})}/><NumberField label="截面惯性矩 I" value={member.I} unit="cm⁴" min={.000001} max={1e10} onChange={I=>update({I})}/><NumberField label="截面面积 A" value={member.A??100} unit="cm²" min={.000001} max={1e8} onChange={A=>update({A})}/><p className="field-help">EI 控制弯曲刚度，EA 控制轴向刚度。旧模型未设置面积时按 A = 100 cm² 计算，请按实际截面修改。</p></>}
        {support&&<><label className="field"><span>支座类型</span><select aria-label="支座类型" value={support.kind} onChange={e=>update({kind:e.target.value})}><option value="pin">铰支座</option><option value="roller">滚动支座</option><option value="fixed">固定支座</option></select></label><div className="property-pair"><span>连接节点</span><b>{support.nodeId.slice(0,8)}</b></div><p className="field-help">{support.kind==='fixed'?'约束全局 X、Y 位移与转角；符号随相连杆件朝向自动调整。':support.kind==='pin'?'约束全局 X、Y 位移，允许转动。':'仅约束全局 Y 位移，允许水平移动与转动。'}铰支座不是梁内铰。删除此支座会保留节点及相连杆件。</p></>}
        {actionPoint&&<><div className="property-pair"><span>所属杆件</span><b>{actionPoint.memberId.slice(0,8)}</b></div><NumberField label="作用点距杆件起点" value={actionPoint.at} unit="m" min={0} max={pointLength} onChange={at=>update({at})}/><p className="field-help">菱形作用点用于定位荷载，不是连接节点，不拆分杆件。可拖到杆件任意位置，集中力和弯矩随作用点移动。删除作用点会同时删除连接的集中力和弯矩，可撤销。</p></>}
        {moment&&<><NumberField label="集中弯矩大小" value={moment.value} unit="kN·m" min={-1e6} max={1e6} onChange={value=>update({value})}/><label className="field"><span>弯矩显示位置</span><select aria-label="弯矩显示位置" value={moment.side} onChange={e=>update({side:e.target.value})}><option value="center">作用点中心</option><option value="left">作用点左侧</option><option value="right">作用点右侧</option></select></label><div className="property-pair"><span>{moment.pointId?'连接作用点':'连接节点'}</span><b>{(moment.pointId??moment.nodeId??'').slice(0,8)}</b></div><p className="field-help">正值逆时针，负值顺时针。中心、左侧、右侧仅改变显示位置，均作用于所连接的点。拖动弯矩可连接其他作用点，也可连接节点。杆件内部无需拆杆，先放置作用点即可。</p></>}
        {(point||udl)&&<label className="field"><span>荷载方向</span><select aria-label="荷载方向" value={(point??udl)?.direction??'y'} onChange={e=>update({direction:e.target.value})}><option value="y">竖向 Y（正值向下）</option><option value="x">水平 X（正值向左）</option></select></label>}
        {loadedMember&&<><button className="range-reset" onClick={()=>update({direction:inferLoadDirection(model.nodes.find(n=>n.id===loadedMember.start)!,model.nodes.find(n=>n.id===loadedMember.end)!)})}>按杆件重新识别方向</button><p className="field-help">横杆默认竖向，竖杆默认水平；斜杆按主要朝向推荐（45°取竖向）。可手动修改，已有荷载方向不会随杆件旋转而改变。</p></>}
        {point&&<><label className="field"><span>集中力作用点</span><select aria-label="集中力作用点" value={point.pointId??''} onChange={e=>update(e.target.value?{pointId:e.target.value,memberId:undefined,at:undefined}:{pointId:undefined,memberId:point.memberId,at:point.at})}><option value="">独立杆件位置</option>{model.actionPoints.map(p=><option key={p.id} value={p.id}>{p.id.slice(0,8)} · {fmt(p.at)} m</option>)}</select></label><NumberField label="集中力大小" value={point.value} unit="kN" min={-1e6} max={1e6} onChange={value=>update({value})}/>{!point.pointId?<NumberField label="距杆件起点" value={point.at} unit="m" min={0} max={length} onChange={at=>update({at})}/>:<button className="range-reset" onClick={()=>onSelect({type:'actionPoints',id:point.pointId!})}>编辑连接的作用点 · {fmt(point.at)} m</button>}<p className="field-help">沿杆件实际长度定位（0–{fmt(length)} m）。正值沿选定负轴方向，负值反向。</p></>}
        {udl&&<><NumberField label="均布荷载强度" value={udl.value} unit="kN/m" min={-1e6} max={1e6} onChange={value=>update({value})}/><div className="load-range-heading">作用区间 <span>沿杆件起点量取</span></div><NumberField label="荷载起点" value={udl.start??0} unit="m" min={0} max={length} onChange={start=>update({start})}/><NumberField label="荷载终点" value={udl.end??length} unit="m" min={0} max={length} onChange={end=>update({end})}/><div className="load-range-summary">作用长度 <b>{fmt((udl.end??length)-(udl.start??0))} m</b></div><button className="range-reset" onClick={()=>update({start:0,end:undefined})}>恢复全杆荷载</button><p className="field-help">选中后可拖动画布两端圆点调整区间。水平 / 竖向仅改变力的方向，均布强度仍按实际杆长计。</p></>}
        <button className="delete-button" onClick={()=>{onChange(removeSelection(model,selection));onSelect(null);}}><Trash2 size={14}/>删除{titles[selection.type]}</button>{node&&<p className="field-help">删除节点会同时删除相连杆件、支座及其荷载、节点集中弯矩；可撤销。</p>}
      </>:<div className="inspector-placeholder"><Settings2 size={26}/><strong>每个构件，都有依据</strong><p>点击对象编辑参数。点击支座的三角形 / 底座可直接选择支座；选中节点也可单独删除其支座。</p><button onClick={()=>model.members[0]&&onSelect({type:'members',id:model.members[0].id})} disabled={!model.members.length}>查看梁截面参数</button></div>}
    </div>
    <div className="inspector-section"><h3>支座反力 <span>向右 / 向上 / 逆时针为正</span></h3>{solution?<div className="reactions">{solution.reactions.map(r=><button key={r.supportId} onClick={()=>onSelect({type:'supports',id:r.supportId})}><div><b>{r.nodeId.slice(0,8)}</b><small>x = {fmt(r.x)} m</small>{r.y!==undefined&&r.y!==0&&<small>y = {fmt(r.y)} m</small>}</div><div><strong>{fmt(r.vertical)} <small>kN · Y</small></strong>{Math.abs(r.horizontal??0)>1e-8&&<span>{fmt(r.horizontal??0)} kN · X</span>}{Math.abs(r.moment)>1e-8&&<span>{fmt(r.moment)} kN·m ↶</span>}</div></button>)}</div>:<p className="muted">求解成功后显示反力。</p>}</div>
    <div className="inspector-section assumption"><h3>计算边界 <span>MVP 0.7</span></h3><p>二维梁 / 刚架 · 小变形 · 线弹性<br/>节点刚接 · 轴向与弯曲变形</p><div>尚不支持内铰、温度荷载、动力与非线性分析。滚动支座仅约束全局 Y。</div>{solution&&<p className="residual">ΣFx = {(solution.equilibrium.horizontal??0).toExponential(1)} kN<br/>ΣFy = {solution.equilibrium.force.toExponential(1)} kN<br/>ΣM = {solution.equilibrium.moment.toExponential(1)} kN·m</p>}{solution?.notes.slice(2).map(n=><p key={n} className="field-help">{n}</p>)}</div>
  </aside>;
}




