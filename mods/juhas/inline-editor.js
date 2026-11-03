import {View,svg} from 'gpui-kit';
import {v_flex,h_flex,Textarea} from 'gpui-base';
import {theme} from 'herdr';
import {button,text} from './ui.js';
import {INLINE_EDITOR_HEIGHT,INLINE_EDITOR_MAX_HEIGHT} from './comments.js';
export default class InlineEditor extends View {
 init(p,cx){this.p=p;this.handle=cx.focus_handle();p.input.set_rows(2);p.input.set_auto_grow(2,5);
  // Native text editing owns Enter and IME; ancestor key bindings cannot reliably intercept it.
  // Older Herdr hosts insert a line break before reporting submit.
  p.input.set_submit_on_enter?.(true);
  p.input.on('submit',(event,cx)=>{if(!event.shift)this.submit(cx);});
 }
 submit(cx){cx.stop_propagation();if(!this.p.owner.busy)this.p.save();}
 render(){const p=this.p,t=theme(),target=p.owner.target,location=target?.scope==='general'?'General review':target?.side?`${target.side==='old'?'Original':'Modified'} · ${target.startLine}${target.endLine!==target.startLine?'–'+target.endLine:''}`:'File comment';
  return v_flex().track_focus(this.handle).min_h(INLINE_EDITOR_HEIGHT).max_h(INLINE_EDITOR_MAX_HEIGHT).w_full().min_w(0).p(8)
   .child(v_flex().min_h(0).min_w(0).rounded(8).border_1().border_color(t.border).bg(t.raised).p(8).gap(6)
    .child(h_flex().h(20).flex_none().gap(6).items_center().child(svg('mods/juhas/icons/comment.svg').size(13)).child(text(`${p.owner.editId?'Edit comment':'New comment'} · ${location}`).font_semibold()))
    .child(Textarea.new(p.input).min_h(48).max_h(102).line_height('18px').flex_none().min_h(0).min_w(0).px(8).py(6).rounded(6).bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13))
    .child(h_flex().flex_none().gap(6).items_center().flex_wrap()
     .child(button('save-inline-comment','Save (Enter)',()=>p.save(),{primary:true}).disabled(Boolean(p.owner.busy)))
     .child(button('cancel-inline-comment','Cancel',()=>p.cancel()))
     .child(text('Shift+Enter: new line',true))));
 }
}
