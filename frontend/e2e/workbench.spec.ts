import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByTestId('max-moment')).toContainText('15');});

test('partial UDL edits actual loading, supports undo, and horizontal arrows remain distributed',async({page})=>{
 await page.getByLabel('选择验证算例').selectOption('udl');
 await expect(page.getByTestId('max-moment')).toContainText('9');
 await page.locator('.object-drawer summary').click();
 await page.locator('.object-list button').filter({hasText:'均布荷载'}).click();
 await page.getByLabel('荷载终点',{exact:true}).fill('3');await page.getByLabel('荷载终点',{exact:true}).press('Enter');
 await page.getByLabel('荷载起点',{exact:true}).fill('1');await page.getByLabel('荷载起点',{exact:true}).press('Enter');
 await expect(page.getByTestId('max-moment')).toContainText('4.444');
 await expect(page.locator('.reactions')).toContainText('2.667');
 await page.getByLabel('荷载方向').selectOption('x');
 await expect(page.getByTestId('max-moment')).toContainText('0');
 await expect(page.locator('.reactions')).toContainText('4 kN · X');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ligou-lab-draft-v1')!));
 expect(saved.distributedLoads).toEqual([{id:'Q1',memberId:'B1',value:2,start:1,end:3,direction:'x'}]);expect(saved.pointLoads).toEqual([]);
 // The second drag handle lies at the end of the axial distribution band.
 const box=(await page.getByTestId('beam-canvas').boundingBox())!;
 const scale=Math.max(25,Math.min(95,(box.width-140)/8));
 const x=box.x+box.width/2,y=box.y+225-42;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+scale,y,{steps:12});await page.mouse.up();
 await expect(page.getByLabel('荷载终点',{exact:true})).toHaveValue('4');
 await expect(page.locator('.reactions')).toContainText('6 kN · X');
 await page.getByRole('button',{name:'撤销',exact:true}).click();
 await expect(page.getByLabel('荷载终点',{exact:true})).toHaveValue('3');
 await page.getByRole('button',{name:'重做',exact:true}).click();
 await expect(page.getByLabel('荷载终点',{exact:true})).toHaveValue('4');
 await page.getByLabel('荷载终点',{exact:true}).fill('0.5');await page.getByLabel('荷载终点',{exact:true}).press('Enter');
 await expect(page.locator('.validation-bar')).toContainText('区间');await expect(page.getByTestId('max-moment')).toContainText('—');
 await page.getByRole('button',{name:'恢复全杆荷载'}).click();
 await expect(page.getByLabel('荷载起点',{exact:true})).toHaveValue('0');await expect(page.getByLabel('荷载终点',{exact:true})).toHaveValue('6');
 await expect(page.locator('.reactions')).toContainText('12 kN · X');
});

test('overall frame diagrams show beam and column together with exact hover readings',async({page})=>{
 await page.getByLabel('选择验证算例').selectOption('frame');await expect(page.getByTestId('max-moment')).toContainText('40');
 const diagram=page.getByTestId('structure-diagram');await expect(diagram).toBeVisible();
 const axes=await diagram.getByTestId('structure-axis').evaluateAll(els=>els.map(e=>['x1','y1','x2','y2'].map(a=>Number(e.getAttribute(a)))));
 expect(axes).toHaveLength(2);expect(axes[0][0]).toBeCloseTo(axes[0][2]);expect(axes[0][1]).not.toBe(axes[0][3]);expect(axes[1][1]).toBeCloseTo(axes[1][3]);expect(axes[1][0]).not.toBe(axes[1][2]);
 const svg=diagram.locator('svg');await svg.scrollIntoViewIfNeeded();const box=(await svg.boundingBox())!;
 // Use SVG coordinates transformed through its CTM; preserveAspectRatio adds margins.
 const position=await svg.evaluate((el,coords)=>{const p=new DOMPoint(coords[0],coords[1]).matrixTransform((el as SVGSVGElement).getScreenCTM()!);return {x:p.x,y:p.y};},[(axes[1][0]+axes[1][2])/2,axes[1][1]]);
 expect(box.width).toBeGreaterThan(100);await page.mouse.move(position.x,position.y);
 await expect(page.getByTestId('structure-readout')).toContainText('B2');await expect(page.getByTestId('structure-readout')).toContainText('M = -20');
 for(const name of ['剪力图','轴力图','挠度图','水平位移','竖向位移']){await page.getByRole('button',{name,exact:false}).click();await expect(diagram.getByTestId('structure-force')).toHaveCount(2);}
 await page.getByRole('button',{name:'截面曲线',exact:true}).click();await expect(page.getByLabel('查看杆件内力')).toBeVisible();
});

test('theme preview panel closes with Escape and restores focus',async({page})=>{
 const trigger=page.getByRole('button',{name:'切换主题'});await trigger.click();
 const panel=page.getByRole('dialog',{name:'界面主题'});await expect(panel).toBeVisible();await expect(panel.locator('.theme-preview')).toHaveCount(5);
 await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);await expect(trigger).toBeFocused();
});
