import {View,div} from 'gpui-kit';
import {uiMetrics} from './ui.js';
function hitOffset(text,x,y,width,height,wrap,codeSize,lineHeight){
 const length=text.length;
 if(!length)return {start:0,end:0,localX:0,cellW:1};
 const charW=Math.max(4,codeSize*0.6);
 if(!wrap){
  const targetCol=Math.max(0,x/charW);
  let idx=0,c=0;
  while(idx<length-1){
   const w=text[idx]==='\t'?4:1;
   if(c+w>targetCol)break;
   c+=w;idx++;
  }
  const w=text[idx]==='\t'?4:1;
  return {start:idx,end:idx+1,localX:targetCol-c,cellW:w};
 }
 const cols=Math.max(1,Math.floor(Math.max(charW,width)/charW));
 const lines=[];
 let pos=0;
 while(pos<length){
  let col=0,end=pos,lastBreak=-1;
  while(end<length){
   const w=text[end]==='\t'?4:1;
   if(col+w>cols&&end>pos)break;
   col+=w;
   if(text[end]===' '||text[end]==='\t')lastBreak=end+1;
   end++;
  }
  const next=end<length&&lastBreak>pos?lastBreak:end;
  lines.push({start:pos,end:next});
  pos=next;
 }
 const lineH=Math.max(lineHeight,height)/lines.length;
 const rowIdx=Math.max(0,Math.min(lines.length-1,Math.floor(Math.max(0,y)/lineH)));
 const seg=lines[rowIdx],targetCol=Math.max(0,x/charW);
 let idx=seg.start,c=0;
 while(idx<seg.end-1){
  const w=text[idx]==='\t'?4:1;
  if(c+w>targetCol)break;
  c+=w;idx++;
 }
 const w=text[idx]==='\t'?4:1;
 return {start:idx,end:idx+1,localX:targetCol-c,cellW:w};
}
// Native entities own row handlers; virtual render callbacks only mount them.
export default class DiffRow extends View {
 init(p){this.p=p;}
 interaction(){const {owner,row}=this.p,runtime=owner.diffSelection;if(!owner.experimentalDiff||!runtime?.model)return null;return {source:side=>runtime.point(row.id,side)?{
   selectedOffsets:()=>runtime.selectedOffsets(row.id,side),
   passive:true
  }:null};}
 pointerEvent(type,event,cx){
  const {owner,row,split,source}=this.p,runtime=owner.diffSelection;
  if(!runtime?.model||!event.local_position||!event.bounds)return;
  const version=runtime.version,wrap=Boolean(owner.readingOptions?.wrap);
  const w=event.bounds.width||1,h=event.bounds.height||22;
  let side,cellX,gutterW,cellW;
  if(split&&row.kind==='pair'){
   const half=w/2;
   side=event.local_position.x<half?'old':'new';
   cellX=side==='old'?event.local_position.x:event.local_position.x-half-1;
   gutterW=52;
   cellW=half-60;
  }else{
   side=row.side==='old'?'old':'new';
   cellX=event.local_position.x;
   gutterW=96;
   cellW=w-104;
  }
  const line=row.kind==='pair'?(side==='old'?row.old:row.next):row;
  if(!line)return;
  if(type==='down'){
   cx?.stop_propagation?.();
   if(cellX<gutterW){runtime.send({type:'comment-down',version,source,rowId:row.id,side});return;}
   const metrics=uiMetrics(),fontPx=metrics.fontSize||14,linePx=fontPx*1.5,prefixW=split?0:fontPx*1.2;
   const hit=hitOffset(line.text||'',cellX-gutterW-prefixW,event.local_position.y,Math.max(20,cellW-prefixW),h,wrap,fontPx,linePx);
   runtime.send({type:'down',source,version,rowId:row.id,side,start:hit.start,end:hit.end,click_count:event.click_count,modifiers:event.modifiers,local_position:{x:hit.localX},bounds:{width:hit.cellW}});
   return;
  }
  if(runtime.drag?.kind==='comment'){
   runtime.send({type:'row-move',version,source,rowId:row.id,side,bounds:event.bounds});
  }else if(runtime.drag?.kind==='text'){
   const metrics=uiMetrics(),fontPx=metrics.fontSize||14,linePx=fontPx*1.5,prefixW=split?0:fontPx*1.2;
   const hit=hitOffset(line.text||'',cellX-gutterW-prefixW,event.local_position.y,Math.max(20,cellW-prefixW),h,wrap,fontPx,linePx);
   runtime.send({type:'move',source,version,rowId:row.id,side,start:hit.start,end:hit.end,local_position:{x:hit.localX},bounds:{width:hit.cellW}});
   runtime.send({type:'row-move',version,source,rowId:row.id,side,bounds:event.bounds});
  }
 }
 measure(size,version,source){
  const runtime=this.p.owner.diffSelection;
  if(runtime&&runtime.version===version&&runtime.source===source)runtime.measure(this.p.row.id,size.height);
 }
 render(){
  const {owner,content,row,split}=this.p;
  if(!owner.experimentalDiff){
   if(split&&row.kind==='pair'){
    return div().w_full().min_w(0)
     .on_mouse_down('left',event=>{if(event.local_position&&event.bounds)owner.commentSide=event.local_position.x<event.bounds.width/2?'old':'new';})
     .child(content(null));
   }
   return content(null);
  }
  const version=owner.diffSelection?.version;
  const runtime=owner.diffSelection?.model?owner.diffSelection:null;
  return div().w_full().min_w(0)
   .when(Boolean(runtime),e=>e.on_mouse_down('left',(event,cx)=>this.pointerEvent('down',event,cx)))
   .when(Boolean(runtime?.drag),e=>e.on_mouse_move(event=>this.pointerEvent('move',event)))
   .when(Boolean(owner.readingOptions?.wrap&&runtime?.drag),e=>e.on_size_change(size=>this.measure(size,version,this.p.source)))
   .child(content(this.interaction()));
 }
}
