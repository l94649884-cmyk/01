import { test, expect } from '@playwright/test';
import { example } from '../src/model';

test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByTestId('max-moment')).toContainText('15');});

test('required benchmarks use the real API and interactive diagrams',async({page})=>{
  const consoleErrors:string[]=[];page.on('pageerror',e=>consoleErrors.push(e.message));
  await expect(page.getByTestId('max-shear')).toContainText('5');
  await page.getByRole('button',{name:'剪力图'}).click();
  const chart=page.getByRole('img',{name:'剪力图，可悬停查看数值'});const box=await chart.boundingBox();
  await page.mouse.move(box!.x+box!.width*402.5/800,box!.y+box!.height*.5);
  await expect(page.getByTestId('chart-readout')).toContainText('V⁻ = 5');
  await expect(page.getByTestId('chart-readout')).toContainText('V⁺ = -5');
  await page.setViewportSize({width:1920,height:1080});
  await chart.scrollIntoViewIfNeeded();
  const wide=await chart.boundingBox();
  await page.mouse.move(wide!.x+wide!.width*(55+(750-55)/4)/800,wide!.y+wide!.height*.5);
  // Browser mouse coordinates are quantized to display pixels after responsive resizing.
  await expect.poll(async()=>Number((await page.getByTestId('chart-readout').innerText()).match(/x = ([\d.]+)/)?.[1])).toBeCloseTo(1.5,1);
  await expect(page.getByTestId('chart-readout')).toContainText('V = 5');
  await page.setViewportSize({width:1440,height:1100});
  await page.getByLabel('选择验证算例').selectOption('udl');
  await expect(page.getByTestId('max-moment')).toContainText('9');
  await expect(page.getByTestId('max-shear')).toContainText('6');
  await page.getByLabel('选择验证算例').selectOption('cantilever');
  await expect(page.getByTestId('max-moment')).toContainText('30');
  await expect(page.getByTestId('max-shear')).toContainText('10');
  await expect(page.locator('.reactions')).toContainText('30 kN·m');
  expect(consoleErrors).toEqual([]);
});

test('parameter editing invalidates results and supports undo and redo',async({page})=>{
  await page.locator('.object-drawer summary').click();
  await page.locator('.object-list button').filter({hasText:'集中力'}).click();
  await page.getByLabel('集中力大小').fill('20');
  await page.getByLabel('集中力大小').press('Enter');
  await expect(page.getByTestId('max-moment')).toContainText('30');
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await expect(page.getByTestId('max-moment')).toContainText('15');
  await page.getByRole('button',{name:'重做',exact:true}).click();
  await expect(page.getByTestId('max-moment')).toContainText('30');
});

test('manual mode clears stale result and solves only when requested',async({page})=>{
  await page.getByLabel('自动求解').uncheck();
  await page.locator('.object-drawer summary').click();
  await page.locator('.object-list button').filter({hasText:'集中力'}).click();
  await page.getByLabel('集中力大小').fill('12');await page.getByLabel('集中力大小').press('Enter');
  await expect(page.getByTestId('max-moment')).toContainText('—');
  await page.getByRole('button',{name:'求解模型'}).click();
  await expect(page.getByTestId('max-moment')).toContainText('18');
  await page.getByLabel('集中力大小').fill('14');await page.getByLabel('集中力大小').press('Enter');
  await expect(page.getByTestId('max-moment')).toContainText('—');
  await expect(page.getByText('点击「求解模型」开始分析')).toBeVisible();
});

test('JSON export/import restores a changed model, invalid files preserve current work',async({page})=>{
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'保存 JSON'}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toContain('.json');
  await page.getByLabel('选择验证算例').selectOption('cantilever');await expect(page.getByTestId('max-moment')).toContainText('30');
  await page.getByLabel('载入 JSON 文件').setInputFiles((await download.path())!);
  await expect(page.getByTestId('max-moment')).toContainText('15');
  await page.getByLabel('载入 JSON 文件').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schemaVersion":99}')});
  await expect(page.locator('.status-bar')).toContainText('载入失败');
  await expect(page.getByTestId('max-moment')).toContainText('15');
});

test('model validation rejects underconstraint without displaying stale forces',async({page})=>{
  const invalid=example('point');invalid.nodes[1].y=2;invalid.supports=[];
  await page.getByLabel('载入 JSON 文件').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await expect(page.getByTestId('max-moment')).toContainText('—');
  await expect(page.getByRole('button',{name:'求解模型'})).toBeDisabled();
  await expect(page.locator('.validation-bar')).toContainText('约束不足');
});

test('dragging a point load snaps to member coordinates and recalculates reactions',async({page})=>{
  const box=await page.getByTestId('beam-canvas').boundingBox();const scale=Math.max(25,Math.min(95,(box!.width-140)/8));
  const cx=box!.x+box!.width/2,y=box!.y+180;
  await page.mouse.move(cx,y);await page.mouse.down();await page.mouse.move(cx-2*scale,y,{steps:15});await page.mouse.up();
  await expect(page.getByLabel('距杆件起点')).toHaveValue('1');
  await expect(page.getByTestId('max-moment')).toContainText('8.333');
  await expect(page.locator('.reactions')).toContainText('8.333');
});

