import {div,PathBuilder,svg,list} from 'gpui-kit';
import {h_flex,v_flex,v_virtual_list,Scrollbar,Input,Button,Checkbox,Toggle,Popover} from 'gpui-base';
import {theme,settings} from 'herdr';
import {layoutGraph} from './graph.js';
import {fileRows,splitRows,changeGroups,filterDrafts} from './review-ui.js';
import {annotatePatch,composerRows,commentHeight,INLINE_EDITOR_HEIGHT,INLINE_EDITOR_MAX_HEIGHT} from './comments.js';
import {formatCommitTime} from './commit-time.js';
import {decorateLine,intraline,multiFileRows} from './reading.js';
export function nativeFrame(id,{framed=true}={}){const t=theme();return v_flex().id(id).size_full().min_h(0).min_w(0).when(framed,e=>e.rounded(10).border_1().border_color(t.border)).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13);}
function control(element,{active=false,primary=false,segment=false}={}){const t=theme();return element.h(28).flex_none().px(8).flex().gap(6).items_center().justify_center().rounded(6).text_size(12).cursor_pointer()
 .text_color(primary?t.solid_foreground:t.foreground).bg(primary?t.solid:active?t.selected:segment?t.chrome:t.background)
 .hover(el=>el.bg(primary?t.solid:t.hover)).active(el=>el.bg(primary?t.solid:t.selected));}
