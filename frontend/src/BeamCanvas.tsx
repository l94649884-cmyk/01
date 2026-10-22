import { useEffect, useRef, useState } from 'react';
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { Crosshair, Maximize2, Minimize2, Minus, Plus, Trash2 } from 'lucide-react';
import { fmt, snap, uid, resolvePointLoad } from './model';
import type { BeamModel, BeamNode, Member, Selection, Solution, SupportKind, Tool } from './model';
import {boxItems,moveItems,type Item} from './editing';
import { connectionError } from './geometry';
import { distributedGlyph } from './loadGeometry';
import { fixedSupportRotation } from './supportGeometry';
import { momentAnchor, momentArrowPoints, nearestMomentTarget, momentTargets, resolveMomentTarget, pointOnMember, momentAttachment, momentSideLabel } from './momentGeometry';
import { baseScale, fitViewport, initialViewport } from './viewport';
import type { Viewport } from './viewport';
import { inferLoadDirection, loadDirectionLabel } from './loadDirection';
import type { ThemePalette } from './themes';

type Props = {
  expanded: boolean; onToggleExpanded: () => void;
  model: BeamModel; selection: Selection; tool: Tool; solution: Solution | null;
  onChange: (model: BeamModel) => void; onSelect: (selection: Selection, additive?:boolean) => void;
  selections:Item[];onBatchSelect:(items:Item[],additive:boolean)=>void;
  onTool: (tool: Tool) => void; onMessage: (message: string) => void;
  onClear: () => boolean;
  palette: ThemePalette;
  viewRevision?: number;
};
type Point = { x: number; y: number };

function SupportSymbol({ kind, color, fill }: { kind: SupportKind; color: string; fill:string }) {
  if (kind === 'fixed') return <Group><Line points={[-10, -25, -10, 28]} stroke={color} strokeWidth={3}/>{[-24, -14, -4, 6, 16, 26].map(y => <Line key={y} points={[-10, y, -23, y + 10]} stroke={color} strokeWidth={1.4}/>)}</Group>;
  return <Group><Line points={[0, 5, -14, 25, 14, 25, 0, 5]} closed fill={fill} stroke={color} strokeWidth={1.8}/>{kind === 'roller' && <><Circle x={-8} y={30} radius={3} stroke={color} strokeWidth={1.5}/><Circle x={8} y={30} radius={3} stroke={color} strokeWidth={1.5}/></>}<Line points={[-21, kind === 'roller' ? 37 : 30, 21, kind === 'roller' ? 37 : 30]} stroke={color} strokeWidth={1.5}/>{[-15, -5, 5, 15].map(x => <Line key={x} points={[x, kind === 'roller' ? 37 : 30, x-5, kind === 'roller' ? 43 : 36]} stroke={color} strokeWidth={1}/>)}</Group>;
}

