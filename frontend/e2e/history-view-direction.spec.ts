import { test, expect, type Page } from '@playwright/test';
import { example, type BeamModel } from '../src/model';

const state = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!));
async function load(page: Page, model: BeamModel) {
  await page.getByLabel('载入 JSON 文件').setInputFiles({ name:'model.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(model)) });
  await expect(page.getByLabel('模型名称')).toHaveValue(model.name);
}
async function editForce(page: Page, value: string) {
  await page.locator('.object-drawer summary').click();
  await page.locator('.object-list button').filter({hasText:'集中力'}).first().click();
  await page.getByLabel('集中力大小').fill(value);
  await page.getByLabel('集中力大小').press('Enter');
}
test.beforeEach(async ({page}) => { await page.goto('/'); await expect(page.getByTestId('max-moment')).toContainText('15'); });

test('new archives the exact model; restore after reload keeps snapshots independent', async ({page}) => {
  await page.setViewportSize({width:1382,height:956});
  await editForce(page,'17');
  const original=(await state(page)).history.present;
  await page.getByRole('button',{name:'新建',exact:true}).click();
  await page.reload();
  await expect(page.locator('.model-count')).toContainText('0 节点');
  await page.getByRole('button',{name:'模型历史',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'模型历史'})).toBeVisible();
  await page.screenshot({path:'../docs/model-history.png',fullPage:true});
  await page.getByRole('button',{name:`恢复模型 ${original.name}`,exact:true}).click();
  expect((await state(page)).history.present).toEqual(original);
  await editForce(page,'23');
  await page.getByRole('button',{name:'模型历史',exact:true}).click();
  await page.getByRole('button',{name:`恢复模型 ${original.name}`,exact:true}).click();
  const restored=await state(page);
  expect(restored.history.present).toEqual(original);
  expect(restored.archives.some((a:{model:BeamModel})=>a.model.pointLoads[0]?.value===23)).toBe(true);
  expect(restored.archives.some((a:{model:BeamModel})=>a.model.pointLoads[0]?.value===17)).toBe(true);
});

test('undo and redo survive refresh',async({page})=>{
  await editForce(page,'20');
  await page.reload();
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await expect(page.getByTestId('max-moment')).toContainText('15');
  await page.reload();
  await page.getByRole('button',{name:'重做',exact:true}).click();
  await expect(page.getByTestId('max-moment')).toContainText('30');
});

test('invalid import and storage failure never replace current document',async({page})=>{
  const before=await state(page);
  await page.getByLabel('载入 JSON 文件').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schemaVersion":99}')});
  await expect(page.locator('.status-bar')).toContainText('载入失败');
  expect(await state(page)).toEqual(before);
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
  await page.getByRole('button',{name:'新建',exact:true}).click();
  await expect(page.locator('.status-bar')).toContainText('本次切换未执行');
  await expect(page.locator('.model-count')).toContainText('2 节点');
  expect(await state(page)).toEqual(before);
  await page.getByRole('button',{name:'清空模型'}).click();
  await expect(page.locator('.status-bar')).toContainText('本次切换未执行');
  await expect(page.locator('.model-count')).toContainText('2 节点');
  expect(await state(page)).toEqual(before);
});

test('fit-model and same-name imports frame geometry without changing the model',async({page})=>{
  const model=example('point');model.name='同名模型';model.nodes.forEach(n=>{n.x+=500;n.y+=100;});
  await load(page,model);
  await page.getByRole('button',{name:'放大视图',exact:true}).click();
  expect((await state(page)).history.present).toEqual(model);
  await page.getByRole('button',{name:'适应模型'}).click();
  let box=(await page.getByTestId('beam-canvas').boundingBox())!;
  await page.mouse.click(box.x+box.width/2,box.y+225);
  await expect(page.getByLabel('弹性模量 E')).toBeVisible();
  model.nodes.forEach(n=>{n.x-=900;n.y-=300;});
  await load(page,model);
  // Wait for the imported view to be committed; member remains at visible midpoint.
  await expect.poll(async()=> (await state(page)).history.present.nodes[0].x).toBe(-400);
  box=(await page.getByTestId('beam-canvas').boundingBox())!;
  await page.mouse.click(box.x+box.width/2,box.y+225);
  await expect(page.getByLabel('弹性模量 E')).toBeVisible();
});

test('clearing an empty canvas gives feedback and leaves history recoverable',async({page})=>{
  await page.getByRole('button',{name:'新建',exact:true}).click();
  await page.getByRole('button',{name:'放大视图',exact:true}).click();
  await page.getByRole('button',{name:'清空模型',exact:true}).click();
  await expect(page.locator('.canvas-controls')).toContainText('100%');
  await expect(page.locator('.canvas-foot')).toContainText('全部模型已清空');
  await expect(page.getByRole('button',{name:'选择 / 移动'})).toHaveClass(/active/);
  expect((await state(page)).archives).toHaveLength(1);
});

test('deleting a history snapshot persists without affecting the current model or other snapshots',async({page})=>{
  const point=example('point'),cantilever=example('cantilever');
  await page.getByLabel('选择验证算例').selectOption('cantilever');
  await expect(page.getByTestId('max-moment')).toContainText('30');
  await page.getByRole('button',{name:'模型历史',exact:true}).click();
  await page.getByRole('button',{name:'保存当前快照'}).click();
  const before=await state(page);expect(before.archives).toHaveLength(2);
  await page.getByRole('button',{name:`删除历史模型 ${point.name}`,exact:true}).click();
  await expect(page.getByRole('button',{name:`恢复模型 ${point.name}`,exact:true})).toHaveCount(0);
  expect((await state(page)).history).toEqual(before.history);
  expect((await state(page)).archives.map((a:{model:BeamModel})=>a.model.name)).toEqual([cantilever.name]);
  await page.reload();await page.getByRole('button',{name:'模型历史',exact:true}).click();
  await expect(page.getByRole('button',{name:`恢复模型 ${point.name}`,exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:`删除历史模型 ${cantilever.name}`,exact:true}).click();
  await expect(page.getByText('还没有历史快照', {exact:true})).toBeVisible();
  await page.reload();expect((await state(page)).archives).toEqual([]);expect((await state(page)).history).toEqual(before.history);
});

for (const vertical of [false,true]) test(`new loads infer ${vertical?'horizontal':'vertical'} direction and manual override persists`,async({page})=>{
  const model=example('point'); model.name=vertical?'竖杆方向':'横杆方向';model.pointLoads=[];
  if(vertical){model.nodes[1].x=0;model.nodes[1].y=6;}
  await load(page,model);
  for(const tool of ['udl','point']){
    const box=(await page.getByTestId('beam-canvas').boundingBox())!;
    const dataTransfer=await page.evaluateHandle(tool=>{const d=new DataTransfer();d.setData('application/ligou-tool',tool);return d;},tool);
    await page.getByTestId('beam-canvas').dispatchEvent('drop',{dataTransfer,clientX:box.x+box.width/2,clientY:box.y+(vertical?217:225)});
    await expect(page.getByLabel('荷载方向')).toHaveValue(vertical?'x':'y');
    await page.getByLabel('荷载方向').selectOption(vertical?'y':'x');
  }
  await page.reload();
  const saved=(await state(page)).history.present;
  expect(saved.pointLoads[0].direction).toBe(vertical?'y':'x');
  expect(saved.distributedLoads[0].direction).toBe(vertical?'y':'x');
  await page.locator('.object-drawer summary').click();
  await page.locator('.object-list button').filter({hasText:'均布荷载'}).click();
  await page.getByRole('button',{name:'按杆件重新识别方向'}).click();
  await expect(page.getByLabel('荷载方向')).toHaveValue(vertical?'x':'y');
});
