import { z } from 'zod';
import { connectionError, distance } from './geometry';

const id = z.string().min(1).max(80);
const coord = z.number().finite().min(-1000).max(1000);
const value = z.number().finite().min(-1e6).max(1e6);
export const modelSchema = z.object({
  schemaVersion: z.literal(1), name: z.string().max(120),
  nodes: z.array(z.object({ id, x: coord, y: coord }).strict()).max(80),
  members: z.array(z.object({ id, start: id, end: id, E: z.number().finite().min(1e-6).max(10000), I: z.number().finite().min(1e-6).max(1e10), A: z.number().finite().min(1e-6).max(1e8).optional() }).strict()).max(79),
  supports: z.array(z.object({ id, nodeId: id, kind: z.enum(['pin', 'roller', 'fixed']) }).strict()).max(80),
  pointLoads: z.array(z.object({ id, memberId: id.optional(), at: z.number().finite().min(0).max(3000).optional(), pointId:id.optional(), value, direction: z.enum(['x','y']).optional() }).strict().refine(p=>p.pointId!==undefined?p.memberId===undefined&&p.at===undefined:p.memberId!==undefined&&p.at!==undefined,'集中力需要作用点或杆件位置')).max(100),
  distributedLoads: z.array(z.object({ id, memberId: id, value, direction: z.enum(['x','y']).optional(), start: z.number().finite().min(0).max(3000).optional(), end: z.number().finite().min(0).max(3000).optional() }).strict()).max(100),
  actionPoints: z.array(z.object({id,memberId:id,at:z.number().finite().min(0).max(3000)}).strict()).max(100).default([]),
  moments: z.array(z.object({id,nodeId:id.optional(),pointId:id.optional(),value,side:z.enum(['left','center','right']).default('right')}).strict().refine(m=>(m.nodeId!==undefined)!==(m.pointId!==undefined),'必须且只能连接一个作用点或节点')).max(100).default([]),
}).strict();
export type BeamModel = z.infer<typeof modelSchema>;
export type BeamNode = BeamModel['nodes'][number];
export type Member = BeamModel['members'][number];
export type SupportKind = BeamModel['supports'][number]['kind'];
export type Collection = 'nodes' | 'members' | 'supports' | 'pointLoads' | 'distributedLoads' | 'moments' | 'actionPoints';
export type Selection = { type: Collection; id: string } | null;
export type Tool = 'select' | 'node' | 'member' | SupportKind | 'point' | 'udl' | 'moment' | 'actionPoint';
export type Sample = { x: number; shear: number; moment: number; displacement: number; memberId?: string; axial?: number; ux?: number; uy?: number };
export type Segment = { memberId: string; x0: number; x1: number; V0: number; M0: number; q: number; EI: number; dofs: number[]; s0?:number; s1?:number; N0?:number; qx?:number; EA?:number; axialDofs?:number[]; c?:number; s?:number };
export type Solution = {
  axis?: 'global-x' | 'member-s';
  reactions: { supportId: string; nodeId: string; x: number; y?:number; horizontal?:number; vertical: number; moment: number }[];
  samples: Sample[]; segments: Segment[];
  extrema: { moment: Sample; shear: Sample; displacement: Sample };
  equilibrium: { force: number; horizontal?:number; moment: number };
  diagnostics: { meshNodes: number; elements: number; scaledCondition: number };
  calculation?: {origin:number[];dofs:number;constrainedDofs:number;freeDofs:number;terms:{id:string;kind:string;x:number;y:number;fx:number;fy:number;couple:number;moment:number}[]};
  nodalDisplacements?:{nodeId:string;ux:number;uy:number;rotation:number}[];
  notes: string[];
};

export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
export const fmt = (n: number, digits = 3) => (Math.abs(n) < 0.5 * 10 ** -digits ? 0 : n).toLocaleString('zh-CN', { maximumFractionDigits: digits });
export const snap = (n: number) => Math.round(n * 4) / 4;

