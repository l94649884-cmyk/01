import { describe, expect, it } from 'vitest';
import { example } from './model';
import { fixedSupportRotation } from './supportGeometry';

describe('fixed support faces the outside of the connected members', () => {
  it.each([
    {end:{x:6,y:0},left:0,right:-180},
    {end:{x:0,y:6},left:-90,right:90},
    {end:{x:3,y:3},left:-45,right:135},
  ])('orients both ends for $end', ({end,left,right}) => {
    const model=example('point');Object.assign(model.nodes[1],end);
    expect(fixedSupportRotation(model,'N1')).toBeCloseTo(left);
    expect(fixedSupportRotation(model,'N2')).toBeCloseTo(right);
    [model.members[0].start,model.members[0].end]=[model.members[0].end,model.members[0].start];
    expect(fixedSupportRotation(model,'N1')).toBeCloseTo(left);
    expect(fixedSupportRotation(model,'N2')).toBeCloseTo(right);
  });
  it('follows edited geometry and is independent of absolute position',()=>{
    const model=example('point');model.nodes.forEach(n=>{n.x+=400;n.y-=100;});
    expect(fixedSupportRotation(model,'N1')).toBeCloseTo(0);
    model.nodes[1].x=model.nodes[0].x;model.nodes[1].y=model.nodes[0].y+6;
    expect(fixedSupportRotation(model,'N1')).toBeCloseTo(-90);
    expect(fixedSupportRotation(model,'N2')).toBeCloseTo(90);
  });
  it('uses a bottom foundation when connected members have opposite directions',()=>{
    const model=example('point');model.nodes.push({id:'N3',x:-6,y:0});
    model.members.push({...model.members[0],id:'B2',start:'N1',end:'N3'});
    expect(fixedSupportRotation(model,'N1')).toBe(-90);
    model.members=[];expect(fixedSupportRotation(model,'N1')).toBe(0);
  });
});
