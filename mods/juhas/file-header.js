import {View,div,svg} from 'gpui-kit';
import {h_flex} from 'gpui-base';
import {theme} from 'herdr';
import {uiMetrics,button,toggle,text,fileStatus} from './ui.js';
// Retained entities keep interactive controls out of virtual-row callbacks.
export default class FileHeader extends View {
 init(p){this.p=p;}
 render(){const type=uiMetrics();const {owner,fileId,comparisonId}=this.p,section=owner.allFileSections?.find(s=>s.file.id===fileId),t=theme();
  if(!section||section.comparison?.id!==comparisonId)return div().h(type.px(34));
  const file=section.file,width=owner.diffWidth||owner.width,reviewed=owner.isFileReviewed(file);
  const act=(kind,cx)=>{cx.stop_propagation();owner.headerAction({kind,fileId,comparisonId});};
  const row=h_flex().w_full().min_w(0).gap(6).items_center()
   .child(svg(`mods/juhas/icons/chevron-${section.collapsed?'right':'down'}.svg`).size(13).flex_none().text_color(t.muted))
   .child(fileStatus(file))
   .child(h_flex().flex_1().min_w(0).gap(6).items_center()
    .child(text(file.newPath).min_w(0).truncate().text_ellipsis_middle())
   .when(Boolean(this.hovered),e=>e.child(button(`copy-path-${fileId}`,svg('mods/juhas/icons/copy.svg').size(13),(_e,cx)=>{cx.stop_propagation();cx.write_to_clipboard(file.newPath);},{tooltip:'Copy path'}).w(22).px(0)))
   )
   .when(Boolean(section.loading||section.limited),e=>e.child(text(section.loading?'Loading…':'Limited',true)))
   .when(file.additions!=null,e=>e.child(text('+'+file.additions).flex_none().text_color(t.ansi2).text_size(type.caption)).child(text('−'+file.deletions).flex_none().text_color(t.ansi1).text_size(type.caption)))
   .child(toggle(`viewed-${fileId}`,svg('mods/juhas/icons/check.svg').size(14).text_color(reviewed?t.ansi2:t.muted),reviewed,(checked,cx)=>{cx.stop_propagation();owner.headerAction({kind:'viewed',fileId,comparisonId,checked});},{tooltip:reviewed?'Mark as not viewed':'Mark as viewed'}).w(28).px(0))
   .child(button(`comment-${fileId}`,svg('mods/juhas/icons/comment.svg').size(14),(_e,cx)=>act('comment',cx),{tooltip:'Comment on this file'}).w(28).px(0).disabled(Boolean(owner.busy)))
   .child(button(`context-${fileId}`,svg(`mods/juhas/icons/${section.patch?.fullContext?'fold':'unfold'}-vertical.svg`).size(14),(_e,cx)=>act('context',cx),{tooltip:section.patch?.fullContext?'Fold unchanged context':'Show whole file'}).w(28).px(0).disabled(Boolean(owner.busy||file.binary||section.patch?.modeOnly)));
  return button(`section-${fileId}`,row,(_e,cx)=>act('toggle',cx),{tooltip:`${section.collapsed?'Expand':'Collapse'} ${file.newPath}`})
   .h(type.px(34)).w(width||'100%').min_w(0).px(8).rounded(0).justify_start().bg(t.background).hover(e=>e.bg(t.hover))
   .on_hover((hovered,cx)=>{if(this.hovered!==hovered){this.hovered=hovered;cx.notify();}});
 }
}
