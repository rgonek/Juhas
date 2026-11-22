import {View,div} from 'gpui-kit';
// Native entities own row handlers; virtual render callbacks only mount them.
export default class DiffRow extends View {
 init(p){this.p=p;}
 interaction(){const {owner,row,source}=this.p,runtime=owner.diffSelection,version=runtime?.version;if(!owner.experimentalDiff||!runtime?.model)return null;const dragging=runtime.drag?.kind==='text';return {source:side=>runtime.point(row.id,side)?{
   selectedOffsets:()=>runtime.selectedOffsets(row.id,side),
   height:owner.readingOptions?.wrap&&runtime.drag?height=>{if(runtime.version===version&&runtime.source===source)runtime.measure(row.id,height,side);}:null,
   down:(glyph,event,cx)=>{cx.stop_propagation();runtime.send({type:'down',source,version,rowId:row.id,side,start:glyph.start,end:glyph.end,click_count:event.click_count,modifiers:event.modifiers,local_position:event.local_position,bounds:event.bounds});},
   move:dragging?(glyph,event)=>{if(runtime.drag?.kind==='text')runtime.send({type:'move',source,version,rowId:row.id,side,start:glyph.start,end:glyph.end,local_position:event.local_position,bounds:event.bounds});}:null,
   commentDown:()=>runtime.send({type:'comment-down',version,source,rowId:row.id,side}),
   commentUp:()=>runtime.send({type:'up',version,source,rowId:row.id,side})
  }:null};}
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
  return div().id('code-'+row.id).w_full().min_w(0)
   .when(Boolean(runtime?.drag),e=>e.on_mouse_move(event=>{const side=split&&row.kind==='pair'?(event.local_position&&event.bounds&&event.local_position.x<event.bounds.width/2?'old':'new'):row.side==='old'?'old':'new';runtime.send({type:'row-move',version,source:this.p.source,rowId:row.id,side,bounds:event.bounds});}))
   .when(Boolean(owner.readingOptions?.wrap&&runtime?.drag),e=>e.on_size_change(size=>this.measure(size,version,this.p.source)))
   .child(content(this.interaction()));
 }
}
