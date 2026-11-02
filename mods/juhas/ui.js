import {div,PathBuilder,svg} from 'gpui-kit';
import {h_flex,v_flex,v_virtual_list,Scrollbar,Input,Button,Checkbox,Toggle,Popover} from 'gpui-base';
import {theme,settings} from 'herdr';
import {layoutGraph} from './graph.js';
import {fileRows,splitRows,changeGroups} from './review-ui.js';
import {annotatePatch,composerRows,commentHeight,INLINE_EDITOR_HEIGHT} from './comments.js';
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
export function buttonGroup(id,items,selected,select){
 const t=theme();return h_flex().id(id).role('group').accessibility_label(id).flex_none().rounded(6).border_1().border_color(t.border).overflow_hidden()
  .children(items.map((item,index)=>button(`${id}-${item.value}`,item.label,(_event,cx)=>select(item.value,cx),{active:item.value===selected,tooltip:item.tooltip||item.label}).disabled(Boolean(item.disabled)).rounded(0).when(index>0,el=>el.border_l(1).border_color(t.border))));
}
export function popover(id,label,open,change,content,{tooltip=label}={}){
 const t=theme();return Popover.new(id).open(Boolean(open)).on_open_change(change).trigger(button(`${id}-trigger`,label,null,{tooltip}))
  .when(Boolean(open),el=>el.content(v_flex().w(380).h(240).min_h(0).min_w(0).rounded(8).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).child(content())));
}
export function field(state,_placeholder,width){const t=theme();return Input.new(state).h(32).min_w(0).when(Boolean(width),e=>e.w(width)).when(!width,e=>e.flex_1()).px(8).rounded(8).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12);}
export function text(value,dim=false){const t=theme();return div().text_size(12).text_color(dim?t.muted:t.foreground).child(value);}
export function commitId(oid){return h_flex().gap(4).items_center().child(text(oid,true)).child(button('copy-commit-id',svg('mods/juhas/icons/copy.svg').size(13),(_e,cx)=>cx.write_to_clipboard(oid),{tooltip:'Copy full commit ID'}).h(22).w(22).px(0));}
export function virtualList(id,items,height,row,click,scrollHandle=null){return v_flex().relative().size_full().flex_1().min_h(0).min_w(0).child(v_virtual_list(id,items.length,height,i=>String(items[i].id??items[i].oid??i),range=>items.slice(range.start,range.end).map(row)).when(Boolean(scrollHandle),el=>el.track_scroll(scrollHandle)).on_item_click(click).size_full()).child(Scrollbar.vertical(id).viewport_from_layout().absolute().inset_0());}
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
 const commit=s.history.find(c=>c.oid===s.comparison?.targetOid);
 return v_flex().size_full().min_w(0).min_h(0).child(h_flex().h(30).flex_none().items_center().gap(4)
  .child(section(view.historyRef==='all'?'History · all branches':view.historyFull?'History · full':s.featureBaseOid?'History · feature commits':'History · HEAD').flex_1().min_w(0).truncate())
  .child(popover('history-options','⋯',view.panel==='historyOptions',(open,cx)=>{if(open||view.panel==='historyOptions')view.panel=open?'historyOptions':null;cx.notify();},()=>v_flex().size_full().min_h(0)
   .child(button('history-feature','Feature branch commits',(_e,cx)=>view.setHistoryView('feature',cx)))
   .child(button('history-full','Show full history',(_e,cx)=>view.setHistoryView('full',cx)))
   .child(button('history-all','All branches',(_e,cx)=>view.setHistoryView('all',cx)))
   .child(checkbox('graph-remotes','Include remotes',view.remotes,(checked,cx)=>{view.remotes=checked;view.work(cx,()=>view.controller.loadHistory(view.filters()));}))
   .child(button('history-branch-picker','Browse branches…',(_e,cx)=>{view.panel='historyRefs';cx.notify();}))
   .child(button('history-base-picker','Choose base branch…',(_e,cx)=>{view.panel='refs';cx.notify();}))
   .child(toggle('history-details','Commit details',view.detailsOpen,(pressed,cx)=>{view.detailsOpen=pressed;if(pressed)view.work(cx,()=>view.controller.loadDetails());cx.notify();}))
   .child(toggle('history-filters','Search filters',view.filtersOpen,(pressed,cx)=>{view.filtersOpen=pressed;cx.notify();})),{tooltip:'History options'})))
  .child(list).when(Boolean(view.detailsOpen&&commit),e=>e.child(v_flex().flex_none().max_h(130).overflow_y_scrollbar().p(10).gap(5).border_t(1).border_color(t.border)
    .child(text(s.details?.subject||commit.subject).font_semibold()).child(text(s.details?.author||`${commit.author} · ${new Date(commit.timestamp*1000).toLocaleString()}`,true)).child(commitId(commit.oid)).child(text(s.details?.body||'',true)).child(text(commit.refs.join(', '),true))))
  .when(s.hasMore,e=>e.child(button('history-more','Load 300 more',(_e,cx)=>view.work(cx,()=>view.controller.loadHistory(view.filters(),true)))));
}
export function filesPane(view){
 const s=view.controller.state,t=theme(),drafts=view.controller.session().drafts,rows=fileRows(s.files,view.fileTree,view.collapsedDirs||new Set());
 const counts=new Map();for(const d of drafts)if(d.repoKey===s.repo?.key)counts.set(d.newPath,(counts.get(d.newPath)||0)+1);
 return v_flex().size_full().min_w(0).min_h(0).child(h_flex().h(30).flex_none().items_center().child(section(`Files · ${s.files.length}`).flex_1())
  .child(toggle('file-tree','Tree',view.fileTree,(pressed,cx)=>{view.fileTree=pressed;cx.notify();},{tooltip:'Show files as a directory tree'})))
 .child(virtualList(`${view.id}-files`,rows,29,f=>{
  if(f.directory)return h_flex().h(29).pl(9+f.depth*14).pr(9).min_w(0).gap(6).items_center().text_size(12).text_color(t.muted).tooltip(`${f.path} · ${f.fileCount} changed ${f.fileCount===1?'file':'files'}`).child(div().w(12).flex_none().child(f.closed?'▸':'▾')).child(div().min_w(0).truncate().child(f.name)).child(div().flex_none().text_size(11).text_color(t.dim).child(`${f.fileCount} ${f.fileCount===1?'file':'files'}`));
  const count=counts.get(f.newPath)||0;return h_flex().h(29).pl(9+(f.depth||0)*14).pr(9).gap(7).items_center().when(s.file?.id===f.id,e=>e.bg(t.selected)).tooltip(f.newPath)
   .child(text(f.status,true).w(16)).child(div().flex_1().min_w(0).truncate().text_size(12).text_color(f.status==='A'?t.ansi2:f.status==='D'?t.ansi1:t.ansi4).child(view.fileTree?f.name:f.newPath))
   .when(f.additions!=null,e=>e.child(text('+'+f.additions).text_color(t.ansi2)).child(text('−'+f.deletions).text_color(t.ansi1)))
   .when(count>0,e=>e.child(h_flex().gap(3).items_center().tooltip('Saved comments').child(svg('mods/juhas/icons/comment.svg').size(12).text_color(t.accent)).child(text(String(count)).text_color(t.accent))));
 },(id,cx)=>{const f=rows.find(r=>r.id===id);if(f?.directory){view.collapsedDirs??=new Set();if(f.closed){for(const path of f.paths)view.collapsedDirs.delete(path);}else view.collapsedDirs.add(f.path);cx.notify();}else view.selectFile(id,cx);}));
}
function codeCell(row,side,t){
 const line=row?.[side==='old'?'oldLine':'newLine'];return h_flex().flex_1().min_w(0).h(22).gap(8).px(8).items_center().overflow_hidden()
  .bg(row?.side==='old'?t.ansi1+'18':row?.side==='new'?t.ansi2+'18':t.background)
  .child(div().w(36).flex_none().text_right().text_color(t.dim).child(String(line??'')))
  .child(div().text_color(row?.side==='old'?t.ansi1:row?.side==='new'?t.ansi2:t.foreground).child(row?.text.replace(/\t/g,'    ')||''));
}
function commentCard(row,viewId,width='100%'){
 const t=theme(),draft=row.draft,location=draft?.side?`${draft.side==='old'?'Original':'Modified'} · ${draft.startLine}${draft.endLine!==draft.startLine?'–'+draft.endLine:''}`:'File comment';
 const header=h_flex().h(24).flex_none().px(8).gap(6).items_center()
  .child(svg('mods/juhas/icons/comment.svg').size(14).flex_none().text_color(t.muted))
  .child(div().flex_1().min_w(0).truncate().text_size(11).font_semibold().text_color(t.muted).child(location));
 const body=div().id(`${viewId}-${row.id}-body`).h(commentHeight(row.text)-42).flex_none().min_w(0).px(8).py(4).overflow_y_scrollbar().text_size(12).line_height('18px').text_color(t.foreground).child(row.text);
 return v_flex().h(commentHeight(row.text)).w_full().max_w(width||'100%').min_w(0).px(8).py(8).tooltip('Click to edit this comment')
  .child(v_flex().h(commentHeight(row.text)-16).flex_none().min_w(0).rounded(8).border_1().border_color(t.border).bg(t.raised).child(header).child(body));
}
export function diffPane(view){
 const s=view.controller.state,t=theme(),annotated=annotatePatch(s.patch,view.controller.session().drafts,s.comparison?.id,s.file?.newPath),split=view.diffMode==='split';
 const activeTarget=view.inlineEditor&&view.target?.comparisonId===s.comparison?.id&&view.target?.newPath===s.file?.newPath?view.target:null,composed=composerRows(annotated,activeTarget,view.editId);
 const clickSource=view.diffChangeKey();
 const display=split?splitRows(composed):composed,rows=s.patch?.binary||s.patch?.modeOnly?[{id:'diff-notice',kind:'notice',text:s.patch.binary?'Binary file changed · file comments are available':'File mode or submodule changed · no text hunks'},...display]:display,changes=changeGroups(rows);view.patchRows=annotated;view.diffRows=rows;view.diffRowsKey=view.diffChangeKey();const activeChange=view.changeCursor?.source===view.diffRowsKey?changes.findIndex(change=>change.id===view.changeCursor.id):-1;
 let body;
 if(!s.file)body=text('Select a file to review').p(20);
 else if(!s.patch)body=text(view.busy?'Reading diff…':'No diff loaded').p(20);
 else body=virtualList(`${view.id}-diff-${split?'split':'unified'}`,rows,rows.map(r=>r.kind==='editor'?INLINE_EDITOR_HEIGHT:r.kind==='comment'?commentHeight(r.text):r.kind==='notice'?46:22),row=>{
  if(row.kind==='notice')return text(row.text,true).h(46).p(12);
  if(row.kind==='comment'||row.kind==='editor'){
   const height=row.kind==='editor'?INLINE_EDITOR_HEIGHT:commentHeight(row.text),content=()=>row.kind==='editor'?div().h(height).w_full().max_w(view.width||'100%').child(view.inlineEditor):commentCard(row,view.id,view.width);
   if(!split||!row.draft?.side)return content();
   return h_flex().h(height).w_full().min_w(0).child(row.draft.side==='old'?div().flex_1().min_w(0).child(content()):div().flex_1().min_w(0)).child(div().w(1).h_full().bg(t.border)).child(row.draft.side==='new'?div().flex_1().min_w(0).child(content()):div().flex_1().min_w(0));
  }
  if(row.kind==='hunk')return div().h(22).px(10).bg(t.raised).text_color(t.accent).font_family(settings().font_family).text_size(11).child(row.text);
  if(row.kind==='pair')return h_flex().h(22).font_family(settings().font_family).text_size(12).child(codeCell(row.old,'old',t)).child(div().w(1).h_full().bg(t.border)).child(codeCell(row.next,'new',t));
  const mark=row.side==='new'?'+':row.side==='old'?'-':' ',color=row.side==='new'?t.ansi2:row.side==='old'?t.ansi1:t.foreground;
  const selected=view.target?.comparisonId===s.comparison?.id&&view.target?.newPath===s.file?.newPath&&(row.side==='context'?'new':row.side)===view.target?.side&&(row.side==='old'?row.oldLine:row.newLine)>=view.target?.startLine&&(row.side==='old'?row.oldLine:row.newLine)<=view.target?.endLine;
  return h_flex().h(22).px(8).gap(8).items_center().font_family(settings().font_family).text_size(12).bg(selected?t.selected:row.side==='new'?t.ansi2+'18':row.side==='old'?t.ansi1+'18':t.background)
   .child(div().w(36).flex_none().text_right().text_color(t.dim).child(String(row.oldLine??''))).child(div().w(36).flex_none().text_right().text_color(t.dim).child(String(row.newLine??'')))
   .child(div().text_color(color).child(`${mark} ${row.text.replace(/\t/g,'    ')}`));
 },(id,cx)=>{if(view.diffChangeKey()!==clickSource)return;const row=rows.find(r=>r.id===id);if(row?.kind==='editor'||row?.kind==='notice')return;if(row?.kind==='pair'){const side=view.commentSide||'new',line=side==='old'?(row.old||row.next):(row.next||row.old);if(line)view.selectLine(line.id,cx,line.side==='context'?side:null,line);}else view.selectLine(id,cx,null,row);},view.diffScroll);
 const minWidth=s.patch?.binary||s.patch?.modeOnly?0:split?Math.max(800,...rows.filter(r=>r.kind==='pair').map(r=>100+Math.max(r.old?.text.length||0,r.next?.text.length||0)*14.6)):Math.max(600,...annotated.filter(r=>r.kind!=='comment').map(r=>100+r.text.length*7.3));
 return v_flex().size_full().min_w(0).min_h(0)
  .child(h_flex().min_h(36).flex_none().px(10).gap(4).flex_wrap().justify_end().items_center().border_b(1).border_color(t.border)
   .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).text_size(12).child(s.file?.newPath||'Diff'))
   .when(Boolean(s.file),e=>e.child(buttonGroup('diff-mode',[{value:'unified',label:'Unified'},{value:'split',label:'Split',tooltip:'Side by side'}],view.diffMode||'unified',(mode,cx)=>view.setDiffMode(mode,cx)))
    .child(buttonGroup('change-navigation',[{value:-1,label:'↑',tooltip:'Previous change; continues to the previous file',disabled:!changes.length||Boolean(view.busy)},{value:1,label:'↓',tooltip:'Next change; continues to the next file',disabled:!changes.length||Boolean(view.busy)}],null,(direction,cx)=>view.navigateChange(direction,cx))).child(text(changes.length?`${activeChange<0?'–':activeChange+1}/${changes.length}`:'',true).tooltip('Current change / total change groups in this file'))
    .when(split,e=>e.child(buttonGroup('comment-side',[{value:'old',label:'Old',tooltip:'Attach comments to the original version'},{value:'new',label:'New',tooltip:'Attach comments to the modified version'}],view.commentSide||'new',(side,cx)=>{view.commentSide=side;cx.notify();})))
    .child(button('comment-file',h_flex().gap(5).items_center().child(svg('mods/juhas/icons/comment.svg').size(14)).child('Comment'),(_e,cx)=>view.fileComment(cx),{tooltip:'Comment on the whole file'}))
    .child(popover('diff-more','⋯',view.panel==='diffMore',(open,cx)=>{if(open||view.panel==='diffMore')view.panel=open?'diffMore':null;cx.notify();},()=>v_flex().size_full()
     .child(button('expand-context','Whole file',(_e,cx)=>{view.panel=null;view.work(cx,()=>view.controller.expandFile());},{tooltip:'Load unchanged lines between and around hunks'}))
     .child(button('select-code','Select / copy',(_e,cx)=>view.openCodeCopy('new',cx),{tooltip:'Select and copy loaded code in a native read-only editor'}).disabled(!s.patch||Boolean(s.patch.binary||s.patch.modeOnly))),{tooltip:'More diff options'}))))
  .when(Boolean(s.patch&&!s.patch.complete),e=>e.child(text(`Incomplete: ${s.patch.reason}`).p(8).text_color(t.ansi1)))
  .child(div().flex_1().min_h(0).min_w(0).w_full().overflow_hidden().child(div().id(`${view.id}-diff-horizontal`).size_full().min_w(0).overflow_x_scrollbar().child(div().min_w(minWidth).w_full().h_full().child(body))));
}
