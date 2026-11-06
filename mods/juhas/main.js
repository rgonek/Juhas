import {View,div,svg} from 'gpui-kit';
import {h_flex,v_flex,InputState,TextareaState,Textarea,Editor,EditorState,h_resizable,v_resizable,resizable_panel,VirtualListScrollHandle} from 'gpui-base';
import {exec,shared,setShared,props,focused,spaces,panes,terminals,theme,run,appHome,nextCommand,readTextFile,agents,layout} from 'herdr';
import {Controller} from './controller.js';
import {createRunner,uid,fingerprint,utf8Bytes} from './git.js';
import {createCache} from './cache.js';
import {readDirectories} from './platform.js';
import {resolveConfig,suggestBases,selectBase,readLocalConfig} from './config.js';
import {commentTarget,annotatePatch,composerRows} from './comments.js';
import InlineEditor from './inline-editor.js';
import FileHeader from './file-header.js';
import {buildBatch,createSubmitter,updateBatch,detectRecipient,agentRecipients,isLiveTerminal,MAX_REVIEW_BYTES} from './submit.js';
import {button,field,text,section,historyPane,filesPane,diffPane,nativeFrame,virtualList,checkbox,toggle,buttonGroup,popover,draftsPane,historyLoadingIndicator} from './ui.js';
import {expandReview,collapseReview,openReview} from './presentation.js';
import {rangeSelection,changeGroups,stepChange,splitRows,patchCode} from './review-ui.js';
import {reviewContext,resolveRepositoryScope,allowedRepository,contextStorageKey} from './context.js';
import {listHistory} from './history.js';
import {createRefreshScheduler,createRefreshCoordinator,reviewVisible} from './refresh.js';
import {generalTarget} from './review.js';
import {reviewedState,setFileReviewed,nextUnreviewed} from './progress.js';
import {captureWorkingSnapshot,deleteWorkingSnapshot} from './snapshots.js';
import {findInPatch} from './reading.js';
import {reviewTabKey,liveReviewTab,reviewTabProps} from './review-tab.js';
import {guidedRequest,parseGuidedResponse,guidedSourceId} from './guided.js';

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
  this.diffMode='unified';this.fileTree=false;this.detailsOpen=false;this.remotes=true;this.historyWidth=480;this.listHeight=230;this.contextProps=p;this.followContext=true;this.contextViews=new Map();this.runningActions=0;this.policy={repos:[],canSwitch:false,kind:'empty'};
  this.controller=new Controller({run:createRunner(exec),store,sessionId:this.sessionId,cache,onChange:()=>this.controllerChanged()});this.handle=cx.focus_handle();this.diffScroll=VirtualListScrollHandle.new();this.filesScroll=VirtualListScrollHandle.new();
  const placeholders={folder:'Repository or parent folder',base:'Base ref / SHA',target:'Target ref / SHA',query:'Text or hash',baseQuery:'Find a base commit',refQuery:'Find a branch',fileQuery:'Filter files by path',recipientQuery:'Find an agent or directory',author:'Author',path:'Path',find:'Find in loaded diff',comment:'Write feedback…',note:'Optional review note',review:'Edit the message that will be copied or sent…'};
  this.inputs={};for(const key of Object.keys(placeholders))this.inputs[key]=(key==='comment'||key==='review'?TextareaState:InputState).new({value:key==='target'?'HEAD':'',placeholder:placeholders[key]});
  for(const input of Object.values(this.inputs)){input.on('focus',()=>{this.inputFocused=true;});input.on('blur',()=>{this.inputFocused=false;});}
  this.inputs.review.on('change',(_e,cx)=>this.changeReview(cx));
  this.inputs.comment.on('change',(_e,cx)=>{this.persistComposer();this.notifyEditor(cx);});
  this.readingOptions={wrap:false};this.findQuery='';this.findMatches=[];this.findIndex=-1;this.allFiles=false;this.allFileSections=[];
  for(const key of ['refQuery','fileQuery','recipientQuery'])this.inputs[key].on('change',(_e,cx)=>cx.notify());
  this.inputs.find.on('change',(_e,cx)=>this.setFindQuery(this.inputs.find.value(),cx));
  this.inlineEditor=cx.new(InlineEditor,{owner:this,input:this.inputs.comment,save:()=>this.headerAction({kind:'save-comment'}),cancel:()=>this.headerAction({kind:'cancel-comment'})});
  this.inputs.folder.on('submit',(_e,cx)=>this.openFolder(this.inputs.folder.value(),cx));
  this.headerQueue=[];cx.spawn(async cx=>{for(;;){const action=await this.nextHeaderAction();if(!action||this.closed)return;if(action.kind==='controller-change'){this.controllerChangeQueued=false;if(this.allFiles&&this.allFilesKey===this.controller?.state.comparison?.id)this.prepareFileHeaders(cx);cx.notify();continue;}if(action.kind==='save-comment'){this.saveComment(cx);continue;}if(action.kind==='cancel-comment'){this.cancelComment(cx);continue;}if(action.comparisonId!==this.controller.state.comparison?.id)continue;if(action.kind==='toggle')this.requestAllFiles(action.fileId,cx);if(action.kind==='viewed')this.markReviewedFile(action.fileId,action.checked,cx);if(action.kind==='comment')this.commentOnFile(action.fileId,cx);this.prepareFileHeaders(cx);cx.notify();}});
  if(this.role!=='bar'){this.activateContext(this.currentContext(),cx);this.setupRefresh(cx);if(p.isReviewTab){let attempts=0;this.tabRegistration=cx.timer.every(100,()=>{if(this.closed||this.registerReviewTab()||++attempts>=30){this.tabRegistration?.cancel();this.tabRegistration=null;}});}}
  cx.spawn(async cx=>{for(;;){const command=await nextCommand();const name=typeof command==='string'?command:command.name;if(name==='preview')this.preview(cx);if(name==='branch'){this.allChangesFrom='branch';this.applyScope('branch',cx);}if(name==='branches')this.setReferencePicker(true,this.panel!=='historyRefs',cx);if(name==='details'){this.detailsOpen=!this.detailsOpen;if(this.detailsOpen)this.work(cx,cx=>this.controller.loadDetails());cx.notify();}if(name==='all-files')this.toggleAllFiles(!this.allFiles,cx);if(name==='search')this.toggleSearch(!this.searchOpen,cx);if(name==='diff-mode')this.setDiffMode(this.diffMode==='split'?'unified':'split',cx);if(name==='next-change')this.navigateChange(1,cx);if(name==='previous-change')this.navigateChange(-1,cx);if(name==='tree'){this.fileTree=!this.fileTree;cx.notify();}if(name==='whole-file')this.work(cx,cx=>this.controller.expandFile());if(name==='comments')this.setUpperView(this.upperView==='comments'?'changes':'comments',cx);if(name==='refresh')this.refreshContext(cx);if(name==='full')this.full();if(name==='terminal')this.terminal();if(name==='sidebar')this.returnToSidebar(cx);if(name==='next-file')this.moveFile(1,cx);if(name==='previous-file')this.moveFile(-1,cx);if(name==='next-commit')this.moveCommit(1,cx);if(name==='previous-commit')this.moveCommit(-1,cx);}});
 }
 close(){this.tabRegistration?.cancel();this.headerWake?.(null);for(const item of this.fileHeaderViews?.values()||[])item.release();this.closed=true;this.refreshScheduler?.close();this.diffScroll?.release();this.filesScroll?.release();this.copyEditor?.release();this.inlineEditor?.release();}
 setupRefresh(cx){
  const coordinator=globalThis[Symbol.for('juhas.refreshCoordinator.v1')]??=createRefreshCoordinator();
  this.refreshScheduler=createRefreshScheduler({timer:cx.timer,coordinator,visible:()=>!this.busy&&this.reviewIsVisible(),key:()=>JSON.stringify([this.id,this.activeContext?.key,this.controller.state.repo?.key]),refresh:cx=>this.poll(cx),onError:(error,cx)=>{if(!this.closed){this.message=error.message;cx.notify();}}});this.refreshScheduler.start();
 }
 reviewIsVisible(){const context=this.contextProps?.isReviewTab?{...this.activeContext,spaceId:this.displaySpaceId,tabId:this.displayTabId}:this.activeContext;return !this.closed&&Boolean(this.controller.state.repo)&&reviewVisible({role:this.role,context,focus:focused(),spaces:spaces(),panes:panes(),layout:layout(),paneId:this.contextProps?.pane});}
 async poll(cx){
  if(this.closed||this.busy||!this.controller.state.repo)return;
  const controller=this.controller,context=this.activeContext?.key;
  const signature=s=>JSON.stringify([s.comparison?.id,s.file?.id,s.history?.map(c=>c.oid),s.branch,s.newHead,s.branchChanged,s.sourceUnavailable,s.refreshError,s.sourceStale]);
  const before=signature(controller.state);
  try{await controller.refresh({preserveComposer:this.hasUnsavedComment()||this.panel==='submit'});
   if(this.closed||this.controller!==controller||this.activeContext?.key!==context)return;
   if(signature(controller.state)!==before){this.publish();this.prepareFileHeaders(cx);cx.notify();}else this.rememberLoadedView();
  }catch(error){if(!this.closed&&this.controller===controller&&this.activeContext?.key===context){this.message=error.message;cx.notify();}}
 }
 hasUnsavedComment(){if(!this.target)return false;const body=this.inputs.comment?.value()||'',saved=this.editId?this.controller.session().drafts.find(d=>d.id===this.editId):null;return saved?body!==saved.body:Boolean(body.trim());}
 composerIsVisible(){const s=this.controller.state,target=this.target;if(target?.scope==='general')return target.comparisonId===s.comparison?.id;if(!target||target.comparisonId!==s.comparison?.id||target.newPath!==s.file?.newPath)return false;if(target.side==null)return true;const field=target.side==='old'?'oldLine':'newLine';return Boolean((s.patch?.hunks||[]).some(h=>h.lines.some(line=>line[field]===target.endLine)));}
 setUpperView(value,cx){this.upperView=value==='comments'?'comments':'changes';this.rememberLoadedView();cx.notify();}
 generalComment(cx){if(this.hasUnsavedComment()){this.message='Save or cancel the current comment first';cx.notify();return;}this.target=generalTarget(this.controller.state.comparison);this.composerComparison=this.controller.state.comparison;this.editId=null;this.selectedStart=null;this.detachedComposer=false;this.inputs.comment.set_value('');this.panel='comment';this.persistComposer();this.inputs.comment.focus();this.notifyEditor(cx);}
 isFileReviewed(file,session){const c=this.controller.state.comparison;return Boolean(c&&file&&reviewedState(session||this.controller.session(),c,file));}
 markReviewedFile(id,checked,cx){const {comparison,files}=this.controller.state,file=files.find(f=>f.id===id);if(!comparison||!file)return;this.controller.mutate(s=>setFileReviewed(s,comparison,file,checked));cx.notify();}
 commentOnFile(id,cx){if(this.busy)return;const controller=this.controller,comparison=controller.state.comparison;if(this.hasUnsavedComment()){this.message='Save or cancel the current comment first';cx.notify();return;}this.work(cx,async cx=>{await controller.selectFile(id);if(this.controller!==controller||controller.state.comparison!==comparison||controller.state.file?.id!==id||this.hasUnsavedComment())return;this.revealSelectedSection();this.publish();this.fileComment(cx);});}
 toggleSearch(open,cx){this.searchOpen=open;if(open)this.inputs.find.focus();else{this.setFindQuery('',cx);this.inputs.find.set_value('');this.handle?.focus();}cx.notify();}
 nextHeaderAction(){if(this.headerQueue.length)return Promise.resolve(this.headerQueue.shift());return new Promise(resolve=>this.headerWake=resolve);}
 controllerChanged(){if(this.closed||this.controllerChangeQueued)return;this.controllerChangeQueued=true;this.headerAction({kind:'controller-change'});}
 headerAction(action){if(this.headerWake){const wake=this.headerWake;this.headerWake=null;wake(action);}else (this.headerQueue??=[]).push(action);}
 prepareFileHeaders(cx){if(!this.allFiles||!cx?.new)return;const key=this.controller.state.comparison?.id;if(this.fileHeadersKey!==key){for(const item of this.fileHeaderViews?.values()||[])item.release();this.fileHeaderViews=new Map();this.fileHeaderSignatures=new Map();this.fileHeadersKey=key;}const session=this.controller.session(),files=new Map((this.controller.state.files||[]).map(file=>[file.id,file]));for(const section of this.allFileSections||[]){if(section.comparison?.id===key&&files.has(section.file.id))section.file=files.get(section.file.id);const p={owner:this,fileId:section.file.id,comparisonId:key},signature=JSON.stringify([section.collapsed,section.loading,section.limited,section.file.additions,section.file.deletions,section.file.binary,this.isFileReviewed(section.file,session),this.busy,this.width]);if(!this.fileHeaderViews.has(section.file.id))this.fileHeaderViews.set(section.file.id,cx.new(FileHeader,p));else if(this.fileHeaderSignatures.get(section.file.id)!==signature)cx.notify(this.fileHeaderViews.get(section.file.id));this.fileHeaderSignatures.set(section.file.id,signature);}}
 markFileReviewed(checked,cx){const {comparison,file}=this.controller.state;if(!comparison||!file)return;this.controller.mutate(s=>setFileReviewed(s,comparison,file,checked));cx.notify();}
 moveUnreviewed(direction,cx){const s=this.controller.state,next=nextUnreviewed(s.files,this.controller.session(),s.comparison,s.file?.id,direction);if(next)this.selectFile(next.id,cx);else{this.message='No more unreviewed files';cx.notify();}}
 resetReviewed(cx){const key=this.controller.state.repo?.key;this.controller.mutate(s=>({...s,reviewedFiles:Object.fromEntries(Object.entries(s.reviewedFiles||{}).filter(([k])=>{try{return JSON.parse(k)[0]!==key;}catch{return true;}}))}));cx.notify();}
 setFindQuery(query,cx){this.findQuery=query;this.findIndex=-1;if(this.allFiles){this.findMatches=[];for(const section of this.allFileSections||[]){if(section.collapsed||!section.patch)continue;const matches=findInPatch(section.patch,query);const remaining=10000-this.findMatches.length;this.findMatches.push(...matches.slice(0,remaining).map(m=>({...m,fileId:section.file.id})));if(matches.limited||matches.length>remaining)this.findMatches.limited=true;}}else this.findMatches=query?findInPatch(this.controller.state.patch,query):[];cx?.notify();}
 moveFind(direction,cx){const matches=this.findMatches||[];if(!matches.length)return;this.findIndex=(this.findIndex+direction+matches.length)%matches.length;const match=matches[this.findIndex],field=match.side==='old'?'oldLine':'newLine';const index=(this.diffRows||[]).findIndex(r=>(!match.fileId||r.fileId===match.fileId)&&(r.kind==='pair'?(match.side==='old'?r.old:r.next)?.[field]===match.line:r.kind==='line'&&r[field]===match.line));if(index>=0)this.diffScroll.scroll_to_item(index,'center');cx.notify();}
 toggleWrap(pressed,cx){this.readingOptions={...this.readingOptions,wrap:pressed};cx.notify();}
 navigateComment(direction,cx){if(this.hasUnsavedComment()){this.message='Save or cancel the current comment first';cx.notify();return;}const drafts=this.controller.session().drafts.filter(d=>d.repoKey===this.controller.state.repo?.key),current=drafts.findIndex(d=>d.id===(this.commentCursor||this.editId)),index=current<0?(direction>0?0:drafts.length-1):current+direction;if(index<0||index>=drafts.length){this.message='No more comments';cx.notify();return;}this.commentCursor=drafts[index].id;this.openComment(drafts[index],cx);}
 revealSelectedSection(){if(!this.allFiles)return;const s=this.controller.state;if(this.allFilesKey!==s.comparison?.id)this.rebuildAllSections();const section=this.allFileSections?.find(section=>section.file.id===s.file?.id);if(section){section.collapsed=false;section.patch=s.patch;section.limited=false;}}
 rebuildAllSections(){const s=this.controller.state;this.allFilesKey=s.comparison?.id;this.allFileSections=s.files.map(file=>({file,comparison:s.comparison,patch:file.id===s.file?.id?s.patch:null,collapsed:file.id!==s.file?.id}));}
 toggleAllFiles(pressed,cx){this.allFiles=pressed;if(pressed)this.rebuildAllSections();this.prepareFileHeaders(cx);this.setFindQuery(this.findQuery||'',cx);}
 requestAllFiles(fileId,cx){const section=this.allFileSections?.find(s=>s.file.id===fileId);if(!section)return;section.collapsed=!section.collapsed;if(section.collapsed||section.patch){cx.notify();return;}const c=this.controller.state.comparison,controller=this.controller;section.loading=true;this.prepareFileHeaders(cx);cx.notify();cx.spawn(async cx=>{try{const patch=await controller.readFilePatch(section.file,c);if(this.closed||this.controller!==controller||this.controller.state.comparison?.id!==c.id)return;const rows=this.allFileSections.reduce((n,s)=>n+(s.patch?.hunks||[]).reduce((m,h)=>m+h.lines.length,0),0),extra=(patch.hunks||[]).reduce((n,h)=>n+h.lines.length,0);if(rows+extra>20000){section.limited=true;}else section.patch=patch;}catch(error){if(this.closed||this.controller!==controller||this.controller.state.comparison?.id!==c.id)return;section.limited=true;this.message=error.message;}finally{section.loading=false;if(!this.closed){this.prepareFileHeaders(cx);this.setFindQuery(this.findQuery||'',cx);}}});}
 selectFileLine(row,fileId,cx,side=null){const controller=this.controller,comparison=controller.state.comparison;if(row.comparisonId&&row.comparisonId!==comparison?.id)return;if(controller.state.file?.id===fileId){this.selectLine(row.id,cx,side,row);return;}if(this.hasUnsavedComment()){this.message='Save or cancel the current comment first';cx.notify();return;}this.work(cx,async cx=>{await controller.selectFile(fileId);if(this.controller!==controller||controller.state.comparison?.id!==comparison.id)return;this.publish();this.selectLine(row.id,cx,side,row);});}
 openComment(d,cx){if(this.hasUnsavedComment()){this.message='Save or cancel the current comment before navigating';cx.notify();return;}if(d.scope==='general'){this.editDraft(d,cx);return;}if(this.target)this.cancelComment(cx);const controller=this.controller;this.work(cx,async cx=>{if(controller.state.comparison?.id!==d.comparisonId){if(!d.targetOid)throw new Error('Original working code is unavailable; the saved comment and quote are retained');await controller.selectScope(d.baseOid?{kind:'range',base:d.baseOid,target:d.targetOid,includeBase:false}:{kind:'commit',commit:d.targetOid});}if(controller.state.comparison?.id!==d.comparisonId)throw new Error('Original source changed; the saved comment is retained');const file=controller.state.files.find(f=>f.newPath===d.newPath&&(d.oldPath==null||f.oldPath===d.oldPath));if(!file)throw new Error('The original file is unavailable');await controller.selectFile(file.id);if(d.side&&!controller.state.patch?.hunks.some(h=>h.lines.some(l=>l[d.side==='old'?'oldLine':'newLine']===d.endLine)))await controller.expandFile();this.panel=null;this.commentCursor=d.id;this.revealSelectedSection();this.publish();cx.notify();cx.timer.after(1,()=>{if(this.controller!==controller||controller.state.comparison?.id!==d.comparisonId)return;const index=(this.diffRows||[]).findIndex(row=>row.kind==='comment'&&row.draft.id===d.id);if(index>=0)this.diffScroll.scroll_to_item(index,'center');});});}
 async prefetchNeighbors(controller=this.controller){if(!this.config.prefetch||this.prefetching)return;const c=controller.state.comparison,selected=controller.state.file?.id,files=controller.state.files,index=files.findIndex(f=>f.id===selected);this.prefetching=true;try{for(const file of [files[index+1],files[index-1]].filter(Boolean)){if(this.controller!==controller||controller.state.comparison!==c||controller.state.file?.id!==selected||this.busy)break;try{await controller.readFilePatch(file,c);}catch{break;}}}finally{this.prefetching=false;}}
 guidedPath(){return `${this.controller.state.repo.gitDir}/juhas-guided.json`;}
 requestGuided(cx){try{if(this.hasUnsavedComment())throw new Error('Save or cancel the current comment first');const s=this.controller.state,request=guidedRequest(s.comparison,s.files,this.guidedPath()),recipient=detectRecipient(terminals(),agents(),this.recipientContext());this.includeQuotes=false;this.includeGitContext=false;this.includeResponseGuidance=false;this.recipientPicker=!recipient;this.recipientSource=recipient?'auto':null;this.showBatch({kind:'guided',id:uid(),sourceId:request.sourceId,contextKey:this.currentContext().key,repoKey:s.repo.key,agentAddress:recipient?.address||null,text:request.text,generatedText:request.text,draftIds:[],draftSnapshots:{},edited:false,utf8Bytes:utf8Bytes(request.text)});this.panel='submit';cx.notify();}catch(error){this.message=error.message;cx.notify();}}
 loadGuided(cx){this.work(cx,async cx=>{const controller=this.controller,c=controller.state.comparison,response=await readTextFile(this.guidedPath(),{on:controller.state.repo.machine??null});if(this.controller!==controller||controller.state.comparison?.id!==c.id)return;this.guided=parseGuidedResponse(response,c,controller.state.files);setShared(`juhas.guided.${c.repoKey}`,this.guided);this.panel='guided';});}
 notifyEditor(cx,reveal=false){this.prepareFileHeaders(cx);if(this.inlineEditor)cx.notify(this.inlineEditor);if(reveal&&this.target?.comparisonId===this.controller.state.comparison?.id&&this.target?.newPath===this.controller.state.file?.newPath){const s=this.controller.state,annotated=composerRows(annotatePatch(s.patch,this.controller.session().drafts,s.comparison.id,s.file.newPath),this.target,this.editId),rows=this.diffMode==='split'?splitRows(annotated):annotated,index=rows.findIndex(r=>r.kind==='editor');if(index>=0)this.diffScroll?.scroll_to_item(index,'center');}cx.notify();}
 cancelComment(cx){this.target=null;this.selectedStart=null;this.editId=null;this.composerComparison=null;this.detachedComposer=false;this.panel=null;this.inputs.comment.set_value('');setShared(this.composerKey||`git-review.v1.composer.${this.sessionId}`,null);this.notifyEditor(cx);}
 resumeComment(cx){const target=this.target;if(!target)return;if(target.scope==='general'){this.panel='comment';this.detachedComposer=false;this.inputs.comment.focus();this.notifyEditor(cx);return;}this.panel='comment';this.detachedComposer=false;this.work(cx,async cx=>{try{
  const c=this.controller.state.comparison;if(c?.id!==target.comparisonId){if(this.composerComparison)await this.controller.selectResolved(this.composerComparison);else if(target.targetOid)await this.controller.selectScope(target.baseOid?{kind:'range',base:target.baseOid,target:target.targetOid,includeBase:false}:{kind:'commit',commit:target.targetOid,parentIndex:0});else throw new Error('Original working-tree context is not available; unsaved text is retained');}
  if(this.controller.state.comparison?.id!==target.comparisonId)throw new Error('Source context changed; unsaved text is retained');
  const file=this.controller.state.files.find(f=>f.newPath===target.newPath&&(target.oldPath==null||f.oldPath===target.oldPath));if(!file)throw new Error('Original file is unavailable; unsaved text is retained');await this.controller.selectFile(file.id);if(!this.composerIsVisible())await this.controller.expandFile();this.publish();if(!this.composerIsVisible())throw new Error('Original line is outside the available patch; unsaved text is retained');this.inputs.comment.focus();this.notifyEditor(cx,true);
 }catch(error){this.detachedComposer=true;this.notifyEditor(cx);throw error;}});}
 openCodeCopy(side,cx){
  const s=this.controller.state;if(!s.patch||s.patch.binary||s.patch.modeOnly)return;
  if(this.hasUnsavedComment()){this.message='Save or cancel the current comment first';cx.notify();return;}
  if(!this.copyEditor){this.copyEditor=EditorState.new({readonly:true,line_numbers:false,folding:false});this.copyEditor.on('focus',()=>{this.inputFocused=true;});this.copyEditor.on('blur',()=>{this.inputFocused=false;});}
  this.copyEditor.set_value(patchCode(s.patch,side));this.copySide=side;this.copySource=this.diffChangeKey();this.copyPath=s.file?.newPath;this.panel='copy-code';cx.notify();
 }
 diffChangeKey(){const s=this.controller.state;return JSON.stringify([s.comparison?.id,s.file?.id,this.diffMode]);}
 setDiffMode(mode,cx){this.diffMode=mode;this.changeCursor=null;cx.notify();}
 navigateChange(direction,cx){
  if(this.busy||this.diffRowsKey!==this.diffChangeKey())return;
  const groups=changeGroups(this.diffRows||[]),source=this.diffChangeKey(),current=this.changeCursor?.source===source?this.changeCursor.id:null,target=stepChange(groups,current,direction);
  const index=groups.findIndex(group=>group.id===current);
  if((index>=0&&(direction>0?index===groups.length-1:index===0))||!groups.length){this.navigateFileChange(direction,cx);return;}
  if(!target)return;this.changeCursor={source,id:target.id};this.diffScroll.scroll_to_item(target.index,'top');cx.notify();
 }
 navigateFileChange(direction,cx){
  const controller=this.controller,s=controller.state,comparison=s.comparison?.id,mode=this.diffMode,files=s.files.slice(),start=files.findIndex(file=>file.id===s.file?.id),step=direction>0?1:-1;
  this.work(cx,async cx=>{
   for(let i=start+step;i>=0&&i<files.length;i+=step){
    if(this.controller!==controller||controller.state.comparison?.id!==comparison||this.diffMode!==mode)return;
    this.selectedStart=null;await controller.selectFile(files[i].id);this.publish();
    if(this.controller!==controller||controller.state.comparison?.id!==comparison||controller.state.file?.id!==files[i].id||this.diffMode!==mode)return;
    const state=controller.state,annotated=annotatePatch(state.patch,controller.session().drafts,comparison,state.file?.newPath),composed=this.inlineEditor&&this.target?.comparisonId===comparison&&this.target?.newPath===state.file?.newPath?composerRows(annotated,this.target,this.editId):annotated,rows=mode==='split'?splitRows(composed):composed,target=stepChange(changeGroups(rows),null,direction);
    this.changeCursor=null;if(!target)continue;
    this.changeCursor={source:this.diffChangeKey(),id:target.id};this.diffScroll.scroll_to_item(target.index,'top');return;
   }
   this.message=direction>0?'End of review':'Start of review';
  });
 }
 async workAsync(cx,action){this.runningActions=(this.runningActions||0)+1;this.busy=true;this.message='';this.notifyEditor(cx);try{await action(cx);}catch(e){this.message=e.message;}finally{this.runningActions--;this.busy=this.runningActions>0;this.rememberLoadedView();this.notifyEditor(cx);if(!this.busy&&this.config.prefetch)cx.spawn(()=>this.prefetchNeighbors());}}
 work(cx,action){cx.spawn(async cx=>this.workAsync(cx,action));}
 scopeWork(cx,action){const version=this.scopeActionVersion=(this.scopeActionVersion||0)+1,controller=this.controller,current=()=>this.scopeActionVersion===version&&this.controller===controller;this.work(cx,async cx=>{try{await action(current,cx);}catch(error){if(current())throw error;}});}
 currentContext(){return this.contextProps?.reviewContext||reviewContext(this.contextProps||{},focused(),spaces(),panes());}
 recipientContext(){const repo=this.controller.state.repo;return this.contextProps?.isReviewTab&&repo?shared(reviewTabKey(repo,this.activeContext?.spaceId))?.sourceContext||this.currentContext():this.currentContext();}
 closeReviewOrigin(origin){if(origin?.paneId&&panes().some(p=>p.pane===origin.paneId&&p.mod==='juhas'&&p.tab===origin.tabId))run('pane.close',{pane:origin.paneId});if(origin?.sidebar){run('layout.hide',{id:'git-review-sidebar'});run('layout.hide',{id:'panel'});}}
 reviewOrigin(){const tabId=this.displayTabId||this.activeContext?.tabId,matches=panes().filter(p=>p.mod==='juhas'&&p.tab===tabId),pane=matches.find(p=>p.pane===this.contextProps?.pane)||matches.find(p=>p.focused)||(matches.length===1?matches[0]:null);return this.role==='sidebar'?{sidebar:true}:this.role==='pane'&&!this.contextProps?.isReviewTab&&pane?{paneId:pane.pane,tabId}:null;}
 registerReviewTab(){
  if(!this.contextProps?.isReviewTab)return false;const key=this.contextProps.reviewTabKey,record=shared(key),space=spaces().find(s=>s.id===this.contextProps.reviewContext?.spaceId||s.id===this.activeContext?.spaceId);if(!key||!space)return false;
  const live=panes().filter(p=>p.mod==='juhas'&&space.tabs.some(t=>t.id===p.tab));let pane=live.find(p=>p.pane===record?.paneId&&p.tab===record?.tabId);
  if(!pane){const candidates=record?.previousTabIds?live.filter(p=>!record.previousTabIds.includes(p.tab)):live.filter(p=>p.tab!==this.contextProps.reviewContext?.tabId&&space.tabs.some(t=>t.id===p.tab&&t.name===`Review · ${String(this.contextProps.folder||'').replace(/\\/g,'/').split('/').at(-1)}`));if(candidates.length===1)pane=candidates[0];}
  if(!pane)return false;
  // Discovery may resolve a parent folder to its repository after the tab opens.
  const repo=this.controller.state.repo,canonicalKey=repo?reviewTabKey(repo,space.id):key;
  if(canonicalKey!==key){
   const existing=shared(canonicalKey);
   if(liveReviewTab(existing,spaces(),panes())){
    setShared(canonicalKey,{...existing,sourceContext:record?.sourceContext||existing.sourceContext,sourceSessionId:record?.sourceSessionId||existing.sourceSessionId,sourcePresentation:record?.sourcePresentation||existing.sourcePresentation});
    const selection=shared(this.selectionKey);if(selection)setShared(contextStorageKey('selection',existing.sessionId,existing.context),selection);
    run('tab.select',{id:existing.tabId});if(record?.origin)this.closeReviewOrigin(record.origin);
    setShared(key,null);setShared('juhas.review-tabs.v1',(shared('juhas.review-tabs.v1')||[]).filter(item=>item.key!==key));
    if(panes().some(p=>p.tab===pane.tab&&p.pane!==pane.pane))run('pane.close',{pane:pane.pane});else run('tab.close',{id:pane.tab});return true;
   }
   this.contextProps.reviewTabKey=canonicalKey;this.contextProps.folder=repo.root;setShared(canonicalKey,record);setShared(key,null);setShared('juhas.review-tabs.v1',(shared('juhas.review-tabs.v1')||[]).filter(item=>item.key!==key));return this.registerReviewTab();}
  this.displayTabId=pane.tab;this.displaySpaceId=space.id;setShared(key,{...record,origin:null,previousTabIds:undefined,tabId:pane.tab,paneId:pane.pane,spaceId:space.id,context:this.activeContext,sessionId:this.sessionId});const index=shared('juhas.review-tabs.v1')||[],entry={key,root:this.contextProps.folder,machine:this.contextProps.machine??null,spaceId:space.id};if(!index.some(item=>item.key===key))setShared('juhas.review-tabs.v1',[...index,entry].slice(-100));if(record?.origin)this.closeReviewOrigin(record.origin);return true;
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
  const s=this.controller.state,repo=s.repo||(this.activeContext?.folder?{root:this.activeContext.folder,machine:this.activeContext.machine??null}:null);if(!repo)return;this.publish();const key=reviewTabKey(repo,this.activeContext?.spaceId),record=shared(key),sourceContext=this.recipientContext(),origin=this.reviewOrigin();
  if(liveReviewTab(record,spaces(),panes())){setShared(key,{...record,sourceContext,sourceSessionId:this.sessionId,sourcePresentation:origin?.sidebar?'sidebar':origin?.paneId?'pane':record.sourcePresentation||'sidebar'});setShared(contextStorageKey('selection',record.sessionId,record.context),shared(this.selectionKey));run('tab.select',{id:record.tabId});this.closeReviewOrigin(origin);return;}
  if(record?.opening&&Date.now()-record.opening<5000)return;
  const p={...reviewTabProps(repo,this.activeContext,this.sessionId),config:this.contextProps?.config},selectionKey=contextStorageKey('selection',this.sessionId,p.reviewContext);
  setShared(selectionKey,shared(this.selectionKey));for(const kind of ['composer','review']){const previous=shared(contextStorageKey(kind,this.sessionId,this.activeContext));if(previous)setShared(contextStorageKey(kind,this.sessionId,p.reviewContext),previous);}
  const snapshot=this.viewSnapshots().get(this.selectionKey);if(snapshot)this.viewSnapshots().set(selectionKey,{...snapshot,policy:{...snapshot.policy,repos:[repo],kind:'single',canSwitch:false}});
  setShared(key,{opening:Date.now(),sourceContext,sourceSessionId:this.sessionId,sourcePresentation:origin?.sidebar?'sidebar':'pane',origin,previousTabIds:spaces().find(space=>space.id===this.activeContext?.spaceId)?.tabs?.map(tab=>tab.id)||[]});run('tab.new',{name:`Review · ${repo.root.replace(/\\/g,'/').split('/').at(-1)}`,space:this.activeContext?.spaceId,folder:repo.root,mod:'juhas',props:p});if(origin?.sidebar)this.closeReviewOrigin(origin);
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
 saveWorkingCheckpoint(cx){this.work(cx,async cx=>{const repo=this.controller.state.repo;if(this.controller.session().checkpoints.filter(cp=>cp.repoKey===repo.key&&cp.kind==='working-snapshot').length>=100)throw new Error('Snapshot history is full; delete an old snapshot first');const comparison=this.controller.state.comparison;await this.controller.verifyComparison(comparison);const checkpoint=await captureWorkingSnapshot(exec,repo,{branch:this.controller.state.branch});try{await this.controller.verifyComparison(comparison);}catch(error){await deleteWorkingSnapshot(exec,repo,checkpoint);throw error;}this.controller.mutate(s=>({...s,checkpoints:[...s.checkpoints,checkpoint]}));this.message='Local working snapshot saved; index and files unchanged';this.panel='checkpoints';});}
 removeWorkingCheckpoint(cp,cx){this.work(cx,async cx=>{if(this.controller.state.comparison?.scope.checkpointId===cp.id||this.target?.baseTree===cp.treeOid||this.controller.session().drafts.some(d=>d.repoKey===cp.repoKey&&d.baseTree===cp.treeOid))throw new Error('This snapshot is in use by the review or saved comments; choose another baseline and clear its comments first');await deleteWorkingSnapshot(exec,this.controller.state.repo,cp);this.controller.mutate(s=>({...s,checkpoints:s.checkpoints.filter(c=>c.id!==cp.id)}));});}
 useCheckpoint(cp,cx){this.allChangesFrom='checkpoint';this.panel=null;this.work(cx,async cx=>{await this.controller.selectScope({kind:'since-review',checkpointId:cp.id,targetRef:'HEAD',includeWorking:Boolean(this.includeWorking||cp.kind==='working-snapshot')});this.publish();});}
 activateContext(context,cx){
  if(this.busy)return;
  const refreshing=this.refreshingContextKey===context.key;this.refreshingContextKey=null;
  if(this.activeContext){this.rememberLoadedView();this.persistComposer();this.persistReview();this.contextViews.set(this.activeContext.key,{controller:this.controller,policy:this.policy,historyRef:this.historyRef,historyFull:this.historyFull,upperView:this.upperView,allChangesFrom:this.allChangesFrom,includeWorking:this.includeWorking,manualCommitBase:this.manualCommitBase,fields:Object.fromEntries(Object.entries(this.inputs).map(([key,state])=>[key,state.value()]))});}
  this.activeContext=context;this.sessionId=this.contextProps.sessionId||context.spaceId||context.key;
  this.selectionKey=contextStorageKey('selection',this.sessionId,context);this.composerKey=contextStorageKey('composer',this.sessionId,context);this.reviewKey=contextStorageKey('review',this.sessionId,context);
  this.seenSelection=null;this.seenComposer=undefined;this.panel=null;this.draftStatus='all';this.draftSource='all';this.draftSourcePicker=false;this.target=null;this.selectedStart=null;this.editId=null;this.batch=null;this.message='';this.rangeAnchor=null;this.rangePicking=false;this.commitAnchor=null;this.filtersOpen=false;
  const saved=this.contextViews.get(context.key);this.controller=saved?.controller||new Controller({run:createRunner(exec),store,sessionId:this.sessionId,cache,onChange:()=>this.controllerChanged()});this.policy=saved?.policy||{repos:[],canSwitch:false,kind:'empty'};this.historyRef=saved?.historyRef||'HEAD';this.historyFull=Boolean(saved?.historyFull);this.upperView=saved?.upperView||'changes';this.allChangesFrom=saved?.allChangesFrom||'branch';this.includeWorking=Boolean(saved?.includeWorking);this.manualCommitBase=saved?.manualCommitBase||null;this.lastAppliedFrom=this.allChangesFrom;this.choosingCommitBase=false;
  this.restoringComposer=true;for(const [key,input] of Object.entries(this.inputs))input.set_value(saved?.fields?.[key]||(key==='folder'?context.folder||'':key==='target'?'HEAD':''));this.restoringComposer=false;
  if(!refreshing&&this.restoreLoadedView(shared(this.selectionKey),cx))return;
  if(saved?.policy?.ready){this.restoreBase();cx.notify();return;}
  const controller=this.controller;
  this.work(cx,async cx=>{
   await this.loadConfig();
   const scopeKey=JSON.stringify([context.machine,context.folder,this.config.maxDepth,this.config.maxRepos]);
   if(!scopeCache.has(scopeKey)){const pending=resolveRepositoryScope(controller.run,(machine,path)=>readDirectories(exec,appHome(),machine,path),context,{maxDepth:this.config.maxDepth,maxRepos:this.config.maxRepos});scopeCache.set(scopeKey,pending);pending.catch(()=>scopeCache.delete(scopeKey));if(scopeCache.size>32)scopeCache.delete(scopeCache.keys().next().value);}
   const policy=await scopeCache.get(scopeKey);if(this.activeContext?.key!==context.key)return;this.policy={...policy,ready:true};
   const selection=shared(this.selectionKey)||shared(`git-review.v1.selection.${this.sessionId}`);
   const repo=allowedRepository(policy,selection?.root)||policy.repos[0];if(!repo)return;
   await controller.openRepo(context.machine,repo.root,{repo,loadHistory:false});if(this.activeContext?.key!==context.key)return;
   this.inputs.folder.set_value(repo.root);this.restoreBase();
   this.includeWorking=Boolean(selection?.includeWorking||selection?.scope?.includeWorking);this.allChangesFrom=selection?.allChangesFrom||(selection?.scope?.kind==='since-review'?'checkpoint':selection?.scope?.kind==='range'&&!selection.scope.includeBase?'commit':'branch');this.manualCommitBase=selection?.manualCommitBase||(selection?.scope?.kind==='range'&&!selection.scope.includeBase?selection.scope.base:null);this.lastAppliedFrom=this.allChangesFrom;
   await this.updateFeatureHistory();
   if(allowedRepository(policy,selection?.root)&&selection?.scope){if(selection.comparison&&!refreshing)await controller.selectResolved(selection.comparison);else await controller.selectScope(selection.scope);if(selection.fileId)await controller.selectFile(selection.fileId);}
   else await controller.selectScope(controller.state.empty?{kind:'working-tree',baseRef:'HEAD'}:{kind:'commit',commit:controller.state.history[0]?.oid||'HEAD',parentIndex:0});
   const oldComposer=shared(`git-review.v1.composer.${this.sessionId}`);if(shared(this.composerKey)==null&&oldComposer?.target?.repoKey===repo.key)setShared(this.composerKey,oldComposer);
   this.publish();this.registerReviewTab();
  });
 }
 async loadConfig(){
  this.localConfigPromise??=readLocalConfig(readTextFile,appHome()+'/juhas.json',appHome()+'/git-review.json').catch(error=>{this.localConfigPromise=null;throw error;});
  const local=await this.localConfigPromise;this.config=resolveConfig(local,shared('git-review.v1.config')||{},this.contextProps.config||{});
 }
 baseChoice(){const s=this.controller.state;return selectBase(s.refs,s.branch||'',this.config,this.controller.base());}
 restoreBase(){const choice=this.baseChoice();this.inputs.base.set_value(choice?.ref||'');this.baseSource=choice?.source||null;return choice;}
 async updateFeatureHistory(){const controller=this.controller;if(!controller.setHistoryBase||controller.state.empty)return;const applied=await controller.setHistoryBase(this.baseChoice()?.ref);if(applied===false||this.controller!==controller)return;await controller.loadHistory(this.filters());}
 reviewMode(){const selected=shared(this.selectionKey),scope=this.controller.state.comparison?.scope||selected?.scope||selected?.comparison?.scope;return !scope||scope.kind==='commit'?'commit':scope.kind==='working-tree'?'uncommitted':'all';}
 setHistoryView(mode,cx){this.historyFull=mode!=='feature';this.historyRef=mode==='all'?'all':'HEAD';this.panel=null;this.work(cx,cx=>this.controller.loadHistory(this.filters()));}
 applyAllChanges(cx){this.pendingScope=null;this.applyScope(this.allChangesFrom==='checkpoint'?'since-review':this.allChangesFrom==='commit'?'manual-base':'branch',cx);}
 chooseCompareFrom(value,cx){this.allChangesFrom=value;this.panel=null;if(value==='commit'&&!this.manualCommitBase){this.panel='compareFrom';this.loadCommitBases(cx);return;}this.applyAllChanges(cx);}
 loadCommitBases(cx,more=false){const controller=this.controller,query=this.inputs.baseQuery.value();this.work(cx,async cx=>{const result=await listHistory(controller.run,controller.state.repo,{ref:more?this.baseCandidatesRef||'HEAD':'HEAD',query,skip:more?this.baseCandidates?.length||0:0});if(this.controller!==controller)return;this.baseCandidates=more?[...(this.baseCandidates||[]),...result.commits]:result.commits;this.baseCandidatesMore=result.hasMore;this.baseCandidatesRef=result.ref;});}
 compareFromPicker(){const content=v_flex().size_full().min_h(0).min_w(0);
  if(this.allChangesFrom==='commit'&&!this.manualCommitBase||this.choosingCommitBase)return content.child(section('Choose commit · changes after this commit'))
   .child(h_flex().gap(5).child(field(this.inputs.baseQuery,'Find a base commit')).child(button('find-base-commit','Search',(_e,cx)=>this.loadCommitBases(cx))))
   .child(virtualList(`${this.id}-base-commits`,(this.baseCandidates||[]).map(c=>({...c,id:c.oid})),28,c=>text(`${c.oid.slice(0,8)} · ${c.subject}`).truncate().tooltip(`${c.subject}\n${c.author}\n${c.oid}`).px(8).h(28),(id,cx)=>{this.manualCommitBase=id;this.choosingCommitBase=false;this.panel=null;this.applyAllChanges(cx);} ))
   .when(Boolean(this.baseCandidatesMore),e=>e.child(button('more-base-commits','Load more',(_e,cx)=>this.loadCommitBases(cx,true))))
   .child(button('back-compare-from','Back',(_e,cx)=>{this.choosingCommitBase=false;this.allChangesFrom=this.lastAppliedFrom||'branch';cx.notify();}));
  return content.child(section('Compare from')).child(button('from-base-branch','Base branch',(_e,cx)=>this.chooseCompareFrom('branch',cx)))
   .child(button('from-checkpoint','Last review checkpoint',(_e,cx)=>this.chooseCompareFrom('checkpoint',cx)))
   .child(button('from-commit','Choose commit…',(_e,cx)=>{this.allChangesFrom='commit';this.choosingCommitBase=true;this.loadCommitBases(cx);cx.notify();}));
 }
 // A bounded, process-only cache bridges Herdr's separate module generations.
 // Initialize lazily: loading a failed hot-reload must not mutate global state.
 viewSnapshots(){return globalThis[Symbol.for('juhas.loadedViews.v2')]??=createCache({maxEntries:8,maxBytes:33554432});}
 viewConfigKey(){return JSON.stringify([shared('git-review.v1.config')||{},this.contextProps?.config||{}]);}
 rememberLoadedView(){
  if(this.busy||!this.activeContext||!this.policy?.ready||!this.controller.state.repo)return;
  const selected=shared(this.selectionKey);if(!selected||JSON.stringify(selected)!==this.seenSelection)return;
  const snapshot={version:selected.version,configKey:this.viewConfigKey(),config:this.config,state:this.controller.state,policy:this.policy,historyRef:this.historyRef,historyFull:this.historyFull,upperView:this.upperView,allChangesFrom:this.allChangesFrom,includeWorking:this.includeWorking,manualCommitBase:this.manualCommitBase,diffMode:this.diffMode,readingOptions:this.readingOptions,allFiles:this.allFiles,fileTree:this.fileTree,detailsOpen:this.detailsOpen,filtersOpen:this.filtersOpen,fields:Object.fromEntries(Object.entries(this.inputs).filter(([key])=>!['comment','review','note'].includes(key)).map(([key,input])=>[key,input.value()]))};
  this.viewSnapshots().set(this.selectionKey,JSON.parse(JSON.stringify(snapshot)));
 }
 restoreLoadedView(selected,cx){
  if(!selected||!this.activeContext)return false;const saved=this.viewSnapshots().get(this.selectionKey);
  if(!saved||saved.version!==selected.version||saved.configKey!==this.viewConfigKey()||!allowedRepository(saved.policy,selected.root))return false;
  const snapshot=JSON.parse(JSON.stringify(saved));this.controller.state=snapshot.state;this.policy=snapshot.policy;this.config=snapshot.config;
  for(const key of ['historyRef','historyFull','upperView','allChangesFrom','manualCommitBase','diffMode','fileTree','detailsOpen','filtersOpen'])this[key]=snapshot[key];this.upperView=snapshot.upperView||'changes';this.readingOptions=snapshot.readingOptions||{wrap:false};this.allFiles=Boolean(snapshot.allFiles);if(this.allFiles){this.rebuildAllSections();this.prepareFileHeaders(cx);}this.lastAppliedFrom=this.allChangesFrom||'branch';this.includeWorking=Boolean(selected.includeWorking||selected.scope?.includeWorking);
  this.restoringComposer=true;try{for(const [key,value] of Object.entries(snapshot.fields))this.inputs[key]?.set_value(value);}finally{this.restoringComposer=false;}
  this.seenSelection=JSON.stringify(selected);this.restoreBase();cx.notify();return true;
 }
 refreshContext(cx){this.localConfigPromise=null;scopeCache.clear();this.viewSnapshots().set(this.selectionKey,null);return cx.spawn(async cx=>{try{await this.loadConfig();await this.poll(cx);}catch(error){this.message=error.message;cx.notify();}});}
 publish(){const s=this.controller.state;if(!s.repo||(this.followContext&&!this.activeContext))return;if(this.inputs.find){if(this.allFiles&&this.allFilesKey!==s.comparison?.id)this.rebuildAllSections();const findSource=JSON.stringify([s.comparison?.id,s.file?.id,this.allFiles]);if(this.findSource!==findSource){this.findSource=findSource;this.setFindQuery(this.findQuery||'');}}const selection={root:s.repo.root,machine:s.repo.machine,scope:s.comparison?.scope,comparison:s.comparison,fileId:s.file?.id,allChangesFrom:this.allChangesFrom||'branch',includeWorking:Boolean(this.includeWorking),manualCommitBase:this.manualCommitBase||null,version:uid()};this.seenSelection=JSON.stringify(selection);setShared(this.selectionKey,selection);this.rememberLoadedView();}
 sync(cx){if(this.role==='bar'||this.busy)return;const selected=shared(this.selectionKey);const key=JSON.stringify(selected);if(!selected||key===this.seenSelection)return;this.seenSelection=key;
  if(this.policy?.ready&&!allowedRepository(this.policy,selected.root))return;
  if(this.restoreLoadedView(selected,cx))return;
  this.work(cx,async cx=>{if(this.controller.state.repo?.root!==selected.root){this.resetRepositoryFields();await this.controller.openRepo(selected.machine,selected.root);}this.includeWorking=Boolean(selected.includeWorking||selected.scope?.includeWorking);this.allChangesFrom=selected.allChangesFrom||(selected.scope?.kind==='since-review'?'checkpoint':selected.scope?.kind==='range'&&!selected.scope.includeBase?'commit':'branch');this.manualCommitBase=selected.manualCommitBase||(selected.scope?.kind==='range'&&!selected.scope.includeBase?selected.scope.base:null);this.lastAppliedFrom=this.allChangesFrom;if(selected.comparison&&(selected.comparison.id!==this.controller.state.comparison?.id||JSON.stringify(selected.comparison.scope)!==JSON.stringify(this.controller.state.comparison?.scope)))await this.controller.selectResolved(selected.comparison);else if(!selected.comparison&&selected.scope&&JSON.stringify(selected.scope)!==JSON.stringify(this.controller.state.comparison?.scope))await this.controller.selectScope(selected.scope);if(selected.fileId&&selected.fileId!==this.controller.state.file?.id)await this.controller.selectFile(selected.fileId);this.inputs.folder.set_value(selected.root);this.restoreBase();if(this.controller.setHistoryBase)await this.updateFeatureHistory();});
 }
 deferSync(cx){
  if(this.role==='bar'||this.syncQueued)return;
  const contextChanged=this.followContext&&this.currentContext().key!==this.activeContext?.key;
  const selectionChanged=JSON.stringify(shared(this.selectionKey))!==this.seenSelection;
  const composerChanged=JSON.stringify(shared(this.composerKey||`git-review.v1.composer.${this.sessionId}`)||null)!==this.seenComposer;
  if(!contextChanged&&!selectionChanged&&!composerChanged)return;this.syncQueued=true;
  // Native async work may start synchronously; do not notify or mutate inputs on the render stack.
  cx.timer.after(1,cx=>{this.syncQueued=false;if(this.followContext&&this.currentContext().key!==this.activeContext?.key){this.activateContext(this.currentContext(),cx);return;}this.sync(cx);this.syncComposer(cx);});
 }
 resetRepositoryFields(){this.historyRef='HEAD';this.historyFull=false;this.allChangesFrom='branch';this.lastAppliedFrom='branch';this.manualCommitBase=null;this.rangeAnchor=null;this.rangePicking=false;this.commitAnchor=null;for(const key of ['target','query','author','path','fileQuery','recipientQuery'])this.inputs[key]?.set_value(key==='target'?'HEAD':'');}
 openFolder(folder,cx){if(!this.policy?.canSwitch||!allowedRepository(this.policy,folder)){this.message='Repository selection is limited to the active project directory';cx.notify();return;}this.work(cx,async cx=>{this.resetRepositoryFields();await this.controller.openRepo(this.activeContext?.machine||null,folder);this.inputs.folder.set_value(folder);this.restoreBase();await this.updateFeatureHistory();if(!this.controller.state.empty)await this.controller.selectScope({kind:'commit',commit:'HEAD',parentIndex:0});this.publish();});}
 filters(){return {ref:this.historyRef,exclude:!this.historyFull&&this.historyRef==='HEAD'?this.controller.state.featureBaseOid:null,remotes:this.remotes,query:this.inputs.query.value(),author:this.inputs.author.value(),path:this.inputs.path.value()};}
 selectCommit(oid,cx){
  this.handle.focus();this.selectedStart=null;this.pendingScope=null;
  if(this.rangePicking&&!this.commitAnchor){this.commitAnchor=oid;this.message='Select the last commit of the range';cx.notify();return;}
  const scope=this.rangePicking?rangeSelection(this.controller.state.history,this.commitAnchor,oid):{kind:'commit',commit:oid,parentIndex:0};
  if(!scope)return;this.rangePicking=false;this.commitAnchor=null;this.message='';this.inputs.target.set_value(scope.target||oid);
  this.scopeWork(cx,async(current,cx)=>{await this.controller.selectScope(scope);if(!current())return;this.publish();if(this.detailsOpen)await this.controller.loadDetails();});
 }
 selectFile(id,cx){this.handle.focus();this.selectedStart=null;const controller=this.controller,version=this.fileActionVersion=(this.fileActionVersion||0)+1,current=()=>this.controller===controller&&this.fileActionVersion===version&&controller.state.file?.id===id;this.work(cx,async cx=>{try{await controller.selectFile(id);if(current())this.revealSelectedSection();}catch(error){if(current())throw error;}finally{this.publish();}});}
 moveFile(direction,cx){const s=this.controller.state,i=s.files.findIndex(f=>f.id===s.file?.id);const next=s.files[Math.max(0,Math.min(s.files.length-1,i+direction))];if(next)this.selectFile(next.id,cx);}
 moveCommit(direction,cx){const s=this.controller.state,i=s.history.findIndex(c=>c.oid===s.comparison?.targetOid);const next=s.history[Math.max(0,Math.min(s.history.length-1,i+direction))];if(next)this.selectCommit(next.oid,cx);}
 applyScope(kind,cx){
  this.pendingScope=null;this.selectedStart=null;this.rangeAnchor=null;this.rangePicking=false;this.commitAnchor=null;
  const previousFrom=this.lastAppliedFrom||'branch';
  this.scopeWork(cx,async(current,cx)=>{try{const base=this.inputs.base.value().trim(),target=this.inputs.target.value().trim()||'HEAD';let scope;
   if(kind==='branch'){const current=this.baseChoice();if(this.config.showAdvanced&&base&&base!==current?.ref)this.controller.setBase(base);const chosen=this.restoreBase();if(!chosen){this.pendingScope='branch';this.setReferencePicker(false,true,cx);return;}scope={kind,baseRef:chosen.ref,targetRef:'HEAD'};}
   else if(kind==='range'){this.rangePicking=true;this.commitAnchor=null;this.message='Select the first commit, then the last commit of the range';return;}
   else if(kind==='working-tree')scope={kind,baseRef:'HEAD'};
   else if(kind==='since-review'){const cp=await this.controller.lastCheckpoint();if(!cp)throw new Error('No checkpoint for this worktree and branch: mark a reviewed commit as seen first');scope={kind,checkpointId:cp.id,targetRef:'HEAD',...(cp.kind==='working-snapshot'?{includeWorking:true}:{})};}
   else if(kind==='manual-base'){if(!this.manualCommitBase){this.panel='compareFrom';this.loadCommitBases(cx);return;}scope={kind:'range',base:this.manualCommitBase,target:'HEAD',includeBase:false};}
   else scope={kind:'commit',commit:kind==='commit'?'HEAD':target,parentIndex:0};
   if(this.includeWorking&&scope.kind!=='commit'&&scope.kind!=='working-tree')scope={...scope,includeWorking:true};
   if(!current())return;await this.controller.selectScope(scope);if(!current())return;if(kind==='branch'||kind==='since-review'||kind==='manual-base')this.lastAppliedFrom=this.allChangesFrom||'branch';this.publish();if(this.detailsOpen)await this.controller.loadDetails();
  }catch(error){if(!current())return;if(kind==='branch'){this.pendingScope='branch';this.setReferencePicker(false,true,cx);}else if(kind==='since-review'||kind==='manual-base')this.allChangesFrom=previousFrom;throw error;}});
 }
 selectLine(id,cx,side=null,snapshot=null){let row=snapshot||this.patchRows.find(r=>r.id===id);if(!row)return;if(row.kind==='line'&&row.side==='context'&&side==='old')row={...row,side:'old'};const s=this.controller.state;
  if(row.kind==='comment'){this.editDraft(row.draft,cx);return;}
  const extending=row.kind==='line'&&this.selectedStart&&this.selectedStart.fileId===s.file.id&&this.selectedStart.comparisonId===s.comparison.id&&(this.selectedStart.row.side==='old'?'old':'new')===(row.side==='old'?'old':'new');
  if(this.hasUnsavedComment()&&!extending){this.message='Save or cancel the current comment before opening another';cx.notify();return;}
  try{if(row.kind==='hunk'){const lines=row.hunk.lines.filter(l=>l.newLine!=null);if(!lines.length){this.target=commentTarget(s.comparison,s.file,row.hunk.lines[0],row.hunk.lines.at(-1),row.hunk.lines);}else this.target=commentTarget(s.comparison,s.file,lines[0],lines.at(-1),lines);this.selectedStart=null;}
  else {if(extending){this.target=commentTarget(s.comparison,s.file,this.selectedStart.row,row,this.patchRows.filter(r=>r.kind==='line'));this.selectedStart=null;}else{this.target=commentTarget(s.comparison,s.file,row);this.selectedStart={row,fileId:s.file.id,comparisonId:s.comparison.id};}}
  this.editId=null;this.detachedComposer=false;this.composerComparison=s.comparison;if(!extending)this.inputs.comment.set_value('');this.panel='comment';this.persistComposer();this.inputs.comment.focus();this.notifyEditor(cx,false);}catch(e){this.message=e.message;cx.notify();}}
 fileComment(cx){if(this.hasUnsavedComment()){this.message='Save or cancel the current comment before opening another';cx.notify();return;}const s=this.controller.state;this.target=commentTarget(s.comparison,s.file);this.composerComparison=s.comparison;this.detachedComposer=false;this.editId=null;this.selectedStart=null;this.inputs.comment.set_value('');this.panel='comment';this.persistComposer();this.notifyEditor(cx,true);}
 editDraft(d,cx){if(this.hasUnsavedComment()){if(this.editId===d.id){this.panel='comment';this.inputs.comment.focus();if(!this.composerIsVisible())this.resumeComment(cx);else this.notifyEditor(cx,true);}else{this.message='Save or cancel the current comment before editing another';cx.notify();}return;}this.editId=d.id;this.target=d;this.detachedComposer=false;this.composerComparison=this.controller.state.comparison?.id===d.comparisonId?this.controller.state.comparison:null;this.selectedStart=null;this.inputs.comment.set_value(d.body);this.inputs.comment.focus();this.panel='comment';this.persistComposer();if(!this.composerIsVisible())this.resumeComment(cx);else this.notifyEditor(cx,true);}
 persistComposer(){if(!this.target||this.restoringComposer)return;const key=this.composerKey||`git-review.v1.composer.${this.sessionId}`,value={target:this.target,body:this.inputs.comment.value(),id:this.editId||null,comparison:this.composerComparison||null};this.seenComposer=JSON.stringify(value);if(JSON.stringify(shared(key))!==this.seenComposer)setShared(key,value);}
 syncComposer(cx){const value=shared(this.composerKey||`git-review.v1.composer.${this.sessionId}`)||null;const serialised=JSON.stringify(value);if(this.seenComposer===serialised)return;this.seenComposer=serialised;
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
 fetch(cx){if(this.busy)return;this.panel=null;this.work(cx,async cx=>{await this.controller.fetch();this.publish();this.message='Fetch completed';});}
 full(){this.openReviewTab();}
 terminal(){this.publish();if(this.contextProps?.isReviewTab){const context=this.recipientContext();if(context?.tabId)run('tab.select',{id:context.tabId});return;}if(this.role==='pane'){const pane=panes().find(p=>p.mod==='juhas'&&p.focused);if(pane?.zoomed)run('pane.zoom',{pane:pane.pane});else run('pane.go',{direction:'left'});return;}collapseReview(run);}
 renderBar(){return h_flex().h(34).px(8).gap(6).items_center().bg(theme().chrome).child(button('review-terminal','Terminal',()=>this.terminal())).child(button('review-full','Juhas',()=>this.full())).child(button('review-sidebar','Sidebar',()=>run('layout.toggle',{id:'git-review-sidebar'})));}
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
   this.controller.mutate(s=>({...s,drafts:result.state==='sent'?s.drafts.filter(d=>batch.draftSnapshots?.[d.id]!==JSON.stringify(d)):s.drafts,submittedBatches:s.submittedBatches.map(b=>b.id===batch.id?{...b,state:result.state,error:result.error}:b)}));this.message=result.state==='sent'?'Review delivered; included comments cleared, newer draft edits retained':`${result.state}: ${result.error}`;if(result.state==='sent'){setShared(this.reviewStorageKey(),null);this.panel=null;this.upperView='comments';this.batch=null;}
  }finally{this.sending=false;}});
 }
 setReferencePicker(history,open,cx){const panel=history?'historyRefs':'refs';if(open||this.panel===panel)this.panel=open?panel:null;if(open){this.inputs.refQuery?.set_value('');const token=this.refFocusToken=(this.refFocusToken||0)+1;cx.timer?.after(30,()=>{if(!this.closed&&this.panel===panel&&this.refFocusToken===token)this.inputs.refQuery?.focus();});}cx.notify();}

 referencePicker(history){const content=v_flex().size_full().min_h(0).min_w(0);
   const query=(this.inputs.refQuery?.value()||'').trim().toLowerCase(),refs=this.controller.state.refs.filter(ref=>!query||ref.name.toLowerCase().includes(query)||ref.fullName.toLowerCase().includes(query));
   const choose=(ref,cx)=>{this.panel=null;if(history){this.historyFull=true;this.historyRef=ref;this.work(cx,cx=>this.controller.loadHistory(this.filters()));}else{this.controller.setBase(ref);this.restoreBase();this.pendingScope=null;this.allChangesFrom='branch';this.work(cx,cx=>this.updateFeatureHistory());this.applyScope('branch',cx);}cx.notify();};
   return content.child(section(history?'History · choose a branch':'Compare branch · choose base'))
    .child(field(this.inputs.refQuery,'Find a branch').flex_none().w_full())
    .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar()
     .when(!history&&(this.controller.base()||selectBase(this.controller.state.refs,this.controller.state.branch||'',this.config)),e=>e.child(button('automatic-base','Use automatic base',(_e,cx)=>{this.controller.setBase('');this.inputs.base.set_value('');this.allChangesFrom='branch';this.panel=null;this.work(cx,cx=>this.updateFeatureHistory());this.applyScope('branch',cx);})))
     .when(history,e=>e.child(button('history-head','Current branch',(_e,cx)=>choose('HEAD',cx))).child(button('history-all','All branches',(_e,cx)=>choose('all',cx))))
     .child(virtualList(`${this.id}-refs`,refs.map(ref=>({...ref,id:ref.fullName})),28,ref=>text(ref.name).px(10).h(28).min_w(0).truncate().text_ellipsis_middle().tooltip(ref.fullName),(id,cx)=>choose(id,cx))))
    .child(button('close-refs','Close',(_e,cx)=>{this.panel=null;this.pendingScope=null;cx.notify();}));
 }
 footer(cx){
  const s=this.controller.session(),t=theme();let content=v_flex().flex_none().border_t(1).border_color(t.border);
  if(this.panel==='checkpoints')return content.h(220).min_h(0).child(section('Review baselines')).when(!s.checkpoints.some(cp=>cp.repoKey===this.controller.state.repo?.key),e=>e.child(text('No checkpoints yet. Use Mark seen after reviewing a commit.',true).p(10))).child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().children(s.checkpoints.filter(cp=>cp.repoKey===this.controller.state.repo?.key).slice().reverse().map(cp=>h_flex().gap(6).px(8).py(4).child(button(`use-${cp.id}`,`${cp.kind==='working-snapshot'?'Working snapshot':'Commit'} · ${new Date(cp.markedAt).toLocaleString()}`,(_e,cx)=>this.useCheckpoint(cp,cx))).when(cp.kind==='working-snapshot',e=>e.child(button(`delete-${cp.id}`,'Delete',(_e,cx)=>this.removeWorkingCheckpoint(cp,cx))))))).child(button('close-checkpoints','Close',(_e,cx)=>{this.panel=null;cx.notify();}));
  if(this.panel==='guided'&&this.guided){const stale=this.guided.sourceId!==guidedSourceId(this.controller.state.comparison);return content.h(260).min_h(0).child(section(stale?'Guided reading · source changed':'Guided reading')).child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().p(10).gap(8).children(this.guided.steps.map(step=>v_flex().gap(4).child(text(step.title).font_semibold()).child(text(step.paths.join(', '),true)).child(text(step.body)))).when(Boolean(this.guided.uncovered.length),e=>e.child(text('Not covered',true)).children(this.guided.uncovered.map(item=>text(`${item.path}: ${item.reason}`,true))))).child(button('close-guided','Return to diff',(_e,cx)=>{this.panel=null;cx.notify();}));}
  if(this.target?.scope==='general'&&this.panel==='comment')return content.child(text('General review comment',true).px(12).py(4)).child(this.inlineEditor);
  if(this.detachedComposer&&this.target&&!this.composerIsVisible()&&this.panel==='comment')return content.h(230).min_w(0)
   .child(text(`Original source unavailable here · ${this.target.newPath} · ${(this.target.side==='old'?this.target.baseOid:this.target.targetOid)?.slice(0,12)||'working tree'}`,true).h(38).px(12).py(8).truncate())
   .child(div().min_w(0).child(this.inlineEditor));
  if(this.panel==='copy-code'&&this.copySource===this.diffChangeKey())return content.h(260).min_h(0).min_w(0)
   .child(h_flex().px(10).py(6).gap(6).items_center().child(text(`Loaded fragments · ${this.copyPath}`).flex_1().min_w(0).truncate().text_ellipsis_middle().tooltip(this.copyPath))
    .child(buttonGroup('copy-side',[{value:'old',label:'Original'},{value:'new',label:'Modified'}],this.copySide,(side,cx)=>this.openCodeCopy(side,cx)))
    .child(button('copy-code-all','Copy all',(_e,cx)=>cx.write_to_clipboard(this.copyEditor.value()),{tooltip:'Copy the code shown below, without diff markers'}))
    .child(button('close-copy-code','Close',(_e,cx)=>{this.panel=null;cx.notify();})))
   .child(Editor.new(this.copyEditor).flex_1().min_h(0).min_w(0));
  if(this.panel==='unsaved-submit')return content.p(10).gap(7)
   .child(text('You have an unsaved comment. Include it in this review?').font_semibold())
   .child(h_flex().gap(6).flex_wrap()
    .child(button('save-before-review','Save and continue',(_e,cx)=>this.saveComment(cx,true),{primary:true}))
    .child(button('skip-before-review','Skip for this review',(_e,cx)=>this.preview(cx,{skipUnsaved:true}),{tooltip:'Keep the unsaved text, but omit it from this review'}).disabled(!s.drafts.some(d=>d.repoKey===this.controller.state.repo?.key)))
    .child(button('back-to-comment','Back',(_e,cx)=>{this.panel='comment';this.notifyEditor(cx,true);})))
  if(this.panel==='submit'){
   const recipients=this.recipientOptions(),availableRecipients=this.recipientOptions(false),recipient=terminals().find(t=>(t.address||t.id)===this.batch?.agentAddress),canSend=Boolean(this.batch?.agentAddress&&this.batch?.text?.trim()&&this.batch.utf8Bytes<=MAX_REVIEW_BYTES&&!this.sending);
   return v_flex().flex_1().min_h(0).min_w(0).w_full()
    .child(h_flex().min_h(42).flex_none().px(12).py(6).gap(7).items_center().flex_wrap().border_b(1).border_color(t.border)
     .child(v_flex().flex_1().min_w(200).gap(3).child(text(recipient?`Agent · ${recipient.title||recipient.program?.name||recipient.name||this.batch.agentAddress}`:'Choose an agent').font_semibold().text_size(13).truncate()).child(text(recipient?`${this.recipientSource==='auto'?'Selected automatically':'Selected manually'} · ${this.batch.agentAddress}`:'No feedback will be sent until an agent is selected',true).truncate()))
     .child(popover('change-recipient','Change',this.recipientPicker,(open,cx)=>{this.recipientPicker=open;cx.notify();},()=>v_flex().size_full().min_h(0).child(checkbox('recipient-scope','All live terminals',this.showAllRecipients,(checked,cx)=>{this.showAllRecipients=checked;cx.notify();},{tooltip:'Show all live terminals instead of project agents'})).when(Boolean(this.inputs.recipientQuery),e=>e.child(field(this.inputs.recipientQuery,'Find an agent or directory').flex_none().w_full())).when(!recipients.length,e=>e.child(text(availableRecipients.length?'No recipients match this search.':this.showAllRecipients?'No live terminals available.':'No agents in this project. Enable All live terminals to choose another recipient.',true).p(12))).child(virtualList(`${this.id}-recipients`,recipients.map(t=>({...t,id:t.address})),44,t=>v_flex().px(10).h(44).min_w(0).justify_center().tooltip(`${t.address} · ${t.title||t.program?.name||t.name||'terminal'}\n${t.cwd||''}`).child(text(`${t.address} · ${t.title||String(t.program?.name||t.name||'terminal').split(/[\\/]/).at(-1)}`).truncate()).child(text(t.cwd||'Directory unavailable',true).text_size(11).truncate().text_ellipsis_start()),(id,cx)=>this.buildPreview(id,cx))),{tooltip:'Choose another agent session'}))
     .when(this.batch?.kind!=='guided',e=>e.child(checkbox('include-code','Include code',this.includeQuotes,(checked,cx)=>this.toggleReviewQuotes(cx,checked),{tooltip:'Include full code quotes; minimal context is automatic for ambiguous or outdated locations'}))
     .child(checkbox('include-git-context','Include Git context',this.includeGitContext,(checked,cx)=>this.toggleGitContext(cx,checked),{tooltip:'Include repository path and full comparison headers; compact source IDs are always retained'}))
     .child(checkbox('include-response-guidance','Reply with code context',this.includeResponseGuidance,(checked,cx)=>this.toggleResponseGuidance(cx,checked),{tooltip:'Ask the agent to explain each concern and fix using symbol names or short code excerpts'}))
     .child(button('regenerate-review','Regenerate',(_e,cx)=>{this.generatePreview(this.batch?.agentAddress,cx);this.message='Review regenerated from saved comments';cx.notify();},{tooltip:'Replace the edited text with a fresh review from saved comments'}))))
    .child(div().flex_1().min_h(0).min_w(0).px(10).py(8).child(Textarea.new(this.inputs.review).size_full().px(14).py(12).rounded(8).bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13).line_height('20px')))
    .child(h_flex().h(52).flex_none().w_full().px(12).gap(8).items_center().border_t(1).border_color(t.border)
     .child(button('send-review',this.sending?'Sending…':'Send review',(_e,cx)=>this.send(cx),{primary:true}).disabled(!canSend).when(!canSend,el=>el.opacity(0.5)))
     .child(button('copy-review','Copy',(_e,cx)=>this.copyReview(cx),{tooltip:'Copy exactly the message in the editor'}))
     .child(button('cancel-submit','Cancel',(_e,cx)=>{this.persistReview();this.panel=this.hasUnsavedComment()?'comment':null;this.batch=null;this.notifyEditor(cx);}))
     .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(this.batch?.utf8Bytes>MAX_REVIEW_BYTES?t.ansi1:t.muted).child(`${this.batch?.draftIds.length||0} comments · ${this.batch?.utf8Bytes||0} bytes${this.batch?.edited?' · edited; source comments retained':''}`)));
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
 render(cx){
  if(this.role==='bar')return this.renderBar();this.deferSync(cx);const s=this.controller.state,t=theme();let session;
  try{session=this.controller.session();}catch(e){return text(e.message).p(20);}
  const switching=this.followContext&&this.currentContext().key!==this.activeContext?.key;
  const header=h_flex().id('juhas-heading').h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border).child(div().flex_1().min_w(0).truncate().text_ellipsis_middle().tooltip(s.branch||'Juhas').font_semibold().text_color(t.foreground).child(this.compact?'Juhas':`Juhas${!switching&&s.branch?' · '+s.branch:''}`))
   .when(this.compact&&Boolean(s.historyLoading||s.historyBaseLoading),e=>e.child(historyLoadingIndicator(s)))
   .when(this.role==='sidebar',e=>e
    .child(button('open-right',svg('mods/juhas/icons/split-right.svg').size(16),()=>this.openReviewPane('right'),{tooltip:'Open review beside the agent'}).disabled(!this.activeContext?.folder))
    .child(button('open-down',svg('mods/juhas/icons/split-down.svg').size(16),()=>this.openReviewPane('down'),{tooltip:'Open review below the agent'}).disabled(!this.activeContext?.folder))
    .child(button('open-tab',svg('mods/juhas/icons/new-tab.svg').size(16),()=>this.full(),{tooltip:'Open review in its own tab'}).disabled(!this.activeContext?.folder)));
  const size=(size,cx)=>{if(this.height!==size.height||this.width!==size.width){this.height=size.height;this.width=size.width;this.prepareFileHeaders(cx);cx.notify();}};
  if(switching&&!s.repo)return nativeFrame(this.id,{framed:this.role==='sidebar'}).when(this.role==='sidebar',e=>e.child(header)).child(text('Reading active project…',true).p(14));
  if(this.panel==='submit')return nativeFrame(this.id,{framed:this.role==='sidebar'}).on_size_change(size).when(this.role==='sidebar',e=>e.child(header)).child(h_flex().min_h(42).flex_none().px(14).py(8).items_center().child(text(this.batch?.kind==='guided'?'Guided reading request':`Review · ${this.batch?.draftIds.length||0} ${this.batch?.draftIds.length===1?'comment':'comments'}`).font_semibold().text_size(15))).when(Boolean(this.message),e=>e.child(text(this.message,true).px(14).py(4))).when(Boolean(this.omittedComposer&&this.hasUnsavedComment()),e=>e.child(text('Unsaved comment omitted; its text is retained.',true).px(14).py(4))).child(this.footer(cx));
  const repositoryPicker=popover('context-repos',`${String(s.repo?.root||this.activeContext?.folder||'Repositories').replace(/\\/g,'/').split('/').filter(Boolean).at(-1)} ▾`,this.panel==='repos',(open,cx)=>{this.panel=open?'repos':null;cx.notify();},()=>v_flex().size_full().min_h(0).child(section('Repositories')).child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().children((this.policy?.repos||[]).map(repo=>button(repo.key,text(repo.root).max_w(340).min_w(0).truncate().text_ellipsis_start(),(_e,cx)=>{this.panel=null;this.openFolder(repo.root,cx);},{active:repo.key===s.repo?.key,tooltip:repo.root}).justify_start()))),{tooltip:s.repo?.root||'Choose repository'});
  const mode=s.pendingScope?(s.pendingScope.kind==='commit'?'commit':s.pendingScope.kind==='working-tree'?'uncommitted':'all'):this.reviewMode(),from=this.allChangesFrom||'branch',comparison=s.comparison,advancedRange=comparison?.scope.kind==='range'&&comparison.scope.includeBase;
  const baseLabel=from==='branch'?`Base: ${this.baseChoice()?.ref?.replace(/^refs\/(heads|remotes)\//,'')||'choose branch'} · ${this.baseSource==='auto'?'automatic':this.baseSource||'not selected'}`:from==='commit'?`Base: ${this.manualCommitBase?.slice(0,8)||'choose commit'} · manual`:`Base: ${comparison?.scope.kind==='since-review'?comparison.baseOid?.slice(0,8):'no checkpoint selected'} · checkpoint`;
  const scope=v_flex().px(8).pt(8).pb(6).gap(5)
   .child(h_flex().gap(6).items_center().flex_wrap()
    .child(buttonGroup('scope',[{value:'commit',label:'Commit'},{value:'all',label:'All changes'},{value:'uncommitted',label:'Uncommitted'}],mode,(kind,cx)=>kind==='all'?this.applyAllChanges(cx):this.applyScope(kind==='uncommitted'?'working-tree':'commit',cx)))
    .when(mode==='all',e=>e.child(checkbox('include-working','Include uncommitted',this.includeWorking,(checked,cx)=>{this.includeWorking=checked;this.applyAllChanges(cx);})))
    .when(mode==='all'&&!advancedRange,e=>e.child(h_flex().id('comparison-baseline').flex_none().items_center().gap(2).rounded(6).border_1().border_color(t.border)
     .child(text('From',true).px(6))
     .child(popover('compare-from',`${from==='branch'?'Branch':from==='checkpoint'?'Checkpoint':'Commit'} ▾`,this.panel==='compareFrom',(open,cx)=>{if(open||this.panel==='compareFrom'){this.panel=open?'compareFrom':null;this.choosingCommitBase=false;}cx.notify();},()=>this.compareFromPicker(),{tooltip:'Choose the starting point; the comparison ends at HEAD'}))
     .when(from==='branch',e=>e.child(popover('change-base',h_flex().min_w(0).gap(4).items_center().child(text(this.baseChoice()?.ref?.replace(/^refs\/(heads|remotes)\//,'')||'Choose branch').max_w(160).truncate().text_ellipsis_middle()).child('▾'),this.panel==='refs',(open,cx)=>this.setReferencePicker(false,open,cx),()=>this.referencePicker(false),{tooltip:baseLabel+'; changes start at the common ancestor with HEAD'})))
     .child(text(`→ ${s.branch&&s.branch!=='(detached)'?s.branch:comparison?.targetOid?.slice(0,8)||'HEAD'}`,true).max_w(200).truncate().text_ellipsis_middle().px(6).tooltip(`End of comparison: ${s.branch&&s.branch!=='(detached)'?s.branch+' (HEAD)':'detached HEAD'}${comparison?.targetOid?' · '+comparison.targetOid:''}`))))

    .child(div().flex_1())
    .child(text(comparison?`${comparison.mutableTarget?(mode==='uncommitted'?'Uncommitted':'Committed + uncommitted'):comparison.commitCount!=null?comparison.commitCount+' '+(comparison.commitCount===1?'commit':'commits'):comparison.scope.kind==='commit'?'1 commit':comparison.summaryError?'Count unavailable':'... commits'} \u00b7 ${s.files.length} ${s.files.length===1?'file':'files'}`:'',true).tooltip(comparison?.summaryError||'Commits and changed files in the selected comparison; independent of history filters'))
    .when(Boolean(s.scopeLoading||s.fileStatsLoading||this.busy||s.refreshing),e=>e.child(text(s.patchLoading?'Loading diff…':s.scopeLoading?'Loading changes…':s.fileStatsLoading?'Counting lines…':s.refreshing?'Refreshing…':'Working…',true))).when(Boolean(s.fileStatsError),e=>e.child(text('Line counts unavailable',true).tooltip(s.fileStatsError))).child(button('refresh-review',svg('mods/juhas/icons/refresh.svg').size(16),(_e,cx)=>this.refreshContext(cx),{tooltip:'Refresh review without changing selection'}))
    .child(popover('review-more',svg('mods/juhas/icons/more.svg').size(14),this.panel==='reviewMore',(open,cx)=>{if(open||this.panel==='reviewMore')this.panel=open?'reviewMore':null;cx.notify();},()=>v_flex().size_full()

     .when(Boolean(comparison?.mutableTarget),e=>e.child(button('save-snapshot','Save working snapshot',(_e,cx)=>{this.panel=null;this.saveWorkingCheckpoint(cx);})))
     .child(button('fetch-review','Fetch remotes',(_e,cx)=>this.fetch(cx)))

     .child(button('reset-viewed','Reset viewed files',(_e,cx)=>this.resetReviewed(cx)))
     .child(button('request-walkthrough','Request guided reading…',(_e,cx)=>this.requestGuided(cx)))
     .child(button('load-walkthrough','Load guided reading',(_e,cx)=>this.loadGuided(cx)))
     .when(Boolean(this.config.showAdvanced),e=>e.child(button('advanced-range','Inclusive commit range…',(_e,cx)=>{this.panel=null;this.applyScope('range',cx);}))),{tooltip:'More review options'}))
    .child(button('submit-preview','Submit review',(_e,cx)=>this.preview(cx),{primary:true}).disabled((!session.drafts.some(d=>d.repoKey===s.repo?.key)&&!this.hasUnsavedComment()))))
   .when(this.panel==='refs'&&(mode!=='all'||from!=='branch'),e=>e.child(popover('configure-base','Choose base branch',true,(open,cx)=>this.setReferencePicker(false,open,cx),()=>this.referencePicker(false))))
   .when(this.panel==='historyRefs',e=>e.child(popover('browse-refs','Browse history',true,(open,cx)=>this.setReferencePicker(true,open,cx),()=>this.referencePicker(true))));
  const notices=this.reviewNotices();
  const root=nativeFrame(this.id,{framed:this.role==='sidebar'}).on_size_change(size).track_focus(this.handle).on_key_down((e,cx)=>this.key(e,cx)).when(this.role==='sidebar',e=>e.child(header)).when(Boolean(s.repo),e=>e.child(scope))
   .when(!this.compact&&this.filtersOpen&&this.upperView!=='comments',e=>e.child(h_flex().px(8).pb(8).gap(5).child(field(this.inputs.query,'Text or hash')).child(field(this.inputs.author,'Author')).child(field(this.inputs.path,'Path')).child(button('apply-filters','Search',(_e,cx)=>this.work(cx,cx=>this.controller.loadHistory(this.filters()))))))
   .when(this.hasUnsavedComment()&&!this.composerIsVisible(),e=>e.child(h_flex().px(10).py(4).gap(6).items_center().child(text('Unsaved comment · '+this.target.newPath,true).flex_1().min_w(0).truncate().text_ellipsis_middle().tooltip(this.target.newPath)).child(button('resume-comment','Resume',(_e,cx)=>this.resumeComment(cx)))))
   .when(Boolean(this.message&&!this.compactMessage()),e=>e.child(text(this.message).px(10).py(6).bg(t.raised)))
   .when(Boolean(s.refreshError),e=>e.child(text(`Refresh failed · ${s.refreshError} · previous view retained`,true).px(10).py(4)))
   ;
  const workspace=v_flex().flex_1().min_h(0).min_w(0);
  if(!s.repo)workspace.child(text(this.busy?'Reading repositories in the active directory…':'No Git repositories found in the active directory.').p(14));
  else if(s.empty&&!s.comparison?.mutableTarget)workspace.child(text('This repository has no commits yet; choose Uncommitted.').p(16));
  else {
   workspace.child(h_flex().min_h(34).flex_none().px(8).pb(6).gap(6).flex_wrap().items_center().border_b(1).border_color(t.border)
     .child(buttonGroup('workspace-layout',[{value:'stacked',label:svg('mods/juhas/icons/layout-stacked.svg').size(15),tooltip:'History and files above the diff'},{value:'sidebar',label:svg('mods/juhas/icons/layout-sidebar.svg').size(15),tooltip:'History and files on the left of the diff'}],this.workspaceLayout||'stacked',(value,cx)=>{this.workspaceLayout=value;cx.notify();}))
     .child(buttonGroup('review-navigation',[{value:'changes',label:'Changes'},{value:'comments',label:`Comments · ${session.drafts.filter(d=>d.repoKey===s.repo?.key).length}`}],this.upperView||'changes',(value,cx)=>this.setUpperView(value,cx)))
     .when(Boolean(this.policy?.canSwitch),e=>e.child(repositoryPicker))
    .child(button('mark-seen',`Mark seen${comparison?.targetOid?' · '+comparison.targetOid.slice(0,12):''}`,(_e,cx)=>{this.panel=null;this.work(cx,async cx=>{const cp=await this.controller.markSeen();this.message=`Checkpoint saved at ${cp.targetOid.slice(0,8)}; comments retained`;});},{tooltip:'Save a checkpoint at the displayed committed target'}).disabled(Boolean(this.busy)||!comparison?.targetOid||Boolean(comparison?.mutableTarget)))
    .child(button('review-baselines',`Checkpoints${(session.checkpoints||[]).filter(cp=>cp.repoKey===s.repo?.key).length?' · '+(session.checkpoints||[]).filter(cp=>cp.repoKey===s.repo?.key).length:''}`,(_e,cx)=>{this.panel=this.panel==='checkpoints'?null:'checkpoints';cx.notify();},{active:this.panel==='checkpoints',tooltip:'Choose or manage a saved review baseline'}))
     .child(div().flex_1())
     .when(Boolean(notices.length),e=>e.child(popover('review-status',`${notices[0].title.length>28?notices[0].title.slice(0,27)+'…':notices[0].title}${notices.length>1?' · +'+(notices.length-1):''}`,this.panel==='reviewStatus',(open,cx)=>{if(open||this.panel==='reviewStatus')this.panel=open?'reviewStatus':null;cx.notify();},()=>v_flex().size_full().min_h(0).overflow_y_scrollbar().p(10).gap(8).children(notices.map(n=>text(n.detail))),{tooltip:notices.map(n=>n.detail).join('\n')})))
     .when(Boolean(s.branchChanged),e=>e.child(button('adopt-branch','Review current branch',(_e,cx)=>this.reviewCurrentBranch(cx),{tooltip:`Checkout changed to ${s.branchChanged?.current}; original review retained until you choose to switch` })))
     .when(Boolean(s.newHead),e=>e.child(button('review-latest','Newer version',(_e,cx)=>this.reviewLatest(cx),{tooltip:`Open latest HEAD ${s.newHead}; the selected source stays pinned until you choose to switch`}))));
   const upper=v_flex().size_full().min_h(0).min_w(0);
   if(this.upperView==='comments')upper.child(draftsPane(this,cx));
   else if(this.workspaceLayout==='sidebar')upper.child(v_resizable(`${this.id}-sidebar-history-files`).size_full()
    .child(resizable_panel().size(200).size_range(100).child(historyPane(this,cx)))
    .child(resizable_panel().size_range(100).child(filesPane(this))));
   else upper.child(this.compact?filesPane(this):h_resizable(`${this.id}-history-files-${(this.width||0)>=900?'wide':'narrow'}`).size_full()
    .child(resizable_panel().size(Math.min(480,Math.max(180,(this.width||520)*0.5))).size_range(180).child(historyPane(this,cx)))
    .child(resizable_panel().size_range(160).child(filesPane(this))));
   workspace.child(this.workspaceLayout==='sidebar'?h_resizable(`${this.id}-files-sidebar`).size_full().min_w(0)
    .child(resizable_panel().size(340).size_range(200).child(upper))
    .child(resizable_panel().size_range(240).child(diffPane(this))):v_resizable(`${this.id}-lists-diff`).flex_1().min_h(0).w_full()
    .child(resizable_panel().size(this.compact?170:230).size_range(100).child(upper))
    .child(resizable_panel().size_range(100).child(diffPane(this))));
  }
  root.child(workspace);const foot=this.footer(cx);if(foot)root.child(foot);return root;
 }
}
