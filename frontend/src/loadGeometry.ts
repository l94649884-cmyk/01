type Point={x:number;y:number};

/** Screen-space distributed-load glyph. Axial arrows have separate short stems
 * inside a band so a continuous distribution cannot look like one point force. */
export function distributedGlyph(a:Point,b:Point,horizontal:boolean,lane=0){
  const length=Math.hypot(b.x-a.x,b.y-a.y),dx=(b.x-a.x)/(length||1),dy=(b.y-a.y)/(length||1);
  const normal={x:dy,y:-dx},parallel=Math.abs(horizontal?dx:dy)>.8;
  const count=Math.max(3,Math.min(40,Math.ceil(length/(parallel?48:32))));
  const offset=parallel?42+lane*24:12;
  const ends=[a,b].map(p=>({x:p.x+normal.x*offset,y:p.y+normal.y*offset}));
  const stem=parallel?Math.min(24,length/count*.62):72+lane*15;
  const tips=Array.from({length:count+1},(_,i)=>{
    const t=parallel?(i+.5)/(count+1):i/count;
    return {x:ends[0].x+(ends[1].x-ends[0].x)*t-(horizontal&&parallel?stem/2:0),y:ends[0].y+(ends[1].y-ends[0].y)*t+(!horizontal&&parallel?stem/2:0)};
  });
  const tails=tips.map(p=>({x:p.x+(horizontal?stem:0),y:p.y-(horizontal?0:stem)}));
  const polygon=parallel?[{x:ends[0].x+normal.x*13,y:ends[0].y+normal.y*13},{x:ends[1].x+normal.x*13,y:ends[1].y+normal.y*13},{x:ends[1].x-normal.x*13,y:ends[1].y-normal.y*13},{x:ends[0].x-normal.x*13,y:ends[0].y-normal.y*13}]:[tails[0],tails[count],tips[count],tips[0]];
  return {parallel,tips,tails,ends,polygon,normal};
}
