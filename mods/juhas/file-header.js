import {View,div} from 'gpui-kit';
import {h_flex} from 'gpui-base';
import {theme} from 'herdr';
import {button,checkbox,text} from './ui.js';
// Retained entities keep interactive controls out of virtual-row callbacks.
export default class FileHeader extends View {
 init(p){this.p=p;}
 render(){const {owner,fileId,comparisonId}=this.p,section=owner.allFileSections?.find(s=>s.file.id===fileId),t=theme();
  if(!section||section.comparison?.id!==comparisonId)return div().h(34);
  const file=section.file;
  return h_flex().h(34).w(owner.width?Math.max(200,owner.width-18):'100%').min_w(0).px(8).gap(6).items_center().bg(t.raised).border_b(1).border_color(t.border)
   .on_mouse_down('left',(_e,cx)=>cx.stop_propagation())
   .child(button(`section-${fileId}`,section.collapsed?'▸':'▾',(_e,cx)=>owner.headerAction({kind:'toggle',fileId,comparisonId}),{tooltip:section.collapsed?'Expand file':'Collapse file'}).w(28))
   .child(text(file.newPath).font_semibold().min_w(0).truncate().text_ellipsis_start().tooltip(file.newPath))
   .when(file.additions!=null,e=>e.child(text('+'+file.additions).text_color(t.ansi2)).child(text('−'+file.deletions).text_color(t.ansi1)))
   .child(div().flex_1())
   .when(Boolean(section.loading||section.limited),e=>e.child(text(section.loading?'Loading…':'Limited',true)))
   .child(checkbox(`viewed-${fileId}`,'Viewed',owner.isFileReviewed(file),(checked,cx)=>owner.headerAction({kind:'viewed',fileId,comparisonId,checked})))
   .child(button(`comment-${fileId}`,'Comment',(_e,cx)=>owner.headerAction({kind:'comment',fileId,comparisonId}),{tooltip:'Comment on this file'}).disabled(Boolean(owner.busy)));
 }
}