export type ExampleKind = 'point' | 'udl' | 'cantilever' | 'vertical' | 'inclined' | 'frame';
export function example(which: ExampleKind): BeamModel {
  if(['vertical','inclined','frame'].includes(which)){
    const m:BeamModel={schemaVersion:1,name:which==='vertical'?'竖向悬臂柱 · 水平端力':which==='inclined'?'斜悬臂 · 竖向端力':'L 形刚架 · 梁端竖向荷载',nodes:[{id:'N1',x:0,y:0},{id:'N2',x:which==='inclined'?3:0,y:3}],members:[{id:'B1',start:'N1',end:'N2',E:210,I:8000,A:100}],supports:[{id:'S1',nodeId:'N1',kind:'fixed'}],pointLoads:[{id:'P1',memberId:'B1',at:which==='inclined'?Math.sqrt(18):3,value:10,direction:which==='vertical'?'x':'y'}],distributedLoads:[],moments:[],actionPoints:[]};
    if(which==='frame'){m.nodes.push({id:'N3',x:4,y:3});m.members.push({id:'B2',start:'N2',end:'N3',E:210,I:8000,A:100});m.pointLoads=[{id:'P1',memberId:'B2',at:4,value:10,direction:'y'}];}
    return m;
  }
  const cantilever = which === 'cantilever';
  return {
    schemaVersion: 1,
    name: which === 'point' ? '简支梁 · 跨中集中力' : which === 'udl' ? '简支梁 · 全跨均布荷载' : '悬臂梁 · 端部集中力',
    nodes: [{ id: 'N1', x: 0, y: 0 }, { id: 'N2', x: cantilever ? 3 : 6, y: 0 }],
    members: [{ id: 'B1', start: 'N1', end: 'N2', E: 210, I: 8000 }],
    supports: cantilever ? [{ id: 'S1', nodeId: 'N1', kind: 'fixed' }] : [{ id: 'S1', nodeId: 'N1', kind: 'pin' }, { id: 'S2', nodeId: 'N2', kind: 'roller' }],
    pointLoads: which === 'udl' ? [] : [{ id: 'P1', memberId: 'B1', at: 3, value: 10 }],
    distributedLoads: which === 'udl' ? [{ id: 'Q1', memberId: 'B1', value: 2 }] : [],
    moments: [], actionPoints: [],
  };
}

export function resolvePointLoad(model:BeamModel,load:BeamModel['pointLoads'][number]){
  const point=model.actionPoints.find(p=>p.id===load.pointId);
  return {...load,memberId:point?.memberId??load.memberId??'',at:point?.at??load.at??0};
}

export function validateModel(model: BeamModel): string[] {
  const parsed = modelSchema.safeParse(model);
  if (!parsed.success) return parsed.error.issues.map(e => `${e.path.join('.')}：参数格式或范围不合法`);
  model=parsed.data;
  const errors: string[] = [];
  const all = [...model.nodes, ...model.members, ...model.supports, ...model.pointLoads, ...model.distributedLoads, ...model.moments, ...model.actionPoints];
  if (new Set(all.map(x => x.id)).size !== all.length) errors.push('所有对象 ID 必须唯一。');
  const nodes = new Map(model.nodes.map(n => [n.id, n]));
  const members = new Map(model.members.map(m => [m.id, m]));
  if (nodes.size < 2 || !model.members.length) errors.push('请放置至少两个节点，并用杆件连接。');
  if(model.nodes.some((n,i)=>model.nodes.slice(i+1).some(o=>distance(n,o)<1e-4)))errors.push('节点重合或间距过小，请调整坐标。');
  if (model.members.some(m => !nodes.has(m.start) || !nodes.has(m.end))) errors.push('杆件引用了不存在的节点。');
  const graph=new Map(model.nodes.map(n=>[n.id,[] as string[]]));
  for(const m of model.members){const a=nodes.get(m.start),b=nodes.get(m.end);if(!a||!b)continue;const error=connectionError(model,a,b,m.id);if(error)errors.push(error);graph.get(a.id)!.push(b.id);graph.get(b.id)!.push(a.id);}
  if(model.nodes.length){const seen=new Set<string>(),stack=[model.nodes[0].id];while(stack.length){const id=stack.pop()!;if(seen.has(id))continue;seen.add(id);stack.push(...graph.get(id)??[]);}if(seen.size!==nodes.size)errors.push('结构存在未连接的节点或独立部分，请用杆件连接成一个整体。');}
  if (model.supports.some(s => !nodes.has(s.nodeId))) errors.push('支座没有连接有效节点。');
  const points=new Set(model.actionPoints.map(p=>p.id));
  if (model.moments.some(m => m.nodeId!==undefined?!nodes.has(m.nodeId):!points.has(m.pointId!))) errors.push('集中弯矩没有连接有效作用点或节点。');
  const supported = new Set(model.supports.filter(s => nodes.has(s.nodeId)).map(s => s.nodeId));
  if (supported.size !== model.supports.length) errors.push('同一节点只能放置一个支座。');
  if (!model.supports.some(s => s.kind === 'fixed' && nodes.has(s.nodeId)) && (supported.size < 2 || !model.supports.some(s=>s.kind==='pin'))) errors.push('约束不足：需要固定支座，或铰支座配合其他支座；滚动支座只约束全局 Y。');
  if(model.pointLoads.some(p=>p.pointId!==undefined&&!points.has(p.pointId)))errors.push('集中力没有连接有效作用点。');
  const forces=model.pointLoads.map(p=>resolvePointLoad(model,p));
  for (const p of [...forces, ...model.distributedLoads, ...model.actionPoints]) if (!members.has(p.memberId)) errors.push('荷载没有连接有效杆件。');
  for (const p of [...forces, ...model.actionPoints]) {
    const m = members.get(p.memberId);
    if (m && nodes.has(m.start) && nodes.has(m.end) && p.at > distance(nodes.get(m.end)!,nodes.get(m.start)!) + 1e-8) errors.push(`作用位置 ${p.id} 超出杆件长度。`);
  }
  for (const q of model.distributedLoads) {
    const m=members.get(q.memberId);
    if(m&&nodes.has(m.start)&&nodes.has(m.end)){
      const length=distance(nodes.get(m.start)!,nodes.get(m.end)!),end=q.end??length;
      if(end>length+1e-8||end-(q.start??0)<1e-6)errors.push(`均布荷载 ${q.id} 的区间须满足 0 ≤ 起点 < 终点 ≤ 杆长 ${fmt(length)} m。`);
    }
  }
  return [...new Set(errors)];
}

