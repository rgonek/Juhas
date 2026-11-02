import {View,div,svg} from 'gpui-kit';
import {h_flex,v_flex,InputState,TextareaState,Textarea,Editor,EditorState,h_resizable,v_resizable,resizable_panel,VirtualListScrollHandle} from 'gpui-base';
import {exec,shared,setShared,props,focused,spaces,panes,terminals,theme,run,appHome,nextCommand,readTextFile,agents} from 'herdr';
import {Controller} from './controller.js';
import {createRunner,uid} from './git.js';
import {createCache} from './cache.js';
import {readDirectories} from './platform.js';
import {resolveConfig,suggestBases,selectBase,readLocalConfig} from './config.js';
import {commentTarget,annotatePatch,composerRows} from './comments.js';
import InlineEditor from './inline-editor.js';
import {buildBatch,createSubmitter,updateBatch,detectRecipient,agentRecipients,isLiveTerminal,MAX_REVIEW_BYTES} from './submit.js';
import {button,field,text,section,historyPane,filesPane,diffPane,nativeFrame,virtualList,checkbox,toggle,buttonGroup,popover} from './ui.js';
import {expandReview,collapseReview} from './presentation.js';
import {rangeSelection,changeGroups,stepChange,splitRows,patchCode} from './review-ui.js';
import {reviewContext,resolveRepositoryScope,allowedRepository,contextStorageKey} from './context.js';
import {listHistory} from './history.js';

