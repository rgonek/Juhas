import {resolveRepo} from './repositories.js';
import {git,uid,oid,isAncestor} from './git.js';
import {listHistory,listRefs} from './history.js';
import {resolveComparison,fromHistory} from './comparisons.js';
import {listChangedFiles,loadPatch} from './diff.js';
import {createCache,createRequestGate} from './cache.js';
import {loadSession,mutateSession} from './storage.js';
import {addDraft,markSeen,lastCheckpoint} from './review.js';
export class Controller {
 constructor({run,store,sessionId='default',cache=createCache()}){this.run=run;this.store=store;this.sessionId=sessionId;this.cache=cache;this.gate=createRequestGate();this.patchGate=createRequestGate();this.historyGate=createRequestGate();this.baseGate=createRequestGate();this.state={repo:null,branch:null,history:[],refs:[],files:[],file:null,patch:null,comparison:null,error:null,hasMore:false};}
 session(){return loadSession(this.store,this.sessionId);}
 mutate(fn){return mutateSession(this.store,this.sessionId,fn);}
 async openRepo(machine,folder){
  const token=this.gate.begin('repo');this.patchGate.begin('repo');this.historyGate.begin('repo');this.baseGate.begin('repo');
  const repo=await resolveRepo(this.run,machine,folder);if(!this.gate.isCurrent(token))return;if(!repo)throw new Error('Folder is not inside a Git repository; use Discover to find nested repositories');
  const [refs,branch]=await Promise.all([listRefs(this.run,repo),this.run(repo,['symbolic-ref','--short','-q','HEAD'])]);if(!this.gate.isCurrent(token))return;
  this.state={...this.state,repo,branch:branch.stdout.trim()||'(detached)',refs,files:[],file:null,patch:null,comparison:null,error:null,history:[],hasMore:false,featureBaseOid:null,historyBaseError:null,historyBaseLoading:false};
  const head=await this.run(repo,['rev-parse','--verify','HEAD']);if(head.code!==0){this.state.empty=true;return;}
  this.state.empty=false;await this.loadHistory();
 }
 async loadHistory(filters={},more=false){
  const repo=this.state.repo;if(!repo)return;const filtersKey=JSON.stringify(filters);const skip=more?this.state.history.length:0;
  const token=this.historyGate.begin(JSON.stringify([repo.key,filters,skip]));const ref=more?this.state.historyRef:filters.ref||'HEAD',exclude=more?this.state.historyExclude:filters.exclude;const result=await listHistory(this.run,repo,{...filters,ref,exclude,skip});if(!this.historyGate.isCurrent(token)||repo.key!==this.state.repo?.key)return;
  this.state.history=more?[...this.state.history,...result.commits]:result.commits;this.state.historyRef=result.ref;this.state.historyExclude=result.exclude;this.state.hasMore=result.hasMore;this.state.filtersKey=filtersKey;
 }
 async setHistoryBase(baseRef){
  const repo=this.state.repo;if(!repo)return false;const token=this.baseGate.begin(baseRef);this.historyGate.begin('base');this.state.historyBaseLoading=true;let base=null,error=null;
  if(baseRef)try{base=(await resolveComparison(this.run,repo,{kind:'branch',baseRef,targetRef:'HEAD'})).baseOid;}catch(e){error=e.message;}
  if(!this.baseGate.isCurrent(token)||this.state.repo?.key!==repo.key)return false;
  this.state.featureBaseOid=base;this.state.historyBaseRef=baseRef||null;this.state.historyBaseError=error;this.state.historyBaseLoading=false;return true;
 }
 async summarizeComparison(comparison){
  if(!comparison.targetOid)return {...comparison,commitCount:null};
  if(comparison.scope.kind==='commit')return {...comparison,commitCount:1};
  const key=JSON.stringify([comparison.repoKey,comparison.baseOid,comparison.targetOid,'commit-count']);let count=this.cache.get(key);
  try{if(count==null){const raw=(await git(this.run,comparison.repo,['rev-list','--count',comparison.targetOid,...(comparison.baseOid?['^'+comparison.baseOid]:[]),'--'])).trim();count=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(count))throw new Error('Invalid Git commit count');this.cache.set(key,count);}}
  catch(error){return {...comparison,commitCount:null,summaryError:error.message};}
  return {...comparison,commitCount:count,summaryError:null};
 }
 async reconcileComments(comparison){
  const repo=this.state.repo;if(!repo)return;
  const drafts=this.session().drafts.filter(d=>d.repoKey===repo.key);if(!drafts.length)return;
  const head=await oid(this.run,repo,'HEAD'),valid=new Map(),statuses=new Map();
  const source=d=>JSON.stringify([d.comparisonId,d.targetOid,d.baseOid]);
  for(const draft of drafts){const key=source(draft);if(!valid.has(key)){
   let current=false;
   if(draft.targetOid){const cacheKey=JSON.stringify([repo.key,head,draft.targetOid,draft.baseOid,'draft-valid']),cached=this.cache.get(cacheKey);if(cached!=null)current=cached.valid;else{if(/^[a-f0-9]{40,64}$/.test(draft.targetOid)){current=await isAncestor(this.run,repo,draft.targetOid,head);if(current&&draft.baseOid)await oid(this.run,repo,draft.baseOid);}this.cache.set(cacheKey,{valid:current});}}
   else if(draft.mutableTarget&&draft.baseOid){const mutable=await resolveComparison(this.run,repo,{kind:'working-tree',baseRef:draft.baseOid});current=mutable.id===draft.comparisonId;}
   else current=draft.comparisonId===comparison.id;
   valid.set(key,current);
  }statuses.set(draft.id,{key,status:valid.get(key)?'current':'outdated'});}
  if(this.state.repo?.key!==repo.key||this.state.comparison?.id!==comparison.id)return;
  this.mutate(s=>({...s,drafts:s.drafts.map(d=>{const result=statuses.get(d.id);return d.repoKey===repo.key&&result?.key===source(d)?{...d,status:result.status}:d;})}));
 }
 async selectScope(scope){
  const repo=this.state.repo;if(!repo)return;const token=this.gate.begin('scope');this.patchGate.begin('scope');
  const scopeKey=JSON.stringify([repo.key,scope]);const immutable=scope.kind==='commit'&&/^[a-f0-9]{40,64}$/.test(scope.commit)||scope.kind==='range'&&/^[a-f0-9]{40,64}$/.test(scope.base)&&/^[a-f0-9]{40,64}$/.test(scope.target);
  let loaded=immutable?this.cache.get(scopeKey):null;
  if(!loaded){const comparison=fromHistory(repo,scope,this.state.history)||await resolveComparison(this.run,repo,scope,this.session().checkpoints);const filesKey=JSON.stringify([repo.key,comparison.baseTree,comparison.targetTree,'files']);let files=this.cache.get(filesKey);if(!files){files=await listChangedFiles(this.run,comparison);if(!comparison.mutableTarget)this.cache.set(filesKey,files);}loaded={comparison,files};if(immutable)this.cache.set(scopeKey,loaded);}
  if(!this.gate.isCurrent(token))return;
  loaded={...loaded,comparison:await this.summarizeComparison(loaded.comparison)};if(!this.gate.isCurrent(token))return;
  this.state={...this.state,comparison:loaded.comparison,details:null,files:loaded.files,file:null,patch:null,error:null};
  await this.reconcileComments(loaded.comparison);
 }
 async selectFile(id){
  const c=this.state.comparison;const file=this.state.files.find(f=>f.id===id);if(!c||!file)return;const token=this.patchGate.begin(id);this.state.file=file;this.state.patch=null;
  if(c.mutableTarget&&!await this.validateWorking(c,token))return;
  const key=JSON.stringify([c.repoKey,c.baseTree,c.targetTree,id,'patch']);let patch=c.mutableTarget?null:this.cache.get(key);
  if(!patch){patch=await loadPatch(this.run,c,file);if(!c.mutableTarget)this.cache.set(key,patch);}
  if(c.mutableTarget&&!await this.validateWorking(c,token))return;
  if(this.patchGate.isCurrent(token)&&this.state.comparison?.id===c.id)this.state.patch=patch;
 }
 async loadDetails(){const repo=this.state.repo,id=this.state.comparison?.targetOid;if(!repo||!id)return;const raw=await git(this.run,repo,['show','-s','--format=%s%x00%an <%ae> · %aI%x00%b',id,'--']);if(this.state.comparison?.targetOid===id){const [subject,author,body]=raw.split('\0');this.state.details={subject,author,body:body?.trim()};}}
 async expandFile(){const c=this.state.comparison,file=this.state.file;if(!c||!file)return;const token=this.patchGate.begin(file.id);const patch=await loadPatch(this.run,c,file,{full:true});if(c.mutableTarget&&!await this.validateWorking(c,token))return;if(this.patchGate.isCurrent(token)&&this.state.comparison?.id===c.id)this.state.patch=patch;}
 async validateWorking(expected,token){
  const current=await resolveComparison(this.run,this.state.repo,expected.scope,this.session().checkpoints);
  if(!this.patchGate.isCurrent(token)||this.state.comparison?.id!==expected.id)return false;
  if(current.id!==expected.id){await this.selectScope(expected.scope);throw new Error('Working tree changed: comparison refreshed and old comments marked outdated; select the file again');}return true;
 }
 async selectResolved(snapshot){
  const repo=this.state.repo;if(!repo||snapshot.repoKey!==repo.key)throw new Error('Comparison belongs to another worktree');
  const token=this.gate.begin('restore');this.patchGate.begin('restore');
  let comparison={...snapshot,repo};
  if(snapshot.mutableTarget){comparison=await resolveComparison(this.run,repo,snapshot.scope,this.session().checkpoints);if(comparison.id!==snapshot.id)throw new Error('Working tree changed; refresh the source comparison before switching views');}
  else if(![snapshot.baseTree,snapshot.targetTree].every(x=>/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(x)))throw new Error('Invalid resolved comparison');
  const key=JSON.stringify([repo.key,comparison.baseTree,comparison.targetTree,'files']);let files=comparison.mutableTarget?null:this.cache.get(key);if(!files){files=await listChangedFiles(this.run,comparison);if(!comparison.mutableTarget)this.cache.set(key,files);}
  comparison=await this.summarizeComparison(comparison);if(!this.gate.isCurrent(token))return;this.state={...this.state,comparison,details:null,files,file:null,patch:null};await this.reconcileComments(comparison);
 }
 async validateComment(target){
  const c=this.state.comparison;if(!c?.mutableTarget||c.repoKey!==target.repoKey)return;
  const current=await resolveComparison(this.run,this.state.repo,c.scope,this.session().checkpoints);if(current.id!==c.id){await this.selectScope(c.scope);throw new Error('Working tree changed; unsaved comment retained. Refresh its context before saving');}
 }
 addComment(target,body,id=uid()){const c=this.state.comparison;const status=c?.repoKey===target.repoKey&&c.id===target.comparisonId?'current':target.status||(!c||target.targetOid?'current':'outdated');return this.mutate(s=>addDraft(s,{...target,id,body,status,sessionId:s.id}));}
 updateCommentBody(target,body,id){
  if(!body?.trim())throw new Error('Comment cannot be empty');
  const fields=['repoKey','comparisonId','baseOid','targetOid','oldPath','newPath','side','startLine','endLine','quote','mutableTarget','targetTree'];
  return this.mutate(s=>{const saved=s.drafts.find(d=>d.id===id);if(!saved||fields.some(key=>saved[key]!==target[key]))throw new Error('Comment source changed; your unsaved text is retained');return {...s,drafts:s.drafts.map(d=>d.id===id?{...d,body}:d)};});
 }
 removeComment(id){return this.mutate(s=>({...s,drafts:s.drafts.filter(d=>d.id!==id)}));}
 async markSeen(){const c=this.state.comparison,repo=this.state.repo;if(!c)throw new Error('Choose a comparison');if(c.mutableTarget||!c.targetOid)throw new Error('Checkpoint requires a committed target');const branch=(await this.run(repo,['symbolic-ref','--short','-q','HEAD'])).stdout.trim();if(!branch||branch!==this.state.branch)throw new Error('Branch context changed or detached; refresh before marking seen');if(!await isAncestor(this.run,repo,c.targetOid,'HEAD'))throw new Error('Selected commit is outside the current branch');const checkpoint=await markSeen(this.run,repo,c,branch);this.mutate(s=>({...s,checkpoints:[...s.checkpoints,checkpoint]}));return checkpoint;}
 async lastCheckpoint(){return lastCheckpoint(this.run,this.state.repo,this.state.branch,this.session().checkpoints);}
 async fetch(){const repo=this.state.repo;if(!repo)return;await git(this.run,repo,['fetch','--all','--prune']);await this.refresh();}
 async refresh(){const repo=this.state.repo,scope=this.state.comparison?.scope,baseRef=this.state.historyBaseRef,filters=this.state.filtersKey?JSON.parse(this.state.filtersKey):{};if(!repo)return;this.cache.invalidateRepo(repo.key);await this.openRepo(repo.machine,repo.root);if(baseRef){await this.setHistoryBase(baseRef);await this.loadHistory({...filters,exclude:filters.exclude?this.state.featureBaseOid:null});}if(scope)await this.selectScope(scope);}
 setBase(baseRef){const key=`git-review.v1.base.${this.state.repo.key}.${this.state.branch}`;this.store.set(key,baseRef);}
 base(){return this.state.repo?this.store.get(`git-review.v1.base.${this.state.repo.key}.${this.state.branch}`)||'':'';}
}