test('palette drag/drop enforces valid attachment targets',async({page})=>{
  const box=await page.getByTestId('beam-canvas').boundingBox();
  const dt=await page.evaluateHandle(()=>{const d=new DataTransfer();d.setData('application/ligou-tool','pin');return d;});
  await page.getByTestId('beam-canvas').dispatchEvent('drop',{dataTransfer:dt,clientX:box!.x+box!.width/2,clientY:box!.y+80});
  await expect(page.locator('.status-bar')).toContainText('支座只能吸附到节点');
  await expect(page.locator('.model-count')).toContainText('2 节点 / 1 杆件');
  const load=await page.evaluateHandle(()=>{const d=new DataTransfer();d.setData('application/ligou-tool','point');return d;});
  await page.getByTestId('beam-canvas').dispatchEvent('drop',{dataTransfer:load,clientX:box!.x+box!.width/2,clientY:box!.y+225});
  await expect(page.getByTestId('max-moment')).toContainText('30');
});

test('builds a complete new beam with nodes, member, supports and UDL',async({page})=>{
  await page.getByRole('button',{name:'新建',exact:true}).click();
  const box=await page.getByTestId('beam-canvas').boundingBox();const scale=Math.max(25,Math.min(95,(box!.width-140)/8));
  const a={x:box!.x+box!.width/2-3*scale,y:box!.y+225},b={x:box!.x+box!.width/2+3*scale,y:a.y};
  await page.mouse.click(a.x,a.y);await page.mouse.click(b.x,b.y);
  await page.getByRole('button',{name:'添加杆件',exact:true}).click();await page.mouse.click(a.x,a.y);await page.mouse.click(b.x,b.y);
  await page.getByRole('button',{name:'添加铰支座',exact:true}).click();await page.mouse.click(a.x,a.y);
  await page.getByRole('button',{name:'添加滚动支座',exact:true}).click();await page.mouse.click(b.x,b.y);
  await page.getByRole('button',{name:'添加均布荷载',exact:true}).click();await page.mouse.click((a.x+b.x)/2,a.y);
  await expect(page.getByTestId('max-moment')).toContainText('9');
  await expect(page.getByLabel('均布荷载强度')).toHaveValue('2');
});

test('backend outage reports failure and never fabricates results',async({page})=>{
  await page.route('**/api/solve',route=>route.abort());
  await page.getByLabel('选择验证算例').selectOption('udl');
  await expect(page.locator('.validation-bar')).toContainText('无法连接计算服务');
  await expect(page.getByTestId('max-moment')).toContainText('—');
  await page.unroute('**/api/solve');await page.getByRole('button',{name:'求解模型'}).click();
  await expect(page.getByTestId('max-moment')).toContainText('9');
});

test('dragging a node updates geometry and preserves attached supports',async({page})=>{
  const box=await page.getByTestId('beam-canvas').boundingBox();const scale=Math.max(25,Math.min(95,(box!.width-140)/8));
  const x=box!.x+box!.width/2+3*scale,y=box!.y+225;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+scale,y,{steps:12});await page.mouse.up();
  await expect(page.getByLabel('X 坐标')).toHaveValue('7');
  await expect(page.getByTestId('max-moment')).toContainText('17.143');
  await expect(page.locator('.reactions')).toContainText('5.714');
});

test('dragging a member carries both nodes, supports and load positions',async({page})=>{
  const box=await page.getByTestId('beam-canvas').boundingBox();const scale=Math.max(25,Math.min(95,(box!.width-140)/8));
  const x=box!.x+box!.width/2-1.5*scale,y=box!.y+225;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+scale,y,{steps:12});await page.mouse.up();
  await expect(page.getByTestId('max-moment')).toContainText('15');
  await expect(page.locator('.reactions')).toContainText('x = 1 m');
  await expect(page.locator('.reactions')).toContainText('x = 7 m');
});

test('support drag reattaches to a free node and UDL drag reattaches to a member',async({page})=>{
  const model=example('udl');model.nodes.push({id:'N3',x:3,y:0});model.members[0].end='N3';model.members.push({id:'B2',start:'N3',end:'N2',E:210,I:8000});
  await page.getByLabel('载入 JSON 文件').setInputFiles({name:'segmented.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
  await expect(page.getByTestId('max-moment')).toContainText('5.063');
  const box=await page.getByTestId('beam-canvas').boundingBox();const scale=Math.max(25,Math.min(95,(box!.width-140)/8));
  const center=box!.x+box!.width/2,beamY=box!.y+225;
  await page.mouse.move(center-1.5*scale,beamY-80);await page.mouse.down();await page.mouse.move(center+1.5*scale,beamY-80,{steps:15});await page.mouse.up();
  await expect(page.locator('.reactions')).toContainText('1.5');
  await page.mouse.move(center-3*scale,beamY+17);await page.mouse.down();await page.mouse.move(center,beamY+17,{steps:15});await page.mouse.up();
  await expect(page.locator('.inspector-body')).toContainText('N3');
  await expect(page.getByTestId('max-moment')).toContainText('2.25');
  await expect(page.locator('.reactions')).toContainText('x = 3 m');
});

test('slow obsolete solve response cannot overwrite the new model result',async({page})=>{
  await page.route('**/api/solve',async route=>{
    const data=route.request().postDataJSON();
    if(data.distributedLoads.length){await new Promise(r=>setTimeout(r,1200));}
    await route.continue();
  });
  await page.getByLabel('选择验证算例').selectOption('udl');
  await expect(page.getByRole('button',{name:'求解模型'})).toBeDisabled();
  await page.getByLabel('选择验证算例').selectOption('cantilever');
  await expect(page.getByTestId('max-moment')).toContainText('30');
  await expect(page.locator('.reactions')).toContainText('30 kN·m');
});

test('capture working application',async({page})=>{
  await page.locator('.object-drawer summary').click();await page.locator('.object-list button').filter({hasText:'集中力'}).click();await page.locator('.object-drawer summary').click();
  await page.screenshot({path:'../docs/workspace.png',fullPage:true});
});
