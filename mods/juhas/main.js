import {revealPatchGap} from './diff.js';
import {selectionModelBatches} from './selection.js';
import DiffRow from './diff-row.js';
import DiffViewport from './diff-viewport.js';
import {DiffSelection} from './diff-selection.js';
import {View,div,svg} from 'gpui-kit';
import {h_flex,v_flex,InputState,TextareaState,Textarea,Editor,EditorState,h_resizable,v_resizable,resizable_panel,ScrollHandle,VirtualListScrollHandle} from 'gpui-base';
import {exec,shared,setShared,props,focused,spaces,panes,terminals,theme,settings,run,appHome,nextCommand,readTextFile,agents,layout} from 'herdr';
import {Controller} from './controller.js';
import {createRunner,uid,fingerprint,utf8Bytes} from './git.js';
import {createCache} from './cache.js';
import {readDirectories,readWorkspacePaths} from './platform.js';
import {resolveRepo} from './repositories.js';
import {hasWorkingChanges,workingLineCounts} from './working-observation.js';
import {resolveConfig,suggestBases,selectBase,readLocalConfig} from './config.js';
import {commentTarget,annotatePatch,composerRows,measuredCommentRows} from './comments.js';
import InlineEditor from './inline-editor.js';
import FileHeader from './file-header.js';
import CommentCard from './comment-card.js';
import {buildBatch,createSubmitter,updateBatch,detectRecipient,agentRecipients,isLiveTerminal,MAX_REVIEW_BYTES} from './submit.js';
import {uiMetrics,button,field,text,section,historyPane,filesPane,diffPane,nativeFrame,virtualList,checkbox,toggle,buttonGroup,popover,selector,optionList,draftsPane,historyLoadingIndicator} from './ui.js';
import {expandReview,collapseReview,openReview} from './presentation.js';
import {rangeSelection,changeGroups,stepChange,splitRows,patchCode,isTestFile,currentBranchFits,branchChoices} from './review-ui.js';
import {reviewContext,resolveRepositoryScope,allowedRepository,contextStorageKey} from './context.js';
import {listHistory} from './history.js';
import {createRefreshScheduler,createRefreshCoordinator,reviewVisible} from './refresh.js';
import {generalTarget} from './review.js';
import {reviewedState,setFileReviewed,nextUnreviewed} from './progress.js';
import {findInPatch,withLineInfo,runDiffBatches} from './reading.js';
import {reviewTabKey,liveReviewTab,reviewTabProps} from './review-tab.js';

