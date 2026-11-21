import {View,div,svg} from 'gpui-kit';
import {theme} from 'herdr';
import {uiMetrics,button} from './ui.js';
// Native entities own row handlers; virtual render callbacks only mount them.
export default class DiffRow extends View {
 init(p){this.p=p;this.hovered=false;this.side=null;}
 pointer(event,cx){const {row,split}=this.p;let side=null;
  if(split&&row.kind==='pair'&&event.local_position&&event.bounds){side=event.local_position.x<event.bounds.width/2?'old':'new';}
  else if(row.kind==='line')side=row.side==='old'?'old':'new';
  if(this.side!==side){this.side=side;if(this.p.owner.experimentalDiff)cx.notify();}return side;
 }
 interaction(){const {owner,row,source}=this.p,runtime=owner.diffSelection,version=runtime?.version;if(!owner.experimentalDiff||!runtime?.model)return null;return {source:side=>runtime.point(row.id,side)?{
   selectedOffsets:()=>runtime.selectedOffsets(row.id,side),
   height:owner.readingOptions?.wrap?height=>{if(runtime.measure(row.id,height,side))runtime.send({type:'measure',source,version});}:null,
   down:(glyph,event,cx)=>{cx.stop_propagation();runtime.send({type:'down',source,version,rowId:row.id,side,start:glyph.start,end:glyph.end,click_count:event.click_count,modifiers:event.modifiers,local_position:event.local_position,bounds:event.bounds});},
   move:(glyph,event)=>{if(runtime.drag?.kind==='text')runtime.send({type:'move',source,version,rowId:row.id,side,start:glyph.start,end:glyph.end,local_position:event.local_position,bounds:event.bounds});}
  }:null};}
 measure(size){if(this.p.owner.diffSelection?.measure(this.p.row.id,size.height))this.p.owner.diffSelection.send({type:'measure',source:this.p.source});}
 render(){
  const {owner,content}=this.p;
  if(!owner.experimentalDiff)return content(null);
  const {row,split}=this.p,version=owner.diffSelection?.version,type=uiMetrics(),t=theme();
  const hover=(value,cx)=>{if(this.hovered!==value){this.hovered=value;if(!value)this.side=null;else if(row.kind==='line')this.side=row.side==='old'?'old':'new';cx.notify();}};
  const line=row.kind==='pair'?(this.side==='old'?row.old:this.side==='new'?row.next:null):row;
  const runtime=this.p.owner.experimentalDiff&&this.p.owner.diffSelection?.model?this.p.owner.diffSelection:null;
  const gesture=(type)=>runtime.send({type,version,source:this.p.source,rowId:row.id,side:this.side});
  return div().id('code-'+row.id).relative().w_full().min_w(0).when(Boolean(runtime),e=>e.on_hover(hover))
   .on_mouse_move((event,cx)=>{this.pointer(event,cx);if(runtime?.drag)runtime.send({type:'row-move',version,source:this.p.source,rowId:row.id,side:this.side,bounds:event.bounds});})
   .when(Boolean(this.p.owner.readingOptions?.wrap),e=>e.on_size_change(size=>this.measure(size)))
   .child(content(this.interaction()))
   .when(Boolean(runtime&&this.hovered&&line),root=>{
    const plus=button('add-'+row.id+'-'+this.side,svg('mods/juhas/icons/plus.svg').size(type.px(12)).flex_none(),
     null,
     {tooltip:'Comment on this line'}).w(type.px(20)).h(type.px(20)).px(0).gap(0).items_center().justify_center()
     .rounded(4).bg(t.ansi4||t.accent).text_color(t.accent_foreground).hover(e=>e.bg(t.ansi4||t.accent)).active(e=>e.bg(t.ansi4||t.accent));
    plus.on_mouse_down('left',(_event,cx)=>{cx.stop_propagation();gesture('comment-down');})
     .on_mouse_up('left',(_event,cx)=>{cx.stop_propagation();gesture('up');})
     .on_key_down((event,cx)=>{if(['enter','space',' '].includes(event.key?.toLowerCase())){cx.stop_propagation();gesture('comment-down');gesture('up');}});
    return root.child(div().absolute().left(split&&this.side==='new'?'50%':0).top(type.px(1)).pl(3).child(plus));
   });
 }
}
