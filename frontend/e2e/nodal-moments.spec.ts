import { test, expect, type Page } from '@playwright/test';
import { example, type BeamModel } from '../src/model';

const modelState=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present);
async function load(page:Page,model:BeamModel){
  await page.getByLabel('载入 JSON 文件').setInputFiles({name:'moment.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
  await expect(page.getByLabel('模型名称')).toHaveValue(model.name);
}
async function coordinates(page:Page){
  const box=(await page.getByTestId('beam-canvas').locator('.konvajs-content').boundingBox())!;
  const scale=Math.max(25,Math.min(95,(box.width-140)/8));
  return {box,at:(x:number,y:number)=>({x:box.x+box.width/2+(x-3)*scale,y:box.y+225-y*scale})};
}
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByTestId('max-moment')).toContainText('15');});

test('places and edits moments on both sides, preserves JSON and undo, rejects non-node targets',async({page})=>{
  const model=example('cantilever');model.name='悬臂端部弯矩';model.pointLoads=[];
  await load(page,model);await expect(page.getByTestId('max-moment')).toContainText('0');
  const {at,box}=await coordinates(page),tip=at(3,0);
  for(const side of ['left','right']){
    await page.getByRole('button',{name:'添加集中弯矩',exact:true}).click();
    if(side==='left'){
      const dataTransfer=await page.evaluateHandle(()=>{const d=new DataTransfer();d.setData('application/ligou-tool','moment');return d;});
      await page.getByTestId('beam-canvas').dispatchEvent('drop',{dataTransfer,clientX:tip.x-42,clientY:tip.y});
    }else await page.mouse.click(tip.x+42,tip.y);
    await expect(page.getByLabel('弯矩显示位置')).toHaveValue(side);
  }
  await expect(page.getByTestId('max-moment')).toContainText('20');
  expect((await modelState(page)).moments.map((m:{side:string})=>m.side)).toEqual(['left','right']);
  await page.getByLabel('集中弯矩大小').fill('-10');await page.getByLabel('集中弯矩大小').press('Enter');
  await expect(page.getByTestId('max-moment')).toContainText('0');
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByTestId('max-moment')).toContainText('20');
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.getByTestId('max-moment')).toContainText('0');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'保存 JSON'}).click();
  const download=await downloadPromise,before=await modelState(page);
  await page.getByRole('button',{name:'清空模型'}).click();expect((await modelState(page)).moments).toEqual([]);
  await page.getByLabel('载入 JSON 文件').setInputFiles((await download.path())!);expect(await modelState(page)).toEqual(before);
  await page.reload();await expect(page.getByTestId('max-moment')).toContainText('0');expect(await modelState(page)).toEqual(before);
  await page.getByRole('button',{name:'添加集中弯矩',exact:true}).click();await page.mouse.click(box.x+box.width*.9,box.y+75);
  await expect(page.locator('.status-bar')).toContainText('集中弯矩只能吸附到作用点或节点');expect((await modelState(page)).moments).toHaveLength(2);
});

test('drags a moment to another node side, deletes independently and cascades with a deleted node',async({page})=>{
  const model=example('cantilever');model.pointLoads=[];model.moments=[{id:'M1',nodeId:'N2',value:10,side:'right'}];
  await load(page,model);await expect(page.getByTestId('max-moment')).toContainText('10');
  const {at}=await coordinates(page),tip=at(3,0),base=at(0,0);
  await page.mouse.move(tip.x+42+12,tip.y+10);await page.mouse.down();
  await page.mouse.move(base.x-42+12,base.y+10,{steps:20});await page.mouse.up();
  await expect(page.getByLabel('弯矩显示位置')).toHaveValue('left');
  expect((await modelState(page)).moments[0]).toEqual({id:'M1',nodeId:'N1',value:10,side:'left'});
  await expect(page.getByTestId('max-moment')).toContainText('0');await expect(page.locator('.reactions')).toContainText('-10');
  await page.getByRole('button',{name:'删除集中弯矩',exact:true}).click();expect((await modelState(page)).moments).toEqual([]);
  await expect(page.locator('.model-count')).toContainText('2 节点 / 1 杆件');
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await page.locator('.object-drawer summary').click();await page.locator('.object-list button').filter({hasText:'节点 1'}).click();
  await page.getByRole('button',{name:'删除节点',exact:true}).click();expect((await modelState(page)).moments).toEqual([]);
  await page.getByRole('button',{name:'撤销',exact:true}).click();expect((await modelState(page)).moments).toHaveLength(1);
});

test('midspan nodal moment displays correct reactions and the two sides of the moment jump',async({page})=>{
  const model=example('point');model.name='简支梁中点弯矩';model.pointLoads=[];
  model.nodes.push({id:'N3',x:3,y:0});model.members[0].end='N3';
  model.members.push({id:'B2',start:'N3',end:'N2',E:210,I:8000});model.moments=[{id:'M1',nodeId:'N3',value:10,side:'left'}];
  await load(page,model);await expect(page.getByTestId('max-moment')).toContainText('5');
  await expect(page.locator('.reactions')).toContainText('1.667');await expect(page.locator('.reactions')).toContainText('-1.667');
  await page.getByRole('button',{name:'截面曲线',exact:true}).click();
  const chart=page.getByRole('img',{name:'弯矩图，可悬停查看数值'});
  await chart.scrollIntoViewIfNeeded();
  const box=(await chart.boundingBox())!;
  await page.mouse.move(box.x+box.width*402.5/800,box.y+box.height*.5);
  await expect(page.getByTestId('chart-readout')).toContainText('M⁻ = 5');await expect(page.getByTestId('chart-readout')).toContainText('M⁺ = -5');
});
