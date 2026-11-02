import {View,svg} from 'gpui-kit';
import {v_flex,h_flex,Textarea} from 'gpui-base';
import {theme} from 'herdr';
import {button,text} from './ui.js';
import {INLINE_EDITOR_HEIGHT} from './comments.js';
export default class InlineEditor extends View {
 init(p){this.p=p;}
 render(){const p=this.p,t=theme(),target=p.owner.target,location=target?.side?`${target.side==='old'?'Original':'Modified'} · ${target.startLine}${target.endLine!==target.startLine?'–'+target.endLine:''}`:'File comment';
  return v_flex().h(INLINE_EDITOR_HEIGHT).w_full().min_w(0).p(8)
   .child(v_flex().flex_1().min_h(0).min_w(0).rounded(8).border_1().border_color(t.border).bg(t.raised).p(8).gap(6)
    .child(h_flex().h(20).flex_none().gap(6).items_center().child(svg('mods/juhas/icons/comment.svg').size(13)).child(text(`${p.owner.editId?'Edit comment':'New comment'} · ${location}`).font_semibold()))
    .child(Textarea.new(p.input).flex_1().min_h(0).min_w(0).px(8).py(6).rounded(6).bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13))
    .child(h_flex().flex_none().gap(6).items_center().flex_wrap()
     .child(button('save-inline-comment','Save',()=>p.save(),{primary:true}).disabled(Boolean(p.owner.busy)))
     .child(button('cancel-inline-comment','Cancel',()=>p.cancel()))
     .child(text('Click another line on the same side to extend',true))));
 }
}
