import { expect, it } from 'vitest';
import { example, historyReducer, parseModel, removeSelection, validateModel } from './model';
import { momentAnchor, momentArrowPoints, nearestMomentTarget } from './momentGeometry';

it('snaps a moment to either side of a node and refuses a distant location',()=>{
  const node={id:'N1',x:2,y:1},scale=80;
  expect(nearestMomentTarget([node],momentAnchor(node,'left',scale),scale)?.side).toBe('left');
  expect(nearestMomentTarget([node],momentAnchor(node,'right',scale),scale)?.side).toBe('right');
  expect(nearestMomentTarget([node],{x:2,y:2},scale)).toBeNull();
});
it('draws positive moments counterclockwise and negative moments clockwise on screen',()=>{
  const direction=(points:number[])=>points[0]*points[3]-points[1]*points[2];
  expect(direction(momentArrowPoints(10))).toBeLessThan(0);
  expect(direction(momentArrowPoints(-10))).toBeGreaterThan(0);
});
it('keeps old JSON valid and persists nodal moment values and sides',()=>{
  const model=example('point'),legacy={...model};delete (legacy as Partial<typeof model>).moments;
  expect(parseModel(JSON.stringify(legacy)).moments).toEqual([]);
  model.moments=[{id:'M1',nodeId:'N2',value:-10,side:'left'}];
  expect(parseModel(JSON.stringify(model))).toEqual(model);expect(validateModel(model)).toEqual([]);
  model.moments[0].nodeId='missing';expect(()=>parseModel(JSON.stringify(model))).toThrow('无效');
});
it('removes a nodal moment independently or with its node and restores it through undo',()=>{
  const model=example('point');model.moments=[{id:'M1',nodeId:'N1',value:10,side:'right'}];
  expect(removeSelection(model,{type:'moments',id:'M1'})).toEqual({...model,moments:[]});
  const deleted=removeSelection(model,{type:'nodes',id:'N1'});expect(deleted.moments).toEqual([]);
  const history=historyReducer({past:[],present:model,future:[]},{type:'set',model:deleted});
  expect(historyReducer(history,{type:'undo'}).present).toEqual(model);
});