export default function BeamCanvas({ expanded,onToggleExpanded,selections,onBatchSelect,model, selection, tool, solution, onChange, onSelect, onTool, onMessage, onClear, palette, viewRevision = 0 }: Props) {
  const green=palette.accent,ink=palette.ink,orange=palette.load;
  const container = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const [selectionBox,setSelectionBox]=useState<{start:Point;end:Point}|null>(null);
  const suppressClick=useRef(false);
  const selectDrag=(type:Item['type'],id:string)=>{if(!selections.some(s=>s.type===type&&s.id===id))onSelect({type,id});};
  const moveBatch=(dx:number,dy:number)=>{try{onChange(moveItems(model,selections,dx,dy));}catch(e){onMessage((e as Error).message);}};
  const panPoint = useRef<{x:number;y:number}|null>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<Point>({ x: 3, y: 0 });
  const [centerY,setCenterY]=useState(225);
  const [startNode, setStartNode] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hint, setHint] = useState<{ p: Point; valid: boolean; label: string } | null>(null);
  const [viewNotice,setViewNotice]=useState('');
  const [panActive,setPanActive]=useState(false);
  const [height,setHeight] = useState(384);
  const scale = baseScale(width) * zoom;
  const toScreen = (p: Point) => ({ x: width/2 + (p.x-center.x)*scale, y: centerY - (p.y-center.y)*scale });
  const toWorld = (p: Point) => ({ x: (p.x-width/2)/scale + center.x, y: (centerY-p.y)/scale + center.y });
  const selected = (type: string, id: string) => selections.some(s=>s.type===type&&s.id===id);
  const nodes = new Map(model.nodes.map(n => [n.id, n]));
  const targets=momentTargets(model);
  const nearestActionPoint=(p:Point)=>targets.filter(t=>t.kind==='actionPoint').map(t=>({target:t,d:Math.hypot(t.x-p.x,t.y-p.y)*scale})).filter(t=>t.d<=20).sort((a,b)=>a.d-b.d)[0]?.target;
  const nearestNode = (p: Point, exclude?: string) => model.nodes.filter(n => n.id !== exclude).map(n => ({ n, d: Math.hypot(n.x-p.x, n.y-p.y)*scale })).filter(x => x.d <= 28).sort((a, b) => a.d-b.d)[0]?.n;
  function nearestMember(p: Point): { member: Member; at: number; p: Point } | null {
    let best: { member: Member; at: number; p: Point; d: number } | null = null;
    for (const m of model.members) {
      const a = nodes.get(m.start), b = nodes.get(m.end);
      if (!a || !b) continue;
      const dx=b.x-a.x, dy=b.y-a.y, length=Math.hypot(dx, dy);
      if (!length) continue;
      const t=Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/(length*length)));
      const foot={x:a.x+t*dx, y:a.y+t*dy}, d=Math.hypot(p.x-foot.x,p.y-foot.y)*scale;
      if (d<=42 && (!best || d<best.d)) best={member:m, at:Math.max(0, Math.min(length, snap(t*length))), p:foot, d};
    }
    return best;
  }
  function fit() {
    applyViewport(fitViewport(model.nodes,width,height));
  }
  function applyViewport(view: Viewport) { setCenter(view.center); setZoom(view.zoom); setCenterY(view.originY); }
  function clearAll() {
    if(!onClear())return;
    setPanActive(false);panPoint.current=null;setStartNode(null);setHint(null);setCursor(null);
    setViewNotice('全部模型已清空 · 可撤销');
  }
  useEffect(()=>{
    const element=container.current;if(!element)return;
    // React delegates wheel listeners as passive; a native non-passive listener
    // must cancel page scrolling while the pointer is over the canvas.
    const zoomAtPointer=(event:WheelEvent)=>{
    event.preventDefault();
    const rect=container.current?.getBoundingClientRect();if(!rect)return;
    const pointer={x:event.clientX-rect.left,y:event.clientY-rect.top};
    const anchor=toWorld(pointer),nextZoom=Math.max(.05,Math.min(8,zoom*Math.exp(-event.deltaY*.0012))),nextScale=baseScale(width)*nextZoom;
    setCenter({x:anchor.x-(pointer.x-width/2)/nextScale,y:anchor.y-(centerY-pointer.y)/nextScale});setZoom(nextZoom);setViewNotice('');
    };
    element.addEventListener('wheel',zoomAtPointer,{passive:false});
    return()=>element.removeEventListener('wheel',zoomAtPointer);
  },[width,zoom,center.x,center.y,centerY]);
  useEffect(()=>{
    if(!panActive)return;
    const move=(event:MouseEvent)=>{
      const previous=panPoint.current;if(!previous)return;
      const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
      panPoint.current={x:event.clientX,y:event.clientY};
      if(dx||dy){setCenter(c=>({x:c.x-dx/scale,y:c.y+dy/scale}));setCursor(null);setHint(null);}
      event.preventDefault();
    };
    const end=()=>{panPoint.current=null;setPanActive(false);setViewNotice('已平移视图 · 按住鼠标中键可继续移动');};
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',end);
    return()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',end);};
  },[panActive,scale]);
  useEffect(() => { const ro = new ResizeObserver(e => {setWidth(e[0].contentRect.width);setHeight(e[0].contentRect.height);}); if (container.current) ro.observe(container.current); return () => ro.disconnect(); }, []);
  useEffect(()=>{
    // Intercept the middle button before Konva's draggable shapes can capture it.
    const content=stage.current?.getContent();if(!content)return;
    const start=(event:MouseEvent)=>{if(event.button!==1)return;event.preventDefault();event.stopImmediatePropagation();panPoint.current={x:event.clientX,y:event.clientY};setPanActive(true);setViewNotice('');setHint(null);};
    content.addEventListener('mousedown',start,true);return()=>content.removeEventListener('mousedown',start,true);
  },[]);
  useEffect(() => { setStartNode(null); setHint(null); }, [tool]);
  useEffect(() => { if (startNode && !nodes.has(startNode)) setStartNode(null); }, [model, startNode]);
  // Reframe on document changes and measured layout changes, not on every model edit.
  const latestNodes = useRef(model.nodes); latestNodes.current = model.nodes;
  useEffect(()=>{applyViewport(initialViewport(latestNodes.current,width,height));setStartNode(null);setHint(null);if(latestNodes.current.length)setViewNotice('');},[width,height,viewRevision]);
  function chooseMemberEnd(n: BeamNode) {
    if (!startNode) { setStartNode(n.id); onMessage('起点已吸附；点击另一个节点完成杆件。'); return; }
    if (startNode===n.id) { onMessage('杆件两端不能是同一节点。'); return; }
    if (model.members.some(m => (m.start===startNode && m.end===n.id)||(m.end===startNode && m.start===n.id))) { onMessage('这两个节点之间已经有杆件。'); return; }
    const a=nodes.get(startNode)!;
    const error=connectionError(model,a,n);if(error){onMessage(error);return;}
    const m={id:uid('B'),start:a.id,end:n.id,E:210,I:8000,A:100};
    onChange({...model,members:[...model.members,m]}); onSelect({type:'members',id:m.id}); setStartNode(null); onTool('select');
  }
  function place(active: Tool, p: Point) {
    setViewNotice('');
    setHint(null);
    if (active==='select') { onSelect(null); return; }
    if (active==='node') {
      const near=nearestNode(p);
      if (near) { onSelect({type:'nodes',id:near.id}); onMessage('已吸附到现有节点，未创建重合节点。'); return; }
      const yTarget=model.nodes.find(n=>Math.abs(n.y-p.y)*scale<18)?.y;
      const xTarget=model.nodes.find(n=>Math.abs(n.x-p.x)*scale<18)?.x;
      const n={id:uid('N'),x:xTarget??snap(p.x),y:yTarget??snap(p.y)};
      onChange({...model,nodes:[...model.nodes,n]}); onSelect({type:'nodes',id:n.id});
    } else if (active==='member') {
      const n=nearestNode(p);
      if (!n) { onMessage('杆件只能吸附到节点：请先添加节点，再依次点击两个端点。'); return; }
      chooseMemberEnd(n);
    } else if(active==='actionPoint'){
      const hit=nearestMember(p);
      if(!hit){onMessage('作用点需要放在杆件上，请靠近杆件。');return;}
      const existing=model.actionPoints.find(a=>a.memberId===hit.member.id&&Math.abs(a.at-hit.at)<1e-8);
      if(existing){onSelect({type:'actionPoints',id:existing.id});onTool('select');onMessage('已选择现有作用点。');return;}
      const point={id:uid('A'),memberId:hit.member.id,at:hit.at};
      onChange({...model,actionPoints:[...model.actionPoints,point]});onSelect({type:'actionPoints',id:point.id});onTool('select');
      onMessage('作用点已放置；可将集中弯矩吸附到其中心或左右侧，位置可在属性面板精确编辑。');
    } else if(active==='moment'){
      const hit=nearestMomentTarget(targets,p,scale);
      if(!hit){onMessage('集中弯矩只能吸附到作用点或节点的中心、左右侧；请先在杆件上添加作用点。');return;}
      const moment={id:uid('M'),...momentAttachment(hit.node),value:10,side:hit.side};
      onChange({...model,moments:[...model.moments,moment]});onSelect({type:'moments',id:moment.id});onTool('select');
      onMessage(`集中弯矩已连接${hit.node.kind==='actionPoint'?'作用点':'节点'}${momentSideLabel(hit.side)}；正值逆时针，可在属性面板修改。`);
    } else if (['pin','roller','fixed'].includes(active)) {
      const n=nearestNode(p);
      if (!n) { onMessage('支座只能吸附到节点，当前位置无法连接。'); return; }
      if (model.supports.some(s=>s.nodeId===n.id)) { onMessage('该节点已有支座，请在属性面板修改类型。'); return; }
      const support={id:uid('S'),nodeId:n.id,kind:active as SupportKind};
      onChange({...model,supports:[...model.supports,support]}); onSelect({type:'supports',id:support.id}); onTool('select');
    } else {
      const target=active==='point'?model.actionPoints.map(point=>({point,p:pointOnMember(model,point)})).filter(hit=>hit.p&&Math.hypot(hit.p.x-p.x,hit.p.y-p.y)*scale<=20).sort((a,b)=>Math.hypot(a.p!.x-p.x,a.p!.y-p.y)-Math.hypot(b.p!.x-p.x,b.p!.y-p.y))[0]:null;
      if(target){const load={id:uid('P'),pointId:target.point.id,value:10,direction:inferLoadDirection(nodes.get(model.members.find(m=>m.id===target.point.memberId)!.start)!,nodes.get(model.members.find(m=>m.id===target.point.memberId)!.end)!)};onChange({...model,pointLoads:[...model.pointLoads,load]});onSelect({type:'pointLoads',id:load.id});onTool('select');onMessage('集中力已连接作用点，将随作用点移动。');return;}
      const hit=nearestMember(p);
      if (!hit) { onMessage('荷载只能吸附到杆件，当前位置无法连接。'); return; }
      const direction=inferLoadDirection(nodes.get(hit.member.start)!,nodes.get(hit.member.end)!);
      if (active==='point') { const load={id:uid('P'),memberId:hit.member.id,at:hit.at,value:10,direction}; onChange({...model,pointLoads:[...model.pointLoads,load]}); onSelect({type:'pointLoads',id:load.id}); }
      else { const load={id:uid('Q'),memberId:hit.member.id,value:2,direction}; onChange({...model,distributedLoads:[...model.distributedLoads,load]}); onSelect({type:'distributedLoads',id:load.id}); }
      onMessage(`已按杆件朝向识别荷载方向：${loadDirectionLabel(direction)}；可在属性面板修改。`);
      onTool('select');
    }
  }
  function preview(active: Tool, p: Point) {
    if (active==='select') return;
    if (active==='node') { const n=nearestNode(p); setHint({p:n??{x:model.nodes.find(n=>Math.abs(n.x-p.x)*scale<18)?.x??snap(p.x),y:model.nodes.find(n=>Math.abs(n.y-p.y)*scale<18)?.y??snap(p.y)},valid:true,label:n?'现有节点':'网格吸附 · 0.25 m'}); }
    else if (active==='member'||['pin','roller','fixed'].includes(active)) { const n=nearestNode(p),a=startNode?nodes.get(startNode):null;const error=active==='member'&&a&&n?connectionError(model,a,n):null; setHint({p:n??p,valid:!!n&&!error,label:error??(n?'节点可连接':'请靠近节点')}); }
    else if(active==='moment'){const hit=nearestMomentTarget(targets,p,scale);setHint({p:hit?.p??p,valid:!!hit,label:hit?`${hit.node.kind==='actionPoint'?'作用点':'节点'}${momentSideLabel(hit.side)} · 集中弯矩`:'请靠近作用点中心或左右侧'});}
    else if(active==='point'&&nearestActionPoint(p)){const target=nearestActionPoint(p)!;setHint({p:target,valid:true,label:'作用点 · 绑定集中力'});}
    else { const hit=nearestMember(p); setHint({p:hit?.p??p,valid:!!hit,label:hit?active==='actionPoint'?'作用点 · 沿杆定位':`默认${loadDirectionLabel(inferLoadDirection(nodes.get(hit.member.start)!,nodes.get(hit.member.end)!))}`:'请靠近杆件'}); }
  }
  function clickObject(type: NonNullable<Selection>['type'], id: string, p: Point, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) { e.cancelBubble=true;if('button' in e.evt&&e.evt.button!==0)return; if(tool==='select') onSelect({type,id},'shiftKey' in e.evt&&e.evt.shiftKey); else {const pointer=stage.current?.getPointerPosition();place(tool,pointer?toWorld(pointer):p);} }
  const gridX: number[]=[];
  const worldLeft=toWorld({x:0,y:0}).x, worldRight=toWorld({x:width,y:0}).x;
  const step=scale<30?Math.max(1,Math.ceil(20/scale)):.25;
  for(let x=Math.ceil(worldLeft/step)*step;x<=worldRight;x+=step) gridX.push(x);
  const gridY:number[]=[];
  const worldBottom=toWorld({x:0,y:height-32}).y,worldTop=toWorld({x:0,y:50}).y;
  for(let y=Math.ceil(worldBottom/step)*step;y<=worldTop;y+=step)gridY.push(y);
  return <div className="canvas-wrap" ref={container} data-testid="beam-canvas" data-panning={panActive||undefined} style={{background:palette.bg}} onDragOver={e=>{e.preventDefault();const r=e.currentTarget.getBoundingClientRect();preview((e.dataTransfer.types.includes('application/ligou-tool')?tool:'select'),toWorld({x:e.clientX-r.left,y:e.clientY-r.top}));}} onDrop={e=>{e.preventDefault();const active=e.dataTransfer.getData('application/ligou-tool') as Tool;const r=e.currentTarget.getBoundingClientRect(); if(active)place(active,toWorld({x:e.clientX-r.left,y:e.clientY-r.top}));}}>
    <div className="canvas-caption"><span className="live-dot"/>二维结构工作台<span className="caption-separator">/</span><span>单位 m · kN</span></div>
    <div className="canvas-controls"><button className="canvas-expand" title={expanded?"退出展开画布（Esc）":"展开画布"} aria-label={expanded?"退出展开画布":"展开画布"} aria-pressed={expanded} onClick={onToggleExpanded}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button><button title="缩小视图" aria-label="缩小视图" onClick={()=>setZoom(z=>Math.max(.05,z/1.2))}><Minus size={15}/></button><span>{Math.round(zoom*100)}%</span><button title="放大视图" aria-label="放大视图" onClick={()=>setZoom(z=>Math.min(8,z*1.2))}><Plus size={15}/></button><button title="适应模型" aria-label="适应模型" onClick={fit}><Crosshair size={16}/></button><button className="canvas-clear" title="清空全部节点、杆件、支座和荷载（可撤销）" aria-label="清空模型" onClick={clearAll}><Trash2 size={14}/><span>清空</span></button></div>
    <Stage width={width} height={height} ref={stage} onMouseLeave={()=>{setSelectionBox(null);if(!panActive){setCursor(null);setHint(null);}}} onMouseDown={e=>{if(tool==='select'&&e.evt.button===0&&e.target===e.target.getStage()){const p=stage.current?.getPointerPosition();if(p){const w=toWorld(p);setSelectionBox({start:w,end:w});}}}} onMouseUp={e=>{if(!selectionBox)return;const moved=Math.hypot(selectionBox.end.x-selectionBox.start.x,selectionBox.end.y-selectionBox.start.y)*scale>4;if(moved){onBatchSelect(boxItems(model,selectionBox.start,selectionBox.end),e.evt.shiftKey);suppressClick.current=true;}setSelectionBox(null);}} onMouseMove={()=>{if(panActive)return;const p=stage.current?.getPointerPosition();if(p){const w=toWorld(p);if(selectionBox)setSelectionBox({...selectionBox,end:w});setCursor(w);preview(tool,w);}}} onClick={e=>{if(suppressClick.current){suppressClick.current=false;return;}if(('button' in e.evt&&e.evt.button!==0)||panActive)return;if(e.target===e.target.getStage()){const p=stage.current?.getPointerPosition();if(p)place(tool,toWorld(p));}}}>
      <Layer>
        {gridX.map(x=><Line key={`gx${x}`} points={[toScreen({x,y:0}).x,50,toScreen({x,y:0}).x,height-32]} stroke={Number.isInteger(x)?palette.majorGrid:palette.grid} strokeWidth={1} listening={false}/>)}
        {gridY.map(y=><Line key={`gy${y}`} points={[0,toScreen({x:0,y}).y,width,toScreen({x:0,y}).y]} stroke={Number.isInteger(y)?palette.majorGrid:palette.grid} strokeWidth={1} listening={false}/>)}
        {gridY.filter(y=>Number.isInteger(y)).map(y=><Text key={`yt${y}`} x={6} y={toScreen({x:0,y}).y-12} text={`y ${fmt(y)}`} fontSize={9} fill={palette.muted} listening={false}/>)}
        <Line points={[0,toScreen({x:0,y:0}).y,width,toScreen({x:0,y:0}).y]} stroke={palette.axis} dash={[3,5]} listening={false}/>
        {gridX.filter(x=>Number.isInteger(x)).map(x=><Text key={`t${x}`} x={toScreen({x,y:0}).x-15} y={height-23} width={30} align="center" text={`${fmt(x)}`} fontSize={10} fill={palette.muted} listening={false}/>)}
        {model.members.map(m=>{
          const a=nodes.get(m.start),b=nodes.get(m.end);if(!a||!b)return null;
          const pa=toScreen(a),pb=toScreen(b),isSelected=selected('members',m.id),len=Math.hypot(pb.x-pa.x,pb.y-pa.y),nx=-(pb.y-pa.y)/(len||1),ny=(pb.x-pa.x)/(len||1),offset=Math.abs(b.y-a.y)<1e-8?69:33;
          const da={x:pa.x+nx*offset,y:pa.y+ny*offset},db={x:pb.x+nx*offset,y:pb.y+ny*offset};
          return <Group key={m.id} draggable={tool==='select'} onDragStart={()=>selectDrag('members',m.id)} onDragEnd={e=>{const dx=snap(e.target.x()/scale),dy=snap(-e.target.y()/scale);e.target.position({x:0,y:0});if(selections.length>1){moveBatch(dx,dy);return;}onChange({...model,nodes:model.nodes.map(n=>(n.id===a.id||n.id===b.id)?{...n,x:n.x+dx,y:n.y+dy}:n)});}} onClick={e=>clickObject('members',m.id,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},e)}>
            <Line points={[pa.x,pa.y,pb.x,pb.y]} stroke={isSelected?palette.selection:palette.majorGrid} strokeWidth={isSelected?17:12} lineCap="round" hitStrokeWidth={24}/>
            <Line points={[pa.x,pa.y,pb.x,pb.y]} stroke={isSelected?green:ink} strokeWidth={5} lineCap="round"/>
            <Text x={(pa.x+pb.x)/2-42} y={(pa.y+pb.y)/2+16} text={m.id.startsWith('B-')?'梁段':m.id} fontSize={11} fill={palette.muted} listening={false} width={84} align="center"/>
            <Group listening={false}><Line points={[da.x,da.y,db.x,db.y]} stroke={palette.axis} strokeWidth={1}/><Line points={[da.x-nx*5,da.y-ny*5,da.x+nx*5,da.y+ny*5]} stroke={palette.axis}/><Line points={[db.x-nx*5,db.y-ny*5,db.x+nx*5,db.y+ny*5]} stroke={palette.axis}/>
            <Rect x={(da.x+db.x)/2-32} y={(da.y+db.y)/2-9} width={64} height={18} fill={palette.bg}/><Text x={(da.x+db.x)/2-32} y={(da.y+db.y)/2-7} text={`${fmt(Math.hypot(b.x-a.x,b.y-a.y))} m`} width={64} align="center" fontSize={12} fill={palette.muted}/></Group>
          </Group>;
        })}
        {model.distributedLoads.map((q,i)=>{
          const m=model.members.find(m=>m.id===q.memberId);if(!m)return null;const a=nodes.get(m.start),b=nodes.get(m.end);if(!a||!b)return null;
          const length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)return null;
          const start=q.start??0,end=q.end??length;
          const worldAt=(s:number)=>({x:a.x+(b.x-a.x)*s/length,y:a.y+(b.y-a.y)*s/length});
          const mid=worldAt((start+end)/2),p=toScreen(mid),sa=toScreen(worldAt(start)),sb=toScreen(worldAt(end));
          const col=selected('distributedLoads',q.id)?green:orange;
          const glyph=distributedGlyph({x:sa.x-p.x,y:sa.y-p.y},{x:sb.x-p.x,y:sb.y-p.y},q.direction==='x',i%3);
          const {tips,tails,ends,polygon,parallel}=glyph;
          const label={x:(ends[0].x+ends[1].x)/2,y:(ends[0].y+ends[1].y)/2};
          return <Group key={q.id} x={p.x} y={p.y} draggable={tool==='select'} onClick={e=>clickObject('distributedLoads',q.id,mid,e)} onDragStart={()=>onSelect({type:'distributedLoads',id:q.id})} onDragEnd={e=>{const hit=nearestMember(toWorld(e.target.position()));e.target.position(p);if(hit&&hit.member.id!==q.memberId)onChange({...model,distributedLoads:model.distributedLoads.map(l=>l.id===q.id?{...l,memberId:hit.member.id,start:0,end:undefined}:l)});else if(!hit)onMessage('均布荷载只能吸附到杆件，已恢复原位置。');}}>
            <Line points={polygon.flatMap(t=>[t.x,t.y])} closed fill={col} opacity={.1} stroke={parallel?col:undefined} strokeWidth={1}/>
            {!parallel&&<Line points={[tails[0].x,tails[0].y,tails.at(-1)!.x,tails.at(-1)!.y]} stroke={col} strokeWidth={1.7}/>}
            {tips.map((tip,j)=><Arrow key={j} points={q.value>=0?[tails[j].x,tails[j].y,tip.x,tip.y]:[tip.x,tip.y,tails[j].x,tails[j].y]} stroke={col} fill={col} strokeWidth={1.7} pointerLength={5} pointerWidth={5} hitStrokeWidth={10}/>)}
            {ends.map((ep,j)=><Line key={`extent${j}`} points={[j?sb.x-p.x:sa.x-p.x,j?sb.y-p.y:sa.y-p.y,ep.x,ep.y]} stroke={col} dash={[3,4]} opacity={.6} listening={false}/>)}
            <Text x={label.x-95+(Math.abs(sb.x-sa.x)<20?95:0)} y={label.y-(parallel?38:110)} width={190} align="center" text={`q${q.direction==='x'?'x':''} = ${fmt(q.value)} kN/m`} fontSize={13} fontStyle="bold" fill={col}/>
            {selected('distributedLoads',q.id)&&ends.map((ep,j)=><Circle key={`handle${j}`} x={ep.x} y={ep.y} radius={6} fill={palette.bg} stroke={col} strokeWidth={2} hitStrokeWidth={12} draggable={tool==='select'} onClick={e=>{e.cancelBubble=true;}} onDragStart={e=>{e.cancelBubble=true;}} onDragMove={e=>{e.cancelBubble=true;}} onDragEnd={e=>{
              e.cancelBubble=true;const w=toWorld({x:p.x+e.target.x(),y:p.y+e.target.y()});
              const station=((w.x-a.x)*(b.x-a.x)+(w.y-a.y)*(b.y-a.y))/length;
              const v=Math.max(j?start+Math.min(.01,length/10):0,Math.min(j?length:end-Math.min(.01,length/10),snap(station)));
              e.target.position(ep);onChange({...model,distributedLoads:model.distributedLoads.map(l=>l.id===q.id?{...l,[j?'end':'start']:v}:l)});
            }}/>)}
          </Group>;
        })}
        {model.pointLoads.map((rawLoad,i)=>{
          const load=resolvePointLoad(model,rawLoad);
          const m=model.members.find(m=>m.id===load.memberId);if(!m)return null;const a=nodes.get(m.start),b=nodes.get(m.end);if(!a||!b)return null;
          const len=Math.hypot(b.x-a.x,b.y-a.y)||1,t=load.at/len,world={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},p=toScreen(world),col=selected('pointLoads',load.id)?green:orange,top=-76-(i%3)*17;
          return <Group key={load.id} x={p.x} y={p.y} draggable={tool==='select'} onClick={e=>clickObject('pointLoads',load.id,world,e)} onDragStart={()=>onSelect({type:'pointLoads',id:load.id})} onDragMove={e=>{const hit=nearestMember(toWorld(e.target.position()));setHint({p:hit?.p??toWorld(e.target.position()),valid:!!hit,label:hit?`吸附 · ${fmt(hit.at)} m`:'无法连接'});}} onDragEnd={e=>{const world=toWorld(e.target.position()),target=nearestActionPoint(world),hit=nearestMember(world);e.target.position(p);setHint(null);if(target){onChange({...model,pointLoads:model.pointLoads.map(l=>l.id===load.id?{...l,pointId:target.id,memberId:undefined,at:undefined}:l)});return;}if(hit)onChange({...model,pointLoads:model.pointLoads.map(l=>l.id===load.id?{...l,pointId:undefined,memberId:hit.member.id,at:hit.at}:l)});else onMessage('集中力只能吸附到杆件，已恢复原位置。');}}>
            <Group rotation={load.direction==='x'?90:0}><Rect x={-16} y={top-5} width={32} height={-top-4} fill="transparent"/><Arrow points={load.value>=0?[0,top,0,-9]:[0,-9,0,top]} stroke={col} fill={col} strokeWidth={2.3} pointerLength={10} pointerWidth={8}/></Group><Text x={load.direction==='x'?10:-70} y={load.direction==='x'?-27:top-23} width={140} align="center" text={`P${load.direction==='x'?'x':''} = ${fmt(load.value)} kN`} fontSize={14} fontStyle="bold" fill={col}/>
          </Group>;
        })}
        {model.supports.map(s=>{
          const n=nodes.get(s.nodeId);if(!n)return null;const p=toScreen(n),col=selected('supports',s.id)?green:ink;
          return <Group key={s.id} x={p.x} y={p.y} draggable={tool==='select'} onClick={e=>clickObject('supports',s.id,n,e)} onDragStart={()=>onSelect({type:'supports',id:s.id})} onDragEnd={e=>{const target=nearestNode(toWorld(e.target.position()));e.target.position(p);if(target&&!model.supports.some(o=>o.id!==s.id&&o.nodeId===target.id))onChange({...model,supports:model.supports.map(o=>o.id===s.id?{...o,nodeId:target.id}:o)});else onMessage('支座需吸附到未占用的节点，已恢复原位置。');}}><Group rotation={s.kind==='fixed'?fixedSupportRotation(model,s.nodeId):0}><Rect x={-25} y={s.kind==='fixed'?-25:6} width={50} height={s.kind==='fixed'?55:40} fill="transparent"/><SupportSymbol kind={s.kind} color={col} fill={palette.supportFill}/></Group></Group>;
        })}
        {model.moments.map(moment=>{
          const node=resolveMomentTarget(model,moment);if(!node)return null;
          const anchor=momentAnchor(node,moment.side,scale),p=toScreen(anchor),np=toScreen(node),col=selected('moments',moment.id)?green:orange;
          return <Group key={moment.id}>
            {moment.side!=='center'&&<Line points={[np.x+(moment.side==='left'?-8:8),np.y,p.x+(moment.side==='left'?20:-20),p.y]} stroke={col} dash={[3,3]} listening={false}/>}
            <Group x={p.x} y={p.y} draggable={tool==='select'} onClick={e=>clickObject('moments',moment.id,anchor,e)} onDragStart={()=>onSelect({type:'moments',id:moment.id})} onDragMove={e=>{const hit=nearestMomentTarget(targets,toWorld(e.target.position()),scale);setHint({p:hit?.p??toWorld(e.target.position()),valid:!!hit,label:hit?`${hit.node.kind==='actionPoint'?'作用点':'节点'}${momentSideLabel(hit.side)}`:'无法连接'});}} onDragEnd={e=>{
              const hit=nearestMomentTarget(targets,toWorld(e.target.position()),scale);e.target.position(p);setHint(null);
              if(hit)onChange({...model,moments:model.moments.map(m=>m.id===moment.id?{...m,nodeId:undefined,pointId:undefined,...momentAttachment(hit.node),side:hit.side}:m)});
              else onMessage('集中弯矩只能连接作用点或节点中心、左右侧，已恢复原位置。');
            }}>
              <Rect x={-22} y={-23} width={44} height={46} fill="transparent"/>
              <Arrow points={momentArrowPoints(moment.value)} stroke={col} fill={col} strokeWidth={2} pointerLength={7} pointerWidth={7}/>
              <Text x={moment.side==='left'?-160:moment.side==='right'?10:-75} y={moment.side==='center'?-62:-44} width={150} align={moment.side==='left'?'right':moment.side==='right'?'left':'center'} text={`M = ${fmt(moment.value)} kN·m`} fontSize={12} fontStyle="bold" fill={col}/>
            </Group>
          </Group>;
        })}
        {model.actionPoints.map(point=>{
          const world=pointOnMember(model,point);if(!world)return null;
          const p=toScreen(world),col=selected('actionPoints',point.id)?green:orange;
          return <Group key={point.id} x={p.x} y={p.y} draggable={tool==='select'} onClick={e=>clickObject('actionPoints',point.id,world,e)} onDragStart={()=>selectDrag('actionPoints',point.id)} onDragEnd={e=>{
            const hit=nearestMember(toWorld(e.target.position()));e.target.position(p);
            if(hit&&selections.length>1){moveBatch(hit.p.x-world.x,hit.p.y-world.y);return;}
            if(hit)onChange({...model,actionPoints:model.actionPoints.map(a=>a.id===point.id?{...a,memberId:hit.member.id,at:hit.at}:a)});
            else onMessage('作用点需要连接杆件，已恢复原位置。');
          }}>
            <Line points={[0,-6,6,0,0,6,-6,0]} closed fill={palette.bg} stroke={col} strokeWidth={2} hitStrokeWidth={7}/>
            <Text x={-32} y={28} width={64} align="center" text="作用点" fontSize={10} fill={col} listening={false}/>
          </Group>;
        })}
        {model.nodes.map(n=>{
          const p=toScreen(n),isSelected=selected('nodes',n.id)||n.id===startNode;
          return <Group key={n.id} x={p.x} y={p.y} draggable={tool==='select'} onClick={e=>clickObject('nodes',n.id,n,e)} onDragStart={()=>selectDrag('nodes',n.id)} onDragMove={e=>{const w=toWorld(e.target.position()),other=nearestNode(w,n.id);setHint({p:{x:model.nodes.find(o=>o.id!==n.id&&Math.abs(o.x-w.x)*scale<18)?.x??snap(w.x),y:model.nodes.find(o=>o.id!==n.id&&Math.abs(o.y-w.y)*scale<18)?.y??snap(w.y)},valid:!other,label:other?'节点不可重合':'网格 / 水平与竖向吸附'});}} onDragEnd={e=>{const w=toWorld(e.target.position()),x=model.nodes.find(o=>o.id!==n.id&&Math.abs(o.x-w.x)*scale<18)?.x??snap(w.x),y=model.nodes.find(o=>o.id!==n.id&&Math.abs(o.y-w.y)*scale<18)?.y??snap(w.y);e.target.position(p);setHint(null);if(selections.length>1){moveBatch(x-n.x,y-n.y);return;}if(model.nodes.some(o=>o.id!==n.id&&Math.hypot(o.x-x,o.y-y)<.001)){onMessage('节点不可重合，已恢复原位置。');return;}onChange({...model,nodes:model.nodes.map(o=>o.id===n.id?{...o,x,y}:o)});}}>
            {isSelected&&<Circle radius={12} fill={palette.accentSoft} listening={false}/>}<Circle radius={5.5} fill={palette.supportFill} stroke={isSelected?green:ink} strokeWidth={2.2} hitStrokeWidth={5}/><Text x={-28} y={-26} width={56} align="center" text={n.id.startsWith('N-')?'节点':n.id} fontSize={11} fill={palette.text} listening={false}/>
          </Group>;
        })}
        {solution?.reactions.map(r=>{const n=nodes.get(r.nodeId);if(!n)return null;const p=toScreen(n);return <Text key={r.supportId} x={p.y>height-140?p.x+28:p.x-58} y={p.y>height-140?Math.min(height-70,p.y+5):p.y+92} width={116} align={p.y>height-140?"left":"center"} text={`${r.vertical>=0?'↑':'↓'} ${fmt(Math.abs(r.vertical))} kN${Math.abs(r.horizontal??0)>1e-8?`\n${(r.horizontal??0)>=0?'→':'←'} ${fmt(Math.abs(r.horizontal??0))} kN`:''}`} fontSize={12} fill={green} listening={false}/>;})}
        {startNode&&nodes.has(startNode)&&cursor&&<Line points={[toScreen(nodes.get(startNode)!).x,toScreen(nodes.get(startNode)!).y,toScreen(cursor).x,toScreen(cursor).y]} stroke={green} dash={[6,4]} listening={false}/>}
        {selectionBox&&<Rect x={Math.min(toScreen(selectionBox.start).x,toScreen(selectionBox.end).x)} y={Math.min(toScreen(selectionBox.start).y,toScreen(selectionBox.end).y)} width={Math.abs(selectionBox.end.x-selectionBox.start.x)*scale} height={Math.abs(selectionBox.end.y-selectionBox.start.y)*scale} stroke={green} fill={green} opacity={.18} listening={false}/>}
        {hint&&<Group x={toScreen(hint.p).x} y={toScreen(hint.p).y} listening={false}><Circle radius={13} stroke={hint.valid?green:'#b65349'} strokeWidth={1.5} dash={[4,3]}/><Text x={19} y={-8} text={hint.label} fill={hint.valid?green:'#b65349'} fontSize={11}/></Group>}
      </Layer>
    </Stage>
    {!model.nodes.length&&<div className="empty-canvas"><span>从一个节点开始。</span><p>将左侧的节点拖入画布，然后连接成梁。</p></div>}
    <div className="canvas-foot"><span>{viewNotice||(startNode?'点击第二个节点完成杆件':tool==='select'?'拖动对象调整位置 · 点击对象编辑参数':'点击画布放置，或从构件库拖入')}</span><span>{cursor?`x ${fmt(cursor.x,2)} / y ${fmt(cursor.y,2)}`:'滚轮缩放 · 中键平移'}</span></div>
  </div>;
}


