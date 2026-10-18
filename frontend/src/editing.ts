import {connectionError,distance} from './geometry';
import {pointOnMember} from './momentGeometry';
import {modelSchema,resolvePointLoad,uid,type BeamModel,type Selection} from './model';

export type Item=NonNullable<Selection>;
const key=(s:Item)=>`${s.type}:${s.id}`;
export function toggleSelection(items:Item[],item:Item){return items.some(s=>key(s)===key(item))?items.filter(s=>key(s)!==key(item)):[...items,item];}
function closure(model:BeamModel,items:Item[]){
 const keys=new Set(items.map(key)),nodes=new Set(items.filter(s=>s.type==='nodes').map(s=>s.id));
 const has=(type:Item['type'],id:string)=>keys.has(key({type,id}));
 for(const m of model.members)if(has('members',m.id)){nodes.add(m.start);nodes.add(m.end);}
 const members=new Set(model.members.filter(m=>has('members',m.id)||(nodes.has(m.start)&&nodes.has(m.end))).map(m=>m.id));
 const points=new Set(model.actionPoints.filter(p=>has('actionPoints',p.id)||members.has(p.memberId)).map(p=>p.id));
 return {nodes,members,points,has};
}
function checkGeometry(model:BeamModel){
 if(!modelSchema.safeParse(model).success)throw new Error('编辑后的数量、坐标或参数超出模型范围。');
 if(new Set(model.supports.map(s=>s.nodeId)).size!==model.supports.length)throw new Error('同一节点只能设置一个支座；复制杆件时可一起复制其节点与支座。');
 for(const n of model.nodes)if(model.nodes.some(o=>o.id!==n.id&&distance(o,n)<1e-4))throw new Error('编辑后节点重合，请调整偏移。');
 for(const m of model.members){const error=connectionError(model,model.nodes.find(n=>n.id===m.start)!,model.nodes.find(n=>n.id===m.end)!,m.id);if(error)throw new Error(error);}
 return model;
}
export function moveItems(model:BeamModel,items:Item[],dx:number,dy:number):BeamModel{
 if(!Number.isFinite(dx)||!Number.isFinite(dy))throw new Error('请输入有效移动距离。');
 const {nodes,has}=closure(model,items),copy=structuredClone(model);
 if(!nodes.size&&!items.some(s=>s.type==='actionPoints'||(s.type==='pointLoads'&&!model.pointLoads.find(p=>p.id===s.id)?.pointId)))throw new Error('请同时选择要移动的节点、杆件或作用点；附着对象会随目标移动。');
 copy.nodes=copy.nodes.map(n=>nodes.has(n.id)?{...n,x:n.x+dx,y:n.y+dy}:n);
 const fullyMoved=(id:string)=>{const m=model.members.find(m=>m.id===id);return !!m&&nodes.has(m.start)&&nodes.has(m.end);};
 function shiftedAt(memberId:string,at:number){
  const m=model.members.find(m=>m.id===memberId)!,a=model.nodes.find(n=>n.id===m.start)!,b=model.nodes.find(n=>n.id===m.end)!,L=distance(a,b);
  const result=at+(dx*(b.x-a.x)+dy*(b.y-a.y))/L;
  if(result<0||result>L)throw new Error('移动后的作用位置超出杆件，请调整偏移。');return result;
 }
 copy.actionPoints=copy.actionPoints.map(p=>has('actionPoints',p.id)&&!fullyMoved(p.memberId)?{...p,at:shiftedAt(p.memberId,p.at)}:p);
 copy.pointLoads=copy.pointLoads.map(p=>has('pointLoads',p.id)&&!p.pointId&&!fullyMoved(p.memberId!)?{...p,at:shiftedAt(p.memberId!,p.at!)}:p);
 return checkGeometry(copy);
}
export function copyItems(model:BeamModel,items:Item[],dx:number,dy:number){
 const {nodes,members,points,has}=closure(model,items),copy=structuredClone(model),ids=new Map<string,string>(),selected:Item[]=[];
 const add=(type:Item['type'],objects:{id:string}[])=>{for(const object of objects){const id=uid(type==='nodes'?'N':type==='members'?'B':'C');ids.set(object.id,id);selected.push({type,id});}};
 const take={
  nodes:model.nodes.filter(n=>nodes.has(n.id)),members:model.members.filter(m=>members.has(m.id)),
  supports:model.supports.filter(s=>has('supports',s.id)||nodes.has(s.nodeId)),
  actionPoints:model.actionPoints.filter(p=>points.has(p.id)),
  pointLoads:model.pointLoads.filter(p=>has('pointLoads',p.id)||members.has(p.memberId??'')||points.has(p.pointId??'')),
  distributedLoads:model.distributedLoads.filter(p=>has('distributedLoads',p.id)||members.has(p.memberId)),
  moments:model.moments.filter(m=>has('moments',m.id)||nodes.has(m.nodeId??'')||points.has(m.pointId??'')),
 };
 for(const [type,objects] of Object.entries(take))add(type as Item['type'],objects);
 const ref=(id:string)=>ids.get(id)??id;
 copy.nodes.push(...take.nodes.map(n=>({...n,id:ref(n.id),x:n.x+dx,y:n.y+dy})));
 copy.members.push(...take.members.map(m=>({...m,id:ref(m.id),start:ref(m.start),end:ref(m.end)})));
 copy.supports.push(...take.supports.map(s=>({...s,id:ref(s.id),nodeId:ref(s.nodeId)})));
 copy.actionPoints.push(...take.actionPoints.map(p=>({...p,id:ref(p.id),memberId:ref(p.memberId)})));
 copy.pointLoads.push(...take.pointLoads.map(p=>({...p,id:ref(p.id),...(p.pointId?{pointId:ref(p.pointId)}:{memberId:ref(p.memberId!)})})));
 copy.distributedLoads.push(...take.distributedLoads.map(p=>({...p,id:ref(p.id),memberId:ref(p.memberId)})));
 copy.moments.push(...take.moments.map(m=>({...m,id:ref(m.id),...(m.pointId?{pointId:ref(m.pointId)}:{nodeId:ref(m.nodeId!)})})));
 return {model:checkGeometry(copy),selection:selected};
}
export function boxItems(model:BeamModel,a:{x:number;y:number},b:{x:number;y:number}):Item[]{
 const inside=(p:{x:number;y:number}|null)=>p&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y);
 const nodes=new Set(model.nodes.filter(inside).map(n=>n.id));
 return [
  ...model.nodes.filter(n=>nodes.has(n.id)).map(n=>({type:'nodes' as const,id:n.id})),
  ...model.members.filter(m=>nodes.has(m.start)&&nodes.has(m.end)).map(m=>({type:'members' as const,id:m.id})),
  ...model.supports.filter(s=>nodes.has(s.nodeId)).map(s=>({type:'supports' as const,id:s.id})),
  ...model.actionPoints.filter(p=>inside(pointOnMember(model,p))).map(p=>({type:'actionPoints' as const,id:p.id})),
  ...model.pointLoads.filter(load=>{const p=resolvePointLoad(model,load);return inside(pointOnMember(model,{id:p.id,memberId:p.memberId,at:p.at}));}).map(p=>({type:'pointLoads' as const,id:p.id})),
  ...model.moments.filter(m=>m.pointId?model.actionPoints.some(p=>p.id===m.pointId&&inside(pointOnMember(model,p))):nodes.has(m.nodeId!)).map(m=>({type:'moments' as const,id:m.id})),
  ...model.distributedLoads.filter(q=>{const m=model.members.find(m=>m.id===q.memberId)!;const L=distance(model.nodes.find(n=>n.id===m.start)!,model.nodes.find(n=>n.id===m.end)!);return inside(pointOnMember(model,{id:q.id,memberId:m.id,at:((q.start??0)+(q.end??L))/2}));}).map(q=>({type:'distributedLoads' as const,id:q.id})),
 ];
}
export function createPolarMember(model:BeamModel,startId:string,length:number,angle:number):BeamModel{
 const start=model.nodes.find(n=>n.id===startId);
 if(!start||!Number.isFinite(length)||length<1e-4||!Number.isFinite(angle))throw new Error('请选择起点，输入有效长度和角度。');
 const x=start.x+length*Math.cos(angle*Math.PI/180),y=start.y+length*Math.sin(angle*Math.PI/180);
 const end=model.nodes.find(n=>distance(n,{x,y})<1e-6)??{id:uid('N'),x,y};
 const next={...model,nodes:model.nodes.some(n=>n.id===end.id)?model.nodes:[...model.nodes,end],members:[...model.members,{id:uid('B'),start:startId,end:end.id,E:210,I:8000,A:100}]};
 return checkGeometry(next);
}
