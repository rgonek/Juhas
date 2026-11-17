import {View,svg} from 'gpui-kit';
import {h_flex} from 'gpui-base';
import {theme} from 'herdr';
import {uiMetrics,button,text} from './ui.js';
import {commentHeight} from './comments.js';
// Native virtual rows cannot register event handlers. Keep interactions in a retained view.
export default class CommentCard extends View {
 init(p){this.p=p;}
 render(){const {owner,id}=this.p,draft=owner.controller.session().drafts.find(d=>d.id===id),type=uiMetrics(),t=theme();if(!draft)return h_flex();
  return h_flex().id('comment-'+id).h(type.px(commentHeight(draft.body))).w_full().min_w(0).px(12).py(type.px(6)).gap(10).items_center().border_l(2).border_color(t.accent).bg(t.raised)
   .on_hover((hovered,cx)=>{if(this.hovered!==hovered){this.hovered=hovered;cx.notify();}})
   .child(svg('mods/juhas/icons/comment.svg').size(14).flex_none().text_color(t.muted))
   .child(text(draft.body).flex_1().min_w(0).max_h(type.px(commentHeight(draft.body)-12)).overflow_y_scrollbar().whitespace_normal())
   .child(button('delete-inline-'+id,svg('mods/juhas/icons/trash.svg').size(14),(_e,cx)=>{cx.stop_propagation();owner.headerAction({kind:'remove-comment',id});},{tooltip:'Delete comment'}).opacity(this.hovered?1:0));
 }
}
