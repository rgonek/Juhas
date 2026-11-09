import {div,PathBuilder,svg,list} from 'gpui-kit';
import {h_flex,v_flex,v_virtual_list,Scrollbar,Input,Button,Checkbox,Toggle,Switch,Popover,Select,Popup} from 'gpui-base';
import {theme,settings} from 'herdr';
import {typography} from './typography.js';
import {layoutGraph} from './graph.js';
import {fileRows,splitRows,changeGroups,filterDrafts,isTestFile} from './review-ui.js';
import {annotatePatch,composerRows,commentHeight,INLINE_EDITOR_HEIGHT,INLINE_EDITOR_MAX_HEIGHT} from './comments.js';
import {formatCommitTime} from './commit-time.js';
import {decorateLine,intraline,multiFileRows} from './reading.js';
export function uiMetrics(){const look=settings();return typography(look.ui_font_size,window.rem_size());}
export function nativeFrame(id,{framed=true}={}){const type=uiMetrics();const t=theme();return v_flex().id(id).size_full().min_h(0).min_w(0).when(framed,e=>e.rounded(10).border_1().border_color(t.border)).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(type.body).line_height(type.lineHeight);}
function control(element,{active=false,primary=false,segment=false}={}){const type=uiMetrics();const t=theme();return element.h(type.px(28)).flex_none().px(8).flex().gap(6).items_center().justify_center().rounded(6).text_size(type.control).line_height(type.lineHeight).cursor_pointer()
 .text_color(primary?t.solid_foreground:t.foreground).bg(primary?t.solid:active?t.selected:segment?t.chrome:t.background)
 .hover(el=>el.bg(primary?t.solid:t.hover)).active(el=>el.bg(primary?t.solid:t.selected));}
