import {test,expect,type Page} from '@playwright/test';
import {example,type BeamModel} from '../src/model';

const state=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present);
async function load(page:Page,model:BeamModel){await page.getByLabel('载入 JSON 文件').setInputFiles({name:'upgrade.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});await expect(page.getByLabel('模型名称')).toHaveValue(model.name);}
async function coordinates(page:Page){const box=(await page.getByTestId('beam-canvas').locator('.konvajs-content').boundingBox())!;const scale=Math.max(25,Math.min(95,(box.width-140)/8));return {box,at:(x:number,y:number)=>({x:box.x+box.width/2+(x-3)*scale,y:box.y+225-y*scale})};}
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByTestId('max-moment')).toContainText('15');});

test('horizontal and vertical forces and a moment share one point and follow its exact edited location',async({page})=>{
 const model=example('point');model.pointLoads=[];model.actionPoints=[{id:'A1',memberId:'B1',at:3}];model.moments=[{id:'M1',pointId:'A1',value:6,side:'right'}];await load(page,model);
 for(const direction of ['x','y']){await page.getByRole('button',{name:'添加集中力',exact:true}).click();const p=(await coordinates(page)).at(3,0);await page.mouse.click(p.x,p.y);await expect(page.getByLabel('集中力作用点')).toHaveValue('A1');await page.getByLabel('荷载方向').selectOption(direction);}
 await expect(page.getByTestId('max-moment')).toContainText('18');await expect(page.locator('.reactions')).toContainText('10 kN · X');
 await page.getByRole('button',{name:/编辑连接的作用点/}).click();await page.getByLabel('作用点距杆件起点').fill('2');await page.getByLabel('作用点距杆件起点').press('Enter');
 await expect(page.getByTestId('max-moment')).toContainText('15.333');const saved=await state(page);expect(saved.pointLoads.map((p:{pointId:string})=>p.pointId)).toEqual(['A1','A1']);expect(saved.nodes).toHaveLength(2);
 await page.getByRole('button',{name:'删除作用点',exact:true}).click();expect((await state(page)).pointLoads).toEqual([]);expect((await state(page)).moments).toEqual([]);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByTestId('max-moment')).toContainText('15.333');
 await page.reload();await expect(page.getByTestId('max-moment')).toContainText('15.333');expect(await state(page)).toEqual(saved);
});

test('marquee selects a model, whole move and copy remap attached objects and undo as one operation',async({page})=>{
 const model=example('point');model.actionPoints=[{id:'A1',memberId:'B1',at:3}];model.pointLoads=[{id:'P1',pointId:'A1',value:10}];model.moments=[{id:'M1',pointId:'A1',value:6,side:'right'}];await load(page,model);
 const {at}=await coordinates(page),a=at(-.5,.8),b=at(6.5,-.7);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:15});await page.mouse.up();
 await expect(page.getByTestId('selection-count')).toHaveText('已选 8 项');
 await page.getByLabel('整体移动 X').fill('0');await page.getByLabel('整体移动 Y').fill('1');await page.getByRole('button',{name:'整体移动',exact:true}).click();
 let current=await state(page);expect(current.nodes.map((n:{y:number})=>n.y)).toEqual([1,1]);expect(current.actionPoints[0].at).toBe(3);await expect(page.getByTestId('max-moment')).toContainText('18');
 await page.getByRole('button',{name:'复制所选',exact:true}).click();current=await state(page);expect(current.nodes).toHaveLength(4);expect(current.members).toHaveLength(2);expect(current.pointLoads[1].pointId).toBe(current.actionPoints[1].id);expect(current.moments[1].pointId).toBe(current.actionPoints[1].id);expect(current.members[1].start).toBe(current.nodes[2].id);
 await page.getByRole('button',{name:'撤销',exact:true}).click();expect((await state(page)).nodes).toHaveLength(2);await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await state(page)).toEqual(model);
});

