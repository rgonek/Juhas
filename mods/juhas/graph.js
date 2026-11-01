export function layoutGraph(commits,previousState=[]){
 let lanes=[...previousState];const rows=[];
 for(const c of commits){let lane=lanes.indexOf(c.oid);if(lane<0){lane=lanes.indexOf(null);if(lane<0)lane=lanes.length;lanes[lane]=c.oid;}
  const before=[...lanes];lanes[lane]=null;const edges=[];
  for(let i=0;i<c.parents.length;i++){const parent=c.parents[i];let target=lanes.indexOf(parent);if(target<0){target=i===0?lane:lanes.indexOf(null);if(target<0)target=lanes.length;lanes[target]=parent;}edges.push({from:lane,to:target,parent});}
  rows.push({oid:c.oid,lane,edges,before,after:[...lanes]});while(lanes.length&&lanes.at(-1)===null)lanes.pop();
 }
 return {rows,continuation:lanes};
}