export function button(id,label,action,options={}){
 const name=options.tooltip||(typeof label==='string'?label:'Action');return control(Button.new(id),options).selected(Boolean(options.active)).tab_index(0).accessibility_label(name).tooltip(name)
  .when(Boolean(action),el=>el.on_click(action)).child(label);
}
export function checkbox(id,label,checked,change,{tooltip=label}={}){const type=uiMetrics();
 const t=theme();return control(Checkbox.new(id)).checked(Boolean(checked)).tab_index(0).accessibility_label(label).on_change(change)
  .child(h_flex().gap(6).items_center().tooltip(tooltip)
   .child(div().size(14).flex_none().rounded(3).border_1().border_color(checked?t.accent:t.border).bg(checked?t.accent:t.background).flex().items_center().justify_center().text_size(type.caption).text_color(t.accent_foreground).when(checked,el=>el.child(svg('mods/juhas/icons/check.svg').size(11))))
   .child(label));
}
export function toggle(id,label,pressed,change,{tooltip=label}={}){
 return control(Toggle.new(id),{active:Boolean(pressed)}).pressed(Boolean(pressed)).tab_index(0).accessibility_label(typeof label==='string'?label:tooltip).on_change(change).child(div().tooltip(tooltip).child(label));
}
export function buttonGroup(id,items,selected,select){
 const t=theme();return h_flex().id(id).role('group').accessibility_label(id).flex_none().rounded(6).border_1().border_color(t.border).overflow_hidden()
  .children(items.map((item,index)=>button(`${id}-${item.value}`,item.label,(_event,cx)=>select(item.value,cx),{active:item.value===selected,tooltip:item.tooltip||item.label}).disabled(Boolean(item.disabled)).rounded(0).when(index>0,el=>el.border_l(1).border_color(t.border))));
}
export function popover(id,label,open,change,content,{tooltip=label,width=380,height=240}={}){const type=uiMetrics();
 const t=theme();return Popover.new(id).open(Boolean(open)).on_open_change(change).trigger(button(`${id}-trigger`,label,null,{tooltip}))
  .when(Boolean(open),el=>el.content(v_flex().w(width).min_h(0).min_w(0).p(4).rounded(6).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).child(content())));
}
export function selector(id,label,open,change,content,{tooltip=label,width=300,triggerFocus,listFocus,context,onMove,onChoose,compact=false}={}){const type=uiMetrics(),t=theme();
 const root=Select.new(id).open(Boolean(open)).on_open_change(change)
  .when(Boolean(triggerFocus),e=>e.track_focus(triggerFocus)).when(Boolean(listFocus),e=>e.content_focus_handle(listFocus))
  .accessibility_label(tooltip);
 const surface=()=>v_flex().w(width).min_h(0).min_w(0).p(4).rounded(6).shadow_sm().border_1().border_color(t.border).bg(t.background).text_color(t.foreground)
  .on_mouse_down_out((_e,cx)=>change(false,cx))
  .when(Boolean(listFocus),e=>e.track_focus(listFocus)).when(Boolean(context),e=>e.key_context(context))
  .on_action('juhas.picker.previous',(_e,cx)=>{cx.stop_propagation();onMove?.(-1,cx);})
  .on_action('juhas.picker.next',(_e,cx)=>{cx.stop_propagation();onMove?.(1,cx);})
  .on_action('juhas.picker.choose',(_e,cx)=>{cx.stop_propagation();onChoose?.(cx);}).child(content());
 return root.child(Popup.new(`${id}-popup`,button(`${id}-trigger`,label,(_e,cx)=>{cx.stop_propagation();change(!open,cx);},{tooltip}).when(compact,e=>e.w(type.px(20)).px(0).rounded(0)))
  .when(Boolean(open),e=>e.content(surface())));
}
export function field(state,_placeholder,width){const type=uiMetrics();const t=theme();return Input.new(state).h(type.px(32)).min_w(0).when(Boolean(width),e=>e.w(width)).when(!width,e=>e.flex_1()).px(8).rounded(8).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(type.body).line_height(type.lineHeight);}
// Popup overlays do not provide the viewport used by v_virtual_list. Keep this
// small option window bounded, with the complete collection searchable and
// reachable through the native wheel and the selector's arrow-key actions.
export function optionList(id,items,index,move,choose,{height=196,rows=7,label=item=>item.name,tooltip=item=>item.fullName||item.oid||item.id,selected,remoteColumn=false,onRemote}={}){const type=uiMetrics(),t=theme();
 const start=Math.max(0,Math.min(Math.max(0,items.length-rows),(index||0)-Math.floor(rows/2)));let wheel=0;
 const option=(item,offset)=>{
  const key=item.fullName||item.oid||item.id,active=start+offset===(index||0),checked=selected===key;
  const mark=()=>svg('mods/juhas/icons/check.svg').size(14).flex_none().opacity(checked?1:0);
  const content=h_flex().w_full().gap(8).items_center().child(text(label(item)).flex_1().min_w(0).truncate().text_ellipsis_middle()).when(!remoteColumn,e=>e.child(mark()));
  const row=button(id+'-'+key,content,(_e,cx)=>choose(item,cx),{active,tooltip:tooltip(item)}).h(type.px(28)).min_w(0).px(8).rounded(4).justify_start().tab_index(-1).role('list_box_option').when(active,e=>e.aria_active_descendant());
  if(!remoteColumn)return row.w_full();
  const useRemote=item.remote?.fullName===key;
  return h_flex().h(type.px(28)).min_w(0).rounded(4).bg(active?t.selected:t.background).child(row.flex_1()).child(h_flex().w(46).flex_none().justify_end().pr(8).items_center()
   .when(Boolean(item.local&&item.remote),e=>e.child(Switch.new(id+'-remote-'+item.id).checked(useRemote).tab_index(0).accessibility_label('Use remote version of '+item.name).tooltip('Use remote version of '+item.name).on_mouse_down('left',(_e,cx)=>cx.stop_propagation()).on_change((value,cx)=>{cx.stop_propagation();onRemote?.(item,value,cx);}).child(div().w(28).h(16).rounded(8).bg(useRemote?t.accent:t.border).flex().items_center().px(2).when(useRemote,e=>e.justify_end()).child(div().size(12).rounded(6).bg(t.background)))))
   .when(Boolean(!item.local&&item.remote),e=>e.child(h_flex().id(id+'-remote-only-'+item.id).w(28).h(16).flex_none().items_center().justify_center().tooltip('Only a remote-tracking branch is available; there is no local branch to switch to. Uses the last fetched version.').child(svg('mods/juhas/icons/check.svg').size(13).text_color(t.muted)))));
 };
 return v_flex().id(id).h(type.px(Math.min(height,Math.max(1,Math.min(rows,items.length))*28))).flex_none().min_w(0).overflow_hidden().role('list')
  .on_scroll_wheel((event,cx)=>{cx.stop_propagation();wheel-=event.delta_lines?.y??(event.delta?.y||0)/type.px(28);const steps=Math.trunc(wheel);if(steps){wheel-=steps;move(steps,cx);}})
  .when(!items.length,e=>e.child(text('No matches',true).p(8)))
  .children(items.slice(start,start+rows).map(option));
}
export function text(value,dim=false){const type=uiMetrics();const t=theme();return div().text_size(type.body).line_height(type.lineHeight).text_color(dim?t.muted:t.foreground).child(value);}
export function fileStatus(file,reviewed=false){const t=theme(),status=file.status||'M',color=status==='D'?t.ansi1:status==='A'?t.ansi2:t.ansi4||t.accent,icon={A:'added',D:'deleted',M:'modified',R:'renamed',C:'copied'}[status]||'modified';
 return svg(reviewed?'mods/juhas/icons/check.svg':`mods/juhas/icons/file-${icon}.svg`).size(14).flex_none().text_color(color)
  .tooltip(`${status==='A'?'Added':status==='D'?'Deleted':status==='R'?'Renamed':status==='C'?'Copied':'Modified'}${reviewed?' · viewed':''}`);
}
export function commitId(oid){const type=uiMetrics();return h_flex().gap(4).items_center().child(text(oid,true)).child(button('copy-commit-id',svg('mods/juhas/icons/copy.svg').size(13),(_e,cx)=>cx.write_to_clipboard(oid),{tooltip:'Copy full commit ID'}).h(type.px(22)).w(22).px(0));}
export function virtualList(id,items,height,row,click,scrollHandle=null,viewportHeight=null){const type=uiMetrics();id=`${id}-${type.body}`;return v_flex().relative().size_full().flex_1().min_h(0).min_w(0).child(v_virtual_list(id,items.length,height,i=>String(items[i].renderKey??items[i].id??items[i].oid??i),range=>items.slice(range.start,range.end).map(row)).when(Boolean(scrollHandle),el=>el.track_scroll(scrollHandle)).on_item_click((key,cx)=>{const item=items.find(i=>String(i.renderKey??i.id??i.oid)===String(key));click(item?.id??item?.oid??key,cx);}).size_full().when(viewportHeight!=null,e=>e.h(viewportHeight).flex_none())).child(Scrollbar.vertical(id).viewport_from_layout().absolute().inset_0());}
export function section(title){const type=uiMetrics();const t=theme();return div().h(type.px(34)).flex_none().px(10).py(type.px(6)).text_size(type.body).font_semibold().text_color(t.foreground).bg(t.chrome).child(title);}
export function draftsPane(view,cx){const type=uiMetrics();
 const repoKey=view.controller.state.repo?.key,drafts=filterDrafts(view.controller.session().drafts,{repoKey}),status=view.draftStatus||'all',source=view.draftSource||'all',visible=filterDrafts(drafts,{status,source}),sources=[...new Map(drafts.map(d=>[d.comparisonId,d])).values()];
 const sourceLabel=d=>d.targetOid?`${d.baseOid?.slice(0,8)||'empty'} → ${d.targetOid.slice(0,8)}`:'Working tree';
 const choose=(value,cx)=>{view.draftSource=value;view.draftSourcePicker=false;cx.notify();};
 return v_flex().size_full().min_h(0).min_w(0)
  .child(h_flex().items_center().child(section(`Saved comments · ${visible.length}/${drafts.length}`).flex_1())
   .when(Boolean(view.navigateComment),e=>e.child(button('comment-previous','↑',(_e,cx)=>view.navigateComment(-1,cx),{tooltip:'Previous comment'})).child(button('comment-next','↓',(_e,cx)=>view.navigateComment(1,cx),{tooltip:'Next comment'})))
   .when(Boolean(view.generalComment),e=>e.child(button('general-comment','General comment',(_e,cx)=>view.generalComment(cx))))
   .child(button('clear-comments','Clear all',(_e,cx)=>{view.controller.mutate(session=>({...session,drafts:session.drafts.filter(d=>d.repoKey!==repoKey)}));cx.notify();},{tooltip:'Delete all saved comments in this repository, including comments hidden by filters'}).disabled(!drafts.length)))
  .child(h_flex().min_h(type.px(36)).flex_none().px(8).py(type.px(4)).gap(6).flex_wrap().items_center()
   .child(buttonGroup('draft-status',[{value:'all',label:'All'},{value:'current',label:'Current'},{value:'outdated',label:'Outdated'}],status,(value,cx)=>{view.draftStatus=value;cx.notify();}))
   .child(popover('draft-source',source==='all'?'All comparisons':sourceLabel(sources.find(d=>d.comparisonId===source)||{}),Boolean(view.draftSourcePicker),(open,cx)=>{view.draftSourcePicker=open;cx.notify();},()=>v_flex().size_full().min_h(0)
    .child(button('draft-source-all','All comparisons',(_e,cx)=>choose('all',cx)))
    .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().children(sources.map(d=>button(`draft-source-${d.id}`,sourceLabel(d),(_e,cx)=>choose(d.comparisonId,cx),{active:source===d.comparisonId,tooltip:`${d.baseOid||'empty'} → ${d.targetOid||'working tree'}`})))),{tooltip:'Filter saved comments by source comparison; Submit review still includes all saved comments'})))
  .child(v_flex().flex_1().min_h(0).min_w(0).overflow_y_scrollbar()
   .when(!visible.length,e=>e.child(text('No saved comments match these filters.',true).p(type.px(10))))
   .children(visible.map(d=>h_flex().gap(6).px(8).py(type.px(4)).items_center()
    .child(v_flex().flex_1().min_w(0).tooltip(`${d.scope==='general'?'General review':d.newPath||d.oldPath}\n${sourceLabel(d)}\n${d.body}`)
     .child(text(`${d.status==='outdated'?'[OUTDATED] ':''}${d.scope==='general'?'General review':`${d.newPath||d.oldPath} ${d.startLine??''}`}`,true).truncate().text_ellipsis_middle().tooltip(d.newPath||d.oldPath||'General review'))
     .child(text(d.body).truncate()).child(text(sourceLabel(d),true).text_size(type.caption)).when(Boolean(view.openComment)&&d.scope!=='general',e=>e.cursor_pointer().on_click((_e,cx)=>view.openComment(d,cx))))
    .when(Boolean(view.openComment)&&d.scope!=='general',e=>e.child(button(`open-code-${d.id}`,'Code',(_e,cx)=>view.openComment(d,cx),{tooltip:'Open the exact source of this comment'})))
    .child(button(`edit-${d.id}`,'Edit',(_e,cx)=>view.editDraft(d,cx))).child(button(`delete-${d.id}`,'Delete',(_e,cx)=>{view.controller.removeComment(d.id);cx.notify();})))));
}
export const LIST_ROW_HEIGHT=29;
export function historyLoadingIndicator(state){const label=state.historyBaseLoading?'Resolving base...':state.historyLoadingMore?'Loading more commits...':'Loading Git history...';return h_flex().gap(4).flex_none().items_center().tooltip(label).accessibility_label(label).child(svg('mods/juhas/icons/loader-circle.svg').size(12).text_color(theme().muted).spin(900)).child(text(state.historyBaseLoading?'Base...':state.historyLoadingMore?'More...':'Loading...',true));}
export function graphCell(row){const type=uiMetrics();
 const height=type.px(LIST_ROW_HEIGHT),mid=height/2,t=theme(),colors=[t.ansi4,t.ansi2,t.ansi5,t.ansi3,t.ansi6];const x=lane=>8+lane*11;const paths=[];
 for(let i=0;i<row.before.length;i++)if(row.before[i]&&i!==row.lane){const to=row.after.indexOf(row.before[i]);if(to>=0)paths.push(window.paint_path(PathBuilder.stroke(1.5).move_to(x(i),0).line_to(x(to),height).build(),colors[i%colors.length]).absolute().inset_0());}
 paths.push(window.paint_path(PathBuilder.stroke(1.5).move_to(x(row.lane),0).line_to(x(row.lane),mid).build(),colors[row.lane%colors.length]).absolute().inset_0());
 for(const e of row.edges)paths.push(window.paint_path(PathBuilder.stroke(1.5).move_to(x(e.from),mid).line_to(x(e.to),height).build(),colors[e.to%colors.length]).absolute().inset_0());
 return div().relative().w(Math.min(120,Math.max(28,(Math.max(row.before.length,row.after.length)+1)*11))).h(height).flex_none().overflow_hidden().children(paths).child(div().absolute().left(x(row.lane)-3).top(mid-3).size(6).rounded(3).bg(colors[row.lane%colors.length]));
}
export function historyPane(view,cx){const type=uiMetrics();
 const s=view.controller.state,t=theme(),rows=layoutGraph(s.history).rows,width=view.historyPaneWidth??view.width??480;
 const first=s.history.findIndex(c=>c.oid===(view.commitAnchor||s.comparison?.scope.base)),last=s.history.findIndex(c=>c.oid===s.comparison?.targetOid);
 const selected=(c,i)=>view.rangePicking?c.oid===view.commitAnchor:s.comparison?.scope.kind==='range'?i>=Math.min(first,last)&&i<=Math.max(first,last):s.comparison?.targetOid===c.oid;
 const list=virtualList(`${view.id}-history`,s.history,type.px(LIST_ROW_HEIGHT),c=>{const i=s.history.indexOf(c),refs=(c.refs||[]).filter(ref=>ref!=='HEAD').map(ref=>({label:ref.replace(/^HEAD -> /,'').replace(/^tag: /,''),current:ref.startsWith('HEAD -> '),tag:ref.startsWith('tag: '),full:ref}));return h_flex().h(type.px(LIST_ROW_HEIGHT)).px(4).gap(6).items_center().when(selected(c,i),e=>e.bg(t.selected))
  .tooltip(`${c.subject}\n${c.author} · ${new Date(c.timestamp*1000).toLocaleString()}\n${c.oid}\n${(c.refs||[]).join(', ')}`)
  .child(graphCell(rows[i]))
  .when(Boolean(refs.length),e=>e.child(h_flex().max_w(160).min_w(0).gap(3).items_center().children(refs.slice(0,1).map(ref=>h_flex().min_w(0).max_w(130).h(type.px(24)).px(4).gap(3).items_center().rounded(4).border_1().border_color(ref.current?t.accent:t.border).bg(ref.current?t.selected:t.chrome).tooltip(ref.full)
   .child(text(ref.current?'\u2713':ref.tag?'\u25c7':'\u2442',true)).child(text(ref.label).min_w(0).truncate().text_ellipsis_middle()))).when(refs.length>1,e=>e.child(text(`+${refs.length-1}`,true).flex_none().tooltip(refs.slice(1).map(ref=>ref.full).join('\n'))))))
  .child(div().flex_1().min_w(0).truncate().text_size(type.body).text_color(c.parents.length>1?t.muted:t.foreground).child(c.subject))
  .when(width>=type.px(900),e=>e.child(div().w(75).flex_none().truncate().text_size(type.caption).text_color(t.muted).child(c.author)))
  .when(width>=type.px(720),e=>e.child(div().w(112).flex_none().truncate().text_size(type.caption).text_color(t.muted).child(formatCommitTime(c.timestamp))));},(id,cx)=>view.selectCommit(id,cx));
 const commit=s.history.find(c=>c.oid===s.comparison?.targetOid);
 return v_flex().size_full().min_w(0).min_h(0).on_size_change((size,cx)=>{const width=Math.round(size.width);if(view.historyPaneWidth!==width){view.historyPaneWidth=width;cx.notify();}}).child(h_flex().h(type.px(34)).flex_none().items_center().gap(4)
  .child(section(view.historyRef==='all'?'Git history · all branches':view.historyFull?'Git history':s.featureBaseOid?'Git history · branch':'Git history · HEAD').flex_1().min_w(0).truncate())
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
  .when(Boolean(view.filtersOpen),e=>e.child(v_flex().px(8).pb(6).gap(4)
   .child(field(view.inputs.query,'Text or hash')).child(field(view.inputs.author,'Author')).child(field(view.inputs.path,'Path'))
   .child(button('apply-filters','Search',(_e,cx)=>view.work(cx,()=>view.controller.loadHistory(view.filters()))))))
  .child(list).when(Boolean(view.detailsOpen&&commit),e=>e.child(v_flex().flex_none().max_h(type.px(130)).overflow_y_scrollbar().p(type.px(10)).gap(5).border_t(1).border_color(t.border)
    .child(text(s.details?.subject||commit.subject).font_semibold()).child(text(s.details?.author||`${commit.author} · ${new Date(commit.timestamp*1000).toLocaleString()}`,true)).child(commitId(commit.oid)).child(text(s.details?.body||'',true)).child(text(commit.refs.join(', '),true))))
  .when(s.hasMore,e=>e.child(button('history-more',s.historyLoadingMore?'Loading...':'Load 300 more',(_e,cx)=>view.work(cx,()=>view.controller.loadHistory(view.filters(),true))).disabled(Boolean(s.historyLoading||s.historyBaseLoading))));
}
export function filesPane(view){const type=uiMetrics();
 const s=view.controller.state,t=theme(),session=view.controller.session(),drafts=session.drafts,query=view.inputs?.fileQuery?.value()||'',rows=fileRows(view.visibleFiles?.()||s.files,view.fileTree,view.collapsedDirs||new Set(),query);

 const counts=new Map();for(const d of drafts)if(d.repoKey===s.repo?.key)counts.set(d.newPath,(counts.get(d.newPath)||0)+1);
 return v_flex().size_full().min_w(0).min_h(0).child(h_flex().h(type.px(30)).flex_none().items_center().child(section(`Files · ${s.files.length}`).flex_1().min_w(0).truncate())
  .child(toggle('hide-tests',svg('mods/juhas/icons/flask-conical-off.svg').size(15),Boolean(view.hideTests),(pressed,cx)=>view.setHideTests?.(pressed,cx),{tooltip:'Hide test files'}))
  .when(Boolean(view.inputs?.fileQuery),e=>e.child(button('toggle-file-filter',svg('mods/juhas/icons/search.svg').size(14),(_e,cx)=>{view.fileFilterOpen=!view.fileFilterOpen;if(view.fileFilterOpen)view.inputs.fileQuery.focus();cx.notify();},{active:Boolean(view.fileFilterOpen||query),tooltip:'Filter files by path'})))
  .child(toggle('file-tree',svg('mods/juhas/icons/tree.svg').size(15),view.fileTree,(pressed,cx)=>{view.fileTree=pressed;cx.notify();},{tooltip:'Show files as a directory tree'})))
 .when(Boolean(view.inputs?.fileQuery&&(view.fileFilterOpen||query)),e=>e.child(h_flex().min_h(type.px(38)).flex_none().px(8).py(3).gap(6).items_center().child(field(view.inputs.fileQuery,'Filter files by path')).when(Boolean(query),e=>e.child(text(`${rows.filter(f=>!f.directory).length}/${s.files.length}`,true)).child(button('clear-file-filter','×',(_e,cx)=>{view.inputs.fileQuery.set_value('');cx.notify();},{tooltip:'Clear file filter'})))))
 .when(!rows.length,e=>e.child(text(query?'No changed files match this path.':'No changed files in this comparison.',true).p(type.px(10))))
 .child(virtualList(`${view.id}-files`,rows.map(f=>({...f,renderKey:JSON.stringify([f.id,counts.get(f.newPath)||0,s.file?.id===f.id])})),type.px(LIST_ROW_HEIGHT),f=>{
  if(f.directory)return h_flex().h(type.px(LIST_ROW_HEIGHT)).pl(9+f.depth*14).pr(9).min_w(0).gap(6).items_center().text_size(type.body).text_color(t.muted).tooltip(`${f.path} · ${f.fileCount} changed ${f.fileCount===1?'file':'files'}${query.trim()?' · Matching folders stay expanded while filtering':''}`).child(svg(`mods/juhas/icons/chevron-${f.closed?'right':'down'}.svg`).size(12).flex_none()).child(div().min_w(0).truncate().text_ellipsis_middle().child(f.name)).child(div().flex_none().text_size(type.caption).text_color(t.dim).child(`${f.fileCount} ${f.fileCount===1?'file':'files'}`));
  const count=counts.get(f.newPath)||0;return h_flex().h(type.px(LIST_ROW_HEIGHT)).pl(9+(f.depth||0)*14).pr(9).gap(7).items_center().when(s.file?.id===f.id,e=>e.bg(t.selected)).tooltip(f.newPath)
   .child(fileStatus(f)).child(div().flex_1().min_w(0).truncate().when(view.fileTree,e=>e.text_ellipsis_middle()).when(!view.fileTree,e=>e.text_ellipsis_start()).text_size(type.body).text_color(t.foreground).child(view.fileTree?f.name:f.newPath))
   .when(f.additions!=null,e=>e.child(text('+'+f.additions).text_color(t.ansi2)).child(text('−'+f.deletions).text_color(t.ansi1)))
   .when(count>0,e=>e.child(h_flex().gap(3).items_center().tooltip('Saved comments').child(svg('mods/juhas/icons/comment.svg').size(12).text_color(t.accent)).child(text(String(count)).text_color(t.accent))));
 },(id,cx)=>{const f=rows.find(r=>r.id===id);if(f?.directory){if(query.trim())return;view.collapsedDirs??=new Set();if(f.closed){for(const path of f.paths)view.collapsedDirs.delete(path);}else view.collapsedDirs.add(f.path);cx.notify();}else view.selectFile(id,cx);},view.reviewIsVisible?.()===false?null:view.filesScroll));
}
function sourceText(row,path,t,wrap,changed,matches,prefix=''){
 const colors={keyword:t.ansi5,string:t.ansi2,number:t.ansi3,comment:t.muted};
 return h_flex().min_w(0).when(wrap,e=>e.flex_1().flex_wrap()).when(!wrap,e=>e.flex_none()).items_start()
  .when(Boolean(prefix),e=>e.child(div().flex_none().child(prefix)))
  .children(decorateLine(row?.text||'',path,changed,matches).map(span=>div().min_w(0).when(!wrap,e=>e.flex_none()).when(wrap,e=>e.whitespace_normal())
   .text_color(colors[span.kind]||t.foreground).when(span.changed,e=>e.bg(row?.side==='old'?t.ansi1+'55':t.ansi2+'55')).when(span.match,e=>e.bg(t.selected).underline()).child(span.text.replace(/\t/g,'    '))));
}
function codeCell(row,side,t,wrap,path,changed=[],matches=[],selected=false){const type=uiMetrics();
 const line=row?.[side==='old'?'oldLine':'newLine'];return h_flex().flex_1().min_w(0).when(wrap,e=>e.min_h(type.px(22)).items_start()).when(!wrap,e=>e.h(type.px(22)).items_center()).gap(8).px(8).overflow_hidden()
  .bg(selected?t.selected:row?.side==='old'?t.ansi1+'18':row?.side==='new'?t.ansi2+'18':t.background)
  .child(div().w(36).flex_none().text_right().text_color(selected?t.accent:t.dim).child(String(line??'')))
  .child(sourceText(row,path,t,wrap,changed,matches));
}
function commentCard(row,viewId,width='100%'){const type=uiMetrics(),t=theme();return h_flex().h(type.px(commentHeight(row.text))).w_full().max_w(width||'100%').min_w(0).px(12).py(type.px(6)).gap(10).items_center().border_l(2).border_color(t.accent).bg(t.raised).child(svg('mods/juhas/icons/comment.svg').size(14).flex_none().text_color(t.muted)).child(text(row.text).flex_1().min_w(0).max_h(type.px(commentHeight(row.text)-12)).overflow_y_scrollbar().whitespace_normal());}
export function diffPane(view,cx){const type=uiMetrics();
 const s=view.controller.state,t=theme(),hiddenSelected=Boolean(view.hideTests&&isTestFile(s.file)),drafts=view.controller.session().drafts,annotated=hiddenSelected?[]:annotatePatch(s.patch,drafts,s.comparison?.id,s.file?.newPath),split=view.diffMode==='split',wrap=Boolean(view.readingOptions?.wrap);
 const activeTarget=view.inlineEditor&&view.target?.comparisonId===s.comparison?.id&&view.target?.newPath===s.file?.newPath?view.target:null,composed=composerRows(annotated,activeTarget,view.editId);
 const clickSource=view.diffChangeKey();
 const selectedLine=(row,side,container=row)=>{const target=view.target,line=row?.[side==='old'?'oldLine':'newLine'];return Boolean(target&&line!=null&&target.comparisonId===(container?.comparisonId||s.comparison?.id)&&target.newPath===(container?.filePath||s.file?.newPath)&&target.side===side&&line>=target.startLine&&line<=target.endLine);};
 const present=(source,patch)=>{const visible=source.filter(row=>row.kind!=='hunk'),display=split?splitRows(visible):visible;return patch?.binary||patch?.modeOnly?[{id:'diff-notice',kind:'notice',text:patch.binary?'Binary file changed · file comments are available':'File mode or submodule changed · no text hunks'},...display]:display;};
 const sections=view.allFiles?(view.allFileSections||[]).filter(section=>!view.hideTests||!isTestFile(section.file)).map(section=>{const source=section.patch?annotatePatch(section.patch,drafts,section.comparison?.id,section.file.newPath):null,target=view.target?.comparisonId===section.comparison?.id&&view.target?.newPath===section.file.newPath?view.target:null;return {...section,source,rows:source?present(composerRows(source,target,view.editId),section.patch):null};}):null;
 const rows=sections?multiFileRows(sections):present(composed,s.patch),changes=changeGroups(rows),emphasis=new Map(),pairs=new Map();
 const paired=(source,fileId='')=>{for(const row of splitRows(source))if(row.kind==='pair'&&row.old&&row.next&&row.old!==row.next){const pair={old:row.old,next:row.next,fileId};pairs.set(fileId+':'+row.old.id,pair);pairs.set(fileId+':'+row.next.id,pair);}};if(sections){for(const section of sections)if(section.source&&!section.collapsed&&!section.limited)paired(section.source,section.file.id);}else paired(annotated);
 const ranges=(row,side)=>{const line=row?.[side==='old'?'oldLine':'newLine'];return (view.findMatches||[]).filter(m=>m.side===side&&m.line===line&&(!view.allFiles||m.fileId===row.fileId));};
 const fragments=row=>{const key=(row?.fileId||'')+':'+(row?.sourceId||row?.id),pair=pairs.get(key);if(pair&&!emphasis.has(key)){const result=intraline(pair.old.text,pair.next.text);emphasis.set(pair.fileId+':'+pair.old.id,result.old);emphasis.set(pair.fileId+':'+pair.next.id,result.new);}return emphasis.get(key)||[];};
 view.patchRows=annotated;view.diffRows=rows;view.diffRowsKey=view.diffChangeKey();const activeChange=view.changeCursor?.source===view.diffRowsKey?changes.findIndex(change=>change.id===view.changeCursor.id):-1;
 let body;
 if((!view.allFiles&&hiddenSelected)||(view.allFiles&&view.hideTests&&s.files?.length&&!sections.length))body=text('Test files are hidden',true).p(type.px(20));
 else if(!s.file&&!view.allFiles)body=text('Select a file to review').p(type.px(20));
 else if(!s.patch&&!view.allFiles)body=text(view.busy?'Reading diff…':'No diff loaded').p(type.px(20));
 else {const renderRow=row=>{
  if(row.kind==='file-header'&&view.fileHeaderViews?.has(row.fileId))return div().h(type.px(34)).w_full().child(view.fileHeaderViews.get(row.fileId));
  if(row.kind==='file-header')return h_flex().h(type.px(34)).px(10).items_center().gap(8).bg(t.raised).text_color(t.foreground).child(text(row.collapsed?'▸':'▾',true)).child(text(row.text).font_semibold()).child(text(row.loading?'Loading…':row.limited?'Limited':'',true));
  if(row.kind==='notice')return text(row.text,true).h(type.px(46)).p(type.px(12));
  if(row.kind==='comment'||row.kind==='editor'){
   const height=row.kind==='editor'?type.px(INLINE_EDITOR_HEIGHT):(commentHeight(row.text)*type.scale),content=()=>row.kind==='editor'?div().min_h(height).max_h(type.px(INLINE_EDITOR_MAX_HEIGHT)).w_full().max_w(view.width||'100%').child(view.inlineEditor):commentCard(row,view.id,view.width);
   if(!split||!row.draft?.side)return content();
   return h_flex().when(row.kind==='editor',e=>e.min_h(height).max_h(type.px(INLINE_EDITOR_MAX_HEIGHT))).when(row.kind!=='editor',e=>e.h(height)).w_full().min_w(0).child(row.draft.side==='old'?div().flex_1().min_w(0).child(content()):div().flex_1().min_w(0)).child(div().w(1).h_full().bg(t.border)).child(row.draft.side==='new'?div().flex_1().min_w(0).child(content()):div().flex_1().min_w(0));
  }
  if(row.kind==='hunk')return div().h(type.px(22)).px(10).bg(t.raised).text_color(t.accent).font_family(settings().font_family).text_size(type.caption).child(row.text);
  if(row.kind==='pair'){const old=row.old?{...row.old,fileId:row.fileId}:null,next=row.next?{...row.next,fileId:row.fileId}:null;return h_flex().when(wrap,e=>e.min_h(type.px(22)).items_stretch()).when(!wrap,e=>e.h(type.px(22))).font_family(settings().font_family).text_size(type.code).line_height(type.lineHeight).child(codeCell(old,'old',t,wrap,row.filePath||s.file?.newPath,fragments(old),ranges(old,'old'),selectedLine(old,'old',row))).child(div().w(1).bg(t.border)).child(codeCell(next,'new',t,wrap,row.filePath||s.file?.newPath,fragments(next),ranges(next,'new'),selectedLine(next,'new',row)));}
  const mark=row.side==='new'?'+':row.side==='old'?'-':' ';
  const selected=selectedLine(row,row.side==='context'?(view.target?.side||'new'):row.side==='old'?'old':'new');
  return h_flex().when(wrap,e=>e.min_h(type.px(22)).items_start()).when(!wrap,e=>e.h(type.px(22)).items_center()).px(8).gap(8).font_family(settings().font_family).text_size(type.code).line_height(type.lineHeight).bg(selected?t.selected:row.side==='new'?t.ansi2+'18':row.side==='old'?t.ansi1+'18':t.background)
   .child(div().w(36).flex_none().text_right().text_color(t.dim).child(String(row.oldLine??''))).child(div().w(36).flex_none().text_right().text_color(t.dim).child(String(row.newLine??'')))
   .child(sourceText(row,row.filePath||s.file?.newPath,t,wrap,fragments(row),ranges(row,row.side==='old'?'old':'new'),`${mark} `));
 };const click=(id,cx)=>{if(view.diffChangeKey()!==clickSource)return;const row=rows.find(r=>r.id===id);if(!row||row.kind==='editor'||row.kind==='notice')return;if(row.kind==='file-header'){if(!view.fileHeaderViews?.has(row.fileId))view.requestAllFiles?.(row.fileId,cx);return;}if(row.kind==='hunk')return;
  if(row.kind==='comment'){view.editDraft?.(row.draft,cx);return;}
  if(row.kind==='pair'){const side=view.commentSide||'new',line=side==='old'?(row.old||row.next):(row.next||row.old);if(line){if(row.fileId)view.selectFileLine?.({...line,comparisonId:row.comparisonId},row.fileId,cx,line.side==='context'?side:null);else view.selectLine(line.id,cx,line.side==='context'?side:null,line);}}
  else if(row.fileId)view.selectFileLine?.({...row,id:row.sourceId},row.fileId,cx);else view.selectLine(id,cx,null,row);};
 const measured=wrap||rows.some(row=>row.kind==='editor'),id=`${view.id}-diff-${split?'split':'unified'}${wrap?'-wrap':measured?'-editor':''}-${type.body}`;
 const scroller=view.reviewIsVisible?.()===false?null:view.diffScroll;
 // A growing retained editor has no fixed row height; let the native list measure it.
 body=measured?v_flex().relative().size_full().flex_1().min_h(0).min_w(0).child(list(id,rows.length,i=>rows[i].id,i=>renderRow(rows[i])).when(Boolean(scroller),e=>e.track_scroll(scroller)).on_item_click((key,cx)=>click(key,cx)).size_full()).child(Scrollbar.vertical(id).viewport_from_layout().absolute().inset_0()):virtualList(id,rows,rows.map(r=>r.kind==='comment'?type.px(commentHeight(r.text)):r.kind==='notice'?type.px(46):r.kind==='file-header'?type.px(34):type.px(22)),renderRow,click,scroller);}
 const minWidth=wrap||s.patch?.binary||s.patch?.modeOnly?0:split?Math.max(800,...rows.filter(r=>r.kind==='pair').map(r=>100+Math.max(r.old?.text.length||0,r.next?.text.length||0)*14.6)):Math.max(600,...annotated.filter(r=>r.kind!=='comment').map(r=>100+r.text.length*7.3));
 return v_flex().size_full().min_w(0).min_h(0)
  .on_size_change((size,cx)=>{if(view.diffWidth!==size.width){view.diffWidth=size.width;view.prepareFileHeaders?.(cx);}})
  .child(h_flex().min_h(type.px(36)).flex_none().px(8).gap(6).flex_wrap().items_center().border_b(1).border_color(t.border)
   .child(buttonGroup('diff-files-mode',[{value:true,label:svg('mods/juhas/icons/all-files.svg').size(15),tooltip:'All files'},{value:false,label:svg('mods/juhas/icons/single-file.svg').size(15),tooltip:'Single file'}],Boolean(view.allFiles),(all,cx)=>view.toggleAllFiles?.(all,cx)))
   .child(buttonGroup('diff-mode',[{value:'unified',label:svg('mods/juhas/icons/diff-unified.svg').size(15),tooltip:'Unified diff'},{value:'split',label:svg('mods/juhas/icons/diff-split.svg').size(15),tooltip:'Split diff'}],view.diffMode||'unified',(mode,cx)=>view.setDiffMode(mode,cx)))
   .child(toggle('diff-wrap',svg('mods/juhas/icons/wrap.svg').size(15),wrap,(pressed,cx)=>view.toggleWrap?.(pressed,cx),{tooltip:'Wrap long lines'}).disabled(!view.toggleWrap))
   .child(toggle('diff-search',svg('mods/juhas/icons/search.svg').size(15),Boolean(view.searchOpen),(pressed,cx)=>view.toggleSearch?.(pressed,cx),{tooltip:'Search in loaded diff'}))
   .when(Boolean(view.allFiles),e=>e.child(toggle('diff-hide-tests',svg('mods/juhas/icons/flask-conical-off.svg').size(15),Boolean(view.hideTests),(pressed,cx)=>view.setHideTests?.(pressed,cx),{tooltip:'Hide test files'})))
   .child(button('expand-all-files',svg(`mods/juhas/icons/${view.anyFileExpanded?.()?'chevrons-down-up':'chevrons-up-down'}.svg`).size(15),(_e,cx)=>view.toggleAllExpansion?.(cx),{tooltip:view.anyFileExpanded?.()?'Collapse all files':'Expand all visible files'}).disabled(!s.files?.length||Boolean(view.busy&&!view.anyFileExpanded?.())))
   .child(div().flex_1()))
  .when(!view.allFiles&&!hiddenSelected&&Boolean(s.file),e=>e.child(h_flex().id('diff-file-header').min_h(type.px(34)).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
   .child(fileStatus(s.file))
   .child(text(s.file.newPath).flex_1().min_w(0).truncate().text_ellipsis_middle().tooltip(s.file.newPath))
   .when(s.file.additions!=null,e=>e.child(text('+'+s.file.additions).flex_none().text_size(type.caption).text_color(t.ansi2)).child(text('−'+s.file.deletions).flex_none().text_size(type.caption).text_color(t.ansi1)))
   .child(button('comment-file',svg('mods/juhas/icons/comment.svg').size(14),(_e,cx)=>view.fileComment(cx),{tooltip:'Comment on this file'}).w(28).px(0))
   .child(button('expand-context',svg(`mods/juhas/icons/${s.patch?.fullContext?'fold':'unfold'}-vertical.svg`).size(14),(_e,cx)=>view.toggleFileContext?.(s.file.id,cx),{tooltip:s.patch?.fullContext?'Fold unchanged context':'Show whole file'}).w(28).px(0))))
  .when(Boolean(view.searchOpen&&view.inputs?.find),e=>e.child(h_flex().min_h(type.px(36)).flex_none().px(8).gap(6).items_center()
   .child(field(view.inputs.find,'Find in loaded diff',180))
   .child(button('find-previous','↑',(_e,cx)=>view.moveFind?.(-1,cx),{tooltip:'Previous match in loaded source'}).disabled(!(view.findMatches||[]).length))
   .child(button('find-next','↓',(_e,cx)=>view.moveFind?.(1,cx),{tooltip:'Next match in loaded source'}).disabled(!(view.findMatches||[]).length))
   .child(text(`${(view.findMatches||[]).length?Math.max(0,(view.findIndex??-1)+1):0}/${(view.findMatches||[]).length}${view.findMatches?.limited?'+ (limit)':''} · loaded context only`,true))
   .child(button('close-search','×',(_e,cx)=>view.toggleSearch?.(false,cx),{tooltip:'Close search (Escape)'}))))
  .when(Boolean(s.patch&&!s.patch.complete),e=>e.child(text(`Incomplete: ${s.patch.reason}`).p(type.px(8)).text_color(t.ansi1)))
  .child(div().flex_1().min_h(0).min_w(0).w_full().overflow_hidden().child(div().id(`${view.id}-diff-horizontal`).size_full().min_w(0).overflow_x_scrollbar().child(div().min_w(minWidth).w_full().h_full().child(body))));
}
