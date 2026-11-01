import {div,PathBuilder,svg} from 'gpui-kit';
import {h_flex,v_flex,v_virtual_list,Scrollbar,Input,Button,Checkbox,Toggle,Tabs,Tab,Popover} from 'gpui-base';
import {theme,settings} from 'herdr';
import {layoutGraph} from './graph.js';
import {fileRows,splitRows} from './review-ui.js';
import {annotatePatch} from './comments.js';
export function nativeFrame(id){const t=theme();return v_flex().id(id).size_full().min_h(0).min_w(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13);}
function control(element,{active=false,primary=false,segment=false}={}){const t=theme();return element.h(28).flex_none().px(8).flex().gap(6).items_center().justify_center().rounded(6).text_size(12).cursor_pointer()
 .text_color(primary?t.solid_foreground:t.foreground).bg(primary?t.solid:active?t.selected:segment?t.chrome:t.background)
 .hover(el=>el.bg(primary?t.accent:t.hover)).active(el=>el.bg(primary?t.accent:t.selected));}
export function button(id,label,action,options={}){
 const name=options.tooltip||(typeof label==='string'?label:'Action');return control(Button.new(id),options).selected(Boolean(options.active)).tab_index(0).accessibility_label(name).tooltip(name)
  .when(Boolean(action),el=>el.on_click(action)).child(label);
}
export function checkbox(id,label,checked,change,{tooltip=label}={}){
 const t=theme();return control(Checkbox.new(id)).checked(Boolean(checked)).tab_index(0).accessibility_label(label).on_change(change)
  .child(h_flex().gap(6).items_center().tooltip(tooltip)
   .child(div().size(14).flex_none().rounded(3).border_1().border_color(checked?t.accent:t.border).bg(checked?t.accent:t.background).flex().items_center().justify_center().text_size(11).text_color(t.accent_foreground).child(checked?'✓':''))
   .child(label));
}
export function toggle(id,label,pressed,change,{tooltip=label}={}){
 return control(Toggle.new(id),{active:Boolean(pressed)}).pressed(Boolean(pressed)).tab_index(0).accessibility_label(label).on_change(change).child(div().tooltip(tooltip).child(label));
}
export function tabs(id,items,selected,select){
 const t=theme();return Tabs.new(id).accessibility_label(id).flex().self_start().gap(2).p(3).rounded(9).bg(t.chrome).flex_wrap()
  .children(items.map((item,index)=>control(Tab.new(`${id}-${item.value}`),{active:item.value===selected,segment:true}).selected(item.value===selected).set_position(index+1,items.length).accessibility_label(item.label)
   .on_click((_event,cx)=>select(item.value,cx)).child(div().tooltip(item.tooltip||item.label).child(item.label))));
}
export function popover(id,label,open,change,content,{tooltip=label}={}){
 const t=theme();return Popover.new(id).open(Boolean(open)).on_open_change(change).trigger(button(`${id}-trigger`,label,null,{tooltip}))
  .when(Boolean(open),el=>el.content(v_flex().w(380).h(240).min_h(0).min_w(0).rounded(8).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).child(content())));
}
export function field(state,_placeholder,width){const t=theme();return Input.new(state).h(32).min_w(0).when(Boolean(width),e=>e.w(width)).when(!width,e=>e.flex_1()).px(8).rounded(8).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12);}
export function text(value,dim=false){const t=theme();return div().text_size(12).text_color(dim?t.muted:t.foreground).child(value);}
export function virtualList(id,items,height,row,click){return v_flex().relative().size_full().flex_1().min_h(0).min_w(0).child(v_virtual_list(id,items.length,height,i=>String(items[i].id??items[i].oid??i),range=>items.slice(range.start,range.end).map(row)).on_item_click(click).size_full()).child(Scrollbar.vertical(id).viewport_from_layout().absolute().inset_0());}
export function section(title){const t=theme();return div().h(28).flex_none().px(10).py(6).text_size(10).font_semibold().text_color(t.muted).bg(t.chrome).child(title.toUpperCase());}
export function graphCell(row){
 const t=theme(),colors=[t.ansi4,t.ansi2,t.ansi5,t.ansi3,t.ansi6];const x=lane=>8+lane*11;const paths=[];
 for(let i=0;i<row.before.length;i++)if(row.before[i]&&i!==row.lane){const to=row.after.indexOf(row.before[i]);if(to>=0)paths.push(window.paint_path(PathBuilder.stroke(1.5).move_to(x(i),0).line_to(x(to),26).build(),colors[i%colors.length]).absolute().inset_0());}
 paths.push(window.paint_path(PathBuilder.stroke(1.5).move_to(x(row.lane),0).line_to(x(row.lane),13).build(),colors[row.lane%colors.length]).absolute().inset_0());
 for(const e of row.edges)paths.push(window.paint_path(PathBuilder.stroke(1.5).move_to(x(e.from),13).line_to(x(e.to),26).build(),colors[e.to%colors.length]).absolute().inset_0());
 return div().relative().w(Math.min(120,Math.max(28,(Math.max(row.before.length,row.after.length)+1)*11))).h(26).flex_none().overflow_hidden().children(paths).child(div().absolute().left(x(row.lane)-3).top(10).size(6).rounded(3).bg(colors[row.lane%colors.length]));
}
export function historyPane(view,cx){
 const s=view.controller.state,t=theme(),rows=layoutGraph(s.history).rows;
 const first=s.history.findIndex(c=>c.oid===(view.commitAnchor||s.comparison?.scope.base)),last=s.history.findIndex(c=>c.oid===s.comparison?.targetOid);
 const selected=(c,i)=>view.rangePicking?c.oid===view.commitAnchor:s.comparison?.scope.kind==='range'?i>=Math.min(first,last)&&i<=Math.max(first,last):s.comparison?.targetOid===c.oid;
 const list=virtualList(`${view.id}-history`,s.history,26,c=>{const i=s.history.indexOf(c);return h_flex().h(26).px(4).gap(6).items_center().when(selected(c,i),e=>e.bg(t.selected))
  .tooltip(`${c.subject}\n${c.author} · ${new Date(c.timestamp*1000).toLocaleString()}\n${c.oid}`)
  .child(graphCell(rows[i])).child(div().flex_1().min_w(0).truncate().text_size(12).text_color(c.parents.length>1?t.muted:t.foreground).child(`${c.refs?.length?'['+c.refs.join(', ')+'] ':''}${c.subject}`))
  .child(div().w(95).flex_none().truncate().text_size(11).text_color(t.muted).child(c.author))
  .child(div().w(60).flex_none().text_size(10).text_color(t.dim).child(c.oid.slice(0,8)));},(id,cx)=>view.selectCommit(id,cx));
 const filter=(ref,cx)=>{view.historyRef=ref;view.work(cx,()=>view.controller.loadHistory(view.filters()));};
 const commit=s.history.find(c=>c.oid===s.comparison?.targetOid);
 return v_flex().size_full().min_w(0).min_h(0).child(h_flex().min_h(34).flex_none().items_center().gap(4).flex_wrap()
  .child(tabs('history-filter',[{value:'HEAD',label:'Current',tooltip:'Show history reachable from the current branch'},{value:'all',label:'All branches'}],view.historyRef,(ref,cx)=>filter(ref,cx)))
  .child(checkbox('graph-remotes','Remotes',view.remotes,(checked,cx)=>{view.remotes=checked;view.work(cx,()=>view.controller.loadHistory(view.filters()));},{tooltip:'Include remote branches in All branches'})))
  .child(list).when(Boolean(view.detailsOpen&&commit),e=>e.child(v_flex().flex_none().max_h(130).overflow_y_scrollbar().p(10).gap(5).border_t(1).border_color(t.border)
    .child(text(s.details?.subject||commit.subject).font_semibold()).child(text(s.details?.author||`${commit.author} · ${new Date(commit.timestamp*1000).toLocaleString()}`,true)).child(text(commit.oid,true)).child(text(s.details?.body||'',true)).child(text(commit.refs.join(', '),true))))
  .when(s.hasMore,e=>e.child(button('history-more','Load 300 more',(_e,cx)=>view.work(cx,()=>view.controller.loadHistory(view.filters(),true)))));
}
export function filesPane(view){
 const s=view.controller.state,t=theme(),drafts=view.controller.session().drafts,rows=fileRows(s.files,view.fileTree,view.collapsedDirs||new Set());
 const counts=new Map();for(const d of drafts)if(d.repoKey===s.repo?.key)counts.set(d.newPath,(counts.get(d.newPath)||0)+1);
 return v_flex().size_full().min_w(0).min_h(0).child(h_flex().h(30).flex_none().items_center().child(section(`Files · ${s.files.length}`).flex_1())
  .child(toggle('file-tree','Tree',view.fileTree,(pressed,cx)=>{view.fileTree=pressed;cx.notify();},{tooltip:'Show files as a directory tree'})))
 .child(virtualList(`${view.id}-files`,rows,29,f=>{
  if(f.directory)return h_flex().h(29).pl(9+f.depth*14).items_center().text_size(12).text_color(t.muted).child(`${f.closed?'▸':'▾'}  ${f.name}`);
  const count=counts.get(f.newPath)||0;return h_flex().h(29).pl(9+(f.depth||0)*14).pr(9).gap(7).items_center().when(s.file?.id===f.id,e=>e.bg(t.selected)).tooltip(f.newPath)
   .child(text(f.status,true).w(16)).child(div().flex_1().min_w(0).truncate().text_size(12).text_color(f.status==='A'?t.ansi2:f.status==='D'?t.ansi1:t.ansi4).child(view.fileTree?f.name:f.newPath))
   .when(f.additions!=null,e=>e.child(text('+'+f.additions).text_color(t.ansi2)).child(text('−'+f.deletions).text_color(t.ansi1)))
   .when(count>0,e=>e.child(h_flex().gap(3).items_center().tooltip('Saved comments').child(svg('mods/git-review/icons/comment.svg').size(12).text_color(t.accent)).child(text(String(count)).text_color(t.accent))));
 },(id,cx)=>{const f=rows.find(r=>r.id===id);if(f?.directory){view.collapsedDirs??=new Set();if(view.collapsedDirs.has(f.path))view.collapsedDirs.delete(f.path);else view.collapsedDirs.add(f.path);cx.notify();}else view.selectFile(id,cx);}));
}
function codeCell(row,side,t){
 const line=row?.[side==='old'?'oldLine':'newLine'];return h_flex().flex_1().min_w(0).h(22).gap(8).px(8).items_center().overflow_hidden()
  .bg(row?.side==='old'?t.ansi1+'18':row?.side==='new'?t.ansi2+'18':t.background)
  .child(div().w(36).flex_none().text_right().text_color(t.dim).child(String(line??'')))
  .child(div().text_color(row?.side==='old'?t.ansi1:row?.side==='new'?t.ansi2:t.foreground).child(row?.text.replace(/\t/g,'    ')||''));
}
export function diffPane(view){
 const s=view.controller.state,t=theme(),annotated=annotatePatch(s.patch,view.controller.session().drafts,s.comparison?.id,s.file?.newPath),split=view.diffMode==='split';
 const rows=split?splitRows(annotated):annotated;view.patchRows=annotated;
 let body;
 if(!s.file)body=text('Select a file to review').p(20);
 else if(!s.patch)body=text(view.busy?'Reading diff…':'No diff loaded').p(20);
 else if(s.patch.binary)body=text('Binary file changed · use File comment to leave feedback').p(20);
 else if(s.patch.modeOnly)body=text('File mode or submodule changed · no text hunks').p(20);
 else body=virtualList(`${view.id}-diff-${split?'split':'unified'}`,rows,rows.map(r=>r.kind==='comment'?44:22),row=>{
  if(row.kind==='comment')return div().h(44).px(12).py(5).bg(t.raised).border_l(3).border_color(t.accent).text_size(12).text_color(t.foreground).overflow_hidden().tooltip(row.text).child(`Comment · ${row.text}`);
  if(row.kind==='hunk')return div().h(22).px(10).bg(t.raised).text_color(t.accent).font_family(settings().font_family).text_size(11).child(row.text);
  if(row.kind==='pair')return h_flex().h(22).font_family(settings().font_family).text_size(12).child(codeCell(row.old,'old',t)).child(div().w(1).h_full().bg(t.border)).child(codeCell(row.next,'new',t));
  const mark=row.side==='new'?'+':row.side==='old'?'-':' ',color=row.side==='new'?t.ansi2:row.side==='old'?t.ansi1:t.foreground;
  const selected=view.target?.comparisonId===s.comparison?.id&&view.target?.newPath===s.file?.newPath&&(row.side==='context'?'new':row.side)===view.target?.side&&(row.side==='old'?row.oldLine:row.newLine)>=view.target?.startLine&&(row.side==='old'?row.oldLine:row.newLine)<=view.target?.endLine;
  return h_flex().h(22).px(8).gap(8).items_center().font_family(settings().font_family).text_size(12).bg(selected?t.selected:row.side==='new'?t.ansi2+'18':row.side==='old'?t.ansi1+'18':t.background)
   .child(div().w(36).flex_none().text_right().text_color(t.dim).child(String(row.oldLine??''))).child(div().w(36).flex_none().text_right().text_color(t.dim).child(String(row.newLine??'')))
   .child(div().text_color(color).child(`${mark} ${row.text.replace(/\t/g,'    ')}`));
 },(id,cx)=>{const row=rows.find(r=>r.id===id);if(row?.kind==='pair'){const line=view.commentSide==='old'?(row.old||row.next):(row.next||row.old);if(line)view.selectLine(line.id,cx);}else view.selectLine(id,cx);});
 const minWidth=split?Math.max(800,...rows.filter(r=>r.kind==='pair').map(r=>100+Math.max(r.old?.text.length||0,r.next?.text.length||0)*14.6)):Math.max(600,...annotated.filter(r=>r.kind!=='comment').map(r=>100+r.text.length*7.3));
 return v_flex().size_full().min_w(0).min_h(0)
  .child(h_flex().min_h(36).flex_none().px(10).gap(4).flex_wrap().items_center().border_b(1).border_color(t.border)
   .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).text_size(12).child(s.file?.newPath||'Diff'))
   .when(Boolean(s.file),e=>e.child(tabs('diff-mode',[{value:'unified',label:'Unified'},{value:'split',label:'Side by side'}],view.diffMode||'unified',(mode,cx)=>{view.diffMode=mode;cx.notify();}))
    .when(split,e=>e.child(tabs('comment-side',[{value:'old',label:'Old'},{value:'new',label:'New'}],view.commentSide||'new',(side,cx)=>{view.commentSide=side;cx.notify();})))
    .child(button('expand-context','Whole file',(_e,cx)=>view.work(cx,()=>view.controller.expandFile()),{tooltip:'Load unchanged lines between and around hunks'}))
    .child(button('comment-file','Comment',(_e,cx)=>view.fileComment(cx),{tooltip:'Comment on the whole file'}))))
  .when(Boolean(s.patch&&!s.patch.complete),e=>e.child(text(`Incomplete: ${s.patch.reason}`).p(8).text_color(t.ansi1)))
  .child(div().id(`${view.id}-diff-horizontal`).flex_1().min_h(0).overflow_x_scrollbar().child(div().min_w(minWidth).w_full().h_full().child(body)));
}