// Each mod copy has its own module generation; durable drafts use Herdr shared state.
const cache=createCache();
const submit=createSubmitter();
const store={get:shared,set:setShared};
const scopeCache=new Map();
export default class Juhas extends View {
 init(p,cx){
  p=props()||p||{};
  this.id=`review-${uid()}`;this.role=p?.role||'pane';this.compact=this.role==='sidebar';this.sessionId=p?.sessionId||focused()?.space||'default';
  this.selectionKey=`git-review.v1.selection.${this.sessionId}`;this.seenSelection=null;this.busy=false;this.message='';this.panel=null;this.upperView='changes';this.target=null;this.selectedStart=null;this.filtersOpen=false;
  this.config=resolveConfig(shared('git-review.v1.config')||{},p.config||{});this.historyRef='HEAD';this.displayTabId=focused()?.tab;this.displaySpaceId=focused()?.space;
  this.diffMode='unified';this.fileTree=true;this.detailsOpen=false;this.remotes=true;this.historyWidth=480;this.listHeight=230;this.contextProps=p;this.followContext=true;this.contextViews=new Map();this.runningActions=0;this.policy={repos:[],canSwitch:false,kind:'empty'};
  this.controller=new Controller({run:createRunner(exec,appHome()),store,sessionId:this.sessionId,cache,onChange:()=>this.controllerChanged()});this.handle=cx.focus_handle();this.diffScroll=VirtualListScrollHandle.new();this.filesScroll=VirtualListScrollHandle.new();this.historyScroll=VirtualListScrollHandle.new();this.commentsScroll=ScrollHandle.new();this.horizontalScroll=ScrollHandle.new();this.scopeTriggerFocus=cx.focus_handle();this.scopeListFocus=cx.focus_handle();this.refTriggerFocus=cx.focus_handle();this.refListFocus=cx.focus_handle();this.panelPosFocus=new Map(['filesPosition','historyPosition','commentsPosition','filesHeaderPosition','historyHeaderPosition','commentsHeaderPosition'].map(k=>[k,cx.focus_handle()]));
  const placeholders={folder:'Repository or parent folder',base:'Base ref / SHA',target:'Target ref / SHA',query:'Text or hash',baseQuery:'Find a base commit',refQuery:'Find a branch',fileQuery:'Filter files by path',recipientQuery:'Find an agent or directory',author:'Author',path:'Path',find:'Find in loaded diff',comment:'Add a comment…',note:'Optional review note',review:'Edit the message that will be copied or sent…'};
  this.inputs={};for(const key of Object.keys(placeholders))this.inputs[key]=(key==='comment'||key==='review'?TextareaState:InputState).new({value:key==='target'?'HEAD':'',placeholder:placeholders[key]});
  for(const input of Object.values(this.inputs)){input.on('focus',()=>{this.inputFocused=true;});input.on('blur',()=>{this.inputFocused=false;});}
  cx.bind_keys(['JuhasSourcePicker','JuhasBranchPicker','JuhasSourcePicker > Input','JuhasBranchPicker > Input'].flatMap(context=>[{keystroke:'up',action:'juhas.picker.previous',context},{keystroke:'down',action:'juhas.picker.next',context},{keystroke:'enter',action:'juhas.picker.choose',context}]));
  this.inputs.review.on('change',(_e,cx)=>this.changeReview(cx));
  this.inputs.comment.on('change',(_e,cx)=>this.queueComposerSave(cx));
  this.inputs.comment.on('blur',()=>{if(this.composerSavePending)this.persistComposer();});
  this.readingOptions={wrap:false};this.experimentalDiff=shared('git-review.v1.experimentalDiff')===true;if(this.experimentalDiff)this.ensureExperimentalSelectionFocus(cx);this.findQuery='';this.findMatches=[];this.findIndex=-1;this.allFiles=true;this.summaryLines=false;this.showFiles=true;this.showComments=false;this.commentPanelPosition='top';this.showHistory=false;this.filePanelPosition='top';this.historyPanelPosition='top';this.allFileSections=[];
  for(const key of ['refQuery','fileQuery','recipientQuery'])this.inputs[key].on('change',(_e,cx)=>{if(key==='refQuery'){this.refIndex=0;if(this.panel==='refs'||this.panel==='historyRefs')this.filteredReferences();}cx.notify();});
  this.inputs.find.on('change',(_e,cx)=>this.setFindQuery(this.inputs.find.value(),cx));
  this.inlineEditor=cx.new(InlineEditor,{owner:this,input:this.inputs.comment,save:()=>this.headerAction({kind:'save-comment'}),cancel:()=>this.headerAction({kind:'cancel-comment'})});
  this.diffViewport=cx.new(DiffViewport,{owner:this});
  this.inputs.folder.on('submit',(_e,cx)=>this.openFolder(this.inputs.folder.value(),cx));
  this.headerQueue=[];cx.spawn(async cx=>{for(;;){const action=await this.nextHeaderAction();if(!action||this.closed)return;if(action.kind==='controller-change'){this.controllerChangeQueued=false;if(this.allFiles&&this.allFilesKey===this.controller?.state.comparison?.id)this.prepareFileHeaders(cx);cx.notify();continue;}if(action.kind==='diff-selection'){this.diffSelection?.handle(action.event,cx);continue;}if(action.kind==='editor-size'){cx.notify();continue;}if(action.kind==='edit-comment'){const draft=this.controller.session().drafts.find(d=>d.id===action.id);if(draft)this.editDraft(draft,cx);continue;}if(action.kind==='remove-comment'){this.controller.removeComment(action.id);cx.notify();continue;}if(action.kind==='save-comment'){this.saveComment(cx);continue;}if(action.kind==='cancel-comment'){this.cancelComment(cx);continue;}if(action.comparisonId!==this.controller.state.comparison?.id)continue;if(action.kind==='toggle')this.requestAllFiles(action.fileId,cx);if(action.kind==='viewed')this.markReviewedFile(action.fileId,action.checked,cx);if(action.kind==='context')this.toggleFileContext(action.fileId,cx);if(action.kind==='comment')this.commentOnFile(action.fileId,cx);this.prepareFileHeaders(cx);cx.notify();}});
  this.applyPreferences();
  if(this.role!=='bar'){this.activateContext(this.currentContext(),cx);this.setupRefresh(cx);if(p.isReviewTab){let attempts=0;this.tabRegistration=cx.timer.every(100,()=>{if(this.closed||this.registerReviewTab()||++attempts>=30){this.tabRegistration?.cancel();this.tabRegistration=null;}});}}
  cx.spawn(async cx=>{for(;;){const command=await nextCommand();const name=typeof command==='string'?command:command.name;if(name==='preview')this.preview(cx);if(name==='branch'){this.allChangesFrom='branch';this.applyScope('branch',cx);}if(name==='base')this.setReferencePicker(false,true,cx);if(name==='branches')this.setReferencePicker(true,this.panel!=='historyRefs',cx);if(name==='details'){this.detailsOpen=!this.detailsOpen;if(this.detailsOpen)this.work(cx,cx=>this.controller.loadDetails());cx.notify();}if(name==='history')this.toggleHistory(!this.showHistory,cx);if(name==='sources'){this.panel=this.panel==='compareFrom'?null:'compareFrom';this.choosingCommitBase=false;cx.notify();}if(name==='uncommitted')this.chooseReviewSource('uncommitted',cx);if(name==='commit')this.chooseReviewSource('commit',cx);if(name==='all-files')this.toggleAllFiles(!this.allFiles,cx);if(name==='search')this.toggleSearch(!this.searchOpen,cx);if(name==='diff-mode')this.setDiffMode(this.diffMode==='split'?'unified':'split',cx);if(name==='next-change')this.navigateChange(1,cx);if(name==='previous-change')this.navigateChange(-1,cx);if(name==='tree'){this.fileTree=!this.fileTree;cx.notify();}if(name==='whole-file'&&this.controller.state.file)this.toggleFileContext(this.controller.state.file.id,cx);if(name==='comments')this.toggleComments(!this.showComments,cx);if(name==='refresh')this.refreshContext(cx);if(name==='full')this.full();if(name==='terminal')this.terminal();if(name==='sidebar')this.returnToSidebar(cx);if(name==='next-file')this.moveFile(1,cx);if(name==='previous-file')this.moveFile(-1,cx);if(name==='next-commit')this.moveCommit(1,cx);if(name==='previous-commit')this.moveCommit(-1,cx);}});
 }
 close(){this.releaseExperimentalDiff();if(this.composerSavePending)this.persistComposer();for(const entry of this.commentCards?.values()||[])entry.view.release();for(const handles of this.contextScrolls?.values()||[])for(const [key,handle] of Object.entries(handles))if(handle!==this[key])handle.release();for(const handle of this.panelPosFocus?.values()||[])handle.release?.();this.tabRegistration?.cancel();this.headerWake?.(null);for(const item of this.fileHeaderViews?.values()||[])item.release();this.closed=true;this.refreshScheduler?.close();this.diffScroll?.release();this.filesScroll?.release();this.historyScroll?.release();this.commentsScroll?.release();this.horizontalScroll?.release();this.copyEditor?.release();this.inlineEditor?.release();this.diffViewport?.release();}
 setupRefresh(cx){
  const coordinator=globalThis[Symbol.for('juhas.refreshCoordinator.v1')]??=createRefreshCoordinator();
  this.refreshScheduler=createRefreshScheduler({timer:cx.timer,coordinator,visible:()=>!this.busy&&this.reviewIsVisible(),key:()=>JSON.stringify([this.id,this.activeContext?.key,this.controller.state.repo?.key]),refresh:cx=>this.poll(cx),onError:(error,cx)=>{if(!this.closed){this.message=error.message;cx.notify();}}});this.refreshScheduler.start();
 }
 reviewIsVisible(){const context=this.contextProps?.isReviewTab?{...this.activeContext,spaceId:this.displaySpaceId,tabId:this.displayTabId}:this.activeContext;return !this.closed&&Boolean(this.controller.state.repo)&&reviewVisible({role:this.role,context,focus:focused(),spaces:spaces(),panes:panes(),layout:layout(),paneId:this.contextProps?.pane});}
 async poll(cx){
  if(this.closed||this.busy||!this.controller.state.repo)return;
  const controller=this.controller,context=this.activeContext?.key;
  const signature=s=>JSON.stringify([s.comparison?.id,s.file?.id,s.history?.map(c=>c.oid),s.branch,s.newHead,s.branchChanged,s.sourceUnavailable,s.refreshError,s.sourceStale]);
  const before=signature(controller.state),beforeWorking=controller.state.hasWorkingChanges;
  try{await controller.refresh({preserveComposer:this.hasUnsavedComment()||this.panel==='submit'});
   if(this.closed||this.controller!==controller||this.activeContext?.key!==context)return;
   if(signature(controller.state)!==before){this.publish();this.prepareFileHeaders(cx);cx.notify();}
   else if(controller.state.hasWorkingChanges!==beforeWorking){this.rememberLoadedView();cx.notify();}
   else this.rememberLoadedView();
  }catch(error){if(!this.closed&&this.controller===controller&&this.activeContext?.key===context){this.message=error.message;cx.notify();}}
 }
 hasUnsavedComment(){if(!this.target)return false;const body=this.inputs.comment?.value()||'',saved=this.editId?this.controller.session().drafts.find(d=>d.id===this.editId):null;return saved?body!==saved.body:Boolean(body.trim());}
 composerIsVisible(){const s=this.controller.state,target=this.target;if(target?.scope==='general')return target.comparisonId===s.comparison?.id;if(!target||target.comparisonId!==s.comparison?.id||target.newPath!==s.file?.newPath)return false;if(target.side==null)return true;const field=target.side==='old'?'oldLine':'newLine';return Boolean((s.patch?.hunks||[]).some(h=>h.lines.some(line=>line[field]===target.endLine)));}
 setUpperView(value,cx){this.upperView=value==='comments'?'comments':'changes';this.toggleComments(value==='comments',cx);}
 generalComment(cx){if(this.hasUnsavedComment()){this.message='Save or cancel the current comment first';cx.notify();return;}this.target=generalTarget(this.controller.state.comparison);this.composerComparison=this.controller.state.comparison;this.editId=null;this.selectedStart=null;this.detachedComposer=false;this.inputs.comment.set_value('');this.panel='comment';this.persistComposer();this.inputs.comment.focus();this.notifyEditor(cx);}
 isFileReviewed(file,session){const c=this.controller.state.comparison;return Boolean(c&&file&&reviewedState(session||this.controller.session(),c,file));}
 markReviewedFile(id,checked,cx){const {comparison,files}=this.controller.state,file=files.find(f=>f.id===id);if(!comparison||!file)return;this.controller.mutate(s=>setFileReviewed(s,comparison,file,checked));cx.notify();}
 commentOnFile(id,cx){if(this.busy)return;const controller=this.controller,comparison=controller.state.comparison;if(this.hasUnsavedComment()){this.message='Save or cancel the current comment first';cx.notify();return;}this.work(cx,async cx=>{await controller.selectFile(id);if(this.controller!==controller||controller.state.comparison!==comparison||controller.state.file?.id!==id||this.hasUnsavedComment())return;this.publish();this.fileComment(cx);});}
 toggleSearch(open,cx){this.searchOpen=open;if(open)this.inputs.find.focus();else{this.setFindQuery('',cx);this.inputs.find.set_value('');this.handle?.focus();}cx.notify();}
 nextHeaderAction(){if(this.headerQueue.length)return Promise.resolve(this.headerQueue.shift());return new Promise(resolve=>this.headerWake=resolve);}
 controllerChanged(){if(this.closed||this.controllerChangeQueued)return;this.controllerChangeQueued=true;this.headerAction({kind:'controller-change'});}
 headerAction(action){if(this.headerWake){const wake=this.headerWake;this.headerWake=null;wake(action);}else (this.headerQueue??=[]).push(action);}
 prepareFileHeaders(cx){if(!this.allFiles||!cx?.new)return;const key=this.controller.state.comparison?.id;if(this.fileHeadersKey!==key){for(const item of this.fileHeaderViews?.values()||[])item.release();this.fileHeaderViews=new Map();this.fileHeaderSignatures=new Map();this.fileHeadersKey=key;}const session=this.controller.session(),files=new Map((this.controller.state.files||[]).map(file=>[file.id,file]));for(const section of this.allFileSections||[]){if(section.comparison?.id===key&&files.has(section.file.id))section.file=files.get(section.file.id);const p={owner:this,fileId:section.file.id,comparisonId:key},signature=JSON.stringify([section.collapsed,section.loading,section.limited,section.file.additions,section.file.deletions,section.file.binary,section.patch?.fullContext,this.isFileReviewed(section.file,session),this.busy,this.diffWidth||this.width]);if(!this.fileHeaderViews.has(section.file.id))this.fileHeaderViews.set(section.file.id,cx.new(FileHeader,p));else if(this.fileHeaderSignatures.get(section.file.id)!==signature)cx.notify(this.fileHeaderViews.get(section.file.id));this.fileHeaderSignatures.set(section.file.id,signature);}}
 markFileReviewed(checked,cx){const {comparison,file}=this.controller.state;if(!comparison||!file)return;this.controller.mutate(s=>setFileReviewed(s,comparison,file,checked));cx.notify();}
 moveUnreviewed(direction,cx){const s=this.controller.state,next=nextUnreviewed(this.visibleFiles(),this.controller.session(),s.comparison,s.file?.id,direction);if(next)this.selectFile(next.id,cx);else{this.message='No more unreviewed files';cx.notify();}}
 setFindQuery(query,cx){this.findQuery=query;this.findIndex=-1;if(this.allFiles){this.findMatches=[];for(const section of this.allFileSections||[]){if(section.collapsed||!section.patch||this.hideTests&&isTestFile(section.file))continue;const matches=findInPatch(this.displayContextPatch(section.patch),query);const remaining=10000-this.findMatches.length;this.findMatches.push(...matches.slice(0,remaining).map(m=>({...m,fileId:section.file.id})));if(matches.limited||matches.length>remaining)this.findMatches.limited=true;}}else this.findMatches=query&&!(this.hideTests&&isTestFile(this.controller.state.file))?findInPatch(this.displayContextPatch(this.controller.state.patch),query):[];cx?.notify();}
 moveFind(direction,cx){const matches=this.findMatches||[];if(!matches.length)return;this.findIndex=(this.findIndex+direction+matches.length)%matches.length;const match=matches[this.findIndex],field=match.side==='old'?'oldLine':'newLine';const index=(this.diffRows||[]).findIndex(r=>(!match.fileId||r.fileId===match.fileId)&&(r.kind==='pair'?(match.side==='old'?r.old:r.next)?.[field]===match.line:r.kind==='line'&&r[field]===match.line));if(index>=0)this.scrollDiffToItem(index,'center');cx.notify();}
 ensureExperimentalSelectionFocus(cx){
  if(this.selectionHandle)return;
  this.selectionHandle=cx.focus_handle();
  if(this.experimentalKeysBound)return;
  cx.bind_keys(['ctrl-c','cmd-c'].map(keystroke=>({keystroke,action:'juhas.selection.copy',context:'JuhasDiffSelection'})));
  this.experimentalKeysBound=true;
 }
 releaseExperimentalDiff(){
  this.selectionHandle?.release();
  this.selectionHandle=null;
  if(this.diffSelection){
   this.diffSelection.close();
   this.diffSelectionVersion=this.diffSelection.version+1;
   this.diffSelection=null;
  }
  this.pendingDiffRows=null;
  this.pendingSelectionModel=null;
  for(const entry of this.diffRowViews?.values()||[])entry.entity.release();
  this.diffRowViews?.clear();
 }
 toggleExperimentalDiff(enabled,cx){
  this.experimentalDiff=Boolean(enabled);
  setShared('git-review.v1.experimentalDiff',this.experimentalDiff);
  this.releaseExperimentalDiff();
  if(this.experimentalDiff)this.ensureExperimentalSelectionFocus(cx);
  this.commentGestureVersion=(this.commentGestureVersion||0)+1;
  this.syncDiffViewport(cx);
  cx.notify();
 }
 prepareDiffRows(rows,render,cx,split,range={start:0,end:80}){
  if(!cx?.timer)return;
  const source=this.diffChangeKey();
  const overscan=range.measured?12:32;
  let start=Math.max(0,range.start-overscan),end=Math.min(rows.length,range.end+overscan);
  const previous=this.pendingDiffRows;
  if(range.measured&&this.diffRowsQueued&&previous?.rows===rows&&previous.render===render&&previous.source===source){
   start=Math.min(start,previous.start);
   end=Math.max(end,previous.end);
  }
  if(previous?.rows===rows&&previous.render===render&&previous.source===source&&range.start>=previous.start&&range.end<=previous.end)return;
  this.pendingDiffRows={rows,render,split,source,start,end};if(this.diffRowsQueued)return;this.diffRowsQueued=true;cx.timer.after(1,cx=>{this.diffRowsQueued=false;const pending=this.pendingDiffRows;if(this.closed||pending?.source!==this.diffChangeKey())return;this.buildDiffRows(pending,cx);});}
 selectionLayoutKey(metrics=uiMetrics()){return `${Boolean(this.readingOptions?.wrap)}|${this.diffWidth||0}|${metrics.scale}|${metrics.fontSize}`;}
 buildDiffRows({rows,render,split,source,start=0,end=rows.length},cx){
  this.diffRowViews??=new Map();
  if(this.experimentalDiff&&!this.diffSelection){
   this.diffSelection=new DiffSelection(this);
   this.diffSelection.version=this.diffSelectionVersion||0;
  }
  const selection=this.diffSelection;
  if(selection&&rows.length>=2048&&(rows!==selection.rows||source!==selection.source||split!==selection.split)){
   const pending=this.pendingSelectionModel;
   if(!pending||pending.rows!==rows||pending.source!==source||pending.split!==split){
    const request={rows,source,split};
    this.pendingSelectionModel=request;
    const state=this.controller.state;
    const current=()=>{
     if(this.pendingSelectionModel!==request)return false;
     if(!this.closed&&this.experimentalDiff&&this.pendingDiffRows?.rows===rows&&this.diffChangeKey()===source)return true;
     this.pendingSelectionModel=null;
     return false;
    };
    runDiffBatches(cx,selectionModelBatches(rows,split,{fileId:state.file?.id,comparisonId:state.comparison?.id}),current,(model,cx)=>{
     this.pendingSelectionModel=null;
     this.diffSelection.update(rows,split,source,this.selectionLayoutKey(),true,model);
     this.buildDiffRows(this.pendingDiffRows,cx);
    });
   }
   return;
  }
  const metrics=uiMetrics();
  if(selection){
   this.selectionScale=metrics.scale;
   selection.update(rows,split,source,this.selectionLayoutKey(metrics));
  }
  const t=theme();
  const style=`${selection?.version??''}|${t.background}|${t.foreground}|${t.accent}|${t.selection}|${settings().font_family||''}|${split}|${Boolean(this.readingOptions?.wrap)}|${this.diffWidth||0}|${metrics.scale}|${metrics.fontSize}|${this.findQuery||''}|${this.findCursor??''}|${this.target?`${this.target.comparisonId}:${this.target.newPath}:${this.target.side}:${this.target.startLine}:${this.target.endLine}`:''}`;
  const keys=new Set(),matches=this.findMatches;
  let mounted=false;
  for(let index=start;index<end;index++){
   const row=rows[index];
   if(row.kind!=='line'&&row.kind!=='pair')continue;
   const key=source+':'+row.id;
   keys.add(key);
   const entry=this.diffRowViews.get(key);
   if(entry?.p.row===row&&entry.style===style&&entry.matches===matches)continue;
   const p={owner:this,row,source,split,content:interaction=>render(row,true,interaction)};
   if(entry){
    Object.assign(entry.p,p);
    entry.style=style;
    entry.matches=matches;
    cx.notify(entry.entity);
   }else{
    this.diffRowViews.set(key,{p,style,matches,entity:cx.new(DiffRow,p)});
    mounted=true;
   }
  }
  for(const [key,entry] of this.diffRowViews)if(!keys.has(key)){
   entry.entity.release();
   this.diffRowViews.delete(key);
  }
  if(mounted){if(this.diffViewport)cx.notify(this.diffViewport);else cx.notify();}
 }
 commitCommentRange(range,cx){
  const controller=this.controller,comparison=controller.state.comparison,file=controller.state.files.find(f=>f.id===range.fileId);if(!file||comparison?.id!==range.comparisonId)return;
  if(this.hasUnsavedComment()){this.message='Save or cancel the current comment before opening another';cx.notify();return;}
  const version=this.commentGestureVersion=(this.commentGestureVersion||0)+1,scopeVersion=this.sourceActionVersion,presentation=JSON.stringify([this.diffMode,Boolean(this.hideTests),Boolean(this.allFiles)]),navigation=this.fileActionVersion,composer=this.target;
  const current=()=>!this.closed&&this.fileActionVersion===navigation&&this.target===composer&&JSON.stringify([this.diffMode,Boolean(this.hideTests),Boolean(this.allFiles)])===presentation&&this.controller===controller&&controller.state.comparison===comparison&&controller.state.file?.id===file.id&&this.commentGestureVersion===version&&this.sourceActionVersion===scopeVersion;
  const open=cx=>{if(!current()||this.hasUnsavedComment())return;const field=range.side==='old'?'oldLine':'newLine',unique=new Map();for(const h of controller.state.patch?.hunks||[])for(const line of h.lines)if(line[field]>=range.startLine&&line[field]<=range.endLine&&line[field]!=null)unique.set(line[field],line);const lines=[...unique.values()].sort((a,b)=>a[field]-b[field]);
   if(lines.length!==range.endLine-range.startLine+1)throw new Error('Source changed; select the comment range again');
   const target=commentTarget(comparison,file,{...lines[0],side:range.side},{...lines.at(-1),side:range.side},lines);if(target.quote!==range.quote)throw new Error('Source changed; select the comment range again');
   this.target=target;this.composerComparison=comparison;this.detachedComposer=false;this.editId=null;this.selectedStart=null;this.inputs.comment.set_value('');this.panel='comment';this.persistComposer();this.inputs.comment.focus();this.notifyEditor(cx);
  };
  if(controller.state.file?.id===file.id){try{open(cx);}catch(error){this.message=error.message;cx.notify();}}
  else this.work(cx,async cx=>{await controller.selectFile(file.id);if(!current())return;this.publish();open(cx);});
 }
 toggleWrap(pressed,cx){this.readingOptions={...this.readingOptions,wrap:pressed};this.syncDiffViewport(cx);cx.notify();}
 navigateComment(direction,cx){if(this.hasUnsavedComment()){this.message='Save or cancel the current comment first';cx.notify();return;}const drafts=this.controller.session().drafts.filter(d=>d.repoKey===this.controller.state.repo?.key),current=drafts.findIndex(d=>d.id===(this.commentCursor||this.editId)),index=current<0?(direction>0?0:drafts.length-1):current+direction;if(index<0||index>=drafts.length){this.message='No more comments';cx.notify();return;}this.commentCursor=drafts[index].id;this.openComment(drafts[index],cx);}
 revealSelectedSection(){if(!this.allFiles)return;const s=this.controller.state;if(this.allFilesKey!==s.comparison?.id)this.rebuildAllSections();const section=this.allFileSections?.find(section=>section.file.id===s.file?.id);if(section){section.collapsed=false;section.patch=s.patch;section.limited=false;}}
 rebuildAllSections(){const s=this.controller.state;this.allFilesKey=s.comparison?.id;this.allFileSections=s.files.map(file=>({file,comparison:s.comparison,patch:file.id===s.file?.id?s.patch:null,collapsed:file.id!==s.file?.id}));}
 toggleAllFiles(pressed,cx){this.allFiles=pressed;if(pressed)this.rebuildAllSections();this.prepareFileHeaders(cx);this.setFindQuery(this.findQuery||'',cx);this.rememberLoadedView();}
 visibleFiles(){const files=this.controller.state.files||[];return this.hideTests?files.filter(file=>!isTestFile(file)):files;}
 setHideTests(hidden,cx){this.hideTests=hidden;this.changeCursor=null;this.setFindQuery(this.findQuery||'',cx);this.rememberLoadedView();cx.notify();}
 anyFileExpanded(){return (this.allFileSections||[]).some(section=>!section.collapsed&&(!this.hideTests||!isTestFile(section.file)));}
 toggleAllExpansion(cx){if(!this.anyFileExpanded()){this.expandAllFiles(cx);return;}this.expansionVersion=(this.expansionVersion||0)+1;for(const section of this.allFileSections||[])if(!this.hideTests||!isTestFile(section.file))section.collapsed=true;this.prepareFileHeaders(cx);this.setFindQuery(this.findQuery||'',cx);}
 displayContextPatch(patch){return this.contextPatches?.get(patch)??patch;}
 revealDiffContext(row,cx){
  const controller=this.controller,{comparison,file:selected,patch:selectedPatch}=controller.state,allFiles=this.allFiles;
  const section=allFiles?this.allFileSections?.find(item=>item.file.id===row.fileId&&item.comparison?.id===comparison?.id):null;
  const file=allFiles?section?.file:selected,patch=allFiles?section?.patch:selectedPatch;
  if(!comparison||!file||!patch||section?.collapsed)return;
  const before=row.sourceId??row.id;
  const current=()=>!this.closed&&this.controller===controller&&controller.state.comparison?.id===comparison.id&&
   this.allFiles===allFiles&&(section?this.allFileSections.includes(section)&&!section.collapsed&&section.patch===patch:
    controller.state.file?.id===file.id&&controller.state.patch===patch);
  this.pendingContextReads??=new WeakMap();
  if(this.pendingContextReads.has(patch))return;
  this.pendingContextReads.set(patch,true);
  cx.spawn(async cx=>{
   try{
    const full=await controller.readFileContext(file,comparison,row.gap);
    if(!current())return;
    const otherRows=section?this.allFileSections.reduce((n,item)=>n+(item===section?0:(this.displayContextPatch(item.patch)?.hunks||[]).reduce((m,h)=>m+h.lines.length,0)),0):0;
    const next=revealPatchGap(this.displayContextPatch(patch),full,row.gap,before,20000-otherRows);
    if(!next)throw new Error('The omitted lines are unavailable within the diff limits');
    this.contextPatches??=new WeakMap();this.contextPatches.set(patch,next);
    this.setFindQuery(this.findQuery||'',cx);
   }catch(error){if(current()){this.message=error.message;cx.notify();}}
   finally{this.pendingContextReads.delete(patch);}
  });
 }
 toggleFileContext(fileId,cx){
  const controller=this.controller,s=controller.state,comparison=s.comparison,section=this.allFileSections?.find(section=>section.file.id===fileId&&section.comparison?.id===comparison?.id),displayed=this.allFiles?section?.patch:s.file?.id===fileId?s.patch:null,full=!Boolean(displayed?.fullContext),version=this.expansionVersion||0;
  this.work(cx,async cx=>{if(controller.state.file?.id!==fileId)await controller.selectFile(fileId);if(this.controller!==controller||controller.state.comparison?.id!==comparison?.id||controller.state.file?.id!==fileId)return;
   await controller.expandFile(full);if(this.controller!==controller||controller.state.comparison?.id!==comparison?.id||controller.state.file?.id!==fileId)return;
   if(section){const count=patch=>(patch?.hunks||[]).reduce((n,h)=>n+h.lines.length,0),rows=(this.allFileSections||[]).reduce((n,item)=>n+(item===section?0:count(item.patch)),0)+count(controller.state.patch);if((this.expansionVersion||0)===version)section.collapsed=false;section.limited=rows>20000;if(!section.limited)section.patch=controller.state.patch;}
   this.prepareFileHeaders(cx);this.setFindQuery(this.findQuery||'',cx);
  });
 }
 expandAllFiles(cx){
  if(this.busy)return;if(!this.allFiles)this.toggleAllFiles(true,cx);if(this.allFilesKey!==this.controller.state.comparison?.id)this.rebuildAllSections();
  const controller=this.controller,comparison=controller.state.comparison,version=this.expansionVersion=(this.expansionVersion||0)+1;if(!comparison)return;
  const current=()=>!this.closed&&this.expansionVersion===version&&this.controller===controller&&controller.state.comparison?.id===comparison.id;
  this.work(cx,async cx=>{
   const count=patch=>(patch?.hunks||[]).reduce((n,h)=>n+h.lines.length,0);
   let rows=this.allFileSections.reduce((n,s)=>n+count(s.patch),0);
   const visible=this.allFileSections.filter(section=>!this.hideTests||!isTestFile(section.file));
   for(const section of visible)section.collapsed=false;
   const pending=visible.filter(section=>!section.patch&&!section.limited);
   for(let offset=0;offset<pending.length;offset+=4){
    if(!current())return;
    const batch=pending.slice(offset,offset+4);
    if(rows>=20000){for(const section of batch)section.limited=true;continue;}
    for(const section of batch)section.loading=true;
    this.prepareFileHeaders(cx);cx.notify();
    try{
     const results=await controller.readFilePatches(batch.map(section=>section.file),comparison,{rowBudget:20000-rows});
     if(!current())return;
     batch.forEach((section,index)=>{
      const result=results[index],extra=count(result?.patch);
      if(result?.patch&&rows+extra<=20000){section.patch=result.patch;rows+=extra;}
      else {section.limited=true;if(result?.error)this.message=result.error.message;}
     });
    }catch(error){
     if(!current())return;
     for(const section of batch)section.limited=true;
     this.message=error.message;
    }finally{
     for(const section of batch)section.loading=false;
     if(current()){this.prepareFileHeaders(cx);cx.notify();}
    }
   }
   if(!current())return;
   this.prepareFileHeaders(cx);
   this.setFindQuery(this.findQuery||'',cx);
  });
 }
 requestAllFiles(fileId,cx){const section=this.allFileSections?.find(s=>s.file.id===fileId);if(!section)return;section.collapsed=!section.collapsed;if(section.collapsed||section.patch){cx.notify();return;}const c=this.controller.state.comparison,controller=this.controller;section.loading=true;this.prepareFileHeaders(cx);cx.notify();cx.spawn(async cx=>{try{const patch=await controller.readFilePatch(section.file,c);if(this.closed||this.controller!==controller||this.controller.state.comparison?.id!==c.id)return;const rows=this.allFileSections.reduce((n,s)=>n+(s.patch?.hunks||[]).reduce((m,h)=>m+h.lines.length,0),0),extra=(patch.hunks||[]).reduce((n,h)=>n+h.lines.length,0);if(rows+extra>20000){section.limited=true;}else section.patch=patch;}catch(error){if(this.closed||this.controller!==controller||this.controller.state.comparison?.id!==c.id)return;section.limited=true;this.message=error.message;}finally{section.loading=false;if(!this.closed){this.prepareFileHeaders(cx);this.setFindQuery(this.findQuery||'',cx);}}});}
 selectFileLine(row,fileId,cx,side=null){const controller=this.controller,comparison=controller.state.comparison;if(row.comparisonId&&row.comparisonId!==comparison?.id)return;if(controller.state.file?.id===fileId){this.selectLine(row.id,cx,side,row);return;}if(this.hasUnsavedComment()){this.message='Save or cancel the current comment first';cx.notify();return;}this.work(cx,async cx=>{await controller.selectFile(fileId);if(this.controller!==controller||controller.state.comparison?.id!==comparison.id)return;this.publish();this.selectLine(row.id,cx,side,row);});}
 openComment(d,cx){if(this.hasUnsavedComment()){this.message='Save or cancel the current comment before navigating';cx.notify();return;}if(this.hideTests&&isTestFile(d))this.hideTests=false;if(d.scope==='general'){this.editDraft(d,cx);return;}if(this.target)this.cancelComment(cx);const controller=this.controller;this.work(cx,async cx=>{if(controller.state.comparison?.id!==d.comparisonId){if(!d.targetOid)throw new Error('Original working code is unavailable; the saved comment and quote are retained');await controller.selectScope(d.baseOid?{kind:'range',base:d.baseOid,target:d.targetOid,includeBase:false}:{kind:'commit',commit:d.targetOid});}if(controller.state.comparison?.id!==d.comparisonId)throw new Error('Original source changed; the saved comment is retained');const file=controller.state.files.find(f=>f.newPath===d.newPath&&(d.oldPath==null||f.oldPath===d.oldPath));if(!file)throw new Error('The original file is unavailable');await controller.selectFile(file.id);if(d.side&&!controller.state.patch?.hunks.some(h=>h.lines.some(l=>l[d.side==='old'?'oldLine':'newLine']===d.endLine)))await controller.expandFile();this.panel=null;this.commentCursor=d.id;this.revealSelectedSection();this.publish();cx.notify();cx.timer.after(1,()=>{if(this.controller!==controller||controller.state.comparison?.id!==d.comparisonId)return;const index=(this.diffRows||[]).findIndex(row=>row.kind==='comment'&&row.draft.id===d.id);if(index>=0)this.scrollDiffToItem(index,'center');});});}
 async prefetchNeighbors(controller=this.controller){
  if(!this.config.prefetch||this.prefetching)return;
  const {comparison,file,files}=controller.state,index=files.findIndex(item=>item.id===file?.id);
  if(!comparison||index<0||this.busy)return;
  const neighbors=[files[index+1],files[index-1]].filter(Boolean);
  if(!neighbors.length)return;
  this.prefetching=true;
  try{await controller.readFilePatches(neighbors,comparison);}
  catch{/* The next explicit read will validate the current comparison again. */}
  finally{this.prefetching=false;}
 }

