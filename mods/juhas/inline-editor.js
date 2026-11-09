import {View,div} from 'gpui-kit';
import {v_flex,h_flex,Textarea} from 'gpui-base';
import {theme} from 'herdr';
import {uiMetrics,button,text} from './ui.js';
import {INLINE_EDITOR_HEIGHT,INLINE_EDITOR_MAX_HEIGHT} from './comments.js';
export default class InlineEditor extends View {
 init(p,cx){this.p=p;this.handle=cx.focus_handle();p.input.set_rows(2);p.input.set_auto_grow(2,5);
  p.input.set_submit_on_enter?.(false);
  cx.bind_keys([{keystroke:'ctrl-enter',action:'juhas.comment.submit',context:'JuhasComment'},{keystroke:'cmd-enter',action:'juhas.comment.submit',context:'JuhasComment'}]);
 }
 submit(cx){cx.stop_propagation();if(!this.p.owner.busy)this.p.save();}
 render(){const type=uiMetrics();const p=this.p,t=theme();
  return v_flex().track_focus(this.handle).key_context('JuhasComment').on_action('juhas.comment.submit',(_e,cx)=>this.submit(cx))
   .min_h(type.px(INLINE_EDITOR_HEIGHT)).max_h(type.px(INLINE_EDITOR_MAX_HEIGHT)).w_full().min_w(0).px(14).py(type.px(8)).gap(6)
   .child(Textarea.new(p.input).min_h(type.px(64)).max_h(type.px(136)).line_height(type.lineHeight).flex_none().min_w(0).px(8).py(type.px(6)).rounded(6)
    .bg(t.background).border_1().border_color(t.accent).text_color(t.foreground).text_size(type.body))
   .child(h_flex().flex_none().gap(6).items_center()
    .child(text('Ctrl/⌘ Enter to comment',true).text_size(type.caption))
    .child(div().flex_1())
    .child(button('cancel-inline-comment','Cancel',()=>p.cancel()))
    .child(button('save-inline-comment',p.owner.editId?'Save changes':'Comment',()=>p.save(),{primary:true}).disabled(Boolean(p.owner.busy))));
 }
}