export function parseModel(text: string): BeamModel {
  const parsed = modelSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('JSON 格式不符合力构 Lab v1 模型规范。请检查字段、单位和参数范围。');
  // Incomplete geometry is allowed for saved drafts; dangling references are not.
  const model = parsed.data;
  const ids = [...model.nodes, ...model.members, ...model.supports, ...model.pointLoads, ...model.distributedLoads, ...model.moments, ...model.actionPoints].map(o => o.id);
  const nodes = new Set(model.nodes.map(n => n.id));
  const members = new Set(model.members.map(m => m.id));
  if (new Set(ids).size !== ids.length || model.members.some(m => !nodes.has(m.start) || !nodes.has(m.end)) || model.supports.some(s => !nodes.has(s.nodeId)) || model.moments.some(m=>m.nodeId!==undefined?!nodes.has(m.nodeId):!model.actionPoints.some(p=>p.id===m.pointId)) || model.pointLoads.some(p=>p.pointId!==undefined?!model.actionPoints.some(a=>a.id===p.pointId):!members.has(p.memberId!)) || [...model.distributedLoads, ...model.actionPoints].some(l => !members.has(l.memberId))) throw new Error('模型包含重复 ID 或无效对象引用，未载入。');
  return model;
}

export function removeSelection(model: BeamModel, selection: Selection): BeamModel {
  if (!selection) return model;
  const copy = structuredClone(model);
  const deletedMembers = new Set(selection.type === 'members' ? [selection.id] : selection.type === 'nodes' ? copy.members.filter(m => m.start === selection.id || m.end === selection.id).map(m => m.id) : []);
  copy.nodes = copy.nodes.filter(n => !(selection.type === 'nodes' && n.id === selection.id));
  copy.members = copy.members.filter(m => !deletedMembers.has(m.id));
  copy.supports = copy.supports.filter(s => !(selection.type === 'supports' && s.id === selection.id) && !(selection.type === 'nodes' && s.nodeId === selection.id));
  copy.pointLoads = copy.pointLoads.filter(p => !(selection.type === 'pointLoads' && p.id === selection.id) && !deletedMembers.has(p.memberId??''));
  copy.distributedLoads = copy.distributedLoads.filter(p => !(selection.type === 'distributedLoads' && p.id === selection.id) && !deletedMembers.has(p.memberId??''));
  const deletedPoints=new Set(copy.actionPoints.filter(p=>deletedMembers.has(p.memberId)||(selection.type==='actionPoints'&&p.id===selection.id)).map(p=>p.id));
  copy.actionPoints=copy.actionPoints.filter(p=>!deletedPoints.has(p.id));
  copy.pointLoads=copy.pointLoads.filter(p=>!deletedPoints.has(p.pointId??''));
  copy.moments = copy.moments.filter(m => !(selection.type==='moments' && m.id===selection.id) && !(selection.type==='nodes' && m.nodeId===selection.id) && !deletedPoints.has(m.pointId??''));
  return copy;
}

export type History = { past: BeamModel[]; present: BeamModel; future: BeamModel[] };
export function historyReducer(state: History, action: { type: 'set'; model: BeamModel } | { type: 'undo' | 'redo' }): History {
  if (action.type === 'set') return JSON.stringify(action.model) === JSON.stringify(state.present) ? state : { past: [...state.past, state.present].slice(-100), present: action.model, future: [] };
  if (action.type === 'undo' && state.past.length) return { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future] };
  if (action.type === 'redo' && state.future.length) return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  return state;
}

export function evaluate(segment: Segment, x: number): Sample {
  const L = segment.x1 - segment.x0, s = Math.max(0, Math.min(L, x - segment.x0)), t = s / L;
  const N = [1 - 3*t*t + 2*t*t*t, L*(t - 2*t*t + t*t*t), 3*t*t - 2*t*t*t, L*(-t*t + t*t*t)];
  const displacement=N.reduce((sum, n, i) => sum + n*segment.dofs[i], 0) + segment.q*s*s*(s-L)**2/(24*segment.EI);
  const axialDofs=segment.axialDofs??[0,0],qx=segment.qx??0;
  const u=(1-t)*axialDofs[0]+t*axialDofs[1]+qx*s*(L-s)/(2*(segment.EA??1));
  const c=segment.c??1,sine=segment.s??0;
  return { x, memberId:segment.memberId, shear: segment.V0 + segment.q*s, moment: segment.M0 + segment.V0*s + segment.q*s*s/2,
    displacement, axial:(segment.N0??0)-qx*s,ux:c*u-sine*displacement,uy:sine*u+c*displacement };
}

