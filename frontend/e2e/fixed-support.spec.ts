import { test, expect } from '@playwright/test';
import { example } from '../src/model';
import { palettes } from '../src/themes';

test('fixed walls render outside opposite beam ends and remain independently selectable',async({page})=>{
  await page.goto('/');await expect(page.getByTestId('max-moment')).toContainText('15');
  const model=example('point');model.supports=model.supports.map(s=>({...s,kind:'fixed' as const}));
  await page.getByLabel('载入 JSON 文件').setInputFiles({name:'fixed-ends.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
  await expect(page.getByTestId('max-moment')).toContainText('7.5');
  const canvas=page.getByTestId('beam-canvas').locator('.konvajs-content canvas').first();
  const samples=await canvas.evaluate(element=>{
    const canvas=element as HTMLCanvasElement,context=canvas.getContext('2d')!,width=canvas.clientWidth;
    const scale=Math.max(25,Math.min(95,(width-140)/8)),left=width/2-3*scale,right=width/2+3*scale;
    const ratio=canvas.width/width;
    const pixel=(x:number)=>Array.from(context.getImageData(Math.round(x*ratio),Math.round(243*ratio),1,1).data).slice(0,3);
    return {leftWall:pixel(left-10),rightWall:pixel(right+10),rightInside:pixel(right-10)};
  });
  const ink=palettes.botanical.ink.match(/[0-9a-f]{2}/gi)!.map(hex=>parseInt(hex,16));
  expect(samples.leftWall).toEqual(ink);expect(samples.rightWall).toEqual(ink);expect(samples.rightInside).not.toEqual(ink);
  const box=(await canvas.boundingBox())!,scale=Math.max(25,Math.min(95,(box.width-140)/8));
  await page.mouse.click(box.x+box.width/2+3*scale+10,box.y+243);
  await expect(page.getByLabel('支座类型')).toHaveValue('fixed');
  await expect(page.locator('.property-pair')).toContainText('N2');
});