export function button(id,label,action,options={}){
 const name=options.tooltip||(typeof label==='string'?label:'Action');return control(Button.new(id),options).selected(Boolean(options.active)).tab_index(0).accessibility_label(name).tooltip(name)
  .when(Boolean(action),el=>el.on_click(action)).child(label);
}
export function checkbox(id,label,checked,change,{tooltip=label}={}){
 const t=theme();return control(Checkbox.new(id)).checked(Boolean(checked)).tab_index(0).accessibility_label(label).on_change(change)
  .child(h_flex().gap(6).items_center().tooltip(tooltip)
   .child(div().size(14).flex_none().rounded(3).border_1().border_color(checked?t.accent:t.border).bg(checked?t.accent:t.background).flex().items_center().justify_center().text_size(11).text_color(t.accent_foreground).when(checked,el=>el.child(svg('mods/juhas/icons/check.svg').size(11))))
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
export function virtualList(id,items,height,row,click,scrollHandle=null){return v_flex().relative().size_full().flex_1().min_h(0).min_w(0).child(v_virtual_list(id,items.length,height,i=>String(items[i].renderKey??items[i].id??items[i].oid??i),range=>items.slice(range.start,range.end).map(row)).when(Boolean(scrollHandle),el=>el.track_scroll(scrollHandle)).on_item_click((key,cx)=>{const item=items.find(i=>String(i.renderKey??i.id??i.oid)===String(key));click(item?.id??item?.oid??key,cx);}).size_full()).child(Scrollbar.vertical(id).viewport_from_layout().absolute().inset_0());}
export function section(title){const t=theme();return div().h(28).flex_none().px(10).py(6).text_size(11).font_semibold().text_color(t.foreground).bg(t.chrome).child(title);}
export function draftsPane(view,cx){
 const repoKey=view.controller.state.repo?.key,drafts=filterDrafts(view.controller.session().drafts,{repoKey}),status=view.draftStatus||'all',source=view.draftSource||'all',visible=filterDrafts(drafts,{status,source}),sources=[...new Map(drafts.map(d=>[d.comparisonId,d])).values()];
 const sourceLabel=d=>d.targetOid?`${d.baseOid?.slice(0,8)||'empty'} → ${d.targetOid.slice(0,8)}`:'Working tree';
 const choose=(value,cx)=>{view.draftSource=value;view.draftSourcePicker=false;cx.notify();};
 return v_flex().size_full().min_h(0).min_w(0)
  .child(h_flex().items_center().child(section(`Saved comments · ${visible.length}/${drafts.length}`).flex_1())
   .when(Boolean(view.navigateComment),e=>e.child(button('comment-previous','↑',(_e,cx)=>view.navigateComment(-1,cx),{tooltip:'Previous comment'})).child(button('comment-next','↓',(_e,cx)=>view.navigateComment(1,cx),{tooltip:'Next comment'})))
   .when(Boolean(view.generalComment),e=>e.child(button('general-comment','General comment',(_e,cx)=>view.generalComment(cx))))
   .child(button('clear-comments','Clear all',(_e,cx)=>{view.controller.mutate(session=>({...session,drafts:session.drafts.filter(d=>d.repoKey!==repoKey)}));cx.notify();},{tooltip:'Delete all saved comments in this repository, including comments hidden by filters'}).disabled(!drafts.length)))
  .child(h_flex().min_h(36).flex_none().px(8).py(4).gap(6).flex_wrap().items_center()
   .child(buttonGroup('draft-status',[{value:'all',label:'All'},{value:'current',label:'Current'},{value:'outdated',label:'Outdated'}],status,(value,cx)=>{view.draftStatus=value;cx.notify();}))
   .child(popover('draft-source',source==='all'?'All comparisons':sourceLabel(sources.find(d=>d.comparisonId===source)||{}),Boolean(view.draftSourcePicker),(open,cx)=>{view.draftSourcePicker=open;cx.notify();},()=>v_flex().size_full().min_h(0)
    .child(button('draft-source-all','All comparisons',(_e,cx)=>choose('all',cx)))
    .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().children(sources.map(d=>button(`draft-source-${d.id}`,sourceLabel(d),(_e,cx)=>choose(d.comparisonId,cx),{active:source===d.comparisonId,tooltip:`${d.baseOid||'empty'} → ${d.targetOid||'working tree'}`})))),{tooltip:'Filter saved comments by source comparison; Submit review still includes all saved comments'})))
  .child(v_flex().flex_1().min_h(0).min_w(0).overflow_y_scrollbar()
   .when(!visible.length,e=>e.child(text('No saved comments match these filters.',true).p(10)))
   .children(visible.map(d=>h_flex().gap(6).px(8).py(4).items_center()
    .child(v_flex().flex_1().min_w(0).tooltip(`${d.scope==='general'?'General review':d.newPath||d.oldPath}\n${sourceLabel(d)}\n${d.body}`)
     .child(text(`${d.status==='outdated'?'[OUTDATED] ':''}${d.scope==='general'?'General review':`${d.newPath||d.oldPath} ${d.startLine??''}`}`,true).truncate())
     .child(text(d.body).truncate()).child(text(sourceLabel(d),true).text_size(10)).when(Boolean(view.openComment)&&d.scope!=='general',e=>e.cursor_pointer().on_click((_e,cx)=>view.openComment(d,cx))))
    .when(Boolean(view.openComment)&&d.scope!=='general',e=>e.child(button(`open-code-${d.id}`,'Code',(_e,cx)=>view.openComment(d,cx),{tooltip:'Open the exact source of this comment'})))
    .child(button(`edit-${d.id}`,'Edit',(_e,cx)=>view.editDraft(d,cx))).child(button(`delete-${d.id}`,'Delete',(_e,cx)=>{view.controller.removeComment(d.id);cx.notify();})))));
}
export const LIST_ROW_HEIGHT=29;
export function historyLoadingIndicator(state){const label=state.historyBaseLoading?'Resolving base...':state.historyLoadingMore?'Loading more commits...':'Loading Git history...';return h_flex().gap(4).flex_none().items_center().tooltip(label).accessibility_label(label).child(svg('mods/juhas/icons/loader-circle.svg').size(12).text_color(theme().muted).spin(900)).child(text(state.historyBaseLoading?'Base...':state.historyLoadingMore?'More...':'Loading...',true));}
export function graphCell(row){
 const height=LIST_ROW_HEIGHT,mid=height/2,t=theme(),colors=[t.ansi4,t.ansi2,t.ansi5,t.ansi3,t.ansi6];const x=lane=>8+lane*11;const paths=[];
 for(let i=0;i<row.before.length;i++)if(row.before[i]&&i!==row.lane){const to=row.after.indexOf(row.before[i]);if(to>=0)paths.push(window.paint_path(PathBuilder.stroke(1.5).move_to(x(i),0).line_to(x(to),height).build(),colors[i%colors.length]).absolute().inset_0());}
 paths.push(window.paint_path(PathBuilder.stroke(1.5).move_to(x(row.lane),0).line_to(x(row.lane),mid).build(),colors[row.lane%colors.length]).absolute().inset_0());
 for(const e of row.edges)paths.push(window.paint_path(PathBuilder.stroke(1.5).move_to(x(e.from),mid).line_to(x(e.to),height).build(),colors[e.to%colors.length]).absolute().inset_0());
 return div().relative().w(Math.min(120,Math.max(28,(Math.max(row.before.length,row.after.length)+1)*11))).h(height).flex_none().overflow_hidden().children(paths).child(div().absolute().left(x(row.lane)-3).top(mid-3).size(6).rounded(3).bg(colors[row.lane%colors.length]));
}
export function historyPane(view,cx){
 const s=view.controller.state,t=theme(),rows=layoutGraph(s.history).rows;
 const first=s.history.findIndex(c=>c.oid===(view.commitAnchor||s.comparison?.scope.base)),last=s.history.findIndex(c=>c.oid===s.comparison?.targetOid);
 const selected=(c,i)=>view.rangePicking?c.oid===view.commitAnchor:s.comparison?.scope.kind==='range'?i>=Math.min(first,last)&&i<=Math.max(first,last):s.comparison?.targetOid===c.oid;
 const list=virtualList(`${view.id}-history`,s.history,LIST_ROW_HEIGHT,c=>{const i=s.history.indexOf(c),refs=(c.refs||[]).filter(ref=>ref!=='HEAD'&&!ref.startsWith('HEAD -> '));return h_flex().h(LIST_ROW_HEIGHT).px(4).gap(6).items_center().when(selected(c,i),e=>e.bg(t.selected))
  .tooltip(`${c.subject}\n${c.author} · ${new Date(c.timestamp*1000).toLocaleString()}\n${c.oid}\n${(c.refs||[]).join(', ')}`)
  .child(graphCell(rows[i])).child(div().flex_1().min_w(0).truncate().text_size(12).text_color(c.parents.length>1?t.muted:t.foreground).child(`${refs.length?'['+refs.join(', ')+'] ':''}${c.subject}`))
  .when(!view.width||view.width>=900,e=>e.child(div().w(75).flex_none().truncate().text_size(11).text_color(t.muted).child(c.author)))
  .when(!view.width||view.width>=720,e=>e.child(div().w(112).flex_none().truncate().text_size(11).text_color(t.muted).child(formatCommitTime(c.timestamp))));},(id,cx)=>view.selectCommit(id,cx));
 const commit=s.history.find(c=>c.oid===s.comparison?.targetOid);
 return v_flex().size_full().min_w(0).min_h(0).child(h_flex().h(30).flex_none().items_center().gap(4)
  .child(section(view.historyRef==='all'?'History · all branches':view.historyFull?'History · full':s.featureBaseOid?'History · feature commits':'History · HEAD').flex_1().min_w(0).truncate())
  .when(Boolean(s.historyLoading||s.historyBaseLoading),e=>e.child(historyLoadingIndicator(s)))
  .child(popover('history-options',svg('mods/juhas/icons/more.svg').size(14),view.panel==='historyOptions',(open,cx)=>{if(open||view.panel==='historyOptions')view.panel=open?'historyOptions':null;cx.notify();},()=>v_flex().size_full().min_h(0)
   .child(button('history-feature','Feature branch commits',(_e,cx)=>view.setHistoryView('feature',cx)))
   .child(toggle('history-details','Commit details',view.detailsOpen,(pressed,cx)=>{view.detailsOpen=pressed;if(pressed)view.work(cx,()=>view.controller.loadDetails());cx.notify();}))
   .child(toggle('history-filters','Search filters',view.filtersOpen,(pressed,cx)=>{view.filtersOpen=pressed;cx.notify();}))
   .child(toggle('history-advanced','Advanced Git history',view.historyAdvanced,(pressed,cx)=>{view.historyAdvanced=pressed;cx.notify();}))
   .when(Boolean(view.historyAdvanced),e=>e.child(button('history-full','Show full history',(_e,cx)=>view.setHistoryView('full',cx)))
    .child(button('history-all','All branches',(_e,cx)=>view.setHistoryView('all',cx)))
    .child(checkbox('graph-remotes','Include remotes',view.remotes,(checked,cx)=>{view.remotes=checked;view.work(cx,()=>view.controller.loadHistory(view.filters()));}))
    .child(button('history-branch-picker','Browse branches…',(_e,cx)=>view.setReferencePicker(true,true,cx)))),{tooltip:'History options'})))
  .child(list).when(Boolean(view.detailsOpen&&commit),e=>e.child(v_flex().flex_none().max_h(130).overflow_y_scrollbar().p(10).gap(5).border_t(1).border_color(t.border)
    .child(text(s.details?.subject||commit.subject).font_semibold()).child(text(s.details?.author||`${commit.author} · ${new Date(commit.timestamp*1000).toLocaleString()}`,true)).child(commitId(commit.oid)).child(text(s.details?.body||'',true)).child(text(commit.refs.join(', '),true))))
  .when(s.hasMore,e=>e.child(button('history-more',s.historyLoadingMore?'Loading...':'Load 300 more',(_e,cx)=>view.work(cx,()=>view.controller.loadHistory(view.filters(),true))).disabled(Boolean(s.historyLoading||s.historyBaseLoading))));
}
export function filesPane(view){
 const s=view.controller.state,t=theme(),session=view.controller.session(),drafts=session.drafts,query=view.inputs?.fileQuery?.value()||'',rows=fileRows(s.files,view.fileTree,view.collapsedDirs||new Set(),query);
 const reviewed=new Set();for(const file of s.files)if(view.isFileReviewed?.(file,session))reviewed.add(file.id);
 const counts=new Map();for(const d of drafts)if(d.repoKey===s.repo?.key)counts.set(d.newPath,(counts.get(d.newPath)||0)+1);
 return v_flex().size_full().min_w(0).min_h(0).child(h_flex().h(30).flex_none().items_center().child(section(`Files · ${reviewed.size}/${s.files.length} viewed`).flex_1().min_w(0).truncate())
  .when(Boolean(view.moveUnreviewed),e=>e.child(button('next-unreviewed',svg('mods/juhas/icons/chevron-right.svg').size(14),(_e,cx)=>view.moveUnreviewed(1,cx),{tooltip:'Next unreviewed file in the full comparison'})))
  .child(toggle('file-tree','Tree',view.fileTree,(pressed,cx)=>{view.fileTree=pressed;cx.notify();},{tooltip:'Show files as a directory tree'})))
 .when(Boolean(view.inputs?.fileQuery),e=>e.child(h_flex().min_h(38).flex_none().px(8).py(3).gap(6).items_center().child(field(view.inputs.fileQuery,'Filter files by path')).when(Boolean(query),e=>e.child(text(`${rows.filter(f=>!f.directory).length}/${s.files.length}`,true)).child(button('clear-file-filter','×',(_e,cx)=>{view.inputs.fileQuery.set_value('');cx.notify();},{tooltip:'Clear file filter'})))))
 .when(!rows.length,e=>e.child(text(query?'No changed files match this path.':'No changed files in this comparison.',true).p(10)))
 .child(virtualList(`${view.id}-files`,rows.map(f=>({...f,renderKey:JSON.stringify([f.id,counts.get(f.newPath)||0,Boolean(reviewed.has(f.id)),s.file?.id===f.id])})),LIST_ROW_HEIGHT,f=>{
  if(f.directory)return h_flex().h(LIST_ROW_HEIGHT).pl(9+f.depth*14).pr(9).min_w(0).gap(6).items_center().text_size(12).text_color(t.muted).tooltip(`${f.path} · ${f.fileCount} changed ${f.fileCount===1?'file':'files'}${query.trim()?' · Matching folders stay expanded while filtering':''}`).child(svg(`mods/juhas/icons/chevron-${f.closed?'right':'down'}.svg`).size(12).flex_none()).child(div().min_w(0).truncate().child(f.name)).child(div().flex_none().text_size(11).text_color(t.dim).child(`${f.fileCount} ${f.fileCount===1?'file':'files'}`));
  const count=counts.get(f.newPath)||0;return h_flex().h(LIST_ROW_HEIGHT).pl(9+(f.depth||0)*14).pr(9).gap(7).items_center().when(s.file?.id===f.id,e=>e.bg(t.selected)).tooltip(f.newPath)
   .child(text(reviewed.has(f.id)?'✓':f.status,true).w(16)).child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(view.fileTree?f.name:f.newPath))
   .when(f.additions!=null,e=>e.child(text('+'+f.additions).text_color(t.ansi2)).child(text('−'+f.deletions).text_color(t.ansi1)))
   .when(count>0,e=>e.child(h_flex().gap(3).items_center().tooltip('Saved comments').child(svg('mods/juhas/icons/comment.svg').size(12).text_color(t.accent)).child(text(String(count)).text_color(t.accent))));
 },(id,cx)=>{const f=rows.find(r=>r.id===id);if(f?.directory){if(query.trim())return;view.collapsedDirs??=new Set();if(f.closed){for(const path of f.paths)view.collapsedDirs.delete(path);}else view.collapsedDirs.add(f.path);cx.notify();}else view.selectFile(id,cx);}));
}
function sourceText(row,path,t,wrap,changed,matches,prefix=''){
 const colors={keyword:t.ansi5,string:t.ansi2,number:t.ansi3,comment:t.muted};
 return h_flex().min_w(0).when(wrap,e=>e.flex_1().flex_wrap()).when(!wrap,e=>e.flex_none()).items_start()
  .when(Boolean(prefix),e=>e.child(div().flex_none().child(prefix)))
  .children(decorateLine(row?.text||'',path,changed,matches).map(span=>div().min_w(0).when(!wrap,e=>e.flex_none()).when(wrap,e=>e.whitespace_normal())
   .text_color(colors[span.kind]||t.foreground).when(span.changed,e=>e.bg(row?.side==='old'?t.ansi1+'55':t.ansi2+'55')).when(span.match,e=>e.bg(t.selected).underline()).child(span.text.replace(/\t/g,'    '))));
}
function codeCell(row,side,t,wrap,path,changed=[],matches=[]){
 const line=row?.[side==='old'?'oldLine':'newLine'];return h_flex().flex_1().min_w(0).when(wrap,e=>e.min_h(22).items_start()).when(!wrap,e=>e.h(22).items_center()).gap(8).px(8).overflow_hidden()
  .bg(row?.side==='old'?t.ansi1+'18':row?.side==='new'?t.ansi2+'18':t.background)
  .child(div().w(36).flex_none().text_right().text_color(t.dim).child(String(line??'')))
  .child(sourceText(row,path,t,wrap,changed,matches));
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
 const s=view.controller.state,t=theme(),drafts=view.controller.session().drafts,annotated=annotatePatch(s.patch,drafts,s.comparison?.id,s.file?.newPath),split=view.diffMode==='split',wrap=Boolean(view.readingOptions?.wrap);
 const activeTarget=view.inlineEditor&&view.target?.comparisonId===s.comparison?.id&&view.target?.newPath===s.file?.newPath?view.target:null,composed=composerRows(annotated,activeTarget,view.editId);
 const clickSource=view.diffChangeKey();
 const present=(source,patch)=>{const display=split?splitRows(source):source;return patch?.binary||patch?.modeOnly?[{id:'diff-notice',kind:'notice',text:patch.binary?'Binary file changed · file comments are available':'File mode or submodule changed · no text hunks'},...display]:display;};
 const sections=view.allFiles?(view.allFileSections||[]).map(section=>{const source=section.patch?annotatePatch(section.patch,drafts,section.comparison?.id,section.file.newPath):null,target=view.target?.comparisonId===section.comparison?.id&&view.target?.newPath===section.file.newPath?view.target:null;return {...section,source,rows:source?present(composerRows(source,target,view.editId),section.patch):null};}):null;
 const rows=sections?multiFileRows(sections):present(composed,s.patch),changes=changeGroups(rows),emphasis=new Map(),pairs=new Map();
 const paired=(source,fileId='')=>{for(const row of splitRows(source))if(row.kind==='pair'&&row.old&&row.next&&row.old!==row.next){const pair={old:row.old,next:row.next,fileId};pairs.set(fileId+':'+row.old.id,pair);pairs.set(fileId+':'+row.next.id,pair);}};if(sections){for(const section of sections)if(section.source&&!section.collapsed&&!section.limited)paired(section.source,section.file.id);}else paired(annotated);
 const ranges=(row,side)=>{const line=row?.[side==='old'?'oldLine':'newLine'];return (view.findMatches||[]).filter(m=>m.side===side&&m.line===line&&(!view.allFiles||m.fileId===row.fileId));};
 const fragments=row=>{const key=(row?.fileId||'')+':'+(row?.sourceId||row?.id),pair=pairs.get(key);if(pair&&!emphasis.has(key)){const result=intraline(pair.old.text,pair.next.text);emphasis.set(pair.fileId+':'+pair.old.id,result.old);emphasis.set(pair.fileId+':'+pair.next.id,result.new);}return emphasis.get(key)||[];};
 view.patchRows=annotated;view.diffRows=rows;view.diffRowsKey=view.diffChangeKey();const activeChange=view.changeCursor?.source===view.diffRowsKey?changes.findIndex(change=>change.id===view.changeCursor.id):-1;
 let body;
 if(!s.file&&!view.allFiles)body=text('Select a file to review').p(20);
 else if(!s.patch&&!view.allFiles)body=text(view.busy?'Reading diff…':'No diff loaded').p(20);
 else {const renderRow=row=>{
  if(row.kind==='file-header'&&view.fileHeaderViews?.has(row.fileId))return div().h(34).w_full().child(view.fileHeaderViews.get(row.fileId));
  if(row.kind==='file-header')return h_flex().h(30).px(10).items_center().gap(8).bg(t.raised).text_color(t.foreground).child(text(row.collapsed?'▸':'▾',true)).child(text(row.text).font_semibold()).child(text(row.loading?'Loading…':row.limited?'Limited':'',true));
  if(row.kind==='notice')return text(row.text,true).h(46).p(12);
  if(row.kind==='comment'||row.kind==='editor'){
   const height=row.kind==='editor'?INLINE_EDITOR_HEIGHT:commentHeight(row.text),content=()=>row.kind==='editor'?div().min_h(height).max_h(INLINE_EDITOR_MAX_HEIGHT).w_full().max_w(view.width||'100%').child(view.inlineEditor):commentCard(row,view.id,view.width);
   if(!split||!row.draft?.side)return content();
   return h_flex().when(row.kind==='editor',e=>e.min_h(height).max_h(INLINE_EDITOR_MAX_HEIGHT)).when(row.kind!=='editor',e=>e.h(height)).w_full().min_w(0).child(row.draft.side==='old'?div().flex_1().min_w(0).child(content()):div().flex_1().min_w(0)).child(div().w(1).h_full().bg(t.border)).child(row.draft.side==='new'?div().flex_1().min_w(0).child(content()):div().flex_1().min_w(0));
  }
  if(row.kind==='hunk')return div().h(22).px(10).bg(t.raised).text_color(t.accent).font_family(settings().font_family).text_size(11).child(row.text);
  if(row.kind==='pair'){const old=row.old?{...row.old,fileId:row.fileId}:null,next=row.next?{...row.next,fileId:row.fileId}:null;return h_flex().when(wrap,e=>e.min_h(22).items_stretch()).when(!wrap,e=>e.h(22)).font_family(settings().font_family).text_size(12).child(codeCell(old,'old',t,wrap,row.filePath||s.file?.newPath,fragments(old),ranges(old,'old'))).child(div().w(1).bg(t.border)).child(codeCell(next,'new',t,wrap,row.filePath||s.file?.newPath,fragments(next),ranges(next,'new')));}
  const mark=row.side==='new'?'+':row.side==='old'?'-':' ';
  const selected=view.target?.comparisonId===(row.comparisonId||s.comparison?.id)&&view.target?.newPath===(row.filePath||s.file?.newPath)&&(row.side==='context'?'new':row.side)===view.target?.side&&(row.side==='old'?row.oldLine:row.newLine)>=view.target?.startLine&&(row.side==='old'?row.oldLine:row.newLine)<=view.target?.endLine;
  return h_flex().when(wrap,e=>e.min_h(22).items_start()).when(!wrap,e=>e.h(22).items_center()).px(8).gap(8).font_family(settings().font_family).text_size(12).bg(selected?t.selected:row.side==='new'?t.ansi2+'18':row.side==='old'?t.ansi1+'18':t.background)
   .child(div().w(36).flex_none().text_right().text_color(t.dim).child(String(row.oldLine??''))).child(div().w(36).flex_none().text_right().text_color(t.dim).child(String(row.newLine??'')))
   .child(sourceText(row,row.filePath||s.file?.newPath,t,wrap,fragments(row),ranges(row,row.side==='old'?'old':'new'),`${mark} `));
 };const click=(id,cx)=>{if(view.diffChangeKey()!==clickSource)return;const row=rows.find(r=>r.id===id);if(!row||row.kind==='editor'||row.kind==='notice')return;if(row.kind==='file-header'){if(!view.fileHeaderViews?.has(row.fileId))view.requestAllFiles?.(row.fileId,cx);return;}if(row.kind==='hunk')return;
  if(row.kind==='pair'){const side=view.commentSide||'new',line=side==='old'?(row.old||row.next):(row.next||row.old);if(line){if(row.fileId)view.selectFileLine?.({...line,comparisonId:row.comparisonId},row.fileId,cx,line.side==='context'?side:null);else view.selectLine(line.id,cx,line.side==='context'?side:null,line);}}
  else if(row.fileId)view.selectFileLine?.({...row,id:row.sourceId},row.fileId,cx);else view.selectLine(id,cx,null,row);};
 const id=`${view.id}-diff-${split?'split':'unified'}${wrap?'-wrap':''}`;
 body=(wrap||rows.some(row=>row.kind==='editor'))?v_flex().relative().size_full().flex_1().min_h(0).min_w(0).child(list(id,rows.length,i=>rows[i].id,i=>renderRow(rows[i])).when(Boolean(view.diffScroll),e=>e.track_scroll(view.diffScroll)).on_item_click((key,cx)=>click(key,cx)).size_full()).child(Scrollbar.vertical(id).viewport_from_layout().absolute().inset_0()):virtualList(id,rows,rows.map(r=>r.kind==='editor'?INLINE_EDITOR_HEIGHT:r.kind==='comment'?commentHeight(r.text):r.kind==='notice'?46:r.kind==='file-header'?34:22),renderRow,click,view.diffScroll);}
 const minWidth=wrap||s.patch?.binary||s.patch?.modeOnly?0:split?Math.max(800,...rows.filter(r=>r.kind==='pair').map(r=>100+Math.max(r.old?.text.length||0,r.next?.text.length||0)*14.6)):Math.max(600,...annotated.filter(r=>r.kind!=='comment').map(r=>100+r.text.length*7.3));
 return v_flex().size_full().min_w(0).min_h(0)
  .child(h_flex().min_h(36).flex_none().px(8).gap(6).flex_wrap().items_center().border_b(1).border_color(t.border)
   .child(buttonGroup('diff-files-mode',[{value:false,label:'Single file'},{value:true,label:`All files${s.files?.length?' · '+s.files.length:''}`}],Boolean(view.allFiles),(all,cx)=>view.toggleAllFiles?.(all,cx)))
   .child(buttonGroup('diff-mode',[{value:'unified',label:'Unified'},{value:'split',label:'Split',tooltip:'Side by side'}],view.diffMode||'unified',(mode,cx)=>view.setDiffMode(mode,cx)))
   .child(toggle('diff-wrap','Wrap',wrap,(pressed,cx)=>view.toggleWrap?.(pressed,cx),{tooltip:'Wrap long lines using native measured rows'}).disabled(!view.toggleWrap))
   .child(toggle('diff-search','Search',Boolean(view.searchOpen),(pressed,cx)=>view.toggleSearch?.(pressed,cx)))
   .child(div().flex_1())
   .when(split,e=>e.child(buttonGroup('comment-side',[{value:'old',label:'Old',tooltip:'Attach comments to the original version'},{value:'new',label:'New',tooltip:'Attach comments to the modified version'}],view.commentSide||'new',(side,cx)=>{view.commentSide=side;cx.notify();})))
   .child(button('select-code','Copy code',(_e,cx)=>view.openCodeCopy('new',cx),{tooltip:'Select and copy the loaded original or modified code without diff markers'}).disabled(!s.patch||Boolean(s.patch.binary||s.patch.modeOnly))))
  .when(!view.allFiles&&Boolean(s.file),e=>e.child(h_flex().id('diff-file-header').min_h(34).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
   .child(text(s.file.newPath).font_semibold().min_w(0).truncate().tooltip(s.file.newPath))
   .when(s.file.additions!=null,e=>e.child(text('+'+s.file.additions).text_color(t.ansi2)).child(text('−'+s.file.deletions).text_color(t.ansi1)))
   .child(div().flex_1())
   .when(Boolean(view.markFileReviewed),e=>e.child(checkbox('file-reviewed','Viewed',view.isFileReviewed?.(s.file),(checked,cx)=>view.markFileReviewed(checked,cx))))
   .child(buttonGroup('change-navigation',[{value:-1,label:'↑',tooltip:'Previous change; continues to the previous file',disabled:!changes.length||Boolean(view.busy)},{value:1,label:'↓',tooltip:'Next change; continues to the next file',disabled:!changes.length||Boolean(view.busy)}],null,(direction,cx)=>view.navigateChange(direction,cx)))
   .child(text(changes.length?`${activeChange<0?'–':activeChange+1}/${changes.length}`:'',true))
   .child(button('comment-file','Comment',(_e,cx)=>view.fileComment(cx),{tooltip:'Comment on this file'}))
   .child(button('expand-context','Whole file',(_e,cx)=>view.work(cx,()=>view.controller.expandFile()),{tooltip:'Load unchanged context for this file'}))))
  .when(Boolean(view.searchOpen&&view.inputs?.find),e=>e.child(h_flex().min_h(36).flex_none().px(8).gap(6).items_center()
   .child(field(view.inputs.find,'Find in loaded diff',180))
   .child(button('find-previous','↑',(_e,cx)=>view.moveFind?.(-1,cx),{tooltip:'Previous match in loaded source'}).disabled(!(view.findMatches||[]).length))
   .child(button('find-next','↓',(_e,cx)=>view.moveFind?.(1,cx),{tooltip:'Next match in loaded source'}).disabled(!(view.findMatches||[]).length))
   .child(text(`${(view.findMatches||[]).length?Math.max(0,(view.findIndex??-1)+1):0}/${(view.findMatches||[]).length}${view.findMatches?.limited?'+ (limit)':''} · loaded context only`,true))
   .child(button('close-search','×',(_e,cx)=>view.toggleSearch?.(false,cx),{tooltip:'Close search (Escape)'}))))
  .when(Boolean(s.patch&&!s.patch.complete),e=>e.child(text(`Incomplete: ${s.patch.reason}`).p(8).text_color(t.ansi1)))
  .child(div().flex_1().min_h(0).min_w(0).w_full().overflow_hidden().child(div().id(`${view.id}-diff-horizontal`).size_full().min_w(0).overflow_x_scrollbar().child(div().min_w(minWidth).w_full().h_full().child(body))));
}
