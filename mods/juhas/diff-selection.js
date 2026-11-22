import {buildSelectionModel,selectionRange,selectionText,unitSelection,extendUnit,commentSelection,glyphSelected} from './selection.js';
import {commentHeight,INLINE_EDITOR_HEIGHT} from './comments.js';

// The parent processes gestures; retained rows only report source coordinates.
export class DiffSelection {
 constructor(owner){this.owner=owner;this.selection=null;this.drag=null;this.heights=new Map();this.cellHeights=new Map();this.source=null;this.pendingMove=null;this.version=0;this.motionBatch=0;}
 update(rows,split,source,layoutKey,enabled=true,preparedModel=null){
  if(rows===this.rows&&source===this.source&&layoutKey===this.layoutKey&&split===this.split&&enabled===this.enabled)return;
  const state=this.owner.controller?.state||{},next=enabled?(preparedModel||(rows===this.rows&&split===this.split&&source===this.source?this.model:null)||buildSelectionModel(rows,split,{fileId:state.file?.id,comparisonId:state.comparison?.id})):null;
  if(source!==this.source||next?.signature!==this.model?.signature||enabled!==this.enabled){this.stop();this.selection=null;this.heights.clear();this.cellHeights.clear();this.moves?.clear();this.measurementQueued=false;this.visibleRange=null;this.version++;}
  if(layoutKey!==this.layoutKey){this.stop();this.heights.clear();this.cellHeights.clear();this.measurementQueued=false;this.moves?.clear();this.visibleRange=null;this.version++;}this.layoutKey=layoutKey;
  this.split=split;this.rows=rows;this.model=next;this.source=source;this.enabled=enabled;
 }
 send(event){
  event={...event,source:event.source??this.source,version:event.version??this.version};
  if(event.type==='measure'){if(this.measurementQueued)return;this.measurementQueued=true;this.owner.headerAction({kind:'diff-selection',event});return;}
  if(event.type==='move'||event.type==='row-move'||event.type==='viewport'){
   // Preserve down/up ordering while coalescing motion of the same kind.
   this.moves??=new Map();const key=this.motionBatch+':'+event.type;if(this.moves.has(key)){this.moves.set(key,event);return;}
   this.moves.set(key,event);this.owner.headerAction({kind:'diff-selection',event:{type:'pending',motion:key,source:event.source,version:event.version}});return;
  }
  this.motionBatch++;this.owner.headerAction({kind:'diff-selection',event});
 }
 text(){return this.model?selectionText(this.model,this.selection):'';}
 point(id,side,offset=0){const point=this.model?.point(id,side);return point?{...point,offset}:null;}
 selected(id,side,start,end){return glyphSelected(this.selection,this.point(id,side),start,end);}
 selectedOffsets(id,side){
  const range=selectionRange(this.selection);
  if(!range)return null;
  const point=this.point(id,side);
  if(!point)return null;
  const [start,end]=range;
  if(point.key!==start.key||point.line<start.line||point.line>end.line)return null;
  return [point.line===start.line?start.offset:0,point.line===end.line?end.offset:Infinity];
 }
 preview(){return this.drag?.kind==='comment'&&this.drag.moved?this.drag.range:null;}
 marked(id,side){const range=this.preview();if(!range)return false;const entry=this.model?.entry(this.point(id,side)),line=side==='old'?entry?.oldLine:entry?.newLine;return entry?.fileId===range.fileId&&entry?.comparisonId===range.comparisonId&&side===range.side&&line>=range.startLine&&line<=range.endLine;}
 snapshot(){
  const result=new Map(),range=selectionRange(this.selection),preview=this.preview();
  if(!range&&!preview)return result;
  for(const {p:{row}} of this.owner.diffRowViews?.values()||[]){
   if(range){
    const [start,end]=range;
    for(const side of this.split?['old','new']:['new']){
     const point=this.point(row.id,side);
     if(!point||point.key!==start.key||point.line<start.line||point.line>end.line)continue;
     const entry=this.model.entry(point);
     result.set(row.id,`${point.key}:${point.line===start.line?start.offset:0}:${point.line===end.line?end.offset:entry.text.length}`);
     break;
    }
   }
   if(preview&&this.marked(row.id,preview.side))result.set(row.id,(result.get(row.id)||'')+'#'+preview.side);
  }
  return result;
 }
 invalidate(before,cx,forceAll=false){const after=this.snapshot();if(forceAll){const prefix=this.source+':';for(const [key,entry] of this.owner.diffRowViews||[])if(key.startsWith(prefix)&&entry.entity)cx.notify(entry.entity);return;}for(const id of new Set([...before.keys(),...after.keys()]))if(before.get(id)!==after.get(id)){const entity=this.owner.diffRowViews?.get(this.source+':'+id)?.entity;if(entity)cx.notify(entity);}}
 isCollapsed(){return !this.selection||(this.selection.anchor.key===this.selection.end.key&&this.selection.anchor.line===this.selection.end.line&&this.selection.anchor.offset===this.selection.end.offset);}
 stop(){this.drag=null;this.timer?.cancel();this.timer=null;this.scrollTop=null;}
 close(){this.stop();this.moves?.clear();}
 measure(id,height,part=null){if(!Number.isFinite(height)||height<=0)return false;if(part){const cells=this.cellHeights.get(id)||{};cells[part]=height;this.cellHeights.set(id,cells);height=Math.max(...Object.values(cells));}else if(this.cellHeights.has(id))return false;if(Math.abs((this.heights.get(id)||0)-height)<0.5)return false;this.heights.set(id,height);return true;}

