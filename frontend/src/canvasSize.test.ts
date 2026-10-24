import {it,expect} from 'vitest';
import {defaultCanvasSize,validCanvasSize} from './CanvasSize';
import {drawingRangeViewport,baseScale} from './viewport';
it('rejects invalid pixel and metre ranges',()=>{
 expect(validCanvasSize(defaultCanvasSize)).toBe(true);
 for(const patch of [{width:0},{height:1601},{width:640.5},{worldWidth:NaN},{worldHeight:0},{worldHeight:1001},{mode:'other'}])expect(validCanvasSize({...defaultCanvasSize,...patch})).toBe(false);
});
it.each([[20,10],[1000,1000],[.25,.25]])('fits the requested metre rectangle with equal X/Y scale', (w,h)=>{
 const view=drawingRangeViewport(w,h,1280,720),scale=baseScale(1280)*view.zoom;
 expect(view.center).toEqual({x:w/2,y:h/2});
 expect(w*scale).toBeLessThanOrEqual(1080.001);expect(h*scale).toBeLessThanOrEqual(570.001);
});