// Module-local cache is shared by views; durable drafts are kept by Herdr shared state.
const cache=createCache();
const submit=createSubmitter();
const store={get:shared,set:setShared};
const scopeCache=new Map();
export default class Juhas extends View {
 init(p,cx){
  p=props()||p||{};
  this.id=`review-${uid()}`;this.role=p?.role||'full';this.compact=this.role==='sidebar';this.sessionId=p?.sessionId||focused()?.space||'default';
  this.selectionKey=`git-review.v1.selection.${this.sessionId}`;this.seenSelection=null;this.busy=false;this.message='';this.panel=null;this.target=null;this.selectedStart=null;this.filtersOpen=false;
  this.config=resolveConfig(shared('git-review.v1.config')||{},p.config||{});this.historyRef='HEAD';
  this.diffMode='unified';this.fileTree=false;this.detailsOpen=false;this.remotes=true;this.historyWidth=480;this.listHeight=230;this.contextProps=p;this.followContext=true;this.contextViews=new Map();this.runningActions=0;this.policy={repos:[],canSwitch:false,kind:'empty'};
  this.controller=new Controller({run:createRunner(exec),store,sessionId:this.sessionId,cache});this.handle=cx.focus_handle();this.diffScroll=VirtualListScrollHandle.new();
  const placeholders={folder:'Repository or parent folder',base:'Base ref / SHA',target:'Target ref / SHA',query:'Text or hash',baseQuery:'Find a base commit',author:'Author',path:'Path',comment:'Write feedback…',note:'Optional review note',review:'Edit the message that will be copied or sent…'};
  this.inputs={};for(const key of Object.keys(placeholders))this.inputs[key]=(key==='comment'||key==='review'?TextareaState:InputState).new({value:key==='target'?'HEAD':'',placeholder:placeholders[key]});
  for(const input of Object.values(this.inputs)){input.on('focus',()=>{this.inputFocused=true;});input.on('blur',()=>{this.inputFocused=false;});}
  this.inputs.review.on('change',(_e,cx)=>this.changeReview(cx));
  this.inputs.comment.on('change',(_e,cx)=>{this.persistComposer();this.notifyEditor(cx);});
  this.inlineEditor=cx.new(InlineEditor,{owner:this,input:this.inputs.comment,save:()=>this.saveComment(cx),cancel:()=>this.cancelComment(cx)});
  this.inputs.folder.on('submit',(_e,cx)=>this.openFolder(this.inputs.folder.value(),cx));
  if(this.role!=='bar')this.activateContext(this.currentContext(),cx);
  cx.spawn(async cx=>{for(;;){const command=await nextCommand();const name=typeof command==='string'?command:command.name;if(name==='preview')this.preview(cx);if(name==='branch'){this.allChangesFrom='branch';this.applyScope('branch',cx);}if(name==='branches'){this.panel=this.panel==='historyRefs'?null:'historyRefs';cx.notify();}if(name==='details'){this.detailsOpen=!this.detailsOpen;if(this.detailsOpen)this.work(cx,()=>this.controller.loadDetails());cx.notify();}if(name==='diff-mode')this.setDiffMode(this.diffMode==='split'?'unified':'split',cx);if(name==='next-change')this.navigateChange(1,cx);if(name==='previous-change')this.navigateChange(-1,cx);if(name==='tree'){this.fileTree=!this.fileTree;cx.notify();}if(name==='whole-file')this.work(cx,()=>this.controller.expandFile());if(name==='comments'){this.panel=this.panel==='drafts'?null:'drafts';cx.notify();}if(name==='refresh')this.refreshContext(cx);if(name==='full')this.full();if(name==='terminal')this.terminal();if(name==='next-file')this.moveFile(1,cx);if(name==='previous-file')this.moveFile(-1,cx);if(name==='next-commit')this.moveCommit(1,cx);if(name==='previous-commit')this.moveCommit(-1,cx);}});
 }
 close(){this.diffScroll?.release();this.copyEditor?.release();this.inlineEditor?.release();}
 hasUnsavedComment(){if(!this.target)return false;const body=this.inputs.comment?.value()||'',saved=this.editId?this.controller.session().drafts.find(d=>d.id===this.editId):null;return saved?body!==saved.body:Boolean(body.trim());}
 composerIsVisible(){const s=this.controller.state,target=this.target;if(!target||target.comparisonId!==s.comparison?.id||target.newPath!==s.file?.newPath)return false;if(target.side==null)return true;const field=target.side==='old'?'oldLine':'newLine';return Boolean((s.patch?.hunks||[]).some(h=>h.lines.some(line=>line[field]===target.endLine)));}
 notifyEditor(cx,reveal=false){if(this.inlineEditor)cx.notify(this.inlineEditor);if(reveal&&this.target?.comparisonId===this.controller.state.comparison?.id&&this.target?.newPath===this.controller.state.file?.newPath){const s=this.controller.state,annotated=composerRows(annotatePatch(s.patch,this.controller.session().drafts,s.comparison.id,s.file.newPath),this.target,this.editId),rows=this.diffMode==='split'?splitRows(annotated):annotated,index=rows.findIndex(r=>r.kind==='editor');if(index>=0)this.diffScroll?.scroll_to_item(index,'bottom');}cx.notify();}
 cancelComment(cx){this.target=null;this.selectedStart=null;this.editId=null;this.composerComparison=null;this.detachedComposer=false;this.panel=null;this.inputs.comment.set_value('');setShared(this.composerKey||`git-review.v1.composer.${this.sessionId}`,null);this.notifyEditor(cx);}
 resumeComment(cx){const target=this.target;if(!target)return;this.panel='comment';this.detachedComposer=false;this.work(cx,async()=>{try{
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
  this.work(cx,async()=>{
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
 async workAsync(cx,action){this.runningActions=(this.runningActions||0)+1;this.busy=true;this.message='';this.notifyEditor(cx);try{await action();}catch(e){this.message=e.message;}finally{this.runningActions--;this.busy=this.runningActions>0;this.notifyEditor(cx);}}
 work(cx,action){cx.spawn(async cx=>this.workAsync(cx,action));}
 currentContext(){return reviewContext(this.contextProps||{},focused(),spaces(),panes());}
 activateContext(context,cx){
  if(this.busy)return;
  const refreshing=this.refreshingContextKey===context.key;this.refreshingContextKey=null;
  if(this.activeContext){this.persistComposer();this.persistReview();this.contextViews.set(this.activeContext.key,{controller:this.controller,policy:this.policy,historyRef:this.historyRef,historyFull:this.historyFull,allChangesFrom:this.allChangesFrom,manualCommitBase:this.manualCommitBase,fields:Object.fromEntries(Object.entries(this.inputs).map(([key,state])=>[key,state.value()]))});}
  this.activeContext=context;this.sessionId=this.contextProps.sessionId||context.spaceId||context.key;
  this.selectionKey=contextStorageKey('selection',this.sessionId,context);this.composerKey=contextStorageKey('composer',this.sessionId,context);this.reviewKey=contextStorageKey('review',this.sessionId,context);
  this.seenSelection=null;this.seenComposer=undefined;this.panel=null;this.target=null;this.selectedStart=null;this.editId=null;this.batch=null;this.message='';this.rangeAnchor=null;this.rangePicking=false;this.commitAnchor=null;this.filtersOpen=false;
  const saved=this.contextViews.get(context.key);this.controller=saved?.controller||new Controller({run:createRunner(exec),store,sessionId:this.sessionId,cache});this.policy=saved?.policy||{repos:[],canSwitch:false,kind:'empty'};this.historyRef=saved?.historyRef||'HEAD';this.historyFull=Boolean(saved?.historyFull);this.allChangesFrom=saved?.allChangesFrom||'branch';this.manualCommitBase=saved?.manualCommitBase||null;this.lastAppliedFrom=this.allChangesFrom;this.choosingCommitBase=false;
  this.restoringComposer=true;for(const [key,input] of Object.entries(this.inputs))input.set_value(saved?.fields?.[key]||(key==='folder'?context.folder||'':key==='target'?'HEAD':''));this.restoringComposer=false;
  if(saved?.policy?.ready){this.restoreBase();cx.notify();return;}
  const controller=this.controller;
  this.work(cx,async()=>{
   await this.loadConfig();
   const scopeKey=JSON.stringify([context.machine,context.folder,this.config.maxDepth,this.config.maxRepos]);
   if(!scopeCache.has(scopeKey)){const pending=resolveRepositoryScope(controller.run,(machine,path)=>readDirectories(exec,appHome(),machine,path),context,{maxDepth:this.config.maxDepth,maxRepos:this.config.maxRepos});scopeCache.set(scopeKey,pending);pending.catch(()=>scopeCache.delete(scopeKey));if(scopeCache.size>32)scopeCache.delete(scopeCache.keys().next().value);}
   const policy=await scopeCache.get(scopeKey);if(this.activeContext?.key!==context.key)return;this.policy={...policy,ready:true};
   const selection=shared(this.selectionKey)||shared(`git-review.v1.selection.${this.sessionId}`);
   const repo=allowedRepository(policy,selection?.root)||policy.repos[0];if(!repo)return;
   await controller.openRepo(context.machine,repo.root);if(this.activeContext?.key!==context.key)return;
   this.inputs.folder.set_value(repo.root);this.restoreBase();
   this.allChangesFrom=selection?.allChangesFrom||(selection?.scope?.kind==='since-review'?'checkpoint':selection?.scope?.kind==='range'&&!selection.scope.includeBase?'commit':'branch');this.manualCommitBase=selection?.manualCommitBase||(selection?.scope?.kind==='range'&&!selection.scope.includeBase?selection.scope.base:null);this.lastAppliedFrom=this.allChangesFrom;
   await this.updateFeatureHistory();
   if(allowedRepository(policy,selection?.root)&&selection?.scope){if(selection.comparison&&!refreshing)await controller.selectResolved(selection.comparison);else await controller.selectScope(selection.scope);if(selection.fileId)await controller.selectFile(selection.fileId);}
   else if(!controller.state.empty)await controller.selectScope({kind:'commit',commit:'HEAD',parentIndex:0});
   const oldComposer=shared(`git-review.v1.composer.${this.sessionId}`);if(shared(this.composerKey)==null&&oldComposer?.target?.repoKey===repo.key)setShared(this.composerKey,oldComposer);
   this.publish();
  });
 }
 async loadConfig(){
  this.localConfigPromise??=readLocalConfig(readTextFile,appHome()+'/juhas.json',appHome()+'/git-review.json').catch(error=>{this.localConfigPromise=null;throw error;});
  const local=await this.localConfigPromise;this.config=resolveConfig(local,shared('git-review.v1.config')||{},this.contextProps.config||{});
 }
 baseChoice(){const s=this.controller.state;return selectBase(s.refs,s.branch||'',this.config,this.controller.base());}
 restoreBase(){const choice=this.baseChoice();this.inputs.base.set_value(choice?.ref||'');this.baseSource=choice?.source||null;return choice;}
 async updateFeatureHistory(){if(!this.controller.setHistoryBase)return;await this.controller.setHistoryBase(this.baseChoice()?.ref);await this.controller.loadHistory(this.filters());}
 reviewMode(){return this.controller.state.comparison?.scope.kind==='commit'?'commit':'all';}
 setHistoryView(mode,cx){this.historyFull=mode!=='feature';this.historyRef=mode==='all'?'all':'HEAD';this.panel=null;this.work(cx,()=>this.controller.loadHistory(this.filters()));}
 applyAllChanges(cx){this.pendingScope=null;this.applyScope(this.allChangesFrom==='checkpoint'?'since-review':this.allChangesFrom==='commit'?'manual-base':'branch',cx);}
 chooseCompareFrom(value,cx){this.allChangesFrom=value;this.panel=null;if(value==='commit'&&!this.manualCommitBase){this.panel='compareFrom';this.loadCommitBases(cx);return;}this.applyAllChanges(cx);}
 loadCommitBases(cx,more=false){const controller=this.controller,query=this.inputs.baseQuery.value();this.work(cx,async()=>{const result=await listHistory(controller.run,controller.state.repo,{ref:more?this.baseCandidatesRef||'HEAD':'HEAD',query,skip:more?this.baseCandidates?.length||0:0});if(this.controller!==controller)return;this.baseCandidates=more?[...(this.baseCandidates||[]),...result.commits]:result.commits;this.baseCandidatesMore=result.hasMore;this.baseCandidatesRef=result.ref;});}
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
 refreshContext(cx){this.localConfigPromise=null;scopeCache.clear();this.refreshingContextKey=this.activeContext?.key;if(this.activeContext)this.contextViews.delete(this.activeContext.key);this.activeContext=null;cx.notify();}
 publish(){const s=this.controller.state;if(!s.repo||(this.followContext&&!this.activeContext))return;const selection={root:s.repo.root,machine:s.repo.machine,scope:s.comparison?.scope,comparison:s.comparison,fileId:s.file?.id,allChangesFrom:this.allChangesFrom||'branch',manualCommitBase:this.manualCommitBase||null,version:uid()};this.seenSelection=JSON.stringify(selection);setShared(this.selectionKey,selection);}
 sync(cx){if(this.role==='bar'||this.busy)return;const selected=shared(this.selectionKey);const key=JSON.stringify(selected);if(!selected||key===this.seenSelection)return;this.seenSelection=key;
  if(this.policy?.ready&&!allowedRepository(this.policy,selected.root))return;
  this.work(cx,async()=>{if(this.controller.state.repo?.root!==selected.root){this.resetRepositoryFields();await this.controller.openRepo(selected.machine,selected.root);}this.allChangesFrom=selected.allChangesFrom||(selected.scope?.kind==='since-review'?'checkpoint':selected.scope?.kind==='range'&&!selected.scope.includeBase?'commit':'branch');this.manualCommitBase=selected.manualCommitBase||(selected.scope?.kind==='range'&&!selected.scope.includeBase?selected.scope.base:null);this.lastAppliedFrom=this.allChangesFrom;if(selected.comparison&&(selected.comparison.id!==this.controller.state.comparison?.id||JSON.stringify(selected.comparison.scope)!==JSON.stringify(this.controller.state.comparison?.scope)))await this.controller.selectResolved(selected.comparison);else if(!selected.comparison&&selected.scope&&JSON.stringify(selected.scope)!==JSON.stringify(this.controller.state.comparison?.scope))await this.controller.selectScope(selected.scope);if(selected.fileId&&selected.fileId!==this.controller.state.file?.id)await this.controller.selectFile(selected.fileId);this.inputs.folder.set_value(selected.root);this.restoreBase();if(this.controller.setHistoryBase)await this.updateFeatureHistory();});
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
 resetRepositoryFields(){this.historyRef='HEAD';this.historyFull=false;this.allChangesFrom='branch';this.lastAppliedFrom='branch';this.manualCommitBase=null;this.rangeAnchor=null;this.rangePicking=false;this.commitAnchor=null;for(const key of ['target','query','author','path'])this.inputs[key]?.set_value(key==='target'?'HEAD':'');}
 openFolder(folder,cx){if(!this.policy?.canSwitch||!allowedRepository(this.policy,folder)){this.message='Repository selection is limited to the active project directory';cx.notify();return;}this.work(cx,async()=>{this.resetRepositoryFields();await this.controller.openRepo(this.activeContext?.machine||null,folder);this.inputs.folder.set_value(folder);this.restoreBase();await this.updateFeatureHistory();if(!this.controller.state.empty)await this.controller.selectScope({kind:'commit',commit:'HEAD',parentIndex:0});this.publish();});}
 filters(){return {ref:this.historyRef,exclude:!this.historyFull&&this.historyRef==='HEAD'?this.controller.state.featureBaseOid:null,remotes:this.remotes,query:this.inputs.query.value(),author:this.inputs.author.value(),path:this.inputs.path.value()};}
 selectCommit(oid,cx){
  this.handle.focus();this.selectedStart=null;this.pendingScope=null;
  if(this.rangePicking&&!this.commitAnchor){this.commitAnchor=oid;this.message='Select the last commit of the range';cx.notify();return;}
  const scope=this.rangePicking?rangeSelection(this.controller.state.history,this.commitAnchor,oid):{kind:'commit',commit:oid,parentIndex:0};
  if(!scope)return;this.rangePicking=false;this.commitAnchor=null;this.message='';this.inputs.target.set_value(scope.target||oid);
  this.work(cx,async()=>{await this.controller.selectScope(scope);this.publish();if(this.detailsOpen)await this.controller.loadDetails();});
 }
 selectFile(id,cx){this.handle.focus();this.selectedStart=null;this.work(cx,async()=>{try{await this.controller.selectFile(id);}finally{this.publish();}});}
 moveFile(direction,cx){const s=this.controller.state,i=s.files.findIndex(f=>f.id===s.file?.id);const next=s.files[Math.max(0,Math.min(s.files.length-1,i+direction))];if(next)this.selectFile(next.id,cx);}
 moveCommit(direction,cx){const s=this.controller.state,i=s.history.findIndex(c=>c.oid===s.comparison?.targetOid);const next=s.history[Math.max(0,Math.min(s.history.length-1,i+direction))];if(next)this.selectCommit(next.oid,cx);}
 applyScope(kind,cx){
  this.pendingScope=null;this.selectedStart=null;this.rangeAnchor=null;this.rangePicking=false;this.commitAnchor=null;
  const previousFrom=this.lastAppliedFrom||'branch';
  this.work(cx,async()=>{try{const base=this.inputs.base.value().trim(),target=this.inputs.target.value().trim()||'HEAD';let scope;
   if(kind==='branch'){const current=this.baseChoice();if(this.config.showAdvanced&&base&&base!==current?.ref)this.controller.setBase(base);const chosen=this.restoreBase();if(!chosen){this.pendingScope='branch';this.panel='refs';return;}scope={kind,baseRef:chosen.ref,targetRef:'HEAD'};}
   else if(kind==='range'){this.rangePicking=true;this.commitAnchor=null;this.message='Select the first commit, then the last commit of the range';return;}
   else if(kind==='working-tree')scope={kind,baseRef:'HEAD'};
   else if(kind==='since-review'){const cp=await this.controller.lastCheckpoint();if(!cp)throw new Error('No checkpoint for this worktree and branch: mark a reviewed commit as seen first');scope={kind,checkpointId:cp.id,targetRef:'HEAD'};}
   else if(kind==='manual-base'){if(!this.manualCommitBase){this.panel='compareFrom';this.loadCommitBases(cx);return;}scope={kind:'range',base:this.manualCommitBase,target:'HEAD',includeBase:false};}
   else scope={kind:'commit',commit:kind==='commit'?'HEAD':target,parentIndex:0};
   await this.controller.selectScope(scope);if(kind==='branch'||kind==='since-review'||kind==='manual-base')this.lastAppliedFrom=this.allChangesFrom||'branch';this.publish();if(this.detailsOpen)await this.controller.loadDetails();
  }catch(error){if(kind==='branch'){this.pendingScope='branch';this.panel='refs';}else if(kind==='since-review'||kind==='manual-base')this.allChangesFrom=previousFrom;throw error;}});
 }
 selectLine(id,cx,side=null,snapshot=null){let row=snapshot||this.patchRows.find(r=>r.id===id);if(!row)return;if(row.kind==='line'&&row.side==='context'&&side==='old')row={...row,side:'old'};const s=this.controller.state;
  if(row.kind==='comment'){this.editDraft(row.draft,cx);return;}
  const extending=row.kind==='line'&&this.selectedStart&&this.selectedStart.fileId===s.file.id&&this.selectedStart.comparisonId===s.comparison.id&&(this.selectedStart.row.side==='old'?'old':'new')===(row.side==='old'?'old':'new');
  if(this.hasUnsavedComment()&&!extending){this.message='Save or cancel the current comment before opening another';cx.notify();return;}
  try{if(row.kind==='hunk'){const lines=row.hunk.lines.filter(l=>l.newLine!=null);if(!lines.length){this.target=commentTarget(s.comparison,s.file,row.hunk.lines[0],row.hunk.lines.at(-1),row.hunk.lines);}else this.target=commentTarget(s.comparison,s.file,lines[0],lines.at(-1),lines);this.selectedStart=null;}
  else {if(extending){this.target=commentTarget(s.comparison,s.file,this.selectedStart.row,row,this.patchRows.filter(r=>r.kind==='line'));this.selectedStart=null;}else{this.target=commentTarget(s.comparison,s.file,row);this.selectedStart={row,fileId:s.file.id,comparisonId:s.comparison.id};}}
  this.editId=null;this.detachedComposer=false;this.composerComparison=s.comparison;if(!extending)this.inputs.comment.set_value('');this.panel='comment';this.persistComposer();this.inputs.comment.focus();this.notifyEditor(cx,true);}catch(e){this.message=e.message;cx.notify();}}
 fileComment(cx){if(this.hasUnsavedComment()){this.message='Save or cancel the current comment before opening another';cx.notify();return;}const s=this.controller.state;this.target=commentTarget(s.comparison,s.file);this.composerComparison=s.comparison;this.detachedComposer=false;this.editId=null;this.selectedStart=null;this.inputs.comment.set_value('');this.panel='comment';this.persistComposer();this.notifyEditor(cx,true);}
 editDraft(d,cx){if(this.hasUnsavedComment()){if(this.editId===d.id){this.panel='comment';this.inputs.comment.focus();if(!this.composerIsVisible())this.resumeComment(cx);else this.notifyEditor(cx,true);}else{this.message='Save or cancel the current comment before editing another';cx.notify();}return;}this.editId=d.id;this.target=d;this.detachedComposer=false;this.composerComparison=this.controller.state.comparison?.id===d.comparisonId?this.controller.state.comparison:null;this.selectedStart=null;this.inputs.comment.set_value(d.body);this.inputs.comment.focus();this.panel='comment';this.persistComposer();if(!this.composerIsVisible())this.resumeComment(cx);else this.notifyEditor(cx,true);}
 persistComposer(){if(!this.target||this.restoringComposer)return;const key=this.composerKey||`git-review.v1.composer.${this.sessionId}`,value={target:this.target,body:this.inputs.comment.value(),id:this.editId||null,comparison:this.composerComparison||null};this.seenComposer=JSON.stringify(value);if(JSON.stringify(shared(key))!==this.seenComposer)setShared(key,value);}
 syncComposer(cx){const value=shared(this.composerKey||`git-review.v1.composer.${this.sessionId}`)||null;const serialised=JSON.stringify(value);if(this.seenComposer===serialised)return;this.seenComposer=serialised;
  cx.spawn(async cx=>{this.restoringComposer=true;try{if(value?.target){this.target=value.target;this.composerComparison=value.comparison||null;this.editId=value.id;this.inputs.comment.set_value(value.body||'');if(this.panel!=='submit'&&this.panel!=='unsaved-submit')this.panel='comment';}else{if(this.panel==='comment')this.panel=null;this.target=null;this.composerComparison=null;this.editId=null;this.selectedStart=null;this.inputs.comment.set_value('');}}finally{this.restoringComposer=false;this.notifyEditor(cx);}});
 }
 saveComment(cx,thenPreview=false){const target=this.target,body=this.inputs.comment.value(),editId=this.editId,id=editId||uid();this.work(cx,async()=>{
  if(!target)throw new Error('Choose a code line or file');const existing=editId?this.controller.session().drafts.find(d=>d.id===editId):null;
  if(existing?.status==='outdated'&&target.status==='outdated')this.controller.updateCommentBody(target,body,id);
  else{try{await this.controller.validateComment(target);}finally{this.publish();}this.controller.addComment(target,body,id);await this.controller.reconcileComments(this.controller.state.comparison);}
  if(this.target===target&&this.inputs.comment.value()===body&&this.editId===editId)this.cancelComment(cx);
  else {if(this.target===target&&this.editId===editId)this.editId=id;this.persistComposer();this.message='Comment saved; newer unsaved edits retained';this.notifyEditor(cx);}
  if(thenPreview)this.preview(cx);
 });}
 fetch(cx){if(this.busy)return;this.work(cx,async()=>{await this.controller.fetch();this.publish();this.message='Fetch completed';});}
 full(){expandReview(run);}
 terminal(){collapseReview(run);}
 renderBar(){return h_flex().h(34).px(8).gap(6).items_center().bg(theme().chrome).child(button('review-terminal','Terminal',()=>this.terminal())).child(button('review-full','Juhas',()=>this.full())).child(button('review-sidebar','Sidebar',()=>run('layout.toggle',{id:'git-review-sidebar'})));}
 reviewStorageKey(){return this.reviewKey||`git-review.v1.review.${this.sessionId}`;}
 persistReview(){if(!this.batch)return;setShared(this.reviewStorageKey(),{repoKey:this.controller.state.repo?.key,batch:this.batch,includeQuotes:Boolean(this.includeQuotes),includeGitContext:Boolean(this.includeGitContext),recipientSource:this.recipientSource});}
 showBatch(batch){this.batch=batch;this.restoringReview=true;try{this.inputs.review.set_value(batch.text);}finally{this.restoringReview=false;}this.persistReview();}
 generatePreview(address,cx){const comparison=this.controller.state.comparison;this.showBatch({...buildBatch(this.controller.session(),comparison?[comparison]:[],{agentAddress:address||null,note:this.inputs.note.value(),repoKey:this.controller.state.repo?.key,includeQuotes:Boolean(this.includeQuotes),includeGitContext:Boolean(this.includeGitContext)}),contextKey:this.currentContext().key});cx.notify();}
 preview(cx,{skipUnsaved=false}={}){try{
  if(this.followContext&&this.activeContext?.key!==this.currentContext().key)throw new Error('Project context changed; reopen its review before choosing an agent');
  if(this.hasUnsavedComment()&&!skipUnsaved){this.persistComposer();this.panel='unsaved-submit';cx.notify();return;}this.omittedComposer=Boolean(this.hasUnsavedComment()&&skipUnsaved);
  const repo=this.controller.state.repo,session=this.controller.session();if(!repo||!session.drafts.some(d=>d.repoKey===repo.key))throw new Error('No saved comments in the current repository');
  const stored=shared(this.reviewStorageKey()),saved=stored?.repoKey===repo.key?stored:null,automatic=detectRecipient(terminals(),agents(),this.currentContext());
  const savedAddress=saved?.batch?.agentAddress,recipient=savedAddress&&terminals().some(t=>(t.address||t.id)===savedAddress&&isLiveTerminal(t))?savedAddress:automatic?.address||null;
  this.includeQuotes=Boolean(saved?.includeQuotes);this.includeGitContext=Boolean(saved?.includeGitContext);this.recipientSource=recipient===savedAddress?saved.recipientSource||'manual':recipient?'auto':null;this.recipientPicker=!recipient;this.showAllRecipients=false;this.panel='submit';
  if(saved?.batch?.edited)this.showBatch(updateBatch(saved.batch,{agentAddress:recipient}));else this.generatePreview(recipient,cx);
  this.message='';cx.notify();
 }catch(error){this.message=error.message;cx.notify();}}
 buildPreview(address,cx){try{this.recipientSource='manual';this.recipientPicker=false;if(this.batch)this.showBatch(updateBatch(this.batch,{agentAddress:address}));else this.generatePreview(address,cx);this.message='Recipient selected; message edits retained';cx.notify();}catch(error){this.message=error.message;cx.notify();}}
 changeReview(cx){if(this.restoringReview||!this.batch)return;this.batch=updateBatch(this.batch,{text:this.inputs.review.value()});this.persistReview();cx.notify();}
 copyReview(cx){if(!this.batch?.text?.trim())return;cx.write_to_clipboard(this.batch.text);this.message='Review copied';cx.notify();}
 toggleReviewQuotes(cx,checked=!this.includeQuotes){this.includeQuotes=checked;if(this.batch?.edited){this.persistReview();this.message='Edits retained. Regenerate applies the code-quote option.';}else this.generatePreview(this.batch?.agentAddress,cx);cx.notify();}
 toggleGitContext(cx,checked=!this.includeGitContext){this.includeGitContext=checked;if(this.batch?.edited){this.persistReview();this.message='Edits retained. Regenerate applies the Git-context option.';}else this.generatePreview(this.batch?.agentAddress,cx);cx.notify();}
 recipientOptions(){const live=terminals().filter(isLiveTerminal);if(this.showAllRecipients)return live.map(t=>({...t,address:t.address||t.id}));return agentRecipients(live,agents()).filter(a=>a.space===this.currentContext().spaceId);}
 send(cx){if(!this.batch||this.sending)return;const batch=this.batch;if(!batch.agentAddress||!batch.text.trim()||batch.utf8Bytes>MAX_REVIEW_BYTES){this.message='Choose a recipient and a nonempty message within the transport limit';cx.notify?.();return;}if(batch.contextKey&&this.currentContext().key!==batch.contextKey){this.message='Project context changed; reopen its review before sending';cx.notify?.();return;}this.sending=true;
  this.work(cx,async()=>{try{const saved=this.controller.session().submittedBatches.find(b=>b.id===batch.id);if(saved&&saved.state!=='failed'){this.message=`Delivery is ${saved.state}; inspect recipient before attempting another delivery`;return;}
   if(!terminals().some(t=>(t.address||t.id)===batch.agentAddress&&isLiveTerminal(t)))throw new Error('Recipient is no longer available; draft retained');
   this.controller.mutate(s=>({...s,submittedBatches:[...s.submittedBatches.filter(b=>b.id!==batch.id),{id:batch.id,state:'unknown',text:batch.text,agentAddress:batch.agentAddress,createdAt:Date.now()}]}));
   const result=await submit(batch,{send:async(address,message)=>{const r=await exec('hc',['send',address,message,'--json']);if(r.code!==0)throw new Error(r.stderr||r.stdout||'Delivery not confirmed');return {ok:true};}});
   this.controller.mutate(s=>({...s,drafts:result.state==='sent'&&!batch.edited?s.drafts.filter(d=>batch.draftSnapshots?.[d.id]!==JSON.stringify(d)):s.drafts,submittedBatches:s.submittedBatches.map(b=>b.id===batch.id?{...b,state:result.state,error:result.error}:b)}));this.message=result.state==='sent'?(batch.edited?'Review delivered; source comments retained because the message was edited':'Review delivered to terminal; newer draft edits have been retained'):`${result.state}: ${result.error}`;if(result.state==='sent'){setShared(this.reviewStorageKey(),null);this.panel='drafts';this.batch=null;}
  }finally{this.sending=false;}});
 }
 setReferencePicker(history,open,cx){const panel=history?'historyRefs':'refs';if(open||this.panel===panel)this.panel=open?panel:null;cx.notify();}
 referencePicker(history){const content=v_flex().size_full().min_h(0).min_w(0);
   const refs=this.controller.state.refs;
   const choose=(ref,cx)=>{this.panel=null;if(history){this.historyFull=true;this.historyRef=ref;this.work(cx,()=>this.controller.loadHistory(this.filters()));}else{this.controller.setBase(ref);this.restoreBase();this.pendingScope=null;this.allChangesFrom='branch';this.work(cx,()=>this.updateFeatureHistory());this.applyScope('branch',cx);}cx.notify();};
   return content.child(section(history?'History · choose a branch':'Compare branch · choose base'))
    .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar()
     .when(!history&&(this.controller.base()||selectBase(refs,this.controller.state.branch||'',this.config)),e=>e.child(button('automatic-base','Use automatic base',(_e,cx)=>{this.controller.setBase('');this.inputs.base.set_value('');this.allChangesFrom='branch';this.panel=null;this.work(cx,()=>this.updateFeatureHistory());this.applyScope('branch',cx);})))
     .when(history,e=>e.child(button('history-head','Current branch',(_e,cx)=>choose('HEAD',cx))).child(button('history-all','All branches',(_e,cx)=>choose('all',cx))))
     .child(virtualList(`${this.id}-refs`,refs.map(ref=>({...ref,id:ref.fullName})),28,ref=>text(ref.name).px(10).h(28),(id,cx)=>choose(id,cx))))
    .child(button('close-refs','Close',(_e,cx)=>{this.panel=null;this.pendingScope=null;cx.notify();}));
 }
 footer(cx){
  const s=this.controller.session(),t=theme();let content=v_flex().flex_none().border_t(1).border_color(t.border);
  if(this.detachedComposer&&this.target&&!this.composerIsVisible()&&this.panel==='comment')return content.h(230).min_w(0)
   .child(text(`Original source unavailable here · ${this.target.newPath} · ${(this.target.side==='old'?this.target.baseOid:this.target.targetOid)?.slice(0,12)||'working tree'}`,true).h(38).px(12).py(8).truncate())
   .child(div().min_w(0).child(this.inlineEditor));
  if(this.panel==='copy-code'&&this.copySource===this.diffChangeKey())return content.h(260).min_h(0).min_w(0)
   .child(h_flex().px(10).py(6).gap(6).items_center().child(text(`Loaded fragments · ${this.copyPath}`).flex_1().min_w(0).truncate())
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
  if(this.panel==='repos')return content.h(190).child(section('Repositories')).child(v_flex().flex_1().overflow_y_scrollbar().children((this.discovered||[]).map(repo=>button(repo.key,repo.root,(_e,cx)=>{this.panel=null;this.openFolder(repo.root,cx);}))).child(button('close-repos','Close',(_e,cx)=>{this.panel=null;cx.notify();})));
  if(this.panel==='drafts')return content.h(Math.min(260,80+s.drafts.length*45)).child(h_flex().items_center().child(section(`Saved comments · ${s.drafts.length}`).flex_1()).child(button('clear-comments','Clear all',(_e,cx)=>{this.controller.mutate(session=>({...session,drafts:[]}));cx.notify();},{tooltip:'Delete all saved comments in this review session'}))).child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().children(s.drafts.map(d=>h_flex().gap(6).px(8).py(4).items_center().child(div().flex_1().min_w(0).text_size(12).text_color(d.status==='outdated'?t.ansi3:t.foreground).child(`${d.status==='outdated'?'[OUTDATED] ':''}${d.newPath} ${d.startLine??''}: ${d.body}`)).child(button(`edit-${d.id}`,'Edit',(_e,cx)=>{this.editDraft(d,cx);})).child(button(`delete-${d.id}`,'Delete',(_e,cx)=>{this.controller.removeComment(d.id);cx.notify();})))));
  if(this.panel==='submit'){
   const recipient=terminals().find(t=>(t.address||t.id)===this.batch?.agentAddress),canSend=Boolean(this.batch?.agentAddress&&this.batch?.text?.trim()&&this.batch.utf8Bytes<=MAX_REVIEW_BYTES&&!this.sending);
   return v_flex().flex_1().min_h(0).min_w(0).w_full()
    .child(h_flex().min_h(42).flex_none().px(12).py(6).gap(7).items_center().flex_wrap().border_b(1).border_color(t.border)
     .child(v_flex().flex_1().min_w(200).gap(3).child(text(recipient?`Agent · ${recipient.title||recipient.program?.name||recipient.name||this.batch.agentAddress}`:'Choose an agent').font_semibold().text_size(13).truncate()).child(text(recipient?`${this.recipientSource==='auto'?'Selected automatically':'Selected manually'} · ${this.batch.agentAddress}`:'No feedback will be sent until an agent is selected',true).truncate()))
     .child(popover('change-recipient','Change',this.recipientPicker,(open,cx)=>{this.recipientPicker=open;cx.notify();},()=>v_flex().size_full().min_h(0).child(checkbox('recipient-scope','All live terminals',this.showAllRecipients,(checked,cx)=>{this.showAllRecipients=checked;cx.notify();},{tooltip:'Show all live terminals instead of project agents'})).child(virtualList(`${this.id}-recipients`,this.recipientOptions().map(t=>({...t,id:t.address})),28,t=>text(`${t.address} · ${t.title||t.program?.name||t.name||'terminal'}`).px(10).h(28),(id,cx)=>this.buildPreview(id,cx))),{tooltip:'Choose another agent session'}))
     .child(checkbox('include-code','Include code',this.includeQuotes,(checked,cx)=>this.toggleReviewQuotes(cx,checked),{tooltip:'Include full code quotes; minimal context is automatic for ambiguous or outdated locations'}))
     .child(checkbox('include-git-context','Include Git context',this.includeGitContext,(checked,cx)=>this.toggleGitContext(cx,checked),{tooltip:'Include repository path and full comparison headers; compact source IDs are always retained'}))
     .child(button('regenerate-review','Regenerate',(_e,cx)=>{this.generatePreview(this.batch?.agentAddress,cx);this.message='Review regenerated from saved comments';cx.notify();},{tooltip:'Replace the edited text with a fresh review from saved comments'})))
    .child(div().flex_1().min_h(0).min_w(0).px(10).py(8).child(Textarea.new(this.inputs.review).size_full().px(14).py(12).rounded(8).bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13).line_height('20px')))
    .child(h_flex().h(52).flex_none().w_full().px(12).gap(8).items_center().border_t(1).border_color(t.border)
     .child(button('send-review',this.sending?'Sending…':'Send review',(_e,cx)=>this.send(cx),{primary:true}).disabled(!canSend).when(!canSend,el=>el.opacity(0.5)))
     .child(button('copy-review','Copy',(_e,cx)=>this.copyReview(cx),{tooltip:'Copy exactly the message in the editor'}))
     .child(button('cancel-submit','Cancel',(_e,cx)=>{this.persistReview();this.panel=this.hasUnsavedComment()?'comment':null;this.batch=null;this.notifyEditor(cx);}))
     .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(this.batch?.utf8Bytes>MAX_REVIEW_BYTES?t.ansi1:t.muted).child(`${this.batch?.draftIds.length||0} comments · ${this.batch?.utf8Bytes||0} bytes${this.batch?.edited?' · edited; source comments retained':''}`)));
  }

  return null;
 }
 key(e,cx){if(this.inputFocused||this.panel==='comment'||this.panel==='submit')return;const key=e.key?.toLowerCase();const s=this.controller.state;
  if(key==='escape'){this.terminal();cx.stop_propagation();}
  if(key==='j'||key==='k'){this.moveFile(key==='j'?1:-1,cx);cx.stop_propagation();}
  if(key==='['||key===']'){this.moveCommit(key===']'?1:-1,cx);cx.stop_propagation();}
  if(key==='c'&&s.file){this.fileComment(cx);cx.stop_propagation();}
 }
 render(cx){
  if(this.role==='bar')return this.renderBar();this.deferSync(cx);const s=this.controller.state,t=theme();let session;
  try{session=this.controller.session();}catch(e){return text(e.message).p(20);}
  const switching=this.followContext&&this.currentContext().key!==this.activeContext?.key;
  const header=h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border).child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(this.compact?'Juhas':`Juhas${!switching&&s.branch?' · '+s.branch:''}`))
   .child(button('fetch-review',svg('mods/juhas/icons/fetch.svg').size(16),(_e,cx)=>this.fetch(cx),{tooltip:'Fetch all remotes'})).child(button('refresh-review',svg('mods/juhas/icons/refresh.svg').size(16),(_e,cx)=>this.refreshContext(cx),{tooltip:'Refresh review'}))
   .child(button('open-full',svg(`mods/juhas/icons/${this.compact?'expand':'collapse'}.svg`).size(16),()=>this.compact?this.full():this.terminal(),{tooltip:this.compact?'Expand review':'Return to sidebar'}));
  const size=(size,cx)=>{if(this.height!==size.height||this.width!==size.width){this.height=size.height;this.width=size.width;cx.notify();}};
  if(switching)return nativeFrame(this.id).child(header).child(text('Reading active project…',true).p(14));
  if(this.panel==='submit')return nativeFrame(this.id).on_size_change(size).child(header).child(h_flex().min_h(42).flex_none().px(14).py(8).items_center().child(text(`Review · ${this.batch?.draftIds.length||0} comments`).font_semibold().text_size(15))).when(Boolean(this.message),e=>e.child(text(this.message,true).px(14).py(4))).when(Boolean(this.omittedComposer&&this.hasUnsavedComment()),e=>e.child(text('Unsaved comment omitted; its text is retained.',true).px(14).py(4))).child(this.footer(cx));
  const location=h_flex().px(14).py(8).gap(8).items_center().child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(s.repo?.root||this.activeContext?.folder||'No active directory'))
   .when(Boolean(this.policy?.canSwitch),e=>e.child(button('context-repos','Repositories',(_e,cx)=>{this.discovered=this.policy.repos;this.panel='repos';cx.notify();})));
  const mode=this.reviewMode(),from=this.allChangesFrom||'branch',comparison=s.comparison,advancedRange=comparison?.scope.kind==='range'&&comparison.scope.includeBase;
  const baseLabel=from==='branch'?`Base: ${this.baseChoice()?.ref?.replace(/^refs\/(heads|remotes)\//,'')||'choose branch'} · ${this.baseSource==='auto'?'automatic':this.baseSource||'not selected'}`:from==='commit'?`Base: ${this.manualCommitBase?.slice(0,8)||'choose commit'} · manual`:`Base: ${comparison?.scope.kind==='since-review'?comparison.baseOid?.slice(0,8):'no checkpoint selected'} · checkpoint`;
  const scope=v_flex().px(8).pt(8).pb(8).gap(5)
   .child(h_flex().gap(6).items_center().flex_wrap()
    .child(buttonGroup('scope',[{value:'commit',label:'Commit'},{value:'all',label:'All changes'}],mode,(kind,cx)=>kind==='all'?this.applyAllChanges(cx):this.applyScope('commit',cx)))
    .when(mode==='all'&&!comparison?.mutableTarget&&!advancedRange,e=>e.child(popover('compare-from',`Compare from: ${from==='branch'?'Base branch':from==='checkpoint'?'Last review checkpoint':'Choose commit'} ▾`,this.panel==='compareFrom',(open,cx)=>{if(open||this.panel==='compareFrom'){this.panel=open?'compareFrom':null;this.choosingCommitBase=false;}cx.notify();},()=>this.compareFromPicker(),{tooltip:'Choose the baseline for the final diff against HEAD'})))
    .child(div().flex_1())
    .child(popover('review-more',svg('mods/juhas/icons/more.svg').size(14),this.panel==='reviewMore',(open,cx)=>{if(open||this.panel==='reviewMore')this.panel=open?'reviewMore':null;cx.notify();},()=>v_flex().size_full()
     .child(section('Advanced comparisons'))
     .child(button('advanced-working-tree','Uncommitted',(_e,cx)=>{this.panel=null;this.applyScope('working-tree',cx);}))
     .child(button('advanced-range','Inclusive commit range…',(_e,cx)=>{this.panel=null;this.applyScope('range',cx);}))
     .child(button('advanced-base','Choose base branch…',(_e,cx)=>{this.panel='refs';cx.notify();})),{tooltip:'More review options'})))
   .when(mode==='all'&&!comparison?.mutableTarget&&!advancedRange,e=>e.child(h_flex().gap(6).items_center().child(text(baseLabel,true).truncate())
    .when(from==='branch',e=>e.child(popover('change-base','Change…',this.panel==='refs',(open,cx)=>this.setReferencePicker(false,open,cx),()=>this.referencePicker(false),{tooltip:'Choose a base branch or return to automatic selection'})))))
   .when(Boolean(advancedRange),e=>e.child(text('Advanced inclusive commit range',true)))
   .when(Boolean(comparison?.mutableTarget),e=>e.child(text('Uncommitted changes',true)))
   .when(this.panel==='refs'&&(mode!=='all'||from!=='branch'),e=>e.child(popover('configure-base','Choose base branch',true,(open,cx)=>this.setReferencePicker(false,open,cx),()=>this.referencePicker(false))))
   .when(this.panel==='historyRefs',e=>e.child(popover('browse-refs','Browse history',true,(open,cx)=>this.setReferencePicker(true,open,cx),()=>this.referencePicker(true))));
  const actions=h_flex().px(8).pb(8).gap(5).flex_wrap().child(toggle('drafts',`Comments · ${session.drafts.filter(d=>d.repoKey===s.repo?.key).length}`,this.panel==='drafts',(pressed,cx)=>{this.panel=pressed?'drafts':null;cx.notify();}))
   .child(button('submit-preview','Submit review',(_e,cx)=>this.preview(cx),{primary:true}).disabled((!session.drafts.some(d=>d.repoKey===s.repo?.key)&&!this.hasUnsavedComment())).when((!session.drafts.some(d=>d.repoKey===s.repo?.key)&&!this.hasUnsavedComment()),e=>e.opacity(0.5)))
   .child(button('mark-seen',`Mark seen${comparison?.targetOid?' · '+comparison.targetOid.slice(0,12):''}`,(_e,cx)=>this.work(cx,async()=>{const cp=await this.controller.markSeen();this.message=`Checkpoint saved at ${cp.targetOid.slice(0,8)}; comments retained`;}),{tooltip:comparison?.targetOid?`Mark exactly ${comparison.targetOid} as reviewed; saves a checkpoint without sending feedback`:'Checkpoint requires a committed target'}).disabled(!comparison?.targetOid||Boolean(comparison?.mutableTarget)))
   .when(Boolean(comparison?.scope.kind==='commit'&&comparison?.parents.length>1),e=>e.child(button('merge-parent',`Parent ${(comparison.scope.parentIndex||0)+1}`,(_e,cx)=>{this.work(cx,async()=>{await this.controller.selectScope({...comparison.scope,parentIndex:((comparison.scope.parentIndex||0)+1)%comparison.parents.length});this.publish();});})));
  const root=nativeFrame(this.id).on_size_change(size).track_focus(this.handle).on_key_down((e,cx)=>this.key(e,cx)).child(header).when(Boolean(this.config.showAdvanced),e=>e.child(location)).when(Boolean(s.repo),e=>e.child(scope).child(actions))
   .when(!this.compact&&this.filtersOpen,e=>e.child(h_flex().px(8).pb(8).gap(5).child(field(this.inputs.query,'Text or hash')).child(field(this.inputs.author,'Author')).child(field(this.inputs.path,'Path')).child(button('apply-filters','Search',(_e,cx)=>this.work(cx,()=>this.controller.loadHistory(this.filters()))))))
   .when(this.hasUnsavedComment()&&!this.composerIsVisible(),e=>e.child(h_flex().px(10).py(4).gap(6).items_center().child(text('Unsaved comment · '+this.target.newPath,true).flex_1().min_w(0).truncate()).child(button('resume-comment','Resume',(_e,cx)=>this.resumeComment(cx)))))
   .when(Boolean(this.message),e=>e.child(text(this.message).px(10).py(6).bg(t.raised)))
   ;
  if(!s.repo)root.child(text(this.busy?'Reading repositories in the active directory…':'No Git repositories found in the active directory.').p(14));
  else if(s.empty)root.child(text('This repository has no commits yet.').p(16));
  else {
   const lists=this.compact?filesPane(this):h_resizable(`${this.id}-history-files`).size_full()
    .child(resizable_panel().size(480).size_range(180).child(historyPane(this,cx)))
    .child(resizable_panel().size_range(160).child(filesPane(this)));
   root.child(v_resizable(`${this.id}-lists-diff`).flex_1().min_h(0).w_full()
    .child(resizable_panel().size(this.compact?170:230).size_range(80).child(lists))
    .child(resizable_panel().size_range(100).child(diffPane(this))));
  }
  const foot=this.footer(cx);if(foot)root.child(foot);return root;
 }
}
