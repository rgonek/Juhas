import {resolveAutomaticBase} from './automatic-base.js';
import {resolveRepo} from './repositories.js';
import {git,uid,oid,isAncestor,withGitBudget} from './git.js';
import {listHistory,listRefs} from './history.js';
import {resolveComparison,fromHistory,resolveBase} from './comparisons.js';
import {listChangedFiles,listChangedFileMetadata,loadChangedFileStats,loadPatch} from './diff.js';
import {createCache,createRequestGate} from './cache.js';
import {loadSession,mutateSession} from './storage.js';
import {addDraft,markSeen,lastCheckpoint} from './review.js';
import {observeWorking} from './working-observation.js';
function patchKey(c,file,full=false){return JSON.stringify([c.repoKey,c.baseTree,c.mutableTarget?file.contentIdentity||c.targetTree:c.targetTree,file.id,'patch',full]);}
export class Controller {
 constructor({run,store,sessionId='default',cache=createCache(),onChange=()=>{}}){this.run=run;this.store=store;this.sessionId=sessionId;this.cache=cache;this.onChange=onChange;this.gate=createRequestGate();this.patchGate=createRequestGate();this.historyGate=createRequestGate();this.baseGate=createRequestGate();this.refreshGate=createRequestGate();this.state={repo:null,branch:null,history:[],refs:[],files:[],file:null,patch:null,comparison:null,error:null,hasMore:false,historyLoading:false,historyLoadingMore:false,fileStatsLoading:false,fileStatsError:null};}
 session(){return loadSession(this.store,this.sessionId);}
 mutate(fn){return mutateSession(this.store,this.sessionId,fn);}
 async openRepo(machine,folder,{repo:providedRepo,loadHistory=true}={}){
  this.automaticVersion=(this.automaticVersion||0)+1;this.automaticRequest=null;this.refreshGate.begin('repo');
  const token=this.gate.begin('repo');this.patchGate.begin('repo');this.historyGate.begin('repo');this.baseGate.begin('repo');this.state.historyLoading=false;this.state.historyLoadingMore=false;this.state.fileStatsLoading=false;this.state.fileStatsError=null;
  const repo=providedRepo||await resolveRepo(this.run,machine,folder);if(!this.gate.isCurrent(token))return;if(!repo)throw new Error('Folder is not inside a Git repository; use Discover to find nested repositories');
  const [refs,branch]=await Promise.all([listRefs(this.run,repo),this.run(repo,['symbolic-ref','--short','-q','HEAD'])]);if(!this.gate.isCurrent(token))return;
  this.state={...this.state,repo,automaticChoice:null,branch:branch.stdout.trim()||'(detached)',refs,files:[],file:null,patch:null,comparison:null,error:null,history:[],hasMore:false,featureBaseOid:null,historyBaseError:null,historyBaseLoading:false,branchChanged:null,sourceUnavailable:false,sourceStale:false,newHead:null,missingFile:null,refreshError:null};
  const head=await this.run(repo,['rev-parse','--verify','HEAD']);if(!this.gate.isCurrent(token))return;if(head.code!==0){this.state.empty=true;this.state.observedHead=null;return;}
  this.state.empty=false;this.state.observedHead=head.stdout.trim();if(loadHistory)await this.loadHistory({},false,head.stdout.trim());
 }
 async loadHistory(filters={},more=false,resolvedHead=null){
  this.refreshGate.begin('history');const repo=this.state.repo;if(!repo)return;const filtersKey=JSON.stringify(filters);const skip=more?this.state.history.length:0;
  const token=this.historyGate.begin(JSON.stringify([repo.key,filters,skip]));const ref=more?this.state.historyRef:filters.ref||'HEAD',exclude=more?this.state.historyExclude:filters.exclude;this.state.historyLoading=true;this.state.historyLoadingMore=more;this.onChange();
  try{const result=await listHistory(this.run,repo,{...filters,ref,exclude,skip,resolvedHead});if(!this.historyGate.isCurrent(token)||repo.key!==this.state.repo?.key)return;
   this.state.history=more?[...this.state.history,...result.commits]:result.commits;this.state.historyRef=result.ref;this.state.historyExclude=result.exclude;this.state.hasMore=result.hasMore;this.state.filtersKey=filtersKey;
  }finally{if(this.historyGate.isCurrent(token)&&repo.key===this.state.repo?.key){this.state.historyLoading=false;this.state.historyLoadingMore=false;this.onChange();}}
 }
 async setHistoryBase(baseRef){
  this.refreshGate.begin('base');  const repo=this.state.repo;if(!repo)return false;const token=this.baseGate.begin(baseRef);this.historyGate.begin('base');this.state.historyLoading=false;this.state.historyLoadingMore=false;this.state.historyBaseLoading=true;this.onChange();let base=null,error=null;
  if(baseRef)try{base=await resolveBase(this.run,repo,baseRef);}catch(e){error=e.message;}
  if(!this.baseGate.isCurrent(token)||this.state.repo?.key!==repo.key)return false;
  this.state.featureBaseOid=base;this.state.historyBaseRef=baseRef||null;this.state.historyBaseError=error;this.state.historyBaseLoading=false;this.onChange();return true;
 }
 async summarizeComparison(comparison,run=this.run){
  const targetOid=comparison.targetOid||comparison.committedTargetOid;if(!targetOid)return {...comparison,commitCount:null};
  if(comparison.scope.kind==='commit')return {...comparison,commitCount:1};
  const key=JSON.stringify([comparison.repoKey,comparison.baseOid,targetOid,'commit-count']);let count=this.cache.get(key);
  try{if(count==null){const raw=(await git(run,comparison.repo,['rev-list','--count',targetOid,...(comparison.baseOid?['^'+comparison.baseOid]:[]),'--'])).trim();count=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(count))throw new Error('Invalid Git commit count');this.cache.set(key,count);}}
  catch(error){return {...comparison,commitCount:null,summaryError:error.message};}
  return {...comparison,commitCount:count,summaryError:null};
 }
 async reconcileComments(comparison,{validatedWorking=null,headOid=null,run=this.run}={}){
  const repo=this.state.repo;if(!repo)return;
  const drafts=this.session().drafts.filter(d=>d.repoKey===repo.key);if(!drafts.length)return;
  const head=drafts.some(d=>d.targetOid)?headOid||await oid(run,repo,'HEAD'):null,valid=new Map(),statuses=new Map();
  const source=d=>JSON.stringify([d.comparisonId,d.targetOid,d.baseOid]);
  for(const draft of drafts){const key=source(draft);if(!valid.has(key)){
   let current=false;
   if(draft.targetOid){const cacheKey=JSON.stringify([repo.key,head,draft.targetOid,draft.baseOid,'draft-valid']),cached=this.cache.get(cacheKey);if(cached!=null)current=cached.valid;else{if(/^[a-f0-9]{40,64}$/.test(draft.targetOid)){current=await isAncestor(run,repo,draft.targetOid,head);if(current&&draft.baseOid)await oid(run,repo,draft.baseOid);}this.cache.set(cacheKey,{valid:current});}}
   else if(draft.mutableTarget&&draft.baseTree){const observed=validatedWorking===comparison&&comparison.baseTree===draft.baseTree?comparison.observation:await observeWorking(run,repo,draft.baseTree);current=observed?.id===draft.targetTree;}
   else if(draft.mutableTarget&&draft.baseOid){const mutable=validatedWorking===comparison&&comparison.mutableTarget&&draft.baseOid===comparison.baseOid?comparison:await resolveComparison(run,repo,{kind:'working-tree',baseRef:draft.baseOid});current=mutable.id===draft.comparisonId;}
   else current=draft.comparisonId===comparison.id;
   valid.set(key,current);
  }statuses.set(draft.id,{key,status:valid.get(key)?'current':'outdated'});}
  if(this.state.repo?.key!==repo.key||this.state.comparison?.id!==comparison.id)return;
  this.mutate(s=>({...s,drafts:s.drafts.map(d=>{const result=statuses.get(d.id);return d.repoKey===repo.key&&result?.key===source(d)?{...d,status:result.status}:d;})}));
 }
 async selectScope(scope,{preservePath=true}={}){
  const repo=this.state.repo;if(!repo)return;const token=this.gate.begin('scope'),patchToken=this.patchGate.begin('scope'),run=withGitBudget(this.run);
  this.state.scopeLoading=true;this.state.pendingScope=scope;this.state.fileStatsLoading=false;this.state.fileStatsError=null;this.onChange();
  try{
  this.refreshGate.begin('scope');const previousPath=preservePath?this.state.file?.newPath:null;
  const scopeKey=JSON.stringify([repo.key,scope]);const immutable=scope.kind==='commit'&&/^[a-f0-9]{40,64}$/.test(scope.commit)||scope.kind==='range'&&!scope.includeWorking&&/^[a-f0-9]{40,64}$/.test(scope.base)&&/^[a-f0-9]{40,64}$/.test(scope.target);
  let loaded=immutable?this.cache.get(scopeKey):null;
  if(!loaded){const comparison=fromHistory(repo,scope,this.state.history)||await resolveComparison(run,repo,scope,this.session().checkpoints),splitMetadata=!comparison.mutableTarget&&scope.kind!=='commit';const filesKey=JSON.stringify([repo.key,comparison.baseTree,comparison.targetTree,splitMetadata?'files:raw':'files']);let files=this.cache.get(filesKey);if(!files){files=splitMetadata?await listChangedFileMetadata(run,comparison):await listChangedFiles(run,comparison);if(!comparison.mutableTarget)this.cache.set(filesKey,files);}loaded={comparison,files,splitMetadata};if(immutable)this.cache.set(scopeKey,loaded);}
  if(!this.gate.isCurrent(token))return;
  const retained=previousPath?loaded.files.find(f=>f.newPath===previousPath):null;
  this.state={...this.state,comparison:loaded.comparison,details:null,files:loaded.files,file:retained?{...retained}:null,patch:null,patchLoading:!!retained,fileStatsLoading:!!loaded.splitMetadata,fileStatsError:null,error:null,sourceUnavailable:false,sourceStale:false,missingFile:previousPath&&!retained?previousPath:null,newHead:null};this.onChange();
  if(loaded.splitMetadata){const filesKey=JSON.stringify([repo.key,loaded.comparison.baseTree,loaded.comparison.targetTree,'files']),statsKey=filesKey+':numstat',current=()=>this.gate.isCurrent(token)&&this.state.comparison?.id===loaded.comparison.id;void (async()=>{try{let stats=this.cache.get(statsKey);if(!stats){stats=await loadChangedFileStats(run,loaded.comparison,loaded.files);this.cache.set(statsKey,stats);}if(!current())return;this.state.files=stats;if(this.state.file){const counts=stats.find(f=>f.id===this.state.file.id);if(counts)this.state.file={...this.state.file,additions:counts.additions,deletions:counts.deletions,binary:counts.binary};}this.state.fileStatsError=null;}catch(error){if(!current())return;this.state.fileStatsError=error.message;}finally{if(current()){this.state.fileStatsLoading=false;this.onChange();}}})();}
  const summary=await this.summarizeComparison(loaded.comparison,run);if(!this.gate.isCurrent(token))return;
  this.state.comparison=summary;this.onChange();
  const patch=retained?await this.readFilePatch(retained,summary,{run}):null;
  if(!this.gate.isCurrent(token))return;
  if(this.patchGate.isCurrent(patchToken)){this.state.patch=patch;this.state.patchLoading=false;this.onChange();}
  await this.reconcileComments(summary,{run});
  }finally{if(this.gate.isCurrent(token)){this.state.scopeLoading=false;this.state.pendingScope=null;this.state.patchLoading=false;this.onChange();}}
 }

 async selectFile(id){
  const c=this.state.comparison;const file=this.state.files.find(f=>f.id===id);if(!c||!file)return;if(!c.mutableTarget&&this.state.file?.id===id&&this.state.patch)return;this.refreshGate.begin('file');const token=this.patchGate.begin(id);this.state.file=file;this.state.patch=null;
  if(c.mutableTarget&&!await this.validateWorking(c,token))return;
  const key=patchKey(c,file);let patch=this.cache.get(key);
  if(!patch){patch=await loadPatch(this.run,c,file);this.cache.set(key,patch);}
  if(c.mutableTarget&&!await this.validateWorking(c,token))return;
  if(this.patchGate.isCurrent(token)&&this.state.comparison?.id===c.id)this.state.patch=patch;
 }
 async verifyComparison(comparison=this.state.comparison){if(!comparison?.mutableTarget)return true;const current=await resolveComparison(withGitBudget(this.run),comparison.repo,comparison.scope,this.session().checkpoints);if(current.id!==comparison.id)throw new Error('Working tree changed; previous source retained');return true;}
 async readFilePatch(file,comparison=this.state.comparison,{full=false,run=withGitBudget(this.run)}={}){
  if(!comparison||!file)throw new Error('Choose a comparison and file');
  const verify=async()=>{if(!comparison.mutableTarget)return;const current=await resolveComparison(run,comparison.repo,comparison.scope,this.session().checkpoints);if(current.id!==comparison.id)throw new Error('Working tree changed; detached patch source is stale');};
  await verify();const key=patchKey(comparison,file,full);let patch=this.cache.get(key);if(!patch){patch=await loadPatch(run,comparison,file,{full});this.cache.set(key,patch);}await verify();return patch;
 }
 async loadDetails(){const repo=this.state.repo,id=this.state.comparison?.targetOid;if(!repo||!id)return;const key=JSON.stringify([repo.key,id,'details']);let details=this.cache.get(key);if(!details){const raw=await git(this.run,repo,['show','-s','--format=%s%x00%an <%ae> · %aI%x00%b',id,'--']);const [subject,author,body]=raw.split('\0');details={subject,author,body:body?.trim()};this.cache.set(key,details);}if(this.state.repo?.key===repo.key&&this.state.comparison?.targetOid===id)this.state.details=details;}
 async expandFile(full=true){this.refreshGate.begin('expand');const c=this.state.comparison,file=this.state.file;if(!c||!file)return;const token=this.patchGate.begin(file.id);const patch=await loadPatch(this.run,c,file,{full});if(c.mutableTarget&&!await this.validateWorking(c,token))return;if(this.patchGate.isCurrent(token)&&this.state.comparison?.id===c.id)this.state.patch={...patch,fullContext:full};}
 async validateWorking(expected,token){
  if(!this.patchGate.isCurrent(token)||this.state.comparison?.id!==expected.id)return false;
  const current=await resolveComparison(this.run,expected.repo,expected.scope,this.session().checkpoints);
  if(!this.patchGate.isCurrent(token)||this.state.comparison?.id!==expected.id)return false;
  if(current.id!==expected.id){await this.selectScope(expected.scope,{preservePath:false});throw new Error('Working tree changed: comparison refreshed and old comments marked outdated; select the file again');}return true;
 }
 async selectResolved(snapshot){
  this.refreshGate.begin('restore');
  const repo=this.state.repo;if(!repo||snapshot.repoKey!==repo.key)throw new Error('Comparison belongs to another worktree');this.state.fileStatsLoading=false;this.state.fileStatsError=null;
  const token=this.gate.begin('restore');this.patchGate.begin('restore');
  let comparison={...snapshot,repo};
  if(snapshot.mutableTarget){comparison=await resolveComparison(this.run,repo,snapshot.scope,this.session().checkpoints);if(comparison.id!==snapshot.id)throw new Error('Working tree changed; refresh the source comparison before switching views');}
  else if(![snapshot.baseTree,snapshot.targetTree].every(x=>/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(x)))throw new Error('Invalid resolved comparison');
  const key=JSON.stringify([repo.key,comparison.baseTree,comparison.targetTree,'files']);let files=comparison.mutableTarget?null:this.cache.get(key);if(!files){files=await listChangedFiles(this.run,comparison);if(!comparison.mutableTarget)this.cache.set(key,files);}
  comparison=await this.summarizeComparison(comparison);if(!this.gate.isCurrent(token))return;this.state={...this.state,comparison,details:null,files,file:null,patch:null};await this.reconcileComments(comparison);
 }
 async validateComment(target){
  if(target.mutableTarget&&this.state.comparison?.id!==target.comparisonId){if(this.state.repo?.key!==target.repoKey)throw new Error('Return to the original repository before saving this working comment');const observed=target.baseTree?await observeWorking(this.run,this.state.repo,target.baseTree):null;if(!observed||observed.id!==target.targetTree)throw new Error('Working source changed; unsaved comment retained');return;}
  const c=this.state.comparison;if(this.state.sourceUnavailable)throw new Error('Source object is unavailable; retain the draft and select an available source');if(c?.mutableTarget&&this.state.branchChanged)throw new Error('Branch changed; retain the draft and explicitly review the current branch');if(!c?.mutableTarget||c.repoKey!==target.repoKey)return;
  const current=await resolveComparison(this.run,this.state.repo,c.scope,this.session().checkpoints);if(current.id!==c.id){await this.selectScope(c.scope);throw new Error('Working tree changed; unsaved comment retained. Refresh its context before saving');}return c;
 }
 addComment(target,body,id=uid()){const c=this.state.comparison;const status=c?.repoKey===target.repoKey&&c.id===target.comparisonId?'current':target.status||(!c||target.targetOid?'current':'outdated');return this.mutate(s=>addDraft(s,{...target,id,body,status,sessionId:s.id}));}
 updateCommentBody(target,body,id){
  if(!body?.trim())throw new Error('Comment cannot be empty');
  const fields=['repoKey','comparisonId','baseOid','targetOid','oldPath','newPath','side','startLine','endLine','quote','mutableTarget','baseTree','targetTree'];
  return this.mutate(s=>{const saved=s.drafts.find(d=>d.id===id);if(!saved||fields.some(key=>saved[key]!==target[key]))throw new Error('Comment source changed; your unsaved text is retained');return {...s,drafts:s.drafts.map(d=>d.id===id?{...d,body}:d)};});
 }
 removeComment(id){return this.mutate(s=>({...s,drafts:s.drafts.filter(d=>d.id!==id)}));}
 async markSeen(){const c=this.state.comparison,repo=this.state.repo;if(!c)throw new Error('Choose a comparison');if(c.mutableTarget||!c.targetOid)throw new Error('Checkpoint requires a committed target');const branch=(await this.run(repo,['symbolic-ref','--short','-q','HEAD'])).stdout.trim();if(!branch||branch!==this.state.branch)throw new Error('Branch context changed or detached; refresh before marking seen');if(!await isAncestor(this.run,repo,c.targetOid,'HEAD'))throw new Error('Selected commit is outside the current branch');const checkpoint=await markSeen(this.run,repo,c,branch);this.mutate(s=>({...s,checkpoints:[...s.checkpoints,checkpoint]}));return checkpoint;}
 async lastCheckpoint(){return lastCheckpoint(this.run,this.state.repo,this.state.branch,this.session().checkpoints);}
 async fetch(){const repo=this.state.repo,version=this.automaticVersion;if(!repo)return;await git(this.run,repo,['fetch','--all','--prune']);const refs=await listRefs(this.run,repo);if(this.state.repo!==repo||this.automaticVersion!==version)return;this.state.refs=refs;this.onChange();}
 async refresh({preserveComposer=false}={}){
  if(this.refreshPromise)return this.refreshPromise;
  const repo=this.state.repo;if(!repo)return;const run=withGitBudget(this.run);
  const token=this.refreshGate.begin('refresh'),comparison=this.state.comparison,file=this.state.file,patch=this.state.patch,historyToken=this.state.historyRef;
  const current=()=>this.refreshGate.isCurrent(token)&&this.state.repo===repo&&this.state.comparison===comparison&&this.state.file===file;
  this.state.refreshing=true;this.state.refreshError=null;this.onChange();
  this.refreshPromise=(async()=>{try{
   const [refs,branchResult,headResult]=await Promise.all([listRefs(run,repo),run(repo,['symbolic-ref','--short','-q','HEAD']),run(repo,['rev-parse','--verify','HEAD'])]);
   if(!current())return false;
   const branch=branchResult.stdout.trim()||'(detached)',head=headResult.code===0?headResult.stdout.trim():null;
   if(branch!==this.state.branch){this.state.branchChanged={previous:this.state.branch,current:branch};return false;}
   const refsChanged=JSON.stringify(refs)!==JSON.stringify(this.state.refs),headChanged=head!==this.state.observedHead,changed=refsChanged||headChanged;
   const filters=this.state.filtersKey?JSON.parse(this.state.filtersKey):{};let featureBase=this.state.featureBaseOid;
   if(changed&&head&&this.state.historyBaseRef)featureBase=await resolveBase(run,repo,this.state.historyBaseRef,head);
   let history=changed?{commits:[],hasMore:false,ref:null,exclude:null}:{commits:this.state.history,hasMore:this.state.hasMore,ref:this.state.historyRef,exclude:this.state.historyExclude};
   if(changed&&head){const depth=Math.max(300,this.state.history.length);let skip=0;do{const page=await listHistory(run,repo,{...filters,ref:filters.ref||'HEAD',exclude:filters.exclude?featureBase||filters.exclude:null,resolvedHead:!filters.ref||filters.ref==='HEAD'?head:null,skip,limit:Math.min(1000,depth-skip)});history={...page,commits:[...history.commits,...page.commits]};skip=history.commits.length;if(!current())return false;}while(history.hasMore&&skip<depth);}
   if(!current()||this.state.historyRef!==historyToken)return false;
   let candidate=comparison,files=this.state.files,nextFile=file,nextPatch=patch,missingFile=null,sourceUnavailable=false,sourceStale=false;
   if(comparison){
    if(comparison.scope.kind==='commit'){
     // Pinned commits retain their exact loaded source after amend/rebase.
     try{await oid(run,repo,comparison.targetOid);sourceUnavailable=false;}catch{sourceUnavailable=true;}
    }else{
     candidate=!changed&&!comparison.mutableTarget?comparison:await resolveComparison(run,repo,comparison.scope,this.session().checkpoints);
     if(candidate.id===comparison.id)candidate=candidate.committedTargetOid!==comparison.committedTargetOid?await this.summarizeComparison({...comparison,committedTargetOid:candidate.committedTargetOid},run):comparison;
     else if(preserveComposer){sourceStale=true;candidate=comparison;}
     else{
      const key=JSON.stringify([repo.key,candidate.baseTree,candidate.targetTree,'files']);files=this.cache.get(key)||await listChangedFiles(run,candidate);if(!candidate.mutableTarget)this.cache.set(key,files);
      candidate=await this.summarizeComparison(candidate,run);
      nextFile=file?files.find(f=>f.newPath===file.newPath)||null:null;missingFile=file&&!nextFile?file.newPath:null;nextPatch=null;
      if(nextFile){const key=patchKey(candidate,nextFile,!!patch?.full);nextPatch=this.cache.get(key)||await loadPatch(run,candidate,nextFile,{full:!!patch?.full});this.cache.set(key,nextPatch);}
      if(candidate.mutableTarget){const verified=await resolveComparison(run,repo,candidate.scope,this.session().checkpoints);if(verified.id!==candidate.id)throw new Error('Working tree changed during refresh; previous source retained');}
     }
    }
   }
   if(!current()||this.state.historyRef!==historyToken)return false;
   if(changed||candidate?.mutableTarget){const finalHead=await run(repo,['rev-parse','--verify','HEAD']);if((finalHead.code===0?finalHead.stdout.trim():null)!==head)throw new Error('Repository changed during refresh; previous source retained');if(!current())return false;}
   Object.assign(this.state,{observedHead:head,refs,history:history.commits,hasMore:history.hasMore,historyRef:history.ref,historyExclude:history.exclude,featureBaseOid:featureBase,empty:!head,newHead:comparison?.scope.kind==='commit'&&head&&head!==comparison.targetOid?head:null,branchChanged:null,comparison:candidate,details:candidate===comparison?this.state.details:null,files,file:nextFile,patch:nextPatch,missingFile,sourceUnavailable,sourceStale});
   if(candidate!==comparison){this.state.sourceStale=false;this.state.fileStatsLoading=false;this.state.fileStatsError=null;}
   if(candidate&&(changed||candidate.mutableTarget||this.session().drafts.some(d=>d.repoKey===repo.key&&d.mutableTarget)))await this.reconcileComments(candidate,{run,headOid:head,validatedWorking:candidate.mutableTarget&&!this.state.sourceStale?candidate:null});
   return true;
  }catch(error){if(current())this.state.refreshError=error.message;return false;}finally{this.state.refreshing=false;this.refreshPromise=null;this.onChange();}})();
  return this.refreshPromise;
 }
 async ensureAutomaticBase(config={}, {force=false}={}){
  const repo=this.state.repo,branch=this.state.branch;if(!repo||this.state.empty||this.base())return null;
  const signature=JSON.stringify([repo.key,branch,config.baseRef||null,config.baseRules||[]]);
  if(!force&&this.state.automaticChoice?.signature===signature)return this.state.automaticChoice;
  if(!force&&this.automaticRequest?.signature===signature)return this.automaticRequest.promise;
  const version=this.automaticVersion=(this.automaticVersion||0)+1;
  const storageKey='git-review.v1.automatic-base.'+repo.key+'.'+branch;
  const saved=force?null:this.store.get(storageKey);
  const promise=(async()=>{
   let choice;
   if(saved?.signature===signature&&saved.ref){
    let exists=this.state.refs.some(ref=>ref.fullName===saved.ref||ref.name===saved.ref);if(!exists)try{await oid(this.run,repo,saved.ref);exists=true;}catch{}
    choice=exists?saved:{ref:null,source:'unavailable',reason:'The retained automatic base is unavailable; choose a base or recalculate Automatic',candidates:[],signature};
   }else choice={...await resolveAutomaticBase(this.run,repo,{branch,refs:this.state.refs,config}),signature};
   if(this.automaticVersion!==version||this.state.repo!==repo||this.state.branch!==branch||this.base())return null;
   this.state.automaticChoice=choice;if(choice.ref)this.store.set(storageKey,choice);else if(force)this.store.set(storageKey,null);this.onChange();return choice;
  })();
  this.automaticRequest={signature,promise};try{return await promise;}finally{if(this.automaticRequest?.promise===promise)this.automaticRequest=null;}
 }
 setBase(baseRef){this.automaticVersion=(this.automaticVersion||0)+1;this.automaticRequest=null;const key=`git-review.v1.base.${this.state.repo.key}.${this.state.branch}`;this.store.set(key,baseRef);}
 base(){return this.state.repo?this.store.get(`git-review.v1.base.${this.state.repo.key}.${this.state.branch}`)||'':'';}
}