test('shift click selects both nodes and dragging one moves both without changing member length',async({page})=>{
 const {at}=await coordinates(page),a=at(0,0),b=at(6,0),end=at(6.5,.5);await page.mouse.click(a.x,a.y);await page.keyboard.down('Shift');await page.mouse.click(b.x,b.y);await page.keyboard.up('Shift');
 await expect(page.getByTestId('selection-count')).toHaveText('已选 2 项');await page.mouse.move(b.x,b.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:15});await page.mouse.up();
 expect((await state(page)).nodes.map((n:{x:number;y:number})=>[n.x,n.y])).toEqual([[.5,.5],[6.5,.5]]);await expect(page.getByTestId('max-moment')).toContainText('15');
});

test('creates an exact member using length and angle and rejects a duplicate without changing the model',async({page})=>{
 const model=example('point');model.nodes=[{id:'N1',x:0,y:0}];model.members=[];model.supports=[];model.pointLoads=[];await load(page,model);
 await page.getByRole('button',{name:'长度 / 角度建杆',exact:true}).click();await page.getByLabel('精确杆长').fill('2.4');await page.getByLabel('精确杆件角度').fill('30');await page.getByRole('button',{name:'创建杆件',exact:true}).click();
 const saved=await state(page);expect(saved.nodes[1].x).toBeCloseTo(2.4*Math.cos(Math.PI/6));expect(saved.nodes[1].y).toBeCloseTo(1.2);expect(saved.members).toHaveLength(1);
 await page.getByRole('button',{name:'创建杆件',exact:true}).click();await expect(page.locator('.status-bar')).toContainText('已经有杆件');expect(await state(page)).toEqual(saved);
});

test('deformation plot uses actual displacement, responds to amplification and toggles original overlay',async({page})=>{
 await page.getByLabel('选择验证算例').selectOption('cantilever');await expect(page.getByTestId('max-displacement')).toContainText('5.357');await page.getByRole('button',{name:'变形图',exact:true}).click();await page.getByLabel('变形放大倍数').fill('100');
 const path=page.getByTestId('deformed-member').first(),d=await path.getAttribute('d');expect(d).not.toBeNull();
 await page.locator('.deformation-panel circle').last().hover();await expect(page.getByTestId('deformation-readout')).toContainText('uy = -5.357 mm');
 await page.getByLabel('变形放大倍数').fill('0');expect(await path.getAttribute('d')).not.toBe(d);const points=(await path.getAttribute('d'))!.match(/[ML][^ML]+/g)!.map(pair=>Number(pair.slice(1).split(',')[1]));expect(Math.max(...points)-Math.min(...points)).toBeLessThan(1e-6);
 await page.getByLabel('叠加原始结构').uncheck();await expect(page.getByTestId('undeformed-member')).toHaveCount(0);
 await page.getByLabel('选择验证算例').selectOption('frame');await expect(page.getByTestId('max-moment')).toContainText('40');await page.getByRole('button',{name:'变形图',exact:true}).click();await expect(page.getByTestId('deformed-member')).toHaveCount(2);
});

test('clicking a section explains both shear values and clicking support highlights its equilibrium term',async({page})=>{
 const chart=page.getByRole('img',{name:'弯矩图，可悬停查看数值'});await chart.scrollIntoViewIfNeeded();const box=(await chart.boundingBox())!;await page.mouse.click(box.x+box.width*402.5/800,box.y+box.height*.5);
 await expect(page.locator('.calculation-explanation')).toHaveAttribute('open','');await expect(page.getByTestId('section-explanation')).toContainText('15 kN·m');await expect(page.getByTestId('section-explanation')).toContainText('-5 kN');await expect(page.getByTestId('section-explanation')).toContainText('5 kN');
 await expect(page.getByTestId('equilibrium-equations')).toContainText('ΣFy');await expect(page.locator('.calculation-table')).toContainText('集中力');await page.locator('.reactions button').first().click();await expect(page.locator('.selected-reaction')).toContainText('S1');
 await page.getByLabel('解释截面位置').fill('1.5');await expect(page.getByTestId('section-explanation')).toContainText('7.5 kN·m');await page.getByLabel('解释截面位置').fill('9');await expect(page.locator('.calculation-body')).toContainText('请输入 0–6 m');
});