 measureEditor(height,version=this.version){if(version!==this.version)return;const row=this.rows?.find(row=>row.kind==='editor');if(row&&this.measure(row.id,height,'editor'))this.send({type:'measure',version});}
 height(index){const row=this.rows[index],scale=this.owner.selectionScale||1;return this.heights.get(row?.id)||(row?.kind==='comment'?commentHeight(row.text):row?.kind==='editor'?INLINE_EDITOR_HEIGHT:row?.kind==='file-header'?34:22)*scale;}
 startTimer(cx){this.timer?.cancel();if(cx.timer)this.timer=cx.timer.every(100,cx=>this.tick(cx));}
 handle(event,cx){
  if(event.type==='pending'){const pending=this.moves?.get(event.motion);if(!pending||pending.version!==event.version||pending.source!==event.source)return;this.moves.delete(event.motion);event=pending;}
  if(event.version!=null&&event.version!==this.version)return;
  if(event.source!==this.source||this.source!==this.owner.diffChangeKey()){const before=this.snapshot();this.stop();this.selection=null;this.invalidate(before,cx);return;}
  if(event.type==='viewport'){this.viewport=event.bounds;this.position=event.position;return;}
  if(event.type==='row-move'){if(event.bounds)this.lastRow={id:event.rowId,bounds:event.bounds};this.scrollTop=null;if(this.drag?.kind!=='comment'||event.rowId===this.drag.end)return;}
  if(event.type==='move'&&this.drag?.kind!=='text')return;
  if(event.type==='copy'){if(!this.owner.inputFocused){const text=this.text();if(text)cx.write_to_clipboard(text);}return;}
  if(event.type==='measure'){
   const version=this.version,source=this.source;
   const flush=cx=>{
    if(version!==this.version||source!==this.source||source!==this.owner.diffChangeKey())return;
    this.measurementQueued=false;
    cx.notify(this.owner.diffViewport);
   };
   if(cx.timer?.after)cx.timer.after(24,flush);else flush(cx);
   return;
  }
  const before=this.snapshot(),wasDragging=Boolean(this.drag);
  if(event.type==='clear'){this.stop();this.selection=null;}
  else if(event.type==='cancel'||event.type==='leave'){this.stop();}
  else if(event.type==='copy'){if(!this.owner.inputFocused){const text=this.text();if(text)cx.write_to_clipboard(text);}}
  else if(event.type==='viewport'){this.viewport=event.bounds;this.position=event.position;}
  else if(event.type==='row-move'){
   this.moveComment(event.rowId);
   if(this.drag.moved&&!this.timer)this.startTimer(cx);
  }
  else if(event.type==='comment-down'){
   if(this.owner.hasUnsavedComment?.()){this.owner.message='Save or cancel the current comment before opening another';cx.notify();return;}
   const range=commentSelection(this.model,event.rowId,event.side);if(!range)return;
   this.selection=null;this.drag={kind:'comment',start:event.rowId,side:range.side,end:event.rowId,range};this.owner.selectionHandle?.focus();
  }else if(event.type==='down'||event.type==='move'){
   const offset=event.local_position&&event.bounds&&event.local_position.x>=event.bounds.width/2?event.end:event.start,point=this.point(event.rowId,event.side,offset);if(!point)return;
   if(event.type==='down'){
    const hadSelection=!this.isCollapsed();
    const unit=event.click_count>=3?'line':event.click_count===2?'word':'character';
    this.selection=unit==='character'?{anchor:event.modifiers?.shift&&this.selection?.anchor.key===point.key?this.selection.anchor:point,end:point}:unitSelection(this.model,point,unit,event.start);
    const clickComment=unit==='character'&&!event.modifiers?.shift&&!hadSelection?{rowId:event.rowId,side:event.side}:null;
    this.drag={kind:'text',unit,unitAnchor:unit==='character'?null:this.selection,clickComment};this.owner.selectionHandle?.focus();this.startTimer(cx);
   }else if(this.drag?.kind==='text'&&point.key===this.selection?.anchor.key){
    this.selection=this.drag.unitAnchor?extendUnit(this.drag.unitAnchor,unitSelection(this.model,point,this.drag.unit,event.start)):{...this.selection,end:point};
    if(!this.isCollapsed())this.drag.clickComment=null;
   }
  }else if(event.type==='up'){
   let range=this.drag?.kind==='comment'?this.drag.range:null;
   if(!range&&this.drag?.kind==='text'&&this.drag.clickComment&&this.isCollapsed()){
    if(this.owner.hasUnsavedComment?.()){this.owner.message='Save or cancel the current comment before opening another';cx.notify();}
    else range=commentSelection(this.model,this.drag.clickComment.rowId,this.drag.clickComment.side);
    this.selection=null;
   }
   this.stop();this.invalidate(before,cx,wasDragging);if(range)this.owner.commitCommentRange(range,cx);return;
  }
  this.invalidate(before,cx,wasDragging!==Boolean(this.drag));
 }
 moveComment(id){const range=commentSelection(this.model,this.drag.start,this.drag.side,id);if(range){this.drag.moved ||= id!==this.drag.start;this.drag.end=id;this.drag.range=range;}}
 tick(cx){
  if(!this.drag)return;
  const before=this.snapshot();
  if(this.owner.closed||this.source!==this.owner.diffChangeKey()||this.owner.selectionHandle?.is_focused?.()===false||(typeof window!=='undefined'&&window.is_window_active&&!window.is_window_active())){this.stop();this.invalidate(before,cx);return;}
  if(this.owner.isLargeMeasuredDiff?.(this.rows))return;
  const bounds=this.viewport,p=this.position;if(!bounds||!p||!this.lastRow)return;
  const edge=Math.min(28,bounds.height/4),direction=p.y<bounds.y+edge?-1:p.y>bounds.y+bounds.height-edge?1:0;if(!direction){this.scrollTop=null;return;}
  let top=this.scrollTop;
  if(top==null){top=this.model.rowIndices.get(this.lastRow.id);if(top==null)return;let remaining=this.lastRow.bounds.y-bounds.y;while(top>0&&remaining>0){top--;remaining-=this.height(top);}}
  const visible=this.visibleRange,requested=visible?(direction>0?visible.end:visible.start-1):top+direction;
  const nextTop=Math.max(0,Math.min(this.rows.length-1,requested));if(nextTop===top||visible&&(direction>0?visible.end>=this.rows.length:visible.start<=0))return;
  this.scrollTop=nextTop;if(this.owner.scrollDiffToItem)this.owner.scrollDiffToItem(nextTop,'top',this.rows);else this.owner.diffScroll?.scroll_to_item(nextTop,'top');cx.notify(this.owner.diffViewport);
  let index=nextTop,height=0;while(!visible&&index+1<this.rows.length&&height+this.height(index)<p.y-bounds.y){height+=this.height(index);index++;}
  const candidates=this.model.entries.filter(e=>e.displayIndex<=index);
  if(this.drag.kind==='comment'){const match=[...candidates].reverse().find(e=>commentSelection(this.model,this.drag.start,this.drag.side,e.rowId));if(match)this.moveComment(match.rowId);}
  else{const match=[...candidates].reverse().find(e=>e.key===this.selection.anchor.key);if(match){const point={key:match.key,line:match.line,rowId:match.rowId,offset:direction>0?match.text.length:0};this.selection=this.drag.unitAnchor?extendUnit(this.drag.unitAnchor,unitSelection(this.model,point,this.drag.unit)):{...this.selection,end:point};}}
  this.invalidate(before,cx);
 }
}
