import { test, expect } from '@playwright/test';
import { example } from '../src/model';

test.beforeEach(async ({page})=>{await page.goto('/');await expect(page.getByTestId('max-moment')).toContainText('15');});

test('clear removes all model objects, saves a snapshot and supports undo, redo and reload',async({page})=>{
  const model=example('point');model.distributedLoads=[{id:'qClear',memberId:'B1',value:2}];model.moments=[{id:'mClear',nodeId:'N2',value:10,side:'left'}];
  await page.getByLabel('载入 JSON 文件').setInputFiles({name:'all-types.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
  await expect(page.locator('.status-bar')).toContainText('JSON 模型已载入');
  await page.getByRole('button',{name:'放大视图'}).click();
  await page.getByRole('button',{name:'放大视图'}).click();
  await expect(page.locator('.canvas-controls')).toContainText('144%');
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present);
  await page.getByRole('button',{name:'清空模型'}).click();
  await expect(page.locator('.canvas-controls')).toContainText('100%');
  await expect(page.locator('.model-count')).toContainText('0 节点 / 0 杆件');
  await expect(page.getByTestId('max-moment')).toContainText('—');
  const empty={...before,nodes:[],members:[],supports:[],pointLoads:[],distributedLoads:[],moments:[]};
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present)).toEqual(empty);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present)).toEqual(before);
  await page.getByRole('button',{name:'重做',exact:true}).click();await page.reload();
  await expect(page.locator('.model-count')).toContainText('0 节点 / 0 杆件');
  const archives=await page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).archives);
  expect(archives[0].reason).toBe('清空前');expect(archives[0].model).toEqual(before);
  await page.getByRole('button',{name:'模型历史',exact:true}).click();
  await page.getByRole('button',{name:`恢复模型 ${before.name}`,exact:true}).first().click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present)).toEqual(before);
});

test('wheel zooms around the pointer without editing the model',async({page})=>{
  const box=(await page.getByTestId('beam-canvas').boundingBox())!;
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present);
  await page.mouse.move(box.x+box.width*.28,box.y+110);
  await page.mouse.wheel(0,-360);
  await expect(page.locator('.canvas-controls')).not.toContainText('100%');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present)).toEqual(before);
});

test('middle mouse drag pans the canvas and preserves model geometry',async({page})=>{
  const box=(await page.getByTestId('beam-canvas').boundingBox())!;
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present);
  const beam={x:box.x+box.width/2,y:box.y+225};
  await page.mouse.move(beam.x,beam.y);
  await page.mouse.down({button:'middle'});
  await page.mouse.move(beam.x+80,beam.y+35,{steps:5});
  await page.mouse.up({button:'middle'});
  await expect(page.locator('.canvas-foot')).toContainText('已平移视图');
  // The beam's center is now displaced by the pointer delta; clicking it still selects the same member.
  await page.mouse.click(beam.x+80,beam.y+35);
  await expect(page.getByLabel('弹性模量 E')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present)).toEqual(before);
});

