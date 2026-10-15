import {test,expect,type Page} from '@playwright/test';
import {example,type BeamModel} from '../src/model';

const state=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present);
async function load(page:Page,model:BeamModel){
  await page.getByLabel('载入 JSON 文件').setInputFiles({name:'action-points.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
  await expect(page.getByLabel('模型名称')).toHaveValue(model.name);
}
async function coordinates(page:Page){
  const box=(await page.getByTestId('beam-canvas').locator('.konvajs-content').boundingBox())!;
  const scale=Math.max(25,Math.min(95,(box.width-140)/8));
  return {box,at:(x:number,y:number)=>({x:box.x+box.width/2+(x-3)*scale,y:box.y+225-y*scale})};
}
async function selectObject(page:Page,label:string){
  const drawer=page.locator('.object-drawer details');
  if(!await drawer.evaluate(e=>e.hasAttribute('open')))await drawer.locator('summary').click();
  await page.locator('.object-list button').filter({hasText:label}).click();
}
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByTestId('max-moment')).toContainText('15');});

test('creates a separate action point and snaps moments to its center and both sides',async({page})=>{
  const model=example('point');model.name='一点三位置';model.pointLoads=[];await load(page,model);
  await page.getByRole('button',{name:'添加作用点',exact:true}).click();
  const {at}=await coordinates(page),mid=at(3,0);
  const dataTransfer=await page.evaluateHandle(()=>{const d=new DataTransfer();d.setData('application/ligou-tool','actionPoint');return d;});
  await page.getByTestId('beam-canvas').dispatchEvent('drop',{dataTransfer,clientX:mid.x,clientY:mid.y});
  await expect(page.getByLabel('作用点距杆件起点')).toHaveValue('3');
  const pointId=(await state(page)).actionPoints[0].id;
  for(const [side,offset] of [['center',0],['left',-42],['right',42]] as const){
    await page.getByRole('button',{name:'添加集中弯矩',exact:true}).click();
    const current=await coordinates(page),p=current.at(3,0);await page.mouse.click(p.x+offset,p.y);
    await expect(page.getByLabel('弯矩显示位置')).toHaveValue(side);
  }
  const saved=await state(page);expect(saved.nodes).toHaveLength(2);expect(saved.members).toHaveLength(1);
  expect(saved.actionPoints).toHaveLength(1);expect(saved.moments.map((m:{pointId:string})=>m.pointId)).toEqual([pointId,pointId,pointId]);
  await expect(page.getByTestId('max-moment')).toContainText('15');
  await page.getByLabel('集中弯矩大小').fill('-20');await page.getByLabel('集中弯矩大小').press('Enter');
  await expect(page.getByTestId('max-moment')).toContainText('0');
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'保存 JSON'}).click();const download=await downloadEvent;
  const before=await state(page);await page.getByRole('button',{name:'清空模型'}).click();
  expect((await state(page)).actionPoints).toEqual([]);expect((await state(page)).moments).toEqual([]);
  await page.getByLabel('载入 JSON 文件').setInputFiles((await download.path())!);expect(await state(page)).toEqual(before);
  await page.reload();await expect(page.getByTestId('max-moment')).toContainText('0');expect(await state(page)).toEqual(before);
});

test('edits and moves an interior point with its moment, deletes and restores it without splitting the beam',async({page})=>{
  const model=example('point');model.pointLoads=[];model.actionPoints=[{id:'A1',memberId:'B1',at:3}];model.moments=[{id:'M1',pointId:'A1',value:10,side:'center'}];
  await load(page,model);await expect(page.getByTestId('max-moment')).toContainText('5');
  await selectObject(page,'作用点 1');await page.getByLabel('作用点距杆件起点').fill('1.73');await page.getByLabel('作用点距杆件起点').press('Enter');
  await expect(page.getByTestId('max-moment')).toContainText('7.117');
  await page.getByRole('button',{name:'截面曲线',exact:true}).click();
  const chart=page.getByRole('img',{name:'弯矩图，可悬停查看数值'});await chart.scrollIntoViewIfNeeded();
  const box=(await chart.boundingBox())!;await page.mouse.move(box.x+box.width*(65+675*1.73/6)/800,box.y+box.height*.5);
  await expect(page.getByTestId('chart-readout')).toContainText('M⁻ = 2.883');await expect(page.getByTestId('chart-readout')).toContainText('M⁺ = -7.117');
  await page.getByTestId('beam-canvas').scrollIntoViewIfNeeded();
  const {at}=await coordinates(page),start=at(1.73,0),end=at(4,0);
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:15});await page.mouse.up();
  await expect(page.getByLabel('作用点距杆件起点')).toHaveValue('4');await expect(page.getByTestId('max-moment')).toContainText('6.667');
  expect((await state(page)).moments[0].pointId).toBe('A1');expect((await state(page)).nodes).toHaveLength(2);
  await page.getByRole('button',{name:'删除作用点',exact:true}).click();expect((await state(page)).moments).toEqual([]);expect((await state(page)).members).toHaveLength(1);
  await page.getByRole('button',{name:'撤销',exact:true}).click();expect((await state(page)).actionPoints[0].at).toBe(4);expect((await state(page)).moments).toHaveLength(1);
  await page.getByRole('button',{name:'重做',exact:true}).click();expect((await state(page)).actionPoints).toEqual([]);
});

test('reattaches a moment to another action point and preserves all points on independent moment deletion',async({page})=>{
  const model=example('point');model.pointLoads=[];model.actionPoints=[{id:'A1',memberId:'B1',at:2},{id:'A2',memberId:'B1',at:4}];model.moments=[{id:'M1',pointId:'A1',value:10,side:'left'}];await load(page,model);
  const {at}=await coordinates(page),a=at(2,0),b=at(4,0);
  await page.mouse.move(a.x-42+12,a.y+10);await page.mouse.down();await page.mouse.move(b.x+42+12,b.y+10,{steps:20});await page.mouse.up();
  await expect(page.getByLabel('弯矩显示位置')).toHaveValue('right');expect((await state(page)).moments[0]).toEqual({id:'M1',pointId:'A2',value:10,side:'right'});
  await page.getByRole('button',{name:'删除集中弯矩',exact:true}).click();expect((await state(page)).actionPoints).toHaveLength(2);
  await page.getByRole('button',{name:'添加作用点',exact:true}).click();const {box}=await coordinates(page);await page.mouse.click(box.x+box.width*.8,box.y+70);
  await expect(page.locator('.status-bar')).toContainText('作用点需要放在杆件上');expect((await state(page)).actionPoints).toHaveLength(2);
});

test('places an action point and centered moment on a vertical member',async({page})=>{
  const model=example('vertical');model.pointLoads=[];await load(page,model);
  await page.getByRole('button',{name:'添加作用点',exact:true}).click();let {box}=await coordinates(page);await page.mouse.click(box.x+box.width/2,box.y+217);
  await expect(page.getByLabel('作用点距杆件起点')).toHaveValue('1.5');
  await page.getByRole('button',{name:'添加集中弯矩',exact:true}).click();box=(await coordinates(page)).box;await page.mouse.click(box.x+box.width/2,box.y+217);
  await expect(page.getByLabel('弯矩显示位置')).toHaveValue('center');await expect(page.getByTestId('max-moment')).toContainText('10');
  expect((await state(page)).nodes).toHaveLength(2);await expect(page.locator('.reactions')).toContainText('-10');
});
