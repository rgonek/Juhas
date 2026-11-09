import {View,div,svg} from 'gpui-kit';
import {h_flex} from 'gpui-base';
import {theme} from 'herdr';
import {uiMetrics,button,text} from './ui.js';
import {commentHeight} from './comments.js';
// Native entities own row handlers; virtual render callbacks only mount them.
export default class DiffRow extends View {
 init(p){this.p=p;this.hovered=false;this.side=null;}
 action(kind,side=null){const {owner,row,source}=this.p;owner.headerAction({kind:'diff-row',operation:kind,row,side,source});}
 pointer(event,cx){const {row,split}=this.p;let side=null;
  if(split&&row.kind==='pair'&&event.local_position&&event.bounds){side=event.local_position.x<event.bounds.width/2?'old':'new';}
  else if(row.kind==='line')side=row.side==='old'?'old':'new';
  if(this.side!==side){this.side=side;cx.notify();}return side;
 }
 interaction(){const {owner,row,source}=this.p,runtime=owner.diffSelection,version=runtime?.version;if(!runtime)return null;return {source:side=>runtime.point(row.id,side)?{
   selected:(start,end)=>runtime.selected(row.id,side,start,end),
   height:height=>{if(runtime.measure(row.id,height,side))runtime.send({type:'measure',source,version});},
   down:(glyph,event,cx)=>{cx.stop_propagation();runtime.send({type:'down',source,version,rowId:row.id,side,start:glyph.start,end:glyph.end,click_count:event.click_count,modifiers:event.modifiers,local_position:event.local_position,bounds:event.bounds});},
   move:(glyph,event)=>runtime.send({type:'move',source,version,rowId:row.id,side,start:glyph.start,end:glyph.end,local_position:event.local_position,bounds:event.bounds})
  }:null};}
 measure(size){if(this.p.owner.diffSelection?.measure(this.p.row.id,size.height))this.p.owner.diffSelection.send({type:'measure',source:this.p.source});}
 render(){const {row,split,content}=this.p,version=this.p.owner.diffSelection?.version,type=uiMetrics(),t=theme();
  const hover=(value,cx)=>{if(this.hovered!==value){this.hovered=value;if(!value)this.side=null;else if(row.kind==='line')this.side=row.side==='old'?'old':'new';cx.notify();}};
  if(row.kind==='editor')return div().w_full().min_w(0).on_size_change(size=>this.measure(size)).child(content());
  if(row.kind==='comment')return h_flex().id('saved-'+row.draft.id).h(type.px(commentHeight(row.text))).w_full().min_w(0).px(12).py(type.px(6)).gap(10).items_center().border_l(2).border_color(t.accent).bg(t.raised)
   .on_hover(hover).on_click((_event,cx)=>{cx.stop_propagation();this.action('edit');})
   .child(svg('mods/juhas/icons/comment.svg').size(14).flex_none().text_color(t.muted))
   .child(text(row.text).flex_1().min_w(0).max_h(type.px(commentHeight(row.text)-12)).overflow_y_scrollbar().whitespace_normal())
   .child(div().w(24).flex_none().when(this.hovered,e=>e.child(button('delete-'+row.draft.id,svg('mods/juhas/icons/trash.svg').size(14),(_event,cx)=>{cx.stop_propagation();this.action('delete');},{tooltip:'Delete comment'}).w(24).h(24).px(0))));
  const line=row.kind==='pair'?(this.side==='old'?row.old:this.side==='new'?row.next:null):row;
  return div().id('code-'+row.id).relative().w_full().min_w(0).on_hover(hover).on_mouse_move((event,cx)=>{this.pointer(event,cx);this.p.owner.diffSelection?.send({type:'row-move',version,source:this.p.source,rowId:row.id,side:this.side,bounds:event.bounds});}).on_size_change(size=>this.measure(size))

   .child(content(this.interaction()))
   .when(Boolean(this.hovered&&line),e=>e.child(div().absolute().left(split&&this.side==='new'?'50%':0).top(type.px(1)).pl(3).child(button('add-'+row.id+'-'+this.side,svg('mods/juhas/icons/plus.svg').size(type.px(12)).flex_none(),(_event,cx)=>{cx.stop_propagation();if(!this.p.owner.diffSelection)this.action('select',this.side);},{tooltip:'Comment on this line'}).w(type.px(20)).h(type.px(20)).px(0).gap(0).items_center().justify_center().rounded(4).bg(t.ansi4||t.accent).text_color(t.accent_foreground).hover(e=>e.bg(t.ansi4||t.accent)).active(e=>e.bg(t.ansi4||t.accent)).on_mouse_down('left',(_event,cx)=>{cx.stop_propagation();this.p.owner.diffSelection?.send({type:'comment-down',version,source:this.p.source,rowId:row.id,side:this.side});}).on_mouse_up('left',(_event,cx)=>{cx.stop_propagation();this.p.owner.diffSelection?.send({type:'up',version,source:this.p.source});}).on_key_down((event,cx)=>{if(this.p.owner.diffSelection&&['enter','space',' '].includes(event.key?.toLowerCase())){cx.stop_propagation();this.p.owner.diffSelection.send({type:'comment-down',version,source:this.p.source,rowId:row.id,side:this.side});this.p.owner.diffSelection.send({type:'up',version,source:this.p.source});}}))));
 }
}