 notifyEditor(cx,reveal=false){this.prepareFileHeaders(cx);if(this.inlineEditor)cx.notify(this.inlineEditor);if(reveal&&this.target?.comparisonId===this.controller.state.comparison?.id&&this.target?.newPath===this.controller.state.file?.newPath){const s=this.controller.state,annotated=composerRows(annotatePatch(s.patch,this.controller.session().drafts,s.comparison.id,s.file.newPath),this.target,this.editId),visible=withLineInfo(annotated),rows=this.diffMode==='split'?splitRows(visible):visible,index=rows.findIndex(r=>r.kind==='editor');if(index>=0)this.scrollDiffToItem(index,'center',rows);}this.syncDiffViewport(cx);cx.notify();}
 cancelComment(cx){this.composerSavePending=null;this.target=null;this.selectedStart=null;this.editId=null;this.composerComparison=null;this.detachedComposer=false;this.panel=null;this.inputs.comment.set_value('');setShared(this.composerKey||`git-review.v1.composer.${this.sessionId}`,null);this.notifyEditor(cx);}
 resumeComment(cx){const target=this.target;if(!target)return;if(this.hideTests&&isTestFile(target))this.hideTests=false;if(target.scope==='general'){this.panel='comment';this.detachedComposer=false;this.inputs.comment.focus();this.notifyEditor(cx);return;}this.panel='comment';this.detachedComposer=false;this.work(cx,async cx=>{try{
  const c=this.controller.state.comparison;if(c?.id!==target.comparisonId){if(this.composerComparison)await this.controller.selectResolved(this.composerComparison);else if(target.targetOid)await this.controller.selectScope(target.baseOid?{kind:'range',base:target.baseOid,target:target.targetOid,includeBase:false}:{kind:'commit',commit:target.targetOid,parentIndex:0});else throw new Error('Original working-tree context is not available; unsaved text is retained');}
  if(this.controller.state.comparison?.id!==target.comparisonId)throw new Error('Source context changed; unsaved text is retained');
  const file=this.controller.state.files.find(f=>f.newPath===target.newPath&&(target.oldPath==null||f.oldPath===target.oldPath));if(!file)throw new Error('Original file is unavailable; unsaved text is retained');await this.controller.selectFile(file.id);if(!this.composerIsVisible())await this.controller.expandFile();this.publish();if(!this.composerIsVisible())throw new Error('Original line is outside the available patch; unsaved text is retained');this.inputs.comment.focus();this.notifyEditor(cx,true);
 }catch(error){this.detachedComposer=true;this.notifyEditor(cx);throw error;}});}
 syncCodeFont(){
  const fontSize=uiMetrics().fontSize;if(this.copyEditor&&this.copyFontSize===fontSize)return false;
  const value=this.copyEditor?.value()||'',previous=this.copyEditor;
  this.copyEditor=EditorState.new({readonly:true,line_numbers:false,folding:false,font_size:fontSize});this.copyFontSize=fontSize;
  this.copyEditor.on('focus',()=>{this.inputFocused=true;});this.copyEditor.on('blur',()=>{this.inputFocused=false;});this.copyEditor.set_value(value);previous?.release?.();return true;
 }
 openCodeCopy(side,cx){
  const s=this.controller.state;if(!s.patch||s.patch.binary||s.patch.modeOnly)return;
  if(this.hasUnsavedComment()){this.message='Save or cancel the current comment first';cx.notify();return;}
  this.syncCodeFont();
  this.copyEditor.set_value(patchCode(s.patch,side));this.copySide=side;this.copySource=this.diffChangeKey();this.copyPath=s.file?.newPath;this.panel='copy-code';cx.notify();
 }
 diffChangeKey(){const s=this.controller.state;return JSON.stringify([s.comparison?.id,s.file?.id,this.diffMode,Boolean(this.hideTests)]);}
 isLargeMeasuredDiff(rows){
  const projection=this.renderedDiffProjection??this.diffProjection;
  return projection?.rows===rows&&projection.large&&(!projection.uniform||this.readingOptions?.wrap);
 }
 scrollDiffToItem(index,strategy,rows=this.diffRows||[]){
  // Large native measured lists own their scroll position.
  if(this.isLargeMeasuredDiff(rows))return;
  if(this.readingOptions?.wrap){
   const target=rows[index];if(!target)return;
   const projection=this.renderedDiffProjection;
   const entries=projection?.rows===rows?projection.measuredRows:measuredCommentRows(rows);
   index=entries?.findIndex(entry=>entry.id===target.id||[...entry.before,...entry.after].some(row=>row.id===target.id));
   if(index==null||index<0)return;
  }
  this.diffScroll?.scroll_to_item(index,strategy);
 }
 revealDiffRow(cx,kind,strategy,current,onReveal=null){
  const fileId=this.controller.state.file?.id;
  const ready=()=>!this.closed&&this.reviewIsVisible?.()!==false&&current();
  cx.notify();
  cx.timer?.after(16,()=>{
   if(!ready()||this.diffRowsKey!==this.diffChangeKey())return;
   const index=(this.diffRows||[]).findIndex(row=>row.kind===kind&&(!this.allFiles||row.fileId===fileId));
   if(index<0)return;
   this.scrollDiffToItem(index,strategy);
   if(onReveal)cx.timer.after(16,()=>{if(ready())onReveal();});
  });
 }
 setDiffMode(mode,cx){this.diffMode=mode;this.changeCursor=null;this.syncDiffViewport(cx);cx.notify();}
 navigateChange(direction,cx){
  if(this.busy||this.diffRowsKey!==this.diffChangeKey())return;
  const groups=changeGroups(this.diffRows||[]),source=this.diffChangeKey(),current=this.changeCursor?.source===source?this.changeCursor.id:null,target=stepChange(groups,current,direction);
  const index=groups.findIndex(group=>group.id===current);
  if((index>=0&&(direction>0?index===groups.length-1:index===0))||!groups.length){this.navigateFileChange(direction,cx);return;}
  if(!target)return;this.changeCursor={source,id:target.id};this.scrollDiffToItem(target.index,'top');cx.notify();
 }
 navigateFileChange(direction,cx){
  const controller=this.controller,s=controller.state,comparison=s.comparison?.id,mode=this.diffMode,files=this.visibleFiles().slice(),start=files.findIndex(file=>file.id===s.file?.id),step=direction>0?1:-1;
  this.work(cx,async cx=>{
   for(let i=start+step;i>=0&&i<files.length;i+=step){
    if(this.controller!==controller||controller.state.comparison?.id!==comparison||this.diffMode!==mode)return;
    this.selectedStart=null;await controller.selectFile(files[i].id);this.publish();
    if(this.controller!==controller||controller.state.comparison?.id!==comparison||controller.state.file?.id!==files[i].id||this.diffMode!==mode)return;
    const state=controller.state,annotated=annotatePatch(state.patch,controller.session().drafts,comparison,state.file?.newPath),composed=this.inlineEditor&&this.target?.comparisonId===comparison&&this.target?.newPath===state.file?.newPath?composerRows(annotated,this.target,this.editId):annotated,visible=withLineInfo(composed),rows=mode==='split'?splitRows(visible):visible,target=stepChange(changeGroups(rows),null,direction);
    this.changeCursor=null;if(!target)continue;
    this.changeCursor={source:this.diffChangeKey(),id:target.id};this.scrollDiffToItem(target.index,'top',rows);return;
   }
   this.message=direction>0?'End of review':'Start of review';
  });
 }
 async workAsync(cx,action){this.runningActions=(this.runningActions||0)+1;this.busy=true;this.message='';this.notifyEditor(cx);try{await action(cx);}catch(e){this.message=e.message;}finally{this.runningActions--;this.busy=this.runningActions>0;this.rememberLoadedView();this.notifyEditor(cx);if(!this.busy&&this.config.prefetch)cx.spawn(()=>this.prefetchNeighbors());}}
 work(cx,action){cx.spawn(async cx=>this.workAsync(cx,action));}
 scopeWork(cx,action){const version=this.scopeActionVersion=(this.scopeActionVersion||0)+1,controller=this.controller,current=()=>this.scopeActionVersion===version&&this.controller===controller;this.work(cx,async cx=>{try{await action(current,cx);}catch(error){if(current())throw error;}});}
 currentContext(){return this.contextProps?.reviewContext||reviewContext(this.contextProps||{},focused(),spaces(),panes());}
 recipientContext(){
  const repo=this.controller.state.repo;
  const key=this.contextProps?.isReviewTab&&(this.contextProps.reviewTabKey||(repo&&reviewTabKey(repo,this.activeContext?.spaceId)));
  return (key&&shared(key)?.sourceContext)||this.currentContext();
 }
 closeReviewOrigin(origin){if(origin?.paneId&&panes().some(p=>p.pane===origin.paneId&&p.mod==='juhas'&&p.tab===origin.tabId))run('pane.close',{pane:origin.paneId});if(origin?.sidebar){run('layout.hide',{id:'git-review-sidebar'});run('layout.hide',{id:'panel'});}}
 reviewOrigin(){const tabId=this.displayTabId||this.activeContext?.tabId,matches=panes().filter(p=>p.mod==='juhas'&&p.tab===tabId),pane=matches.find(p=>p.pane===this.contextProps?.pane)||matches.find(p=>p.focused)||(matches.length===1?matches[0]:null);return this.role==='sidebar'?{sidebar:true}:this.role==='pane'&&!this.contextProps?.isReviewTab&&pane?{paneId:pane.pane,tabId}:null;}
 registerReviewTab(){
  if(!this.contextProps?.isReviewTab)return false;const key=this.contextProps.reviewTabKey,record=shared(key),space=spaces().find(s=>s.id===this.contextProps.reviewContext?.spaceId||s.id===this.activeContext?.spaceId);if(!key||!space)return false;
  const live=panes().filter(p=>p.mod==='juhas'&&space.tabs.some(t=>t.id===p.tab));
  let pane=live.find(p=>p.pane===this.contextProps.pane)||live.find(p=>p.pane===record?.paneId&&p.tab===record?.tabId);
  if(!pane){
   const candidates=record?.previousTabIds?live.filter(p=>!record.previousTabIds.includes(p.tab)):live.filter(p=>p.tab!==this.contextProps.reviewContext?.tabId&&space.tabs.some(t=>t.id===p.tab&&t.name===`Review · ${String(this.contextProps.folder||'').replace(/\\/g,'/').split('/').at(-1)}`));
   pane=candidates.find(p=>p.tab===this.displayTabId)||(candidates.length===1?candidates[0]:null);
  }
  if(!pane)return false;
  this.displayTabId=pane.tab;this.displaySpaceId=space.id;
  setShared(key,{...record,origin:null,previousTabIds:undefined,tabId:pane.tab,paneId:pane.pane,spaceId:space.id,context:this.activeContext,sessionId:this.sessionId});
  const index=shared('juhas.review-tabs.v1')||[],entry={key,root:this.controller.state.repo?.root||this.contextProps.folder,machine:this.contextProps.machine??null,spaceId:space.id};
  if(!index.some(item=>item.key===key&&item.root===entry.root))setShared('juhas.review-tabs.v1',[...index.filter(item=>item.key!==key),entry].slice(-100));
  if(record?.origin)this.closeReviewOrigin(record.origin);
  return true;
 }


