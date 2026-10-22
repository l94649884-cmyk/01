import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Archive, ArrowDown, ArrowDownToLine, BookOpen, CheckCircle2, ChevronRight, Diamond, Circle, CircleHelp, Download, FolderOpen, GripVertical, Layers3, LoaderCircle, Minus, MousePointer2, Plus, Redo2, RotateCcw, Square, Triangle, Undo2, X, Zap, AlertCircle } from 'lucide-react';
import BeamCanvas from './BeamCanvas';
import EditingTools from './EditingTools';
import {toggleSelection} from './editing';
import type {Item} from './editing';
import Inspector from './Inspector';
import Results from './Results';
import ThemePicker from './ThemePicker';
import ModelHistory from './ModelHistory';
import { loadWorkspace, saveWorkspace, workspaceReducer } from './workspace';
import type { ArchiveReason, ModelArchive, WorkspaceAction } from './workspace';
import { useTheme } from './themes';
import { example, parseModel, removeSelection, validateModel } from './model';
import type { BeamModel, Collection, ExampleKind, Selection, Solution, Tool } from './model';

const palette = [
  { tool:'node', label:'节点', sub:'放置与连接', Icon:Circle },
  { tool:'member', label:'杆件', sub:'连接两个节点', Icon:Minus },
  { tool:'actionPoint', label:'作用点', sub:'杆件任意位置', Icon:Diamond },
  { tool:'pin', label:'铰支座', sub:'约束 X、Y 位移', Icon:Triangle },
  { tool:'roller', label:'滚动支座', sub:'约束全局 Y 位移', Icon:Circle },
  { tool:'fixed', label:'固定支座', sub:'约束位移与转角', Icon:Square },
  { tool:'point', label:'集中力', sub:'作用点 / 杆件', Icon:ArrowDown },
  { tool:'udl', label:'均布荷载', sub:'可调作用区间', Icon:ArrowDownToLine },
  { tool:'moment', label:'集中弯矩', sub:'作用点中心 / 左右侧', Icon:RotateCcw },
] as const;
export default function App(){
  const {theme,setTheme,palette:themePalette}=useTheme();
  const [workspace,dispatch]=useReducer(workspaceReducer,undefined,()=>{try{return loadWorkspace(localStorage);}catch{return loadWorkspace({getItem:()=>null});}});
  const history=workspace.history;
  const [historyOpen,setHistoryOpen]=useState(false);
  const [canvasExpanded,setCanvasExpanded]=useState(false);
  useEffect(()=>{
    if(!canvasExpanded)return;
    const overflow=document.body.style.overflow,scrollY=window.scrollY;
    document.body.style.overflow='hidden';
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setCanvasExpanded(false);};
    window.addEventListener('keydown',close);
    return()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',close);requestAnimationFrame(()=>window.scrollTo(0,scrollY));};
  },[canvasExpanded]);
  const [saveFailed,setSaveFailed]=useState(false);
  const [viewRevision,setViewRevision]=useState(0);
  const model=history.present, serialized=JSON.stringify(model);
  const modelRef=useRef(serialized);modelRef.current=serialized;
  const [selections,setSelections]=useState<Item[]>([]);
  const selection=selections.at(-1)??null;
  const setSelection=useCallback((s:Selection,additive=false)=>setSelections(prev=>s?(additive?toggleSelection(prev,s):[s]):[]),[]);
  useEffect(()=>setSelections(prev=>{const valid=prev.filter(s=>model[s.type].some(o=>o.id===s.id));return valid.length===prev.length?prev:valid;}),[model]);
  const [tool,setTool]=useState<Tool>('select');
  const [automatic,setAutomatic]=useState(true);
  const [calculation,setCalculation]=useState<{snapshot:string;data:Solution}|null>(null);
  const solution=calculation?.snapshot===serialized?calculation.data:null;
  const [status,setStatus]=useState('idle');
  const [serverErrors,setServerErrors]=useState<{snapshot:string;errors:string[]}|null>(null);
  const [message,setMessage]=useState('工作台已就绪；新建前会自动保存历史模型。');
  const [guide,setGuide]=useState(false);
  const [connection,setConnection]=useState<'checking'|'online'|'offline'>('checking');
  const [requestId,setRequestId]=useState(0);
  const manualSnapshot=useRef('');
  const fileInput=useRef<HTMLInputElement>(null);
  const localErrors=useMemo(()=>validateModel(model),[model]);
  const errors=[...localErrors,...(serverErrors?.snapshot===serialized?serverErrors.errors:[])];
  const change=useCallback((next:BeamModel)=>dispatch({type:'set',model:next}),[]);
  useEffect(()=>{try{saveWorkspace(localStorage,workspace);setSaveFailed(false);}catch{setSaveFailed(true);setMessage('本地自动保存失败，请导出 JSON 保存当前模型。');}},[workspace]);
  useEffect(()=>{fetch('/api/health').then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>setConnection(d.status==='ok'?'online':'offline')).catch(()=>setConnection('offline'));},[]);
  useEffect(()=>{
    if(!automatic&&manualSnapshot.current!==serialized){setStatus('idle');return;}
    if(localErrors.length){setStatus('invalid');return;}
    const controller=new AbortController(),snapshot=serialized;
    let disposed=false;
    const timer=window.setTimeout(async()=>{
      setStatus('solving');setServerErrors(null);
      const timeout=window.setTimeout(()=>controller.abort(),20000);
      try{
        const response=await fetch('/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:snapshot,signal:controller.signal});
        const data=await response.json();
        if(modelRef.current!==snapshot||controller.signal.aborted)return;
        setConnection('online');
        if(!response.ok){setCalculation(null);setServerErrors({snapshot,errors:data.errors??['求解器拒绝了此模型。']});setStatus('error');}
        else{setCalculation({snapshot,data});setStatus('done');}
      }catch{
        if(modelRef.current===snapshot&&!controller.signal.aborted){setCalculation(null);setConnection('offline');setServerErrors({snapshot,errors:['无法连接计算服务。请启动后端（本地 8000 端口），然后点击「求解模型」重试。']});setStatus('error');}
        else if(!disposed&&modelRef.current===snapshot&&controller.signal.aborted){setServerErrors({snapshot,errors:['计算服务响应超时，请点击「求解模型」重试。']});setStatus('error');}
      }finally{window.clearTimeout(timeout);}
    },automatic?450:0);
    return()=>{disposed=true;window.clearTimeout(timer);controller.abort();};
  },[serialized,automatic,requestId]);
  useEffect(()=>{
    function keyboard(e:KeyboardEvent){
      if(historyOpen)return;
      const target=e.target as HTMLElement;if(['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable)return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undoRedo(e.shiftKey?'redo':'undo');}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();undoRedo('redo');}
      else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();change(selections.reduce((m,s)=>removeSelection(m,s),model));setSelection(null);}
      else if(e.key==='Escape'){setTool('select');setSelection(null);setGuide(false);}
    }
    window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard);
  },[model,selections,change,historyOpen]);
  function undoRedo(type:'undo'|'redo'){dispatch({type});setViewRevision(v=>v+1);}
  function replaceDocument(next:BeamModel,reason:ArchiveReason,message:string,nextTool:Tool='select'){
    const action:WorkspaceAction={type:'replace',model:next,reason,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
    try{saveWorkspace(localStorage,workspaceReducer(workspace,action));}catch{setSaveFailed(true);setMessage('无法保存历史，本次切换未执行。请先导出 JSON，并检查浏览器存储空间。');return false;}
    dispatch(action);setSelection(null);setTool(nextTool);setViewRevision(v=>v+1);setMessage(message);return true;
  }
  function restoreArchive(item:ModelArchive){if(replaceDocument(item.model,'恢复历史前',`已恢复「${item.model.name}」；当前非空模型已保留在历史中。`))setHistoryOpen(false);}
  function clearModel(){return replaceDocument({...model,nodes:[],members:[],supports:[],pointLoads:[],distributedLoads:[],moments:[],actionPoints:[]},'清空前','全部模型已清空；可撤销或从模型历史恢复。');}
  function deleteArchive(item:ModelArchive){
    const action:WorkspaceAction={type:'deleteArchive',id:item.id};
    try{saveWorkspace(localStorage,workspaceReducer(workspace,action));dispatch(action);setMessage(`已删除「${item.model.name}」的历史快照。`);return true;}
    catch{setSaveFailed(true);setMessage('历史删除未保存，请检查浏览器存储空间后重试。');return false;}
  }
  function snapshot(){
    const action:WorkspaceAction={type:'snapshot',reason:'手动快照',id:crypto.randomUUID(),createdAt:new Date().toISOString()};
    try{saveWorkspace(localStorage,workspaceReducer(workspace,action));dispatch(action);setMessage('当前模型快照已保存，可从模型历史恢复。');}catch{setSaveFailed(true);setMessage('快照保存失败，请导出 JSON 并检查浏览器存储空间。');}
  }
  function loadExample(key:ExampleKind){replaceDocument(example(key),'切换算例前','已载入验证算例，原模型已保留在模型历史中。');}
  function save(){const blob=new Blob([JSON.stringify(model,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${model.name||'力构模型'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('JSON 模型已导出，包含几何、支座、荷载与材料参数。');}
  async function importFile(file:File|undefined){if(!file)return;if(file.size>1_000_000){setMessage('载入失败：模型文件不能超过 1 MB。');return;}try{const next=parseModel(await file.text());replaceDocument(next,'载入前','JSON 模型已载入，原模型已保留在模型历史中。');}catch(e){setMessage(`载入失败：${e instanceof Error?e.message:'文件格式不正确'}`);}finally{if(fileInput.current)fileInput.current.value='';}}
  const count=model.nodes.length+model.members.length+model.supports.length+model.pointLoads.length+model.distributedLoads.length+model.moments.length+model.actionPoints.length;
  const objectNames:Record<Collection,string>={nodes:'节点',members:'杆件',supports:'支座',pointLoads:'集中力',distributedLoads:'均布荷载',moments:'集中弯矩',actionPoints:'作用点'};
  return <div className={`app-shell${canvasExpanded?' canvas-focused':''}`}>
    <header className="app-header"><div className="brand"><div className="brand-mark"><span/><span/><span/></div><div><h1>力构 <i>Lab</i></h1><p>让结构，清晰可见</p></div><span className="version">MVP 0.7</span></div><div className="header-nav"><span className="nav-active">建模与分析</span><button onClick={()=>setGuide(true)}><BookOpen size={15}/>使用指南</button></div><ThemePicker theme={theme} onChange={setTheme}/><div className="header-status"><span className={`status-dot ${connection}`}/>{connection==='online'?'计算服务已连接':connection==='offline'?'计算服务未连接':'连接计算服务…'}</div></header>
    <div className="workspace-bar"><div className="document-title"><span className="file-icon"><Layers3 size={19}/></span><div><input aria-label="模型名称" key={model.name} defaultValue={model.name} maxLength={120} onBlur={e=>change({...model,name:e.target.value.trim()||'未命名梁'})} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>二维结构模型 <ChevronRight size={10}/> {saveFailed?'自动保存失败 · 请导出 JSON':'草稿与历史自动保存'}</span></div></div><div className="document-actions"><button onClick={()=>replaceDocument({schemaVersion:1,name:'未命名梁',nodes:[],members:[],supports:[],pointLoads:[],distributedLoads:[],moments:[],actionPoints:[]},'新建前','新模型已创建；请从「模型历史」恢复原模型，或点击撤销。','node')}><Plus size={15}/>新建</button><button className="history-button" aria-label="模型历史" onClick={()=>setHistoryOpen(true)}><Archive size={15}/>模型历史{workspace.archives.length>0&&<span>{workspace.archives.length}</span>}</button><button onClick={()=>fileInput.current?.click()}><FolderOpen size={15}/>载入</button><button onClick={save}><Download size={15}/>保存 JSON</button><input type="file" ref={fileInput} accept=".json,application/json" hidden aria-label="载入 JSON 文件" onChange={e=>void importFile(e.target.files?.[0])}/><span className="divider"/><button className="primary" disabled={!!localErrors.length||status==='solving'} onClick={()=>{manualSnapshot.current=serialized;setRequestId(v=>v+1);}}>{status==='solving'?<LoaderCircle size={15} className="spin"/>:<Zap size={15}/>}求解模型</button></div></div>
    <main className="workspace">
      <aside className="library"><div className="aside-heading"><Layers3 size={16}/><h2>构件库</h2><span>拖入画布</span></div><div className="library-content"><button className={`select-tool ${tool==='select'?'active':''}`} onClick={()=>setTool('select')}><MousePointer2 size={16}/>选择 / 移动<span>Esc</span></button><div className="tool-section-label">几何与连接</div>{palette.map(({tool:t,label,sub,Icon},i)=><div key={t}>{i===3&&<div className="tool-section-label">边界约束</div>}{i===6&&<div className="tool-section-label">外部荷载</div>}<button draggable data-testid={`tool-${t}`} aria-label={`添加${label}`} onDragStart={e=>{e.dataTransfer.setData('application/ligou-tool',t);e.dataTransfer.effectAllowed='copy';setTool(t);}} onClick={()=>setTool(tool===t?'select':t)} className={`tool-card ${tool===t?'active':''}`}><div className={`tool-symbol ${i>5?'load':''}`}><Icon size={21}/></div><div><strong>{label}</strong><small>{sub}</small></div><GripVertical className="drag-grip" size={13}/></button></div>)}<div className="snap-note"><span className="live-dot"/><div><strong>智能吸附已开启</strong><p>支座 → 节点<br/>荷载 → 杆件<br/>作用点 → 杆件<br/>集中力 → 作用点 / 杆件<br/>弯矩 → 点中心 / 左右侧<br/>无效连接不会吸附</p></div></div></div><div className="example-section"><h3>从一个经典算例开始</h3><select aria-label="选择验证算例" value="" onChange={e=>loadExample(e.target.value as ExampleKind)}><option value="" disabled>载入验证算例</option><option value="point">6 m 简支梁 · 跨中 10 kN</option><option value="udl">6 m 简支梁 · 均布 2 kN/m</option><option value="cantilever">3 m 悬臂梁 · 端部 10 kN</option><option value="vertical">竖向悬臂柱 · 水平 10 kN</option><option value="inclined">斜悬臂 · 竖向 10 kN</option><option value="frame">L 形刚架 · 端部 10 kN</option></select><p>6 组梁与刚架 · 可编辑参数</p></div></aside>
      <div className="center-workspace"><div className="model-toolbar"><div className="toolbar-label"><span>01</span><b>结构模型</b><span className="model-count">{model.nodes.length} 节点 / {model.members.length} 杆件</span></div><div className="toolbar-actions"><button aria-label="撤销" title="撤销 Ctrl+Z" disabled={!history.past.length} onClick={()=>undoRedo('undo')}><Undo2 size={16}/></button><button aria-label="重做" title="重做 Ctrl+Shift+Z" disabled={!history.future.length} onClick={()=>undoRedo('redo')}><Redo2 size={16}/></button><span className="divider"/><label className="auto-solve"><input type="checkbox" checked={automatic} onChange={e=>{manualSnapshot.current="";setAutomatic(e.target.checked);setRequestId(0);}}/>自动求解</label></div></div>
        <EditingTools model={model} items={selections} onChange={change} onSelection={setSelections} onMessage={setMessage}/>
        <BeamCanvas expanded={canvasExpanded} onToggleExpanded={()=>setCanvasExpanded(value=>!value)} selections={selections} onBatchSelect={(items,additive)=>setSelections(prev=>additive?[...prev,...items.filter(s=>!prev.some(p=>p.type===s.type&&p.id===s.id))]:items)} viewRevision={viewRevision} model={model} selection={selection} tool={tool} solution={solution} onChange={change} onSelect={setSelection} onTool={setTool} onMessage={setMessage} onClear={clearModel} palette={themePalette}/>
        <div className={`validation-bar ${errors.length?'has-errors':''}`} role="status">{errors.length?<AlertCircle size={15}/>:<CheckCircle2 size={15}/>}<span>{errors.length?`${errors.length} 项待处理 · ${errors[0]}`:solution?'模型验证与平衡校验通过':status==='solving'?'正在计算…':'模型可求解'}</span>{errors.length>1&&<details><summary>展开</summary><ul>{errors.map(e=><li key={e}>{e}</li>)}</ul></details>}</div>
        <Results solution={solution} status={status} errors={errors} model={model} selection={selection} palette={themePalette}/>
        <div className="object-drawer"><details><summary><Layers3 size={14}/>模型对象 <span>{count}</span><small>选择任意对象进行编辑</small></summary><div className="object-list">{(Object.keys(objectNames) as Collection[]).flatMap(type=>model[type].map((o,i)=><button key={o.id} className={selections.some(s=>s.id===o.id)?'active':''} onClick={e=>setSelection({type,id:o.id},e.shiftKey)}>{objectNames[type]} {i+1}<code>{o.id.slice(0,8)}</code></button>))}{!count&&<p>画布中还没有对象。</p>}</div></details></div>
      </div>
      <Inspector model={model} selection={selection} onChange={change} onSelect={setSelection} solution={solution}/>
    </main>
    <footer className="status-bar"><span><span className="live-dot"/>{message}</span><button onClick={()=>setGuide(true)}><CircleHelp size={13}/>操作与符号约定</button></footer>
    {historyOpen&&<ModelHistory archives={workspace.archives} model={model} onClose={()=>setHistoryOpen(false)} onRestore={restoreArchive} onSnapshot={snapshot} onDelete={deleteArchive}/>}
    {guide&&<div className="modal-backdrop" onClick={()=>setGuide(false)}><section className="guide-modal" role="dialog" aria-modal="true" aria-label="使用指南" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="关闭指南" onClick={()=>setGuide(false)}><X size={19}/></button><span className="eyebrow">LIGOU LAB / QUICK START</span><h2>从搭建，到理解。</h2><ol><li><b>放置节点，连接成梁</b><p>拖入节点，或选中节点工具后点击画布。杆件工具依次点击两个节点；拖入杆件工具会吸附起点，再点击终点。</p></li><li><b>添加支座与荷载</b><p>支座吸附到节点，集中力可连接已有作用点，或直接放在杆件上；均布荷载吸附到杆件；先在杆件任意位置放置菱形作用点，再将集中弯矩吸附到点中心或左右侧；也兼容已有节点弯矩。正值逆时针，负值顺时针。作用点独立于连接节点，无需拆杆，可拖动或精确编辑距杆件起点的距离。节点、杆件、支座和荷载均可拖动。新荷载按杆件主要朝向推荐方向：横杆默认竖向、竖杆默认水平，斜杆按主要朝向（45°取竖向）。方向可手动修改；已有荷载不会随杆件旋转而自动改变。正值向下或向左，负值反向。均布荷载可在属性面板设置起终点，或拖动两端圆点调整作用区间。</p></li><li><b>编辑参数，读取结果</b><p>空白处拖动可框选，Shift 点击可多选；所选项可用 ΔX / ΔY 整体移动或复制。长度 / 角度建杆可从已有节点精确创建杆件。点击对象编辑坐标、E、I、A、荷载及位置，回车或离开输入框提交。自动求解默认开启；内力图悬停可读数，集中力位置显示左右截面值。</p></li></ol><div className="guide-notes"><b>计算范围与符号</b><p>二维小变形线弹性 Euler–Bernoulli 梁 / 刚架，支持水平、竖向、斜向杆件。每个节点含 X、Y 位移与转角。铰支座约束 X、Y，滚动支座仅约束全局 Y，固定支座约束三个自由度。节点间刚接，支座独立于节点，可从节点属性面板单独删除。</p><p>整体结构图同时显示横梁、竖柱与斜杆的内力；切换截面曲线可沿杆件长度精确读数。水平梁沿全局 x 显示，其他杆件沿起点→终点的局部距离 s 显示。局部 y 为杆轴逆时针 90°，局部挠度沿该方向为正。轴力受拉为正；全局位移 ux 向右、uy 向上为正。支座力矩逆时针为正。内力与位移极值包含单元端点及区间内导数零点。</p><p>尚未实现：内铰、非均布荷载、支座转向 / 沉降、应力强度验算、动力 / 非线性分析。自重需手动作为均布荷载输入。</p></div><p className="guide-shortcuts">Ctrl + Z 撤销 · Ctrl + Shift + Z 重做 · Delete 删除 · Esc 选择工具<br/>JSON 保存可迁移模型；草稿、撤销重做与最近 20 个历史快照保存在当前浏览器。新建后请从“模型历史”恢复之前的模型。滚轮围绕鼠标位置缩放，按住鼠标中键拖动画布平移；“清空模型”删除画布内所有节点、作用点、杆件、支座与荷载（含集中弯矩），清空前自动保留历史，可撤销；“适应模型”重新居中全部构件。历史列表中的“删除”移除指定快照。</p></section></div>}
  </div>;
}






