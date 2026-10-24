import {test,expect,type Page} from '@playwright/test';
const model=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-workspace-v1')!).history.present);
async function drag(page:Page,name:string,dx:number,dy:number){const box=(await page.getByRole('separator',{name}).boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:12});await page.mouse.up();}
async function visibleControls(page:Page){for(const name of ['展开画布','适应模型','清空模型']){const control=page.getByRole('button',{name,exact:true});await expect(control).toBeInViewport({ratio:1});expect(await control.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);}}
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByTestId('max-moment')).toContainText('15');});

test('legacy 1080p settings cannot hide controls and pixel settings are removed',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('ligou-lab-canvas-size-v1',JSON.stringify({mode:'custom',width:1920,height:1080,showRange:true,worldWidth:20,worldHeight:10})));
 await page.reload();
 await expect(page.getByRole('button',{name:'画布大小',exact:true})).toHaveCount(0);
 await visibleControls(page);
 await expect.poll(async()=>(await page.getByTestId('beam-canvas').boundingBox())!.width).toBeLessThan(1000);
 await page.getByRole('button',{name:'展开画布',exact:true}).click();
 await expect.poll(async()=>(await page.getByTestId('beam-canvas').boundingBox())!.height).toBe(1100);
 await page.getByRole('button',{name:'退出展开画布',exact:true}).click();
 await visibleControls(page);
});

test('dragging all three boundaries resizes panes, persists and preserves the model',async({page})=>{
 const before=await model(page),canvas=page.getByTestId('beam-canvas');
 const left=(await page.locator('.library').boundingBox())!,right=(await page.locator('.inspector').boundingBox())!,original=(await canvas.boundingBox())!;
 await drag(page,'调整构件库宽度',65,0);
 await expect.poll(async()=>(await page.locator('.library').boundingBox())!.width).toBeCloseTo(left.width+65,0);
 await drag(page,'调整属性面板宽度',-55,0);
 await expect.poll(async()=>(await page.locator('.inspector').boundingBox())!.width).toBeCloseTo(right.width+55,0);
 await drag(page,'调整画布与分析区高度',0,70);
 await expect.poll(async()=>(await canvas.boundingBox())!.height).toBeCloseTo(original.height+70,0);
 await expect.poll(async()=>(await canvas.boundingBox())!.width).toBeCloseTo(original.width-120,0);
 await visibleControls(page);expect(await model(page)).toEqual(before);
 await page.reload();await expect.poll(async()=>(await canvas.boundingBox())!.height).toBeCloseTo(original.height+70,0);
 await page.getByRole('button',{name:'展开画布',exact:true}).click();
 await page.getByRole('button',{name:'退出展开画布',exact:true}).click();
 await expect.poll(async()=>(await canvas.boundingBox())!.height).toBeCloseTo(original.height+70,0);
 await page.screenshot({path:'../work/resizable-workspace.png'});
 await page.getByRole('button',{name:'恢复默认布局'}).click();
 await expect.poll(async()=>(await canvas.boundingBox())!.height).toBeCloseTo(original.height,0);
 await expect.poll(async()=>(await page.locator('.library').boundingBox())!.width).toBeCloseTo(left.width,0);
 await expect.poll(async()=>(await page.locator('.inspector').boundingBox())!.width).toBeCloseTo(right.width,0);
 expect(await model(page)).toEqual(before);
});

test('boundaries support keyboard and double click reset',async({page})=>{
 const split=page.getByRole('separator',{name:'调整构件库宽度'}),left=page.locator('.library');
 await split.focus();await page.keyboard.press('ArrowRight');await expect.poll(async()=>(await left.boundingBox())!.width).toBe(198);
 await split.dblclick();await expect.poll(async()=>(await left.boundingBox())!.width).toBe(188);
});

for(const size of [{width:1024,height:768},{width:1382,height:956},{width:1920,height:1080}])test(`controls remain reachable after extreme drags at ${size.width}`,async({page})=>{
 await page.setViewportSize(size);
 await drag(page,'调整构件库宽度',600,0);await drag(page,'调整属性面板宽度',-600,0);await drag(page,'调整画布与分析区高度',0,1000);
 await visibleControls(page);
 const canvas=(await page.getByTestId('beam-canvas').boundingBox())!,results=(await page.locator('.results-panel').boundingBox())!;
 expect(canvas.x+canvas.width).toBeLessThanOrEqual(size.width);expect(results.height).toBeGreaterThanOrEqual(100);
 await page.getByRole('button',{name:'展开画布',exact:true}).click();await expect.poll(async()=>(await page.getByTestId('beam-canvas').boundingBox())!.width).toBe(size.width);
 await page.getByRole('button',{name:'退出展开画布',exact:true}).click();await visibleControls(page);
});

test('fullscreen palette exposes every tool, collapses, and opens the arch dialog',async({page})=>{
 await page.getByRole('button',{name:'展开画布',exact:true}).click();
 const palette=page.getByRole('toolbar',{name:'全屏绘图工具'});
 for(const name of ['节点','杆件','直角杆','拱形杆','作用点','铰支座','滚动支座','固定支座','集中力','均布荷载','集中弯矩'])await expect(palette.getByRole('button',{name:`全屏${name}`,exact:true})).toBeVisible();
 await page.screenshot({path:'../work/fullscreen-palette.png'});
 await palette.getByRole('button',{name:'全屏直角杆',exact:true}).click();
 await expect(palette.getByRole('button',{name:'全屏直角杆',exact:true})).toHaveAttribute('aria-pressed','true');
 await palette.getByRole('button',{name:'收起绘图工具',exact:true}).click();
 await expect(palette.getByRole('button',{name:'全屏节点',exact:true})).toHaveCount(0);
 await palette.getByRole('button',{name:'展开绘图工具',exact:true}).click();
 await palette.getByRole('button',{name:'全屏拱形杆',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'绘制拱形杆'})).toBeVisible();
 await page.getByRole('button',{name:'关闭拱形设置',exact:true}).click();
 await expect(palette).toBeVisible();
});