 openReviewPane(direction){
  if(this.role!=='sidebar'||!this.activeContext?.folder||!['right','down'].includes(direction))return;
  const context=this.activeContext,targets=panes().filter(p=>p.tab===context?.tabId&&p.terminal),target=targets.find(p=>p.focused)||targets[0];
  if(!target)return;
  this.persistComposer();this.persistReview();this.publish();
  run('pane.split',{pane:target.pane,direction,mod:'juhas',props:{role:'pane',sessionId:this.sessionId,reviewContext:context,config:this.contextProps?.config}});
  this.closeReviewOrigin({sidebar:true});
 }
 openReviewTab(){
  const context=this.activeContext;
  const repo=this.controller.state.repo||(context?.folder?{root:context.folder,machine:context.machine??null}:null);
  if(!repo||!context)return;
  this.publish();
  const sourceContext=this.recipientContext(),origin=this.reviewOrigin();
  const p={...reviewTabProps(repo,context,this.sessionId,uid()),config:this.contextProps?.config};
  const key=p.reviewTabKey,selectionKey=contextStorageKey('selection',this.sessionId,p.reviewContext);
  p.reviewContext.folder=this.activeContext?.folder||repo.root;
  setShared(selectionKey,shared(this.selectionKey));for(const kind of ['composer','review']){const previous=shared(contextStorageKey(kind,this.sessionId,this.activeContext));if(previous)setShared(contextStorageKey(kind,this.sessionId,p.reviewContext),previous);}
  const snapshot=this.viewSnapshots().get(this.selectionKey);if(snapshot)this.viewSnapshots().set(selectionKey,snapshot);
  setShared(key,{sourceContext,sourceSessionId:this.sessionId,sourcePresentation:origin?.sidebar?'sidebar':'pane',origin,previousTabIds:spaces().find(space=>space.id===context.spaceId)?.tabs?.map(tab=>tab.id)||[]});
  run('tab.new',{name:`Review · ${repo.root.replace(/\\/g,'/').split('/').at(-1)}`,space:context.spaceId,folder:repo.root,mod:'juhas',props:p});
  if(origin?.sidebar)this.closeReviewOrigin(origin);
 }
 returnToSidebar(cx){
  const fail=message=>{this.message=message;cx?.notify();return false;};
  if(!this.contextProps?.isReviewTab)return false;if(this.busy)return fail('Wait for the current review action to finish before returning');
  const repo=this.controller.state.repo;if(!repo)return fail('Review source is unavailable; the tab has been retained');const key=this.contextProps.reviewTabKey||reviewTabKey(repo,this.activeContext?.spaceId),record=shared(key),allSpaces=spaces(),allPanes=panes();
  if(!repo||!liveReviewTab(record,allSpaces,allPanes))return fail('Review tab is still opening; try again shortly');
  let source=record.sourceContext;const sourceSpace=allSpaces.find(space=>space.id===source?.spaceId);
  if(!sourceSpace?.tabs.some(tab=>tab.id===source?.tabId)||source.tabId===record.tabId)return fail('The source tab is no longer open; the review has been retained');
  const terminal=allPanes.find(p=>p.tab===source.tabId&&p.terminal&&p.focused)||allPanes.find(p=>p.tab===source.tabId&&p.terminal),existingPane=allPanes.find(p=>p.tab===source.tabId&&p.mod==='juhas');
  const hasSidebar=tree=>Boolean(tree&&(tree.id==='git-review-sidebar'||(tree.children||[]).some(hasSidebar))),useLegacy=record.sourcePresentation!=='pane'&&hasSidebar(layout());
  if(!useLegacy&&!existingPane&&!terminal)return fail('The source tab has no terminal for a review pane; the review has been retained');
  const path=value=>{const p=String(value||'').replace(/\\/g,'/').replace(/\/+$/,'');return /^[a-z]:|^\/\//i.test(p)?p.toLowerCase():p;};
  if(terminal?.cwd&&path(terminal.cwd)!==path(source.folder)){
   const root=path(repo.root),folder=path(terminal.cwd);if(folder!==root&&!folder.startsWith(root+'/'))return fail('The source terminal moved to another repository; the review has been retained');
   source={...source,folder:terminal.cwd,key:JSON.stringify([source.spaceId,source.tabId,source.machine??null,terminal.cwd])};
  }
  const sessionId=record.sourceSessionId||record.sessionId||this.sessionId,targetSelection=contextStorageKey('selection',sessionId,source),targetComposer=contextStorageKey('composer',sessionId,source),targetReview=contextStorageKey('review',sessionId,source);
  this.persistComposer();this.persistReview();
  const incoming=shared(this.composerKey),existing=shared(targetComposer),preview=shared(this.reviewStorageKey()),existingPreview=shared(targetReview),drafts=this.controller.session().drafts;
  const dirty=value=>{if(!value?.target)return false;const saved=value.id?drafts.find(d=>d.id===value.id):null;return saved?value.body!==saved.body:Boolean(value.body?.trim());};
  if(dirty(incoming)&&dirty(existing)&&JSON.stringify(incoming)!==JSON.stringify(existing))return fail('The source sidebar has another unsaved comment; save or cancel it before returning');
  if(preview?.batch?.edited&&existingPreview?.batch?.edited&&preview.batch.text!==existingPreview.batch.text)return fail('The source sidebar has another edited review; finish it before returning');
  this.publish();const selection=shared(this.selectionKey);if(!selection)return fail('The review source could not be transferred; the tab has been retained');
  setShared(targetSelection,selection);if(incoming&&!dirty(existing))setShared(targetComposer,incoming);if(preview&&!existingPreview?.batch?.edited)setShared(targetReview,{...preview,batch:{...preview.batch,contextKey:source.key}});
  const snapshot=this.viewSnapshots().get(this.selectionKey);if(snapshot)this.viewSnapshots().set(targetSelection,snapshot);
  run('tab.select',{id:source.tabId});
  if(useLegacy)openReview(run);
  else{if(existingPane)run('pane.focus',{pane:existingPane.pane});else if(terminal)run('pane.split',{pane:terminal.pane,direction:'right',mod:'juhas',props:{role:'pane',sessionId}});}
  setShared(this.composerKey,null);setShared(this.reviewStorageKey(),null);setShared('juhas.review-tabs.v1',(shared('juhas.review-tabs.v1')||[]).filter(entry=>entry.key!==key));setShared(key,{...record,sourceContext:source,opening:0,tabId:null,paneId:null});
  if(allPanes.some(p=>p.tab===record.tabId&&p.pane!==record.paneId))run('pane.close',{pane:record.paneId});else run('tab.close',{id:record.tabId});return true;
 }
 reviewCurrentBranch(cx){if(this.hasUnsavedComment()){this.message='Save or cancel the current comment before switching branch context';cx.notify();return;}const controller=this.controller,repo=controller.state.repo,path=controller.state.file?.newPath;this.work(cx,async cx=>{await controller.openRepo(repo.machine,repo.root,{repo,loadHistory:false});this.restoreBase();await this.updateFeatureHistory();await controller.selectScope(controller.state.empty?{kind:'working-tree',baseRef:'HEAD'}:{kind:'commit',commit:controller.state.history[0]?.oid||'HEAD'});const file=controller.state.files.find(f=>f.newPath===path);if(file)await controller.selectFile(file.id);this.publish();});}
 reviewLatest(cx){if(this.hasUnsavedComment()){this.message='Save or cancel the current comment before opening the latest version';cx.notify();return;}const path=this.controller.state.file?.newPath;this.work(cx,async cx=>{await this.controller.selectScope({kind:'commit',commit:'HEAD'});const file=this.controller.state.files.find(f=>f.newPath===path);if(file)await this.controller.selectFile(file.id);this.publish();});}
 activateContext(context,cx){
  if(this.busy)return;
  const refreshing=this.refreshingContextKey===context.key;this.refreshingContextKey=null;
  if(this.activeContext){this.rememberLoadedView();this.persistComposer();this.persistReview();this.contextViews.set(this.activeContext.key,{controller:this.controller,policy:this.policy,historyRef:this.historyRef,historyFull:this.historyFull,upperView:this.upperView,allFiles:this.allFiles,showHistory:this.showHistory,showFiles:this.showFiles,summaryLines:this.summaryLines,showComments:this.showComments,panelOrder:this.panelOrder,commentPanelPosition:this.commentPanelPosition,filePanelPosition:this.filePanelPosition,historyPanelPosition:this.historyPanelPosition,hideTests:this.hideTests,allChangesFrom:this.allChangesFrom,includeWorking:this.includeWorking,manualCommitBase:this.manualCommitBase,fields:Object.fromEntries(Object.entries(this.inputs).map(([key,state])=>[key,state.value()]))});}
  if(this.activeContext){this.contextScrolls??=new Map();this.contextScrolls.set(this.activeContext.key,Object.fromEntries(['diffScroll','filesScroll','historyScroll','commentsScroll','horizontalScroll'].map(key=>[key,this[key]])));}
  this.contextScrolls??=new Map();const handles=this.contextScrolls.get(context.key);if(handles)Object.assign(this,handles);else if(this.activeContext&&this.diffScroll){this.diffScroll=VirtualListScrollHandle.new();this.filesScroll=VirtualListScrollHandle.new();this.historyScroll=VirtualListScrollHandle.new();this.commentsScroll=ScrollHandle.new();this.horizontalScroll=ScrollHandle.new();}
  this.activeContext=context;this.sessionId=this.contextProps.sessionId||context.spaceId||context.key;
  this.selectionKey=contextStorageKey('selection',this.sessionId,context);this.composerKey=contextStorageKey('composer',this.sessionId,context);this.reviewKey=contextStorageKey('review',this.sessionId,context);
  this.seenSelection=null;this.seenComposer=undefined;this.panel=null;this.draftStatus='all';this.draftSource='all';this.draftSourcePicker=false;this.target=null;this.selectedStart=null;this.editId=null;this.batch=null;this.message='';this.rangeAnchor=null;this.rangePicking=false;this.commitAnchor=null;this.filtersOpen=false;
  const saved=this.contextViews.get(context.key);this.controller=saved?.controller||new Controller({run:createRunner(exec,appHome()),store,sessionId:this.sessionId,cache,onChange:()=>this.controllerChanged()});this.policy=saved?.policy||{repos:[],canSwitch:false,kind:'empty'};this.historyRef=saved?.historyRef||'HEAD';this.historyFull=Boolean(saved?.historyFull);this.upperView=saved?.upperView||'changes';this.allFiles=saved?.allFiles!==false;this.showHistory=Boolean(saved?.showHistory);this.showFiles=saved?.showFiles!==false;this.summaryLines=Boolean(saved?.summaryLines);this.showComments=saved?.showComments??saved?.upperView==='comments';this.panelOrder=saved?.panelOrder;this.commentPanelPosition=saved?.commentPanelPosition||'top';this.filePanelPosition=saved?.filePanelPosition||'top';this.historyPanelPosition=saved?.historyPanelPosition||'top';this.hideTests=Boolean(saved?.hideTests);this.allChangesFrom=saved?.allChangesFrom==='commit'?'commit':'branch';this.includeWorking=Boolean(saved?.includeWorking);this.manualCommitBase=saved?.manualCommitBase||null;this.lastAppliedFrom=this.allChangesFrom;this.choosingCommitBase=false;
  if(this.preferenceBaseline)this.applyPreferences();
  this.restoringComposer=true;for(const [key,input] of Object.entries(this.inputs))input.set_value(saved?.fields?.[key]||(key==='folder'?context.folder||'':key==='target'?'HEAD':''));this.restoringComposer=false;
  if(!refreshing&&this.restoreLoadedView(shared(this.selectionKey),cx)){
   const remembered=this.rememberedIncludeWorking();
   if(!saved&&remembered!==null&&remembered!==this.includeWorking){
    this.includeWorking=remembered;
    const scope=this.controller.state.comparison?.scope;
    const aggregate=scope&&(scope.kind==='branch'||(scope.kind==='range'&&!scope.includeBase));
    if(aggregate&&Boolean(scope.includeWorking)!==remembered)this.applyAllChanges(cx);
    else cx.notify();
   }
   this.warmRepositoryCounts(cx);return;
  }
  if(saved?.policy?.ready){this.restoreBase();if(this.allFiles){this.rebuildAllSections();this.prepareFileHeaders(cx);}cx.notify();this.warmRepositoryCounts(cx);return;}
  const controller=this.controller;
  this.work(cx,async cx=>{
   await this.loadConfig();
   const rawSelection=shared(this.selectionKey)||shared(`git-review.v1.selection.${this.sessionId}`),selection=this.supportedSelection(rawSelection)?rawSelection:null;
   const {primary,scope}=this.repositoryDiscovery(controller,context);
   const current=()=>!this.closed&&this.activeContext===context&&this.controller===controller;
   const discoveryVersion=this.discoveryVersion;
   const currentDiscovery=()=>current()&&this.discoveryVersion===discoveryVersion;
   const own=await primary;if(!current())return;
   const immediate=own&&(!selection?.root||allowedRepository({repos:[own]},selection.root));
   const acceptPolicy=policy=>{if(currentDiscovery()){this.policy={...policy,ready:true};this.rememberLoadedView();cx.notify();this.warmRepositoryCounts(cx);}};
   let repo;
   if(immediate){
    repo=own;
    this.policy={repos:[own],canSwitch:false,kind:'single'};
    void scope.then(acceptPolicy,error=>{if(currentDiscovery()){this.message=error.message;cx.notify();}});
   }else{
    const policy=await scope;if(!current())return;
    acceptPolicy(policy);
    repo=allowedRepository(policy,selection?.root)||policy.repos[0];
   }
   if(!repo)return;
   await controller.openRepo(context.machine,repo.root,{repo,loadHistory:false});if(this.activeContext?.key!==context.key)return;
   this.inputs.folder.set_value(repo.root);this.restoreBase();
   const remembered=this.rememberedIncludeWorking();
   this.includeWorking=remembered!==null?remembered:Boolean(selection?.includeWorking||selection?.scope?.includeWorking);this.allChangesFrom=selection?.allChangesFrom==='commit'||selection?.scope?.kind==='range'&&!selection.scope.includeBase?'commit':'branch';this.manualCommitBase=selection?.manualCommitBase||(selection?.scope?.kind==='range'&&!selection.scope.includeBase?selection.scope.base:null);this.lastAppliedFrom=this.allChangesFrom;
   if(allowedRepository({repos:[repo]},selection?.root)&&selection?.scope){
    const aggregate=selection.scope.kind==='branch'||(selection.scope.kind==='range'&&!selection.scope.includeBase);
    const scopeOverride=remembered!==null&&aggregate&&Boolean(selection.scope.includeWorking)!==remembered;
    if(scopeOverride){const adjusted={...selection.scope};if(remembered)adjusted.includeWorking=true;else delete adjusted.includeWorking;await controller.selectScope(adjusted);}
    else if(selection.comparison&&!refreshing)await controller.selectResolved(selection.comparison);
    else await controller.selectScope(selection.scope);
    if(selection.fileId)await controller.selectFile(selection.fileId);
   }
   else await this.selectInitialScope();
   const oldComposer=shared(`git-review.v1.composer.${this.sessionId}`);if(shared(this.composerKey)==null&&oldComposer?.target?.repoKey===repo.key)setShared(this.composerKey,oldComposer);
   this.publish();this.registerReviewTab();
   cx.notify();
   await this.updateFeatureHistory();
  });
 }
 repositoryScope(controller,context,reload=false){return this.repositoryDiscovery(controller,context,reload).scope;}
 repositoryDiscovery(controller,context,reload=false){
  const key=JSON.stringify([context.machine,context.folder,this.config.maxDepth,this.config.maxRepos]);
  if(reload||!scopeCache.has(key)){
   const listings=new Map();
   const readWorkspaceFiles=async (_machine,root)=>{
    const paths=await readWorkspacePaths(exec,appHome(),root,{listings});
    return Promise.all(paths.map(async path=>{
     try{return {path,text:await readTextFile(path)};}catch{return {path,text:null};}
    }));
   };
   const primary=context.folder?resolveRepo(controller.run,context.machine,context.folder):Promise.resolve(null);
   const scope=resolveRepositoryScope(controller.run,(machine,path)=>readDirectories(exec,appHome(),machine,path,{markersOnly:this.config.maxDepth===1,listings}),context,{maxDepth:this.config.maxDepth,maxRepos:this.config.maxRepos,readWorkspaceFiles,primary});
   const entry={primary,scope};
   scopeCache.set(key,entry);
   scope.catch(()=>{if(scopeCache.get(key)===entry)scopeCache.delete(key);});
   if(scopeCache.size>32)scopeCache.delete(scopeCache.keys().next().value);
  }
  return scopeCache.get(key);
 }
 async loadConfig(){
  this.localConfigPromise??=readLocalConfig(readTextFile,appHome()+'/juhas.json',appHome()+'/git-review.json').catch(error=>{this.localConfigPromise=null;throw error;});
  const local=await this.localConfigPromise;this.config=resolveConfig(local,shared('git-review.v1.config')||{},this.contextProps.config||{});
 }
 baseChoice(){const s=this.controller.state,saved=this.controller.base();if(saved)return {ref:saved,source:'manual',reason:'Manually selected base'};if(s.automaticChoice)return s.automaticChoice.ref?s.automaticChoice:null;return selectBase(s.refs,s.branch||'',this.config);}
 restoreBase(){const choice=this.baseChoice();this.inputs.base.set_value(choice?.ref||'');this.baseSource=choice?.source||null;return choice;}
 async updateFeatureHistory(){const controller=this.controller;if(controller.state.empty)return;await controller.ensureAutomaticBase?.(this.config);if(this.controller!==controller)return;this.restoreBase();if(!controller.setHistoryBase)return;const applied=await controller.setHistoryBase(this.baseChoice()?.ref);if(applied===false||this.controller!==controller)return;await controller.loadHistory(this.filters());}
 initialScope(){const s=this.controller.state;if(s.empty)return {kind:'working-tree',baseRef:'HEAD'};const base=this.baseChoice();return base?{kind:'branch',baseRef:base.ref,targetRef:'HEAD',...(this.includeWorking?{includeWorking:true}:{})}:null;}
 supportedSelection(selected){return selected?.scope?.kind!=='since-review'&&selected?.comparison?.scope?.kind!=='since-review';}
 async selectInitialScope(){await this.controller.ensureAutomaticBase?.(this.config);const scope=this.initialScope();if(scope)await this.controller.selectScope(scope);else{this.pendingScope='branch';this.panel='refs';}}
 reviewMode(){const selected=shared(this.selectionKey),scope=this.controller.state.comparison?.scope||selected?.scope||selected?.comparison?.scope;return scope?.kind==='commit'?'commit':scope?.kind==='working-tree'?'uncommitted':'all';}
 chooseReviewSource(value,cx){this.panel=null;this.choosingCommitBase=false;if(value==='commit'){this.toggleHistory(true,cx);this.applyScope('commit',cx);}else if(value==='uncommitted')this.applyScope('working-tree',cx);else{this.allChangesFrom='branch';this.applyAllChanges(cx);}}
 moveSourceChoice(delta,cx){const key=this.choosingCommitBase?'baseCommitIndex':'sourceChoice',count=this.choosingCommitBase?this.baseCandidates?.length||0:4;this[key]=Math.max(0,Math.min(count-1,(this[key]||0)+delta));cx.notify();}
 chooseSourceChoice(cx){if(this.choosingCommitBase){const commit=this.baseCandidates?.[this.baseCommitIndex||0];if(!commit)return;this.manualCommitBase=commit.oid;this.choosingCommitBase=false;this.panel=null;this.applyAllChanges(cx);return;}const value=['branch','uncommitted','commit','manual'][this.sourceChoice||0];if(value==='manual')this.startCommitChoice(cx);else this.chooseReviewSource(value,cx);}
 startCommitChoice(cx){this.allChangesFrom='commit';this.choosingCommitBase=true;this.baseCommitIndex=0;this.panel='compareFrom';this.loadCommitBases(cx);cx.timer?.after(30,()=>{if(!this.closed&&this.panel==='compareFrom'&&this.choosingCommitBase)this.inputs.baseQuery?.focus();});cx.notify();}
 panelIsOpen(kind){return kind==='files'?this.showFiles!==false:kind==='history'?Boolean(this.showHistory):Boolean(this.showComments);}
 openPanelOrder(){return [...new Set([...(Array.isArray(this.panelOrder)?this.panelOrder:[]),'files','history','comments'])].filter(kind=>['files','history','comments'].includes(kind)&&this.panelIsOpen(kind));}
 updatePanelOrder(kind,open){if(this.panelIsOpen(kind)!==open){this.panelOrder=this.openPanelOrder().filter(name=>name!==kind);if(open)this.panelOrder.push(kind);}}
 toggleHistory(open,cx){this.updatePanelOrder('history',open);this.showHistory=open;if(!open&&['historyOptions','historyRefs'].includes(this.panel))this.panel=null;this.rememberLoadedView();cx.notify();}
 toggleFiles(open,cx){this.updatePanelOrder('files',open);this.showFiles=open;this.rememberLoadedView();cx.notify();}
 compactCount(value){
  if(!Number.isSafeInteger(value)||value<0)return '…';const units=['','k','M','B','T','Q'];let unit=0,scaled=value;
  while(scaled>=1000&&unit<units.length-1){scaled/=1000;unit++;}
  let rounded=Number(scaled.toFixed(Math.max(0,2-Math.floor(Math.log10(scaled||1)))));if(rounded>=1000&&unit<units.length-1){rounded=1;unit++;}return String(rounded)+units[unit];
 }
 reviewCounts(){const s=this.controller.state,files=s.files||[];let additions=0,deletions=0,binary=0,linesKnown=!s.fileStatsLoading&&!s.fileStatsError;
  for(const file of files){if(file.binary){binary++;continue;}if(!Number.isSafeInteger(file.additions)||file.additions<0||!Number.isSafeInteger(file.deletions)||file.deletions<0){linesKnown=false;continue;}additions+=file.additions;deletions+=file.deletions;}
  if(!Number.isSafeInteger(additions)||!Number.isSafeInteger(deletions))linesKnown=false;const count=s.comparison?.commitCount;return {files:files.length,commits:Number.isSafeInteger(count)&&count>=0?count:null,additions,deletions,binary,linesKnown:Boolean(linesKnown)};
 }
 summaryControl(cx){const counts=this.reviewCounts(),t=theme(),exact=value=>value.toLocaleString('en-US'),tooltip=[exact(counts.files)+' files',counts.commits==null?'Commits: unavailable for this comparison':exact(counts.commits)+' commits',counts.linesKnown?'Added lines: +'+exact(counts.additions):'Added lines: unavailable',counts.linesKnown?'Removed lines: −'+exact(counts.deletions):'Removed lines: unavailable',...(counts.binary?[exact(counts.binary)+' binary files (excluded from line counts)']:[]),...(this.controller.state.fileStatsLoading?['Line counts are loading']:[]),...(this.controller.state.fileStatsError?[this.controller.state.fileStatsError]:[]),...(this.controller.state.comparison?.summaryError?[this.controller.state.comparison.summaryError]:[]),'Click to switch counts / changed lines'].join('\n');
  const label=h_flex().gap(6).items_center();
  if(this.summaryLines)label.child(text('+'+(counts.linesKnown?this.compactCount(counts.additions):'…')).text_color(t.ansi2)).child(text('−'+(counts.linesKnown?this.compactCount(counts.deletions):'…')).text_color(t.ansi1));
  else{label.child(h_flex().gap(3).items_center().child(svg('mods/juhas/icons/single-file.svg').size(13)).child(text(this.compactCount(counts.files),true)));if(counts.commits!=null)label.child(h_flex().gap(3).items_center().child(svg('mods/juhas/icons/commit.svg').size(13)).child(text(this.compactCount(counts.commits),true)));}
  return button('review-summary',label,(_event,cx)=>{this.summaryLines=!this.summaryLines;this.rememberLoadedView();cx.notify();},{tooltip}).flex_none().px(4);
 }
 toggleComments(open,cx){this.updatePanelOrder('comments',open);this.showComments=open;this.rememberLoadedView();cx.notify();}
 panelPosition(kind){const value=this[kind==='files'?'filePanelPosition':kind==='history'?'historyPanelPosition':'commentPanelPosition'];return ['top','bottom','left','right'].includes(value)?value:'top';}
 positionPanel(kind,position,cx){if(!['top','bottom','left','right'].includes(position))return;this[kind==='files'?'filePanelPosition':kind==='history'?'historyPanelPosition':'commentPanelPosition']=position;this.panel=null;if(kind==='files')this.toggleFiles(true,cx);else if(kind==='history')this.toggleHistory(true,cx);else this.toggleComments(true,cx);}
 panelControl(kind,cx){const type=uiMetrics(),isFiles=kind==='files',isHistory=kind==='history',label=isFiles?'Files':isHistory?'History':'Comments',key=kind+'Position',shown=isFiles?this.showFiles!==false:Boolean(isHistory?this.showHistory:this.showComments),position=this.panelPosition(kind);
  const draftCount=!isFiles&&!isHistory?(this.controller?.session?.().drafts?.filter(d=>d.repoKey===this.controller.state?.repo?.key).length||0):0;
  const icon=svg('mods/juhas/icons/'+(isFiles?'single-file':isHistory?'history':'comment')+'.svg').size(15);
  const content=draftCount>0?h_flex().gap(4).items_center().child(icon).child(text(String(draftCount)).text_size(type.caption).text_color(theme().accent)):icon;
  const trigger=toggle('toggle-'+kind,content,shown,(open,cx)=>isFiles?this.toggleFiles(open,cx):isHistory?this.toggleHistory(open,cx):this.toggleComments(open,cx),{tooltip:'Show or hide '+label+(draftCount>0?` (${draftCount})`:'')+' · Right-click to move'}).when(draftCount===0,e=>e.w(type.px(28)).px(0)).when(draftCount>0,e=>e.px(6))
   .on_mouse_down('right',(_e,cx)=>{cx.stop_propagation();this.panel=this.panel===key?null:key;cx.notify();});
  return h_flex().id('panel-control-'+kind).flex_none().items_center()
   .child(selector('position-'+kind,null,this.panel===key,(open,cx)=>{this.panel=open?key:null;cx.notify();},()=>v_flex().gap(2).children(['top','bottom','left','right'].map(place=>button('position-'+kind+'-'+place,h_flex().w_full().gap(8).items_center().child(svg('mods/juhas/icons/panel-'+place+'.svg').size(15).flex_none()).child(place[0].toUpperCase()+place.slice(1)),(_e,cx)=>this.positionPanel(kind,place,cx),{active:place===position,tooltip:'Show '+label+' at the '+place}).w_full().justify_start())),{tooltip:label+' panel position: '+position,width:150,trigger,triggerFocus:this.panelPosFocus?.get?.(key)}));
 }
 reviewPanelGroups(){
  const groups={top:[],bottom:[],left:[],right:[]};
  for(const kind of this.openPanelOrder())groups[this.panelPosition(kind)].push(kind);
  return groups;
 }
 reviewPanels(cx){const type=uiMetrics(),groups=this.reviewPanelGroups();
  const content=kind=>kind==='files'?filesPane(this):kind==='history'?historyPane(this,cx):draftsPane(this,cx);
  const group=position=>{const names=groups[position];if(names.length===1)return content(names[0]);const split=(['top','bottom'].includes(position)?h_resizable:v_resizable)(this.id+'-panels-'+position+'-'+names.join('-')).size_full().min_h(0).min_w(0);for(const [index,kind] of names.entries())split.child(resizable_panel().when(index<names.length-1,e=>e.size(['top','bottom'].includes(position)?Math.max(140,(this.width||800)/names.length):Math.max(100,(this.height||600)/names.length))).size_range(type.px(80)).child(content(kind)));return split;};
  let center=this.diffViewport?div().id('diff-viewport').size_full().min_h(0).min_w(0).child(this.diffViewport):diffPane(this,cx);
  if(groups.top.length)center=v_resizable(this.id+'-panels-top-'+groups.top.join('-')+'-center').size_full().min_h(0).min_w(0).child(resizable_panel().size(type.px(210)).size_range(type.px(80)).child(group('top'))).child(resizable_panel().size_range(type.px(100)).child(center));
  if(groups.bottom.length)center=v_resizable(this.id+'-panels-bottom-'+groups.bottom.join('-')+'-center').size_full().min_h(0).min_w(0).child(resizable_panel().size_range(type.px(100)).child(center)).child(resizable_panel().size(type.px(210)).size_range(type.px(80)).child(group('bottom')));
  if(!groups.left.length&&!groups.right.length)return center;
  const sides=h_resizable(this.id+'-panels-sides-'+groups.left.join('-')+'-center-'+groups.right.join('-')).size_full().min_h(0).min_w(0);
  if(groups.left.length)sides.child(resizable_panel().size(type.px(280)).size_range(type.px(120)).child(group('left')));
  sides.child(resizable_panel().size_range(type.px(160)).child(center));
  if(groups.right.length)sides.child(resizable_panel().size(type.px(280)).size_range(type.px(120)).child(group('right')));return sides;
 }
 setHistoryView(mode,cx){this.historyFull=mode!=='feature';this.historyRef=mode==='all'?'all':'HEAD';this.panel=null;this.work(cx,cx=>this.controller.loadHistory(this.filters()));}
 rememberedIncludeWorking(){const stored=shared('juhas.include-working.v1');return typeof stored==='boolean'?stored:null;}
 setIncludeWorking(checked,cx){const next=Boolean(checked);this.includeWorking=next;setShared('juhas.include-working.v1',next);this.applyAllChanges(cx);}
 applyAllChanges(cx){this.allChangesFrom=this.allChangesFrom==='commit'?'commit':'branch';this.pendingScope=null;this.applyScope(this.allChangesFrom==='commit'?'manual-base':'branch',cx);}
 chooseCompareFrom(value,cx){this.allChangesFrom=value==='commit'?'commit':'branch';this.panel=null;if(value==='commit'&&!this.manualCommitBase){this.choosingCommitBase=true;this.panel='compareFrom';this.loadCommitBases(cx);return;}this.applyAllChanges(cx);}
 loadCommitBases(cx,more=false){const controller=this.controller,query=this.inputs.baseQuery.value();this.work(cx,async cx=>{const result=await listHistory(controller.run,controller.state.repo,{ref:more?this.baseCandidatesRef||'HEAD':'HEAD',query,skip:more?this.baseCandidates?.length||0:0});if(this.controller!==controller)return;this.baseCandidates=more?[...(this.baseCandidates||[]),...result.commits]:result.commits;this.baseCandidatesMore=result.hasMore;this.baseCandidatesRef=result.ref;});}
 compareFromPicker(){const type=uiMetrics();const content=v_flex().min_h(0).min_w(0),option=(id,label,index,action)=>button(id,h_flex().w_full().gap(8).items_center().child(text(label).flex_1()).child(svg('mods/juhas/icons/check.svg').size(14).opacity((this.reviewMode()==='commit'?2:this.reviewMode()==='uncommitted'?1:this.allChangesFrom==='commit'?3:0)===index?1:0)),action,{active:(this.sourceChoice||0)===index,tooltip:label}).w_full().rounded(4).justify_start().role('list_box_option').when((this.sourceChoice||0)===index,e=>e.aria_active_descendant());
  if(this.choosingCommitBase)return content.child(section('Choose commit · changes after this commit'))
   .child(h_flex().gap(5).child(field(this.inputs.baseQuery,'Find a base commit')).child(button('find-base-commit','Search',(_e,cx)=>this.loadCommitBases(cx))))
   .child(optionList(this.id+'-base-commits',this.baseCandidates||[],this.baseCommitIndex||0,(delta,cx)=>this.moveSourceChoice(delta,cx),(_commit,cx)=>this.chooseSourceChoice(cx),{height:168,rows:6,label:c=>`${c.oid.slice(0,8)} · ${c.subject}`,tooltip:c=>`${c.subject}\n${c.author}\n${c.oid}`}))
   .when(Boolean(this.baseCandidatesMore),e=>e.child(button('more-base-commits','Load more',(_e,cx)=>this.loadCommitBases(cx,true))))
   .child(button('back-compare-from','Back',(_e,cx)=>{this.choosingCommitBase=false;this.allChangesFrom=this.lastAppliedFrom||'branch';cx.notify();}));
  return content
   .child(option('source-branch','Changes',0,(_e,cx)=>this.chooseReviewSource('branch',cx)))
   .child(option('source-uncommitted','Uncommitted',1,(_e,cx)=>this.chooseReviewSource('uncommitted',cx)))
   .child(option('source-commit','Commit',2,(_e,cx)=>this.chooseReviewSource('commit',cx)))
   .child(option('from-commit','Changes since commit…',3,(_e,cx)=>this.startCommitChoice(cx)));
 }
 // A bounded, process-only cache bridges Herdr's separate module generations.
 // Initialize lazily: loading a failed hot-reload must not mutate global state.
 viewSnapshots(){return globalThis[Symbol.for('juhas.loadedViews.v2')]??=createCache({maxEntries:8,maxBytes:33554432});}
 viewConfigKey(){return JSON.stringify([shared('git-review.v1.config')||{},this.contextProps?.config||{}]);}
 diffViewportSignature(){
  const s=this.controller?.state||{},t=theme(),look=settings(),drafts=this.controller?.session?.().drafts||[];
  const sections=this.allFiles?(this.allFileSections||[]).map(sec=>`${sec.file?.id}:${sec.collapsed?1:0}:${sec.loading?1:0}:${sec.limited?1:0}:${sec.patch?1:0}:${sec.patch?.fullContext?1:0}`).join(','):'';
  return `${s.comparison?.id||''}|${s.file?.id||''}|${s.files?.length||0}|${s.patch?1:0}|${s.patch?.hunks?.length||0}|${s.patch?.fullContext?1:0}|${s.hasWorkingChanges}|${Boolean(this.includeWorking)}|${this.diffMode}|${Boolean(this.allFiles)}|${Boolean(this.hideTests)}|${Boolean(this.readingOptions?.wrap)}|${Boolean(this.searchOpen)}|${this.findQuery||''}|${this.findIndex}|${this.findMatches?.length||0}|${Boolean(this.experimentalDiff)}|${this.target?`${this.target.comparisonId}:${this.target.newPath}:${this.target.side}:${this.target.startLine}:${this.target.endLine}`:''}|${this.editId||''}|${Boolean(this.busy)}|${this.inlineEditorHeight||0}|${this.singleHeaderHovered?1:0}|${drafts.length}:${drafts.map(d=>d.id+':'+d.body?.length).join(',')}|${sections}|${t.background}|${t.foreground}|${look.font_family||''}|${look.font_size||''}|${look.ui_font_size||''}`;
 }
 syncDiffViewport(cx){
  if(!this.diffViewport)return;
  const sig=this.diffViewportSignature();
  if(sig!==this.renderedDiffSignature){this.renderedDiffSignature=sig;cx.notify(this.diffViewport);}
 }
 presentationKey(){return JSON.stringify([this.activeContext?.key,this.controller.state.comparison?.id,this.controller.state.filtersKey,this.controller.state.historyLoading,Boolean(this.controller.state.details),this.preferenceKeys().map(key=>this[key]),shared('juhas.view-options.v1'),this.controller.session().drafts,this.width,this.busy,this.diffViewport?this.diffViewportSignature():null]);}
 deferPresentation(cx){
  if(!cx?.timer||this.presentationQueued||this.role==='bar')return;const signature=this.presentationKey();if(signature===this.presentationSignature)return;this.presentationQueued=true;
  cx.timer.after(1,cx=>{this.presentationQueued=false;if(this.closed)return;const allFiles=this.allFiles;this.syncPreferences();if(this.allFiles&&allFiles!==this.allFiles){this.rebuildAllSections();this.prepareFileHeaders(cx);}this.prepareCommentCards(cx);this.syncDiffViewport(cx);this.presentationSignature=this.presentationKey();cx.notify();
   const controller=this.controller;if(this.busy||!this.policy?.ready||!controller.state.repo)return;
   this.presentationLoads??=new WeakMap();const attempted=this.presentationLoads.get(controller)||{},filters=this.filters(),historyKey=JSON.stringify(filters),detailsKey=controller.state.comparison?.id;
   const history=this.showHistory&&controller.loadHistory&&!controller.state.historyLoading&&controller.state.filtersKey!==historyKey&&attempted.history!==historyKey,details=this.detailsOpen&&controller.loadDetails&&!controller.state.details&&detailsKey&&attempted.details!==detailsKey;
   if(history||details){this.presentationLoads.set(controller,{...attempted,...(history?{history:historyKey}:{}),...(details?{details:detailsKey}:{})});this.work(cx,async()=>{if(history)await controller.loadHistory(filters);if(details&&this.controller===controller)await controller.loadDetails();});}
  });
 }
 prepareCommentCards(cx){if(!cx?.new)return;this.commentCards??=new Map();const drafts=this.controller.session().drafts,ids=new Set(drafts.map(d=>d.id));for(const [id,entry] of this.commentCards)if(!ids.has(id)){entry.view.release();this.commentCards.delete(id);}for(const draft of drafts){const signature=JSON.stringify([draft,this.width,this.diffMode]);const entry=this.commentCards.get(draft.id);if(!entry)this.commentCards.set(draft.id,{signature,view:cx.new(CommentCard,{owner:this,id:draft.id})});else if(entry.signature!==signature){entry.signature=signature;cx.notify(entry.view);}}}
 preferenceKeys(){return ['allFiles','diffMode','readingOptions','fileTree','detailsOpen','filtersOpen','summaryLines','showFiles','showHistory','showComments','panelOrder','filePanelPosition','historyPanelPosition','commentPanelPosition','hideTests','historyFull','historyRef','remotes','historyAdvanced','searchOpen','draftStatus','showAllRecipients','copySide','historyWidth','listHeight'];}
 applyPreferences(){const stored=shared('juhas.view-options.v1')||{};for(const key of this.preferenceKeys())if(Object.hasOwn(stored,key))this[key]=stored[key];this.preferenceBaseline=Object.fromEntries(this.preferenceKeys().map(key=>[key,JSON.stringify(this[key])]));}
 syncPreferences(){if(!this.preferenceBaseline)return;const stored=shared('juhas.view-options.v1')||{},next={...stored};let changed=false;for(const key of this.preferenceKeys()){const local=JSON.stringify(this[key]);if(local!==this.preferenceBaseline[key]){next[key]=this[key];changed=true;}else if(Object.hasOwn(stored,key))this[key]=stored[key];}this.preferenceBaseline=Object.fromEntries(this.preferenceKeys().map(key=>[key,JSON.stringify(this[key])]));if(changed&&JSON.stringify(next)!==JSON.stringify(stored))setShared('juhas.view-options.v1',next);}
 scrollIdentity(){return this.id+'-'+(this.activeContext?.key||'default');}
 rememberLoadedView(){
  this.syncPreferences();
  if(this.busy||!this.activeContext||!this.policy?.ready||!this.controller.state.repo)return;
  const selected=shared(this.selectionKey);if(!selected||JSON.stringify(selected)!==this.seenSelection)return;
  const snapshot={presentationVersion:1,version:selected.version,configKey:this.viewConfigKey(),config:this.config,state:this.controller.state,policy:this.policy,historyRef:this.historyRef,historyFull:this.historyFull,upperView:this.upperView,allFiles:this.allFiles,showHistory:this.showHistory,showFiles:this.showFiles,summaryLines:this.summaryLines,showComments:this.showComments,panelOrder:this.panelOrder,commentPanelPosition:this.commentPanelPosition,filePanelPosition:this.filePanelPosition,historyPanelPosition:this.historyPanelPosition,hideTests:this.hideTests,allChangesFrom:this.allChangesFrom,includeWorking:this.includeWorking,manualCommitBase:this.manualCommitBase,diffMode:this.diffMode,readingOptions:this.readingOptions,fileTree:this.fileTree,detailsOpen:this.detailsOpen,filtersOpen:this.filtersOpen,fields:Object.fromEntries(Object.entries(this.inputs).filter(([key])=>!['comment','review','note'].includes(key)).map(([key,input])=>[key,input.value()]))};
  this.viewSnapshots().set(this.selectionKey,JSON.parse(JSON.stringify(snapshot)));
 }
 restoreLoadedView(selected,cx){
  if(!selected||!this.activeContext||!this.supportedSelection(selected))return false;const saved=this.viewSnapshots().get(this.selectionKey);
  if(!saved||saved.version!==selected.version||saved.configKey!==this.viewConfigKey()||!allowedRepository(saved.policy,selected.root))return false;
  if(saved.policy.canSwitch&&saved.policy.homeKey===undefined)return false;
  const snapshot=JSON.parse(JSON.stringify(saved));this.controller.state=snapshot.state;this.policy=snapshot.policy;this.config=snapshot.config;
  for(const key of ['historyRef','historyFull','upperView','allChangesFrom','manualCommitBase','diffMode','fileTree','detailsOpen','filtersOpen'])this[key]=snapshot[key];this.upperView=snapshot.upperView||'changes';this.readingOptions=snapshot.readingOptions||{wrap:false};this.allFiles=snapshot.presentationVersion===1?snapshot.allFiles!==false:true;this.showHistory=Boolean(snapshot.showHistory);this.showFiles=snapshot.showFiles!==false;this.summaryLines=Boolean(snapshot.summaryLines);this.showComments=snapshot.showComments??snapshot.upperView==='comments';this.panelOrder=snapshot.panelOrder;this.commentPanelPosition=snapshot.commentPanelPosition||'top';this.filePanelPosition=snapshot.filePanelPosition||'top';this.historyPanelPosition=snapshot.historyPanelPosition||'top';this.hideTests=Boolean(snapshot.hideTests);if(this.preferenceBaseline)this.applyPreferences();if(this.allFiles){this.rebuildAllSections();this.prepareFileHeaders(cx);}this.lastAppliedFrom=this.allChangesFrom||'branch';this.includeWorking=Boolean(selected.includeWorking||selected.scope?.includeWorking);
  this.restoringComposer=true;try{for(const [key,value] of Object.entries(snapshot.fields))this.inputs[key]?.set_value(value);}finally{this.restoringComposer=false;}
  this.seenSelection=JSON.stringify(selected);this.restoreBase();cx.notify();return true;
 }
 refreshContext(cx){
  const context=this.activeContext,controller=this.controller;
  if(!context||this.busy)return;
  const version=this.discoveryVersion=(this.discoveryVersion||0)+1;
  const current=()=>!this.closed&&this.activeContext===context&&this.controller===controller&&this.discoveryVersion===version;
  this.presentationLoads?.delete(controller);this.presentationSignature=null;this.localConfigPromise=null;
  this.viewSnapshots().set(this.selectionKey,null);
  return cx.spawn(async cx=>{
   try{
    await this.loadConfig();
    if(!current())return;
    const policy=await this.repositoryScope(controller,context,true);
    if(!current())return;
    this.policy={...policy,ready:true};
    cx.notify();
    this.warmRepositoryCounts(cx);
    if(!allowedRepository(policy,controller.state.repo?.root)&&policy.repos.length&&!this.hasUnsavedComment()){
     await this.switchRepository(policy.repos[0],cx);
    }else await this.poll(cx);
   }catch(error){if(current()){this.message=error.message;cx.notify();}}
  });
 }
 publish(){const s=this.controller.state;if(!s.repo||(this.followContext&&!this.activeContext))return;if(this.inputs.find){if(this.allFiles&&this.allFilesKey!==s.comparison?.id)this.rebuildAllSections();const findSource=JSON.stringify([s.comparison?.id,s.file?.id,this.allFiles]);if(this.findSource!==findSource){this.findSource=findSource;this.setFindQuery(this.findQuery||'');}}const selection={root:s.repo.root,machine:s.repo.machine,scope:s.comparison?.scope,comparison:s.comparison,fileId:s.file?.id,allChangesFrom:this.allChangesFrom||'branch',includeWorking:Boolean(this.includeWorking),manualCommitBase:this.manualCommitBase||null,version:uid()};this.seenSelection=JSON.stringify(selection);setShared(this.selectionKey,selection);this.rememberLoadedView();}
 sync(cx){if(this.role==='bar'||this.busy)return;const rawSelection=shared(this.selectionKey),selected=this.supportedSelection(rawSelection)?rawSelection:null;const key=JSON.stringify(selected);if(!selected||key===this.seenSelection)return;this.seenSelection=key;
  if(this.policy?.ready&&!allowedRepository(this.policy,selected.root))return;
  if(this.controller.state.repo?.root!==selected.root&&this.hasUnsavedComment())return;
  if(this.restoreLoadedView(selected,cx))return;
  this.work(cx,async cx=>{if(this.controller.state.repo?.root!==selected.root){this.resetRepositoryFields();await this.controller.openRepo(selected.machine,selected.root);}this.includeWorking=Boolean(selected.includeWorking||selected.scope?.includeWorking);this.allChangesFrom=selected.allChangesFrom==='commit'||selected.scope?.kind==='range'&&!selected.scope.includeBase?'commit':'branch';this.manualCommitBase=selected.manualCommitBase||(selected.scope?.kind==='range'&&!selected.scope.includeBase?selected.scope.base:null);this.lastAppliedFrom=this.allChangesFrom;if(selected.comparison&&(selected.comparison.id!==this.controller.state.comparison?.id||JSON.stringify(selected.comparison.scope)!==JSON.stringify(this.controller.state.comparison?.scope)))await this.controller.selectResolved(selected.comparison);else if(!selected.comparison&&selected.scope&&JSON.stringify(selected.scope)!==JSON.stringify(this.controller.state.comparison?.scope))await this.controller.selectScope(selected.scope);if(selected.fileId&&selected.fileId!==this.controller.state.file?.id)await this.controller.selectFile(selected.fileId);this.inputs.folder.set_value(selected.root);this.restoreBase();if(this.controller.setHistoryBase)await this.updateFeatureHistory();});
 }
 deferSync(cx){
  if(this.role==='bar'||this.syncQueued)return;
  const contextChanged=this.followContext&&this.currentContext().key!==this.activeContext?.key;
  const selectionChanged=JSON.stringify(shared(this.selectionKey))!==this.seenSelection;
  const composerChanged=JSON.stringify(shared(this.composerKey||`git-review.v1.composer.${this.sessionId}`)||null)!==this.seenComposer;
  const codeFontChanged=Boolean(this.copyEditor&&this.copyFontSize!==uiMetrics().fontSize);
  if(!contextChanged&&!selectionChanged&&!composerChanged&&!codeFontChanged)return;this.syncQueued=true;
  // Native async work may start synchronously; do not notify or mutate inputs on the render stack.
  cx.timer.after(1,cx=>{this.syncQueued=false;if(this.closed)return;if(this.followContext&&this.currentContext().key!==this.activeContext?.key){this.activateContext(this.currentContext(),cx);return;}this.sync(cx);this.syncComposer(cx);if(codeFontChanged&&this.syncCodeFont())cx.notify();});
 }
 resetRepositoryFields(){this.historyRef='HEAD';this.historyFull=false;this.allChangesFrom='branch';this.lastAppliedFrom='branch';this.manualCommitBase=null;this.rangeAnchor=null;this.rangePicking=false;this.commitAnchor=null;for(const key of ['target','query','author','path','fileQuery','recipientQuery'])this.inputs[key]?.set_value(key==='target'?'HEAD':'');}
 warmRepositoryCounts(cx){
  const policy=this.policy,context=this.activeContext;
  if(policy.canSwitch)cx.timer?.after(1,cx=>{
   if(!this.closed&&this.policy===policy&&this.activeContext===context)this.loadRepositoryCounts(cx);
  });
 }
 loadRepositoryCounts(cx){
  const policy=this.policy,context=this.activeContext,run=this.controller.run;
  const previous=this.repositoryCountRequest;
  if(previous?.policy===policy&&previous.context===context&&
   (previous.completedAt==null||Date.now()-previous.completedAt<30_000))return;
  const request={policy,context,completedAt:null};
  this.repositoryCountRequest=request;
  const current=()=>!this.closed&&this.activeContext===context&&this.policy===policy&&this.repositoryCountRequest===request;
  if(previous?.context!==context){this.repositoryCounts=new Map();this.repositoryChanges=new Map();}
  cx.spawn(async cx=>{
   const scan=async(repos,read,onResult)=>{
    const results=new Map();let next=0;
    await Promise.all(Array.from({length:Math.min(3,repos.length)},async()=>{
     while(current()&&next<repos.length){
      const repo=repos[next++];
      let value;
      try{value=await read(run,repo);}catch{continue;}
      results.set(repo.key,value);
      if(current())onResult?.(repo.key,value);
     }
    }));
    return results;
   };
   const changes=await scan(policy.repos,hasWorkingChanges);
   if(!current())return;
   this.repositoryChanges=changes;
   this.repositoryIndex=0;
   cx.notify();
   const active=this.controller.state?.repo?.key;
   const dirty=policy.repos.filter(repo=>changes.get(repo.key));
   const first=dirty.findIndex(repo=>repo.key===active);
   if(first>0)dirty.unshift(...dirty.splice(first,1));
   const partial=new Map(this.repositoryCounts);
   const counts=await scan(dirty,workingLineCounts,(key,value)=>{
    partial.set(key,value);
    this.repositoryCounts=partial;
    cx.notify();
   });
   request.completedAt=Date.now();
   if(current()){this.repositoryCounts=counts;cx.notify();}
  });
 }
 repositoryRelativePath(root){
  const normalize=path=>path.replace(/\\/g,'/').replace(/\/+$/,'')||'/';
  const folder=this.activeContext?.folder;
  if(!folder)return '';
  const base=normalize(folder),target=normalize(root);
  const volume=path=>/^(?:[a-z]:|\/\/[^/]+\/[^/]+|\/)/i.exec(path)?.[0]?.toLowerCase()||'';
  if(volume(base)!==volume(target))return '';
  const windows=/^(?:[a-z]:|\/\/)/i.test(base),from=base.split('/').filter(Boolean),to=target.split('/').filter(Boolean);
  let common=0;
  while(common<from.length&&common<to.length&&(windows?from[common].toLowerCase()===to[common].toLowerCase():from[common]===to[common]))common++;
  return [...Array(from.length-common).fill('..'),...to.slice(common)].join('/')||'.';
 }
 openFolder(folder,cx){
  if(this.busy||this.switchingRepository)return;
  const repo=allowedRepository(this.policy,folder);
  if(!this.policy?.canSwitch||!repo){this.message='Repository selection is limited to the active project directory';cx.notify();return;}
  if(repo.key===this.controller.state.repo?.key){this.panel=null;cx.notify();return;}
  if(this.hasUnsavedComment()){this.message='Save or cancel the current comment before switching repositories';cx.notify();return;}
  return this.switchRepository(repo,cx);
 }
 switchRepository(repo,cx){
  const context=this.activeContext,previous=this.controller;
  const key=root=>JSON.stringify([context.key,root]);
  const fields=['target','query','author','path','fileQuery','recipientQuery','find'];
  const options=['historyRef','historyFull','allChangesFrom','includeWorking','manualCommitBase','hideTests'];
  this.repositoryViews??=new Map();
  const old=previous.state.repo;
  if(old)this.repositoryViews.set(key(old.key),{controller:previous,
   options:Object.fromEntries(options.map(name=>[name,this[name]])),
   fields:Object.fromEntries(fields.map(name=>[name,this.inputs[name]?.value()]))});
  const saved=this.repositoryViews.get(key(repo.key));
  const controller=saved?.controller||new Controller({run:previous.run,store,sessionId:this.sessionId,cache,onChange:()=>this.controllerChanged()});
  this.panel=null;
  this.switchingRepository=repo;
  cx.notify();
  const current=()=>!this.closed&&this.activeContext===context&&this.controller===controller;
  return this.work(cx,async cx=>{
   try{
   if(!saved)await controller.openRepo(repo.machine,repo.root,{repo,loadHistory:false});
   if(this.closed||this.activeContext!==context||this.controller!==previous)return;
   this.controller=controller;
   this.target=null;this.selectedStart=null;this.editId=null;this.composerComparison=null;this.batch=null;this.panel=null;
   this.restoringComposer=true;
   try{this.inputs.comment?.set_value('');this.resetRepositoryFields();}finally{this.restoringComposer=false;}
   const remembered=this.rememberedIncludeWorking();
   this.includeWorking=remembered!==null?remembered:false;this.hideTests=false;
   this.inputs.folder.set_value(repo.root);
   if(saved){
    Object.assign(this,saved.options);this.lastAppliedFrom=this.allChangesFrom;
    for(const [name,value] of Object.entries(saved.fields))if(value!==undefined)this.inputs[name]?.set_value(value);
   }
   this.restoreBase();
   if(!saved)await this.selectInitialScope();
   if(!current())return;
   this.publish();
   if(!controller.state.empty&&!controller.state.filtersKey)cx.spawn(async cx=>{
    if(!current())return;
    try{await this.updateFeatureHistory();}
    catch(error){if(current()){this.message=error.message;cx.notify();}}
   });
   }finally{this.switchingRepository=null;}
  });
 }
 filters(){return {ref:this.historyRef,exclude:!this.historyFull&&this.historyRef==='HEAD'?this.controller.state.featureBaseOid:null,remotes:this.remotes,query:this.inputs.query.value(),author:this.inputs.author.value(),path:this.inputs.path.value()};}
 selectCommit(oid,cx){
  this.handle.focus();this.selectedStart=null;this.pendingScope=null;
  if(this.rangePicking&&!this.commitAnchor){this.commitAnchor=oid;this.message='Select the last commit of the range';cx.notify();return;}
  const scope=this.rangePicking?rangeSelection(this.controller.state.history,this.commitAnchor,oid):{kind:'commit',commit:oid,parentIndex:0};
  if(!scope)return;this.rangePicking=false;this.commitAnchor=null;this.message='';this.inputs.target.set_value(scope.target||oid);
  this.scopeWork(cx,async(current,cx)=>{await this.controller.selectScope(scope);if(!current())return;this.publish();if(this.detailsOpen)await this.controller.loadDetails();});
 }
 selectFile(id,cx){this.handle.focus();this.selectedStart=null;const controller=this.controller,version=this.fileActionVersion=(this.fileActionVersion||0)+1,current=()=>this.controller===controller&&this.fileActionVersion===version&&controller.state.file?.id===id;this.work(cx,async cx=>{try{await controller.selectFile(id);if(current()){
  this.revealSelectedSection();
  if(this.allFiles){const comparison=controller.state.comparison?.id;this.revealDiffRow(cx,'file-header','top',()=>current()&&this.allFiles&&controller.state.comparison?.id===comparison);}
 }}catch(error){if(current())throw error;}finally{this.publish();}});}
 moveFile(direction,cx){const s=this.controller.state,files=this.visibleFiles(),i=files.findIndex(f=>f.id===s.file?.id);const next=files[Math.max(0,Math.min(files.length-1,i+direction))];if(next)this.selectFile(next.id,cx);}
 moveCommit(direction,cx){const s=this.controller.state,i=s.history.findIndex(c=>c.oid===s.comparison?.targetOid);const next=s.history[Math.max(0,Math.min(s.history.length-1,i+direction))];if(next)this.selectCommit(next.oid,cx);}
 applyScope(kind,cx){this.sourceActionVersion=(this.sourceActionVersion||0)+1;
  this.pendingScope=null;this.selectedStart=null;this.rangeAnchor=null;this.rangePicking=false;this.commitAnchor=null;
  const previousFrom=this.lastAppliedFrom||'branch';
  this.scopeWork(cx,async(current,cx)=>{try{const base=this.inputs.base.value().trim(),target=this.inputs.target.value().trim()||'HEAD';let scope;
   if(kind==='branch'){if(this.controller.ensureAutomaticBase)await this.controller.ensureAutomaticBase(this.config);if(!current())return;const currentBase=this.baseChoice();if(this.config.showAdvanced&&base&&base!==currentBase?.ref)this.controller.setBase(base);const chosen=this.restoreBase();if(!chosen){this.pendingScope='branch';this.setReferencePicker(false,true,cx);return;}scope={kind,baseRef:chosen.ref,targetRef:'HEAD'};}
   else if(kind==='range'){this.toggleHistory(true,cx);this.rangePicking=true;this.commitAnchor=null;this.message='Select the first commit, then the last commit of the range';return;}
   else if(kind==='working-tree')scope={kind,baseRef:'HEAD'};
   else if(kind==='manual-base'){if(!this.manualCommitBase){this.panel='compareFrom';this.loadCommitBases(cx);return;}scope={kind:'range',base:this.manualCommitBase,target:'HEAD',includeBase:false};}
   else scope={kind:'commit',commit:kind==='commit'?'HEAD':target,parentIndex:0};
   if(this.includeWorking&&scope.kind!=='commit'&&scope.kind!=='working-tree')scope={...scope,includeWorking:true};
   if(!current())return;await this.controller.selectScope(scope);if(!current())return;if(kind==='branch'||kind==='manual-base')this.lastAppliedFrom=this.allChangesFrom||'branch';this.publish();if(this.detailsOpen)await this.controller.loadDetails();
  }catch(error){if(!current())return;if(kind==='branch'){this.pendingScope='branch';this.setReferencePicker(false,true,cx);}else if(kind==='manual-base')this.allChangesFrom=previousFrom;throw error;}});
 }
 selectLine(id,cx,side=null,snapshot=null){let row=snapshot||this.patchRows.find(r=>r.id===id);if(!row)return;if(row.kind==='line'&&row.side==='context'&&side==='old')row={...row,side:'old'};const s=this.controller.state;
  if(row.kind==='comment'){this.editDraft(row.draft,cx);return;}
  const extending=row.kind==='line'&&this.selectedStart&&this.selectedStart.fileId===s.file.id&&this.selectedStart.comparisonId===s.comparison.id&&(this.selectedStart.row.side==='old'?'old':'new')===(row.side==='old'?'old':'new');
  if(this.hasUnsavedComment()&&!extending){this.message='Save or cancel the current comment before opening another';cx.notify();return;}
  try{if(row.kind==='hunk'){const lines=row.hunk.lines.filter(l=>l.newLine!=null);if(!lines.length){this.target=commentTarget(s.comparison,s.file,row.hunk.lines[0],row.hunk.lines.at(-1),row.hunk.lines);}else this.target=commentTarget(s.comparison,s.file,lines[0],lines.at(-1),lines);this.selectedStart=null;}
  else {if(extending){this.target=commentTarget(s.comparison,s.file,this.selectedStart.row,row,this.patchRows.filter(r=>r.kind==='line'));this.selectedStart=null;}else{this.target=commentTarget(s.comparison,s.file,row);this.selectedStart={row,fileId:s.file.id,comparisonId:s.comparison.id};}}
  this.editId=null;this.detachedComposer=false;this.composerComparison=s.comparison;if(!extending)this.inputs.comment.set_value('');this.panel='comment';this.persistComposer();this.inputs.comment.focus();this.notifyEditor(cx,false);}catch(e){this.message=e.message;cx.notify();}}
 fileComment(cx){if(this.hasUnsavedComment()){this.message='Save or cancel the current comment before opening another';cx.notify();return;}const s=this.controller.state;this.target=commentTarget(s.comparison,s.file);this.composerComparison=s.comparison;this.detachedComposer=false;this.editId=null;this.selectedStart=null;this.inputs.comment.set_value('');this.panel='comment';this.persistComposer();this.revealSelectedSection();this.notifyEditor(cx);
  const target=this.target,controller=this.controller,version=this.fileActionVersion;
  this.revealDiffRow(cx,'editor','center',()=>this.target===target&&this.panel==='comment'&&this.controller===controller&&controller.state.comparison?.id===s.comparison?.id&&controller.state.file?.id===s.file?.id&&this.fileActionVersion===version,()=>this.inputs.comment.focus());
 }
 editDraft(d,cx){if(this.hasUnsavedComment()){if(this.editId===d.id){this.panel='comment';this.inputs.comment.focus();if(!this.composerIsVisible())this.resumeComment(cx);else this.notifyEditor(cx,true);}else{this.message='Save or cancel the current comment before editing another';cx.notify();}return;}this.editId=d.id;this.target=d;this.detachedComposer=false;this.composerComparison=this.controller.state.comparison?.id===d.comparisonId?this.controller.state.comparison:null;this.selectedStart=null;this.inputs.comment.set_value(d.body);this.inputs.comment.focus();this.panel='comment';this.persistComposer();if(!this.composerIsVisible())this.resumeComment(cx);else this.notifyEditor(cx,true);}
 queueComposerSave(cx){
  if(!this.target||this.restoringComposer)return;
  const delay=300,deadline=Date.now()+delay;
  if(this.composerSavePending){this.composerSavePending.deadline=deadline;return;}
  const pending={deadline};
  this.composerSavePending=pending;
  // Shared writes invalidate the diff, so wait for a pause in typing.
  const flush=cx=>{
   if(this.composerSavePending!==pending)return;
   const remaining=pending.deadline-Date.now();
   if(remaining>0)cx.timer.after(remaining,flush);
   else this.persistComposer();
  };
  cx.timer.after(delay,flush);
 }
 persistComposer(){if(this.restoringComposer)return;this.composerSavePending=null;if(!this.target)return;const key=this.composerKey||`git-review.v1.composer.${this.sessionId}`,value={target:this.target,body:this.inputs.comment.value(),id:this.editId||null,comparison:this.composerComparison||null};this.seenComposer=JSON.stringify(value);if(JSON.stringify(shared(key))!==this.seenComposer)setShared(key,value);}
 syncComposer(cx){if(this.composerSavePending)return;const value=shared(this.composerKey||`git-review.v1.composer.${this.sessionId}`)||null;const serialised=JSON.stringify(value);if(this.seenComposer===serialised)return;this.seenComposer=serialised;
  cx.spawn(async cx=>{this.restoringComposer=true;try{if(value?.target){this.target=value.target;this.composerComparison=value.comparison||null;this.editId=value.id;this.inputs.comment.set_value(value.body||'');if(this.panel!=='submit'&&this.panel!=='unsaved-submit')this.panel='comment';}else{if(this.panel==='comment')this.panel=null;this.target=null;this.composerComparison=null;this.editId=null;this.selectedStart=null;this.inputs.comment.set_value('');}}finally{this.restoringComposer=false;this.notifyEditor(cx);}});
 }
 saveComment(cx,thenPreview=false){if(this.busy)return;const target=this.target,body=this.inputs.comment.value(),editId=this.editId,id=editId||uid();this.work(cx,async cx=>{
  if(!target)throw new Error('Choose a code line or file');let validatedWorking=null;const existing=editId?this.controller.session().drafts.find(d=>d.id===editId):null;
  if(existing?.status==='outdated'&&target.status==='outdated')this.controller.updateCommentBody(target,body,id);
  else{try{validatedWorking=await this.controller.validateComment(target);}catch(error){this.publish();throw error;}this.controller.addComment(target,body,id);}
  if(this.target===target&&this.inputs.comment.value()===body&&this.editId===editId)this.cancelComment(cx);
  else {if(this.target===target&&this.editId===editId)this.editId=id;this.persistComposer();this.message='Comment saved; newer unsaved edits retained';this.notifyEditor(cx);}
  if(!(existing?.status==='outdated'&&target.status==='outdated'))await this.controller.reconcileComments(this.controller.state.comparison,{validatedWorking});
  if(thenPreview)this.preview(cx);
 });}
 fetch(cx){if(this.busy)return;const controller=this.controller;this.fetching=true;this.fetchError='';this.work(cx,async cx=>{try{await controller.fetch();}catch(error){if(this.controller===controller)this.fetchError=error.message;throw error;}finally{this.fetching=false;cx.notify();}});}
 full(){this.openReviewTab();}
 terminal(){this.publish();if(this.contextProps?.isReviewTab){const context=this.recipientContext();if(context?.tabId)run('tab.select',{id:context.tabId});return;}if(this.role==='pane'){const pane=panes().find(p=>p.mod==='juhas'&&p.focused);if(pane?.zoomed)run('pane.zoom',{pane:pane.pane});else run('pane.go',{direction:'left'});return;}collapseReview(run);}
 renderBar(){const type=uiMetrics();return h_flex().h(type.px(34)).px(8).gap(6).items_center().bg(theme().chrome).child(button('review-terminal','Terminal',()=>this.terminal())).child(button('review-full','Juhas',()=>this.full())).child(button('review-sidebar','Sidebar',()=>run('layout.toggle',{id:'git-review-sidebar'})));}
 reviewStorageKey(){return this.reviewKey||`git-review.v1.review.${this.sessionId}`;}
 reviewOptions(){const options=shared('juhas.review-options.v1')||{};return {includeQuotes:options.includeQuotes===true,includeGitContext:options.includeGitContext===true,includeResponseGuidance:options.includeResponseGuidance===true};}
 persistReviewOptions(option,value){const base=shared('juhas.review-options.v1')?this.reviewOptions():{includeQuotes:Boolean(this.includeQuotes),includeGitContext:Boolean(this.includeGitContext),includeResponseGuidance:Boolean(this.includeResponseGuidance)};setShared('juhas.review-options.v1',{...base,[option]:Boolean(value)});}
 persistReview(){if(!this.batch)return;setShared(this.reviewStorageKey(),{repoKey:this.controller.state.repo?.key,batch:this.batch,includeQuotes:Boolean(this.includeQuotes),includeGitContext:Boolean(this.includeGitContext),includeResponseGuidance:Boolean(this.includeResponseGuidance),recipientSource:this.recipientSource});}
 showBatch(batch){this.batch=batch;this.restoringReview=true;try{this.inputs.review.set_value(batch.text);}finally{this.restoringReview=false;}this.persistReview();}
 generatePreview(address,cx){const comparison=this.controller.state.comparison,recipient=agentRecipients(terminals(),agents()).find(t=>t.address===address),includeRepository=Boolean(address&&(this.recipientSource==='manual'||recipient?.space!==this.recipientContext()?.spaceId||recipient?.tab!==this.recipientContext()?.tabId));this.showBatch({...buildBatch(this.controller.session(),comparison?[comparison]:[],{agentAddress:address||null,includeRepository,note:this.inputs.note.value(),repoKey:this.controller.state.repo?.key,includeQuotes:Boolean(this.includeQuotes),includeGitContext:Boolean(this.includeGitContext),includeResponseGuidance:Boolean(this.includeResponseGuidance)}),contextKey:this.currentContext().key});cx.notify();}
 preview(cx,{skipUnsaved=false}={}){try{
  if(this.followContext&&this.activeContext?.key!==this.currentContext().key)throw new Error('Project context changed; reopen its review before choosing an agent');
  if(this.hasUnsavedComment()&&!skipUnsaved){this.persistComposer();this.panel='unsaved-submit';cx.notify();return;}this.omittedComposer=Boolean(this.hasUnsavedComment()&&skipUnsaved);
  const repo=this.controller.state.repo,session=this.controller.session();if(!repo||!session.drafts.some(d=>d.repoKey===repo.key))throw new Error('No saved comments in the current repository');
  const stored=shared(this.reviewStorageKey()),saved=stored?.repoKey===repo.key?stored:null,automatic=detectRecipient(terminals(),agents(),this.recipientContext());
  const savedAddress=saved?.batch?.agentAddress,recipient=savedAddress&&terminals().some(t=>(t.address||t.id)===savedAddress&&isLiveTerminal(t))?savedAddress:automatic?.address||null;
  const options=this.reviewOptions();this.includeQuotes=Boolean(saved?.includeQuotes??options.includeQuotes);this.includeGitContext=Boolean(saved?.includeGitContext??options.includeGitContext);this.includeResponseGuidance=Boolean(saved?.includeResponseGuidance??options.includeResponseGuidance);this.recipientSource=recipient===savedAddress?saved.recipientSource||'manual':recipient?'auto':null;this.recipientPicker=!recipient;this.showAllRecipients=false;this.panel='submit';
  if(saved?.batch?.edited)this.showBatch(updateBatch(saved.batch,{agentAddress:recipient}));else this.generatePreview(recipient,cx);
  this.message='';cx.notify();
 }catch(error){this.message=error.message;cx.notify();}}
 buildPreview(address,cx){try{this.recipientSource='manual';this.recipientPicker=false;if(this.batch&&(this.batch.edited||this.batch.kind==='guided'))this.showBatch(updateBatch(this.batch,{agentAddress:address}));else this.generatePreview(address,cx);this.message='Recipient selected; message edits retained';cx.notify();}catch(error){this.message=error.message;cx.notify();}}
 changeReview(cx){if(this.restoringReview||!this.batch)return;this.batch=updateBatch(this.batch,{text:this.inputs.review.value()});this.persistReview();cx.notify();}
 copyReview(cx){if(!this.batch?.text?.trim())return;cx.write_to_clipboard(this.batch.text);this.message='Review copied';cx.notify();}
 toggleReviewQuotes(cx,checked=!this.includeQuotes){this.includeQuotes=checked;this.persistReviewOptions('includeQuotes',checked);if(this.batch?.edited){this.persistReview();this.message='Edits retained. Regenerate applies the code-quote option.';}else this.generatePreview(this.batch?.agentAddress,cx);cx.notify();}
 toggleGitContext(cx,checked=!this.includeGitContext){this.includeGitContext=checked;this.persistReviewOptions('includeGitContext',checked);if(this.batch?.edited){this.persistReview();this.message='Edits retained. Regenerate applies the Git-context option.';}else this.generatePreview(this.batch?.agentAddress,cx);cx.notify();}
 toggleResponseGuidance(cx,checked=!this.includeResponseGuidance){this.includeResponseGuidance=checked;this.persistReviewOptions('includeResponseGuidance',checked);if(this.batch?.edited){this.persistReview();this.message='Edits retained. Regenerate applies the response instruction.';}else this.generatePreview(this.batch?.agentAddress,cx);cx.notify();}
 recipientOptions(filtered=true){const live=terminals().filter(isLiveTerminal),candidates=this.showAllRecipients?live.map(t=>({...t,address:t.address||t.id})):agentRecipients(live,agents()).filter(a=>a.space===this.recipientContext().spaceId),query=filtered?(this.inputs?.recipientQuery?.value()||'').trim().toLowerCase():'';return query?candidates.filter(t=>[t.address,t.id,t.title,t.program?.name,t.name,t.cwd,t.tab_name].some(value=>String(value||'').toLowerCase().includes(query))):candidates;}
 send(cx){if(!this.batch||this.sending)return;const batch=this.batch;if(!batch.agentAddress||!batch.text.trim()||batch.utf8Bytes>MAX_REVIEW_BYTES){this.message='Choose a recipient and a nonempty message within the transport limit';cx.notify?.();return;}if(batch.contextKey&&this.currentContext().key!==batch.contextKey){this.message='Project context changed; reopen its review before sending';cx.notify?.();return;}this.sending=true;
  this.work(cx,async cx=>{try{const saved=this.controller.session().submittedBatches.find(b=>b.id===batch.id);if(saved&&saved.state!=='failed'){this.message=`Delivery is ${saved.state}; inspect recipient before attempting another delivery`;return;}
   if(!terminals().some(t=>(t.address||t.id)===batch.agentAddress&&isLiveTerminal(t)))throw new Error('Recipient is no longer available; draft retained');
   this.controller.mutate(s=>({...s,submittedBatches:[...s.submittedBatches.filter(b=>b.id!==batch.id),{id:batch.id,state:'unknown',text:batch.text,agentAddress:batch.agentAddress,createdAt:Date.now(),draftSnapshots:batch.draftSnapshots}]}));
   const result=await submit(batch,{send:async(address,message)=>{const r=await exec('hc',['send',address,message,'--json']);if(r.code!==0)throw new Error(r.stderr||r.stdout||'Delivery not confirmed');return {ok:true};}});
   this.controller.mutate(s=>({...s,drafts:result.state==='sent'?s.drafts.filter(d=>batch.draftSnapshots?.[d.id]!==JSON.stringify(d)):s.drafts,submittedBatches:s.submittedBatches.map(b=>b.id===batch.id?{...b,state:result.state,error:result.error}:b)}));this.message=result.state==='sent'?'Review delivered; included comments cleared, newer draft edits retained':`${result.state}: ${result.error}`;if(result.state==='sent'){setShared(this.reviewStorageKey(),null);this.panel=null;this.upperView='comments';this.updatePanelOrder('comments',true);this.showComments=true;this.batch=null;}
  }finally{this.sending=false;}});
 }
 setReferencePicker(history,open,cx){const panel=history?'historyRefs':'refs';if(open||this.panel===panel)this.panel=open?panel:null;if(open){this.pendingRemoteChoices={};this.inputs.refQuery?.set_value('');const selected=history?this.historyRef:this.controller.base();const refs=this.filteredReferences();this.refIndex=!history&&!selected?-1:Math.max(0,refs.findIndex(ref=>ref.fullName===selected));const token=this.refFocusToken=(this.refFocusToken||0)+1;cx.timer?.after(30,()=>{if(!this.closed&&this.panel===panel&&this.refFocusToken===token)this.inputs.refQuery?.focus();});}cx.notify();}

 filteredReferences(){
  const query=(this.inputs.refQuery?.value()||'').trim().toLowerCase();
  const history=this.panel==='historyRefs',source=this.controller.state.refs;
  const base=history?'':this.controller.base();
  const candidates=!history&&!base&&!query?this.controller.state.automaticChoice?.candidates:undefined;
  const pending=history?undefined:this.pendingRemoteChoices;
  const cached=this.referenceResults;
  if(cached?.source===source&&cached.history===history&&cached.base===base&&cached.query===query&&cached.candidates===candidates&&cached.pending===pending)return cached.refs;

  let refs=source;
  if(!history){
   const paired=this.pairedReferences;
   if(paired?.source!==source||paired.base!==base)this.pairedReferences={source,base,refs:branchChoices(source,base)};
   refs=this.pairedReferences.refs;
  }
  if(query){
   refs=refs.filter(ref=>[ref.name,ref.fullName,ref.local?.fullName,ref.remote?.fullName]
    .some(name=>name?.toLowerCase().includes(query)));
  }else if(candidates?.length){
   const allowed=new Set(candidates.map(candidate=>candidate.ref));
   refs=refs.filter(ref=>allowed.has(ref.fullName)||allowed.has(ref.local?.fullName)||allowed.has(ref.remote?.fullName));
  }
  if(pending&&Object.keys(pending).length){
   refs=refs.map(ref=>{
    const remote=pending[ref.id];
    return remote==null?ref:{...ref,...(remote?ref.remote:ref.local),id:ref.id,name:ref.name};
   });
  }
  this.referenceResults={source,history,base,query,candidates,pending,refs};
  return refs;
 }
 moveReferenceChoice(delta,cx){const refs=this.filteredReferences();this.refIndex=Math.max(this.panel==='historyRefs'||this.inputs.refQuery.value().trim()?0:-1,Math.min(refs.length-1,(this.refIndex??0)+delta));cx.notify();}
 automaticReference(){
  const ref=this.controller.state.automaticChoice?.ref;
  if(!ref)return null;
  const pair=this.pairedReferences?.refs.find(item=>item.local&&item.remote&&(item.local.fullName===ref||item.remote.fullName===ref));
  if(!pair)return null;
  const id='automatic:'+ref;
  const remote=this.pendingRemoteChoices?.[id]??(pair.remote.fullName===ref);
  return {...pair,...(remote?pair.remote:pair.local),id,name:'Automatic'};
 }
 chooseAutomaticReference(cx){
  this.filteredReferences();
  const ref=this.automaticReference()?.fullName;
  this.chooseReference(ref&&ref!==this.controller.state.automaticChoice?.ref?ref:'',false,cx);
 }
 chooseReferenceChoice(history,cx){if(!history&&this.refIndex===-1){this.chooseAutomaticReference(cx);return;}const ref=this.filteredReferences()[this.refIndex||0];if(ref)this.chooseReference(ref.fullName,history,cx);}
 chooseAutomaticBase(cx){const version=this.sourceActionVersion=(this.sourceActionVersion||0)+1,controller=this.controller,repo=controller.state.repo,branch=controller.state.branch,context=this.activeContext?.key;const current=()=>!this.closed&&this.sourceActionVersion===version&&this.controller===controller&&controller.state.repo===repo&&controller.state.branch===branch&&this.activeContext?.key===context;this.controller.setBase('');this.inputs.base.set_value('');this.allChangesFrom='branch';this.panel=null;this.work(cx,async cx=>{await controller.ensureAutomaticBase?.(this.config,{force:true});if(!current())return;this.restoreBase();await this.updateFeatureHistory();if(current())this.applyScope('branch',cx);});}
 chooseReference(ref,history,cx){if(!history&&!ref){this.chooseAutomaticBase(cx);return;}this.panel=null;if(history){this.historyFull=true;this.historyRef=ref;this.work(cx,cx=>this.controller.loadHistory(this.filters()));}else{this.controller.setBase(ref);this.restoreBase();this.pendingScope=null;this.allChangesFrom='branch';this.work(cx,cx=>this.updateFeatureHistory());this.applyScope('branch',cx);}cx.notify();}
 referencePicker(history){const type=uiMetrics(),t=theme();const content=v_flex().min_h(0).min_w(0),refs=this.filteredReferences();
   const showAutomatic=!history&&!this.inputs.refQuery.value().trim();
   const automatic=showAutomatic?this.automaticReference():null;
   const onRemote=(ref,remote,cx)=>{this.pendingRemoteChoices={...this.pendingRemoteChoices,[ref.id]:remote};cx.notify();};
   return content
    .child(h_flex().w_full().min_w(0).gap(4).items_center().child(field(this.inputs.refQuery,'Find a branch')).child(button('fetch-branches',svg('mods/juhas/icons/fetch.svg').size(15).when(Boolean(this.fetching),e=>e.spin(900)),(_e,cx)=>{cx.stop_propagation();this.fetch(cx);},{tooltip:this.fetching?'Fetching branches from remotes':'Fetch latest branches from remotes'}).w(28).px(0).disabled(Boolean(this.busy))))
    .when(Boolean(this.fetchError),e=>e.child(text(this.fetchError,true).px(8).py(4)))
    .child(v_flex().flex_none().min_h(0)
     .child(h_flex().px(8).h(type.px(24)).items_center().border_b(1).border_color(t.border).child(text('BRANCH',true).flex_1().text_size(type.caption)).child(text('REMOTE',true).text_size(type.caption)))
     .when(showAutomatic,e=>e.child(automatic
      ?optionList(this.id+'-automatic-base',[automatic],(this.refIndex??-1)===-1?0:-1,(delta,cx)=>this.moveReferenceChoice(delta,cx),(_ref,cx)=>this.chooseAutomaticReference(cx),{rows:1,remoteColumn:true,onRemote})
      :button('automatic-base',h_flex().w_full().gap(8).items_center().child(text('Automatic').flex_1()),(_e,cx)=>this.chooseAutomaticBase(cx),{active:(this.refIndex??-1)===-1,tooltip:'Automatic'}).w_full().justify_start().rounded(4)))
     .when(history,e=>e.child(button('history-head','Current branch',(_e,cx)=>this.chooseReference('HEAD',true,cx))).child(button('history-all','All branches',(_e,cx)=>this.chooseReference('all',true,cx))))
     .child(optionList(this.id+'-refs',refs,this.refIndex||0,(delta,cx)=>this.moveReferenceChoice(delta,cx),(ref,cx)=>this.chooseReference(ref.fullName,history,cx),{height:history?168:196,rows:history?6:7,selected:history?this.historyRef:this.controller.base(),remoteColumn:!history,onRemote})));
 }
 footer(cx){const type=uiMetrics();
  const s=this.controller.session(),t=theme();let content=v_flex().flex_none().border_t(1).border_color(t.border);
  if(this.target?.scope==='general'&&this.panel==='comment')return content.child(text('General review comment',true).px(12).py(type.px(4))).child(this.inlineEditor);
  if(this.detachedComposer&&this.target&&!this.composerIsVisible()&&this.panel==='comment')return content.h(type.px(230)).min_w(0)
   .child(text(`Original source unavailable here · ${this.target.newPath} · ${(this.target.side==='old'?this.target.baseOid:this.target.targetOid)?.slice(0,12)||'working tree'}`,true).h(type.px(38)).px(12).py(type.px(8)).truncate())
   .child(div().min_w(0).child(this.inlineEditor));
  if(this.panel==='copy-code'&&this.copySource===this.diffChangeKey())return content.h(type.px(260)).min_h(0).min_w(0)
   .child(h_flex().px(10).py(type.px(6)).gap(6).items_center().child(text(`Loaded fragments · ${this.copyPath}`).flex_1().min_w(0).truncate().text_ellipsis_middle().tooltip(this.copyPath))
    .child(buttonGroup('copy-side',[{value:'old',label:'Original'},{value:'new',label:'Modified'}],this.copySide,(side,cx)=>this.openCodeCopy(side,cx)))
    .child(button('copy-code-all','Copy all',(_e,cx)=>cx.write_to_clipboard(this.copyEditor.value()),{tooltip:'Copy the code shown below, without diff markers'}))
    .child(button('close-copy-code','Close',(_e,cx)=>{this.panel=null;cx.notify();})))
   .child(Editor.new(this.copyEditor).flex_1().min_h(0).min_w(0));
  if(this.panel==='unsaved-submit')return content.p(type.px(10)).gap(7)
   .child(text('You have an unsaved comment. Include it in this review?').font_semibold())
   .child(h_flex().gap(6).flex_wrap()
    .child(button('save-before-review','Save and continue',(_e,cx)=>this.saveComment(cx,true),{primary:true}))
    .child(button('skip-before-review','Skip for this review',(_e,cx)=>this.preview(cx,{skipUnsaved:true}),{tooltip:'Keep the unsaved text, but omit it from this review'}).disabled(!s.drafts.some(d=>d.repoKey===this.controller.state.repo?.key)))
    .child(button('back-to-comment','Back',(_e,cx)=>{this.panel='comment';this.notifyEditor(cx,true);})))
  if(this.panel==='submit'){
   const recipients=this.recipientOptions(),availableRecipients=this.recipientOptions(false),recipient=terminals().find(t=>(t.address||t.id)===this.batch?.agentAddress),canSend=Boolean(this.batch?.agentAddress&&this.batch?.text?.trim()&&this.batch.utf8Bytes<=MAX_REVIEW_BYTES&&!this.sending);
   return v_flex().flex_1().min_h(0).min_w(0).w_full()
    .child(h_flex().min_h(type.px(42)).flex_none().px(12).py(type.px(6)).gap(7).items_center().flex_wrap().border_b(1).border_color(t.border)
     .child(v_flex().flex_1().min_w(200).gap(3).child(text(recipient?`Agent · ${recipient.title||recipient.program?.name||recipient.name||this.batch.agentAddress}`:'Choose an agent').font_semibold().text_size(type.body).truncate()).child(text(recipient?`${this.recipientSource==='auto'?'Selected automatically':'Selected manually'} · ${this.batch.agentAddress}`:'No feedback will be sent until an agent is selected',true).truncate()))
     .child(popover('change-recipient','Change',this.recipientPicker,(open,cx)=>{this.recipientPicker=open;cx.notify();},()=>v_flex().size_full().min_h(0).child(checkbox('recipient-scope','All live terminals',this.showAllRecipients,(checked,cx)=>{this.showAllRecipients=checked;cx.notify();},{tooltip:'Show all live terminals instead of project agents'})).when(Boolean(this.inputs.recipientQuery),e=>e.child(field(this.inputs.recipientQuery,'Find an agent or directory').flex_none().w_full())).when(!recipients.length,e=>e.child(text(availableRecipients.length?'No recipients match this search.':this.showAllRecipients?'No live terminals available.':'No agents in this project. Enable All live terminals to choose another recipient.',true).p(type.px(12)))).child(virtualList(`${this.id}-recipients`,recipients.map(t=>({...t,id:t.address})),type.px(44),t=>v_flex().px(10).h(type.px(44)).min_w(0).justify_center().tooltip(`${t.address} · ${t.title||t.program?.name||t.name||'terminal'}\n${t.cwd||''}`).child(text(`${t.address} · ${t.title||String(t.program?.name||t.name||'terminal').split(/[\\/]/).at(-1)}`).truncate()).child(text(t.cwd||'Directory unavailable',true).text_size(type.caption).truncate().text_ellipsis_start()),(id,cx)=>this.buildPreview(id,cx))),{tooltip:'Choose another agent session'}))
     .when(this.batch?.kind!=='guided',e=>e.child(checkbox('include-code','Include code',this.includeQuotes,(checked,cx)=>this.toggleReviewQuotes(cx,checked),{tooltip:'Include full code quotes; minimal context is automatic for ambiguous or outdated locations'}))
     .child(checkbox('include-git-context','Include Git context',this.includeGitContext,(checked,cx)=>this.toggleGitContext(cx,checked),{tooltip:'Include repository path and full comparison headers; compact source IDs are always retained'}))
     .child(checkbox('include-response-guidance','Reply with code context',this.includeResponseGuidance,(checked,cx)=>this.toggleResponseGuidance(cx,checked),{tooltip:'Ask the agent to explain each concern and fix using symbol names or short code excerpts'}))
     .child(button('regenerate-review','Regenerate',(_e,cx)=>{this.generatePreview(this.batch?.agentAddress,cx);this.message='Review regenerated from saved comments';cx.notify();},{tooltip:'Replace the edited text with a fresh review from saved comments'}))))
    .child(div().flex_1().min_h(0).min_w(0).px(10).py(type.px(8)).child(Textarea.new(this.inputs.review).size_full().px(14).py(type.px(12)).rounded(8).bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(type.body).line_height(type.lineHeight)))
    .child(h_flex().h(type.px(52)).flex_none().w_full().px(12).gap(8).items_center().border_t(1).border_color(t.border)
     .child(button('send-review',this.sending?'Sending…':'Send review',(_e,cx)=>this.send(cx),{primary:true}).disabled(!canSend).when(!canSend,el=>el.opacity(0.5)))
     .child(button('copy-review','Copy',(_e,cx)=>this.copyReview(cx),{tooltip:'Copy exactly the message in the editor'}))
     .child(button('cancel-submit','Cancel',(_e,cx)=>{this.persistReview();this.panel=this.hasUnsavedComment()?'comment':null;this.batch=null;this.notifyEditor(cx);}))
     .child(div().flex_1().min_w(0).truncate().text_size(type.caption).text_color(this.batch?.utf8Bytes>MAX_REVIEW_BYTES?t.ansi1:t.muted).child(`${this.batch?.draftIds.length||0} comments · ${this.batch?.utf8Bytes||0} bytes${this.batch?.edited?' · edited; source comments retained':''}`)));
  }

  return null;
 }
 key(e,cx){if(e.key?.toLowerCase()==='escape'&&this.searchOpen){this.toggleSearch(false,cx);cx.stop_propagation();return;}if(this.inputFocused||this.panel==='comment'||this.panel==='submit')return;const key=e.key?.toLowerCase();const s=this.controller.state;
  if(key==='escape'){this.terminal();cx.stop_propagation();}
  if(key==='j'||key==='k'){this.moveFile(key==='j'?1:-1,cx);cx.stop_propagation();}
  if(key==='['||key===']'){this.moveCommit(key===']'?1:-1,cx);cx.stop_propagation();}
  if(key==='c'&&s.file){this.fileComment(cx);cx.stop_propagation();}
 }
 compactMessage(){
  const message=this.message||'';
  return ['No more unreviewed files','No more comments','Start of review','End of review','Fetch completed','Review copied','Comment saved; newer unsaved edits retained','Local working snapshot saved; index and files unchanged','Review regenerated from saved comments','Recipient selected; message edits retained'].includes(message)||/^(Checkpoint saved at [0-9a-f]+; comments retained|Review delivered; source comments retained because the message was edited|Review delivered to terminal; newer draft edits have been retained)$/.test(message)?message:null;
 }
 reviewNotices(){
  const s=this.controller.state,notices=[];
  if(s.newHead&&s.sourceUnavailable)notices.push({title:'Original source unavailable',detail:'Original commit unavailable; cached code retained'});
  if(s.sourceStale)notices.push({title:'Newer source available',detail:'Newer source available · unsaved input retained; save or cancel before updating'});
  if(s.missingFile)notices.push({title:'No diff for selected file',detail:`${s.missingFile} no longer has a diff in this source; choose another file`});
  const message=this.compactMessage();if(message)notices.push({title:message,detail:message});
  return notices;
 }
 render(cx){this.deferPresentation(cx);const type=uiMetrics();
  if(this.role==='bar')return this.renderBar();this.deferSync(cx);const s=this.controller.state,t=theme();let session;
  try{session=this.controller.session();}catch(e){return text(e.message).p(type.px(20));}
  const switching=this.followContext&&this.currentContext().key!==this.activeContext?.key;
  const header=h_flex().id('juhas-heading').h(type.px(42)).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
   .on_hover((hovered,cx)=>{if(this.headerHovered!==hovered){this.headerHovered=hovered;cx.notify();}})
   .child(div().flex_1().min_w(0).truncate().text_ellipsis_middle().tooltip(s.branch||'Juhas').font_semibold().text_size(type.heading).text_color(t.foreground).child(this.compact?'Juhas':`Juhas${!switching&&s.branch?' · '+s.branch:''}`))
   .when(this.compact&&Boolean(s.historyLoading||s.historyBaseLoading),e=>e.child(historyLoadingIndicator(s)))
   .when(this.role==='sidebar',e=>e.child(h_flex().w(92).h(type.px(28)).flex_none().gap(2).items_center().when(Boolean(this.headerHovered),e=>e
    .child(button('open-right',svg('mods/juhas/icons/split-right.svg').size(14).text_color(t.muted),()=>this.openReviewPane('right'),{tooltip:'Open review beside the agent'}).w(28).px(0).disabled(!this.activeContext?.folder))
    .child(button('open-down',svg('mods/juhas/icons/split-down.svg').size(14).text_color(t.muted),()=>this.openReviewPane('down'),{tooltip:'Open review below the agent'}).w(28).px(0).disabled(!this.activeContext?.folder))
    .child(button('open-tab',svg('mods/juhas/icons/panel-top-plus.svg').size(14).text_color(t.muted),()=>this.full(),{tooltip:'Open review in its own tab'}).w(28).px(0).disabled(!this.activeContext?.folder)))));
  const size=(size,cx)=>{if(this.height!==size.height||this.width!==size.width){this.height=size.height;this.width=size.width;this.prepareFileHeaders(cx);cx.notify();}};
  if(switching&&!s.repo)return nativeFrame(this.id,{framed:this.role==='sidebar'}).when(this.role==='sidebar',e=>e.child(header)).child(text('Reading active project…',true).p(type.px(14)));
  if(this.panel==='submit')return nativeFrame(this.id,{framed:this.role==='sidebar'}).on_size_change(size).when(this.role==='sidebar',e=>e.child(header)).child(h_flex().min_h(type.px(42)).flex_none().px(14).py(type.px(8)).items_center().child(text(`Review · ${this.batch?.draftIds.length||0} ${this.batch?.draftIds.length===1?'comment':'comments'}`).font_semibold().text_size(type.heading))).when(Boolean(this.message),e=>e.child(text(this.message,true).px(14).py(type.px(4)))).when(Boolean(this.omittedComposer&&this.hasUnsavedComment()),e=>e.child(text('Unsaved comment omitted; its text is retained.',true).px(14).py(type.px(4)))).child(this.footer(cx));
  const mode=s.pendingScope?(s.pendingScope.kind==='commit'?'commit':s.pendingScope.kind==='working-tree'?'uncommitted':'all'):this.reviewMode(),from=this.allChangesFrom||'branch',comparison=s.comparison,advancedRange=comparison?.scope.kind==='range'&&comparison.scope.includeBase;
  const sourceLabel=mode==='uncommitted'?'Uncommitted':mode==='commit'?'Commit':advancedRange?'Range':from==='commit'?'Since commit':'Changes';
  const targetLabel=s.branch&&s.branch!=='(detached)'?s.branch:comparison?.targetOid?.slice(0,8)||'HEAD';
  const narrow=Boolean(this.width&&this.width<760),tight=Boolean(this.width&&this.width<520),refreshing=Boolean(this.busy||s.refreshing||s.scopeLoading||s.patchLoading||s.fileStatsLoading);
  const baseName=this.baseChoice()?.ref?.replace(/^refs\/(heads|remotes)\//,'')||'Choose branch';
  const baseLabel=from==='branch'?`Base: ${baseName} · ${this.baseChoice()?.reason||this.baseSource||'automatic'}`:`Base: ${this.manualCommitBase?.slice(0,8)||'choose commit'} · manual`;
  const showCurrent=currentBranchFits(this.width?Math.max(1,this.width-type.px(narrow?280:430)):undefined,targetLabel,from==='branch'?baseName:this.manualCommitBase?.slice(0,8),type.fontSize,'');
  const notices=this.reviewNotices();
  const repoName=repo=>repo?.name||repo?.root?.replace(/\\/g,'/').split('/').filter(Boolean).at(-1)||'Repository';
  const activeRepo=(this.policy?.repos||[]).find(repo=>repo.key===s.repo?.key)||s.repo;
  const repoLabel=text(repoName(activeRepo)).min_w(0).max_w(type.px(tight?240:144)).truncate().text_ellipsis_middle();
  const showRepositoryPicker=Boolean(s.repo&&this.policy?.canSwitch);
  const repositoryControl=()=>selector('context-repos',h_flex().min_w(0).items_center().gap(4).child(repoLabel).child('▾'),this.panel==='repos',(open,cx)=>{
    if(open===(this.panel==='repos'))return;
    this.panel=open?'repos':null;cx.notify();
    if(open){this.repositoryIndex=0;this.loadRepositoryCounts(cx);}
   },()=>{
    const rank=repo=>{
     const changed=this.repositoryChanges?.get(repo.key);
     if(changed)return 0;
     if(repo.key===this.policy.homeKey)return 1;
     return changed===false?2:3;
    };
    const repos=this.policy.repos.map(repo=>({...repo,id:repo.key,name:repoName(repo)}))
     .sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name)||a.root.localeCompare(b.root));
    return optionList('context-repo-options',repos,this.repositoryIndex||0,(delta,cx)=>{
     this.repositoryIndex=Math.max(0,Math.min(repos.length-1,(this.repositoryIndex||0)+delta));cx.notify();
    },(repo,cx)=>this.openFolder(repo.root,cx),{height:220,rows:5,rowHeight:44,selected:s.repo?.key,
     tooltip:repo=>repo.root,renderLabel:repo=>{
     const changed=this.repositoryChanges?.get(repo.key),lines=changed&&this.repositoryCounts?.get(repo.key);
     const relative=this.repositoryRelativePath(repo.root);
     return v_flex().flex_1().min_w(0)
      .child(h_flex().min_w(0).gap(6).items_center().child(text(repo.name).min_w(0).truncate())
       .when(Boolean(changed),e=>e.child(h_flex().gap(4).flex_none()
        .child(text('+'+(lines?this.compactCount(lines.additions):'…')).text_color(t.ansi2))
        .child(text('−'+(lines?this.compactCount(lines.deletions):'…')).text_color(t.ansi1)))))
      .when(Boolean(relative),e=>e.child(text(relative,true).text_size(type.caption).truncate().text_ellipsis_start()));
    }});
   },{tooltip:s.repo?.root||'Choose repository',width:type.px(320)});
  const comparisonControls=h_flex().id('comparison-baseline').flex_1().min_w(0).items_center().gap(4)
     .when(showRepositoryPicker,e=>e.child(repositoryControl()))
     .child(selector('compare-from',tight?h_flex().gap(2).items_center().child(svg('mods/juhas/icons/all-files.svg').size(15)).child(svg('mods/juhas/icons/chevron-down.svg').size(10)):`${sourceLabel} ▾`,this.panel==='compareFrom',(open,cx)=>{if(open||this.panel==='compareFrom'){this.panel=open?'compareFrom':null;this.choosingCommitBase=false;if(open)this.sourceChoice=this.reviewMode()==='commit'?2:this.reviewMode()==='uncommitted'?1:this.allChangesFrom==='commit'?3:0;cx.timer?.after(1,()=>{if(!this.closed&&this.panel==='compareFrom')this.scopeListFocus?.focus();});}cx.notify();},()=>this.compareFromPicker(),{tooltip:'Choose which changes to review · '+sourceLabel,width:240,height:this.choosingCommitBase?300:200,triggerFocus:this.scopeTriggerFocus,listFocus:this.scopeListFocus,context:'JuhasSourcePicker',onMove:(delta,cx)=>this.moveSourceChoice(delta,cx),onChoose:cx=>this.chooseSourceChoice(cx)}))
     .when(mode==='all'&&!advancedRange,e=>e
      .when(showCurrent,e=>e.child(text(targetLabel).max_w(180).min_w(0).truncate().text_ellipsis_middle().tooltip(`Current branch: ${targetLabel} (HEAD)`)).child(text('→',true)))
      .when(from==='branch',e=>e.child(selector('change-base',h_flex().min_w(0).gap(4).items_center().child(text(this.baseChoice()?.ref?.replace(/^refs\/(heads|remotes)\//,'')||'Choose branch').max_w(tight?55:narrow?85:160).truncate().text_ellipsis_middle()).child('▾'),this.panel==='refs',(open,cx)=>this.setReferencePicker(false,open,cx),()=>this.referencePicker(false),{tooltip:baseLabel+'; changes start at the common ancestor with HEAD',searchable:true,triggerFocus:this.refTriggerFocus,listFocus:this.refListFocus,context:'JuhasBranchPicker',onMove:(delta,cx)=>this.moveReferenceChoice(delta,cx),onChoose:cx=>this.chooseReferenceChoice(false,cx)})))
      .when(from!=='branch',e=>e.child(text(this.manualCommitBase?.slice(0,8)||'Choose commit',true).tooltip(baseLabel))))
     .when(mode==='commit',e=>e.child(button('choose-review-commit',comparison?.targetOid?.slice(0,8)||'HEAD',(_e,cx)=>this.toggleHistory(true,cx),{tooltip:'Choose a commit in Git history'})))
     .when(mode==='all'&&!advancedRange,e=>{
      const workingDirty=s.hasWorkingChanges,workingOn=Boolean(this.includeWorking);
      const workingTooltip=workingDirty===true?(workingOn?'Including uncommitted changes':'Include uncommitted changes · uncommitted changes available'):workingDirty===false?(workingOn?'Including uncommitted changes · working tree clean':'Include uncommitted changes · working tree clean'):(workingOn?'Including uncommitted changes':'Include uncommitted changes');
      const workingIcon=div().relative().size(18).flex().items_center().justify_center()
       .child(svg('mods/juhas/icons/file-pen-line.svg').size(15)
        .when(workingDirty===false,e=>e.text_color(t.muted).when(!workingOn,e=>e.opacity(0.45)))
        .when(workingDirty===true,e=>e.text_color(t.foreground)))
       .when(workingDirty===true,e=>e.child(div().id('include-working-dot').absolute().top_0().right_0().size(5).rounded(3).bg(t.accent)));
      return e.child(toggle('include-working',workingIcon,workingOn,(checked,cx)=>this.setIncludeWorking(checked,cx),{tooltip:workingTooltip}).w(28).px(0));
     });
  const stackToolbar=tight&&showRepositoryPicker;
  const scope=v_flex().px(8).pt(8).pb(6).gap(5)
   .when(stackToolbar,e=>e.child(h_flex().id('repository-toolbar').min_w(0).items_center().child(comparisonControls)))
   .child(h_flex().id('review-toolbar').min_h(type.px(34)).min_w(0).gap(4).items_center()
    .when(stackToolbar,e=>e.justify_end())
    .when(!stackToolbar,e=>e.child(comparisonControls))

     .when(Boolean(notices.length),e=>e.child(popover('review-status',`${notices[0].title.length>28?notices[0].title.slice(0,27)+'…':notices[0].title}${notices.length>1?' · +'+(notices.length-1):''}`,this.panel==='reviewStatus',(open,cx)=>{if(open||this.panel==='reviewStatus')this.panel=open?'reviewStatus':null;cx.notify();},()=>v_flex().size_full().min_h(0).overflow_y_scrollbar().p(type.px(10)).gap(8).children(notices.map(n=>text(n.detail))),{tooltip:notices.map(n=>n.detail).join('\n')})))
     .when(Boolean(s.branchChanged),e=>e.child(button('adopt-branch','Review current branch',(_e,cx)=>this.reviewCurrentBranch(cx),{tooltip:`Checkout changed to ${s.branchChanged?.current}; original review retained until you choose to switch` })))
     .when(Boolean(s.newHead),e=>e.child(button('review-latest',narrow?svg('mods/juhas/icons/refresh.svg').size(15):'Newer version',(_e,cx)=>this.reviewLatest(cx),{tooltip:`Open latest HEAD ${s.newHead}; the selected source stays pinned until you choose to switch`})))
    .child(this.panelControl('comments',cx))
    .child(this.panelControl('files',cx))
    .child(this.panelControl('history',cx))
    .child(button('refresh-review',svg('mods/juhas/icons/refresh.svg').size(15).when(refreshing,e=>e.spin(900)),(_e,cx)=>this.refreshContext(cx),{tooltip:refreshing?'Refreshing review':'Refresh review'}).w(28).px(0).disabled(refreshing))
    .child(this.summaryControl(cx))
    .child((()=>{const draftCount=session.drafts.filter(d=>d.repoKey===s.repo?.key).length,submitLabel=draftCount>0?`Submit review (${draftCount})`:'Submit review';return button('submit-preview',narrow?svg('mods/juhas/icons/send.svg').size(15):submitLabel,(_e,cx)=>this.preview(cx),{primary:true,tooltip:submitLabel}).disabled(!draftCount&&!this.hasUnsavedComment());})()))
   .when(this.panel==='refs'&&(mode!=='all'||from!=='branch'),e=>e.child(selector('configure-base','Choose base branch',true,(open,cx)=>this.setReferencePicker(false,open,cx),()=>this.referencePicker(false),{searchable:true,triggerFocus:this.refTriggerFocus,listFocus:this.refListFocus,context:'JuhasBranchPicker',onMove:(delta,cx)=>this.moveReferenceChoice(delta,cx),onChoose:cx=>this.chooseReferenceChoice(false,cx)})))
   .when(this.panel==='historyRefs',e=>e.child(selector('browse-refs','Browse history',true,(open,cx)=>this.setReferencePicker(true,open,cx),()=>this.referencePicker(true),{searchable:true,triggerFocus:this.refTriggerFocus,listFocus:this.refListFocus,context:'JuhasBranchPicker',onMove:(delta,cx)=>this.moveReferenceChoice(delta,cx),onChoose:cx=>this.chooseReferenceChoice(true,cx)})));
  const root=nativeFrame(this.id,{framed:this.role==='sidebar'}).on_size_change(size).track_focus(this.handle).on_key_down((e,cx)=>this.key(e,cx)).when(this.role==='sidebar',e=>e.child(header)).when(Boolean(s.repo),e=>e.child(scope))
   .when(this.hasUnsavedComment()&&!this.composerIsVisible(),e=>e.child(h_flex().px(10).py(type.px(4)).gap(6).items_center().child(text('Unsaved comment · '+this.target.newPath,true).flex_1().min_w(0).truncate().text_ellipsis_middle().tooltip(this.target.newPath)).child(button('resume-comment','Resume',(_e,cx)=>this.resumeComment(cx)))))
   .when(Boolean(this.message&&!this.compactMessage()),e=>e.child(text(this.message).px(10).py(type.px(6)).bg(t.raised)))
   .when(Boolean(s.refreshError),e=>e.child(text(`Refresh failed · ${s.refreshError} · previous view retained`,true).px(10).py(type.px(4))))
   ;
  const workspace=v_flex().flex_1().min_h(0).min_w(0);
  const discoveryNotes=[...(this.policy?.warnings||[])];
  if(this.policy?.complete===false&&!this.activeContext?.machine)discoveryNotes.push('Repository search was limited');
  if(discoveryNotes.length)root.child(text(discoveryNotes.length===1?discoveryNotes[0]:`${discoveryNotes.length} repository discovery notices`,true).px(10).truncate().tooltip(discoveryNotes.join('\n')));
  if(this.switchingRepository&&(s.repo?.key!==this.switchingRepository.key||!s.comparison))workspace.child(text(`Opening ${repoName(this.switchingRepository)}…`,true).p(type.px(14)));
  else if(!s.repo)workspace.child(text(this.busy?'Reading repositories in the active directory…':'No Git repositories found in the active directory.').p(type.px(14)));
  else if(s.empty&&!s.comparison?.mutableTarget)workspace.child(text('This repository has no commits yet; choose Uncommitted.').p(type.px(16)));
  else {
   workspace.child(this.reviewPanels(cx));
  }
  root.child(workspace);const foot=this.footer(cx);if(foot)root.child(foot);return root;
 }
}
