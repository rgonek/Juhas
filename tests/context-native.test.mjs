import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,run,directories} from './helpers/repos.mjs';
import {resolveConfig,selectBase,readLocalConfig} from '../mods/juhas/config.js';
import {Controller} from '../mods/juhas/controller.js';
import {createCache} from '../mods/juhas/cache.js';
import {createRunner} from '../mods/juhas/git.js';
import {resolveRepositoryScope,allowedRepository,contextStorageKey} from '../mods/juhas/context.js';
import {resolveRepo} from '../mods/juhas/repositories.js';
function nativeView(list=directories,workingLineCounts,hasWorkingChanges){
 const data=new Map(),store={get:k=>data.get(k),set:(k,v)=>data.set(k,v)};let id=0;
 let source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export default class')).replace('export default class Juhas extends View','class Juhas extends View');
 const deps={createCache,resolveConfig,selectBase,readLocalConfig,readTextFile:async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});},shared:store.get,setShared:store.set,store,Controller,createRunner,cache:createCache(),exec:(_command,args,options)=>run({root:options.cwd},args),scopeCache:new Map(),resolveRepositoryScope,allowedRepository,contextStorageKey,readDirectories:(_exec,_home,machine,path)=>directories(machine,path),appHome:()=>'',uid:()=>String(++id)};
 Object.assign(deps,{resolveRepo,workingLineCounts,hasWorkingChanges,readDirectories:(_exec,_home,machine,path)=>list(machine,path)});
 const Native=new Function('View',...Object.keys(deps),source+'\nreturn Juhas;')(class{},...Object.values(deps));const view=Object.create(Native.prototype);
 view.contextProps={config:{baseRef:'refs/heads/trunk'}};view.config={maxDepth:3,maxRepos:20};view.contextViews=new Map();view.policy={repos:[],canSwitch:false};view.inputs={};view.role='sidebar';view.sessionId='initial';
 for(const key of ['folder','base','target','query','author','path','comment','note']){let value='';view.inputs[key]={value:()=>value,set_value:next=>value=next};}
 view.work=(_cx,fn)=>view.pending=fn(_cx);return {view,store};
}
test('reopening the repository picker reuses pending and fresh counts',async ()=>{
 let calls=0,release;
 const scan=new Promise(resolve=>{release=resolve;});
 const counts={additions:4,deletions:2};
 let probes=0,seen;
 const {view}=nativeView(directories,async(_run,repo)=>{calls++;seen=repo.key;await scan;return counts;},
  async(_run,repo)=>{probes++;return repo.key==='repo';});
 let pending;
 const cx={notify(){},spawn(fn){pending=fn(this);}};
 const repo={key:'repo'};
 view.controller={run(){}};
 view.activeContext={key:'project'};
 view.policy={repos:[repo,{key:'clean'}]};
 view.loadRepositoryCounts(cx);
 view.loadRepositoryCounts(cx);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(probes,2);
 assert.equal(view.repositoryChanges.get('repo'),true);
 assert.equal(view.repositoryChanges.get('clean'),false);
 assert.equal(calls,1);
 assert.equal(seen,'repo');
 release();await pending;
 view.loadRepositoryCounts(cx);
 assert.equal(calls,1);
 assert.deepEqual(view.repositoryCounts.get(repo.key),counts);
 view.policy={repos:[repo]};
 view.loadRepositoryCounts(cx);
 assert.deepEqual(view.repositoryCounts.get(repo.key),counts);
 await pending;
 assert.equal(calls,2);
});
test('switching projects replaces Git and comments; returning restores the correct cached project',async t=>{
 const a=fixture(t),b=fixture(t);a.commit('base A');a.git('checkout','-b','feature/a');a.commit('project A');b.commit('base B');b.git('checkout','-b','feature/b');b.commit('project B');const {view,store}=nativeView();const cx={notify(){},spawn(fn){return fn(this);}};
 const first={key:'project-a',spaceId:'a',folder:a.root,machine:null},second={key:'project-b',spaceId:'b',folder:b.root,machine:null};
 view.activateContext(first,cx);await view.pending;const controllerA=view.controller,keyA=view.selectionKey,rootA=view.controller.state.repo.root;
 view.controller.addComment({repoKey:view.controller.state.repo.key,comparisonId:view.controller.state.comparison.id,newPath:'file.txt'},'Keep project A comment');view.panel='comment';view.target={repoKey:view.controller.state.repo.key,newPath:'file.txt'};view.inputs.comment.set_value('Unsaved A text');
 view.allChangesFrom='commit';view.manualCommitBase='saved-baseline';view.lastAppliedFrom='commit';
 store.set('git-review.v1.selection.b',{root:rootA,scope:{kind:'commit',commit:'HEAD'}});
 view.activateContext(second,cx);await view.pending;assert.notEqual(view.selectionKey,keyA);assert.notEqual(view.controller.state.repo.root,rootA);assert.equal(view.controller.state.repo.root,b.git('rev-parse','--show-toplevel'));assert.equal(view.controller.session().drafts.length,0);assert.equal(view.inputs.comment.value(),'');assert.equal(view.policy.canSwitch,false);
 assert.equal(view.allChangesFrom,'branch');assert.equal(view.lastAppliedFrom,'branch');assert.equal(view.manualCommitBase,null);
 view.activateContext(first,cx);assert.equal(view.controller,controllerA);assert.equal(view.controller.session().drafts[0].body,'Keep project A comment');assert.equal(view.allChangesFrom,'commit');assert.equal(view.lastAppliedFrom,'commit');assert.equal(view.manualCommitBase,'saved-baseline');await view.syncComposer(cx);assert.equal(view.inputs.comment.value(),'Unsaved A text');
 const pinned=view.controller.state.comparison.targetOid,next=a.commit('project A updated');await view.refreshContext(cx);assert.equal(view.controller.state.comparison.targetOid,pinned);assert.equal(view.controller.state.history[0].oid,next);
});
test('initial review is ready while nested repository discovery is still pending',async t=>{
 const repo=fixture(t);repo.commit('base');repo.git('checkout','-b','feature');repo.commit('feature');
 let release,shown;
 const scan=new Promise(resolve=>{release=resolve;});
 const firstReview=new Promise(resolve=>{shown=resolve;});
 const {view}=nativeView(()=>scan);
 const cx={notify(){if(view.controller.state.comparison)shown();}};
 view.activateContext({key:'parallel',spaceId:'parallel',folder:repo.root,machine:null},cx);
 try{
  const timeout=AbortSignal.timeout(8000);
  await Promise.race([firstReview,new Promise((_,reject)=>timeout.addEventListener('abort',()=>reject(new Error('Review waited for the scan')),{once:true}))]);
  assert.equal(view.controller.state.comparison.scope.kind,'branch');
 }finally{release([]);await view.pending;}
 assert.equal(view.policy.ready,true);
});
test('single-repository context cannot be switched to another saved repository',async t=>{
 const a=fixture(t);a.commit('a');const {view}=nativeView(),cx={notify(){}};view.activateContext({key:'a',spaceId:'a',folder:a.root,machine:null},cx);await view.pending;const before=view.controller.state.repo.root;view.openFolder('/outside',cx);assert.equal(view.controller.state.repo.root,before);assert.match(view.message,/active project/);
});
test('choosing another repository in a parent context resets ref and search controls',async t=>{
 const a=fixture(t);a.commit('one');a.git('worktree','add','-b','another',a.parent+'/another');const {view}=nativeView();
 let background;const cx={notify(){},spawn(fn){background=fn(this);}};
 view.activateContext({key:'parent',spaceId:'parent',folder:a.parent,machine:null},cx);await view.pending;assert.equal(view.policy.canSwitch,true);const next=view.policy.repos.find(r=>r.root!==view.controller.state.repo.root);
 let releaseHistory,comparisonAtHistory;
 const history=new Promise(resolve=>{releaseHistory=resolve;});
 view.updateFeatureHistory=async()=>{comparisonAtHistory=view.controller.state.comparison;await history;};
 view.inputs.target.set_value('commit-from-first-repo');view.inputs.query.set_value('old search');view.historyRef='old-branch';view.panel='repos';
 try{
  view.openFolder(next.root,cx);
  assert.equal(view.panel,null);
  assert.equal(view.switchingRepository,next);
  await view.pending;
  assert.ok(comparisonAtHistory);
  assert.equal(view.switchingRepository,null);
 }finally{releaseHistory();await view.pending;await background;}
 assert.equal(view.controller.state.repo.root,next.root);assert.equal(view.inputs.target.value(),'HEAD');assert.equal(view.inputs.query.value(),'');assert.equal(view.historyRef,'HEAD');
 const first=view.policy.repos.find(r=>r.root!==next.root);
 view.target={repoKey:next.key,newPath:'file.txt'};view.inputs.comment.set_value('unsaved');
 view.openFolder(first.root,cx);await view.pending;
 assert.equal(view.controller.state.repo.root,next.root);assert.equal(view.inputs.comment.value(),'unsaved');
 view.target=null;view.inputs.comment.set_value('');
 view.openFolder(first.root,cx);await view.pending;
 assert.equal(view.controller.state.repo.root,first.root);assert.equal(view.inputs.query.value(),'old search');assert.equal(view.historyRef,'old-branch');
});
test('refresh discovers a new nested repository while retaining the selected source',async t=>{
 const a=fixture(t);a.commit('first');
 const {view}=nativeView(),cx={notify(){},spawn(fn){return fn(this);}};
 view.activateContext({key:'root',spaceId:'root',folder:a.root,machine:null},cx);await view.pending;
 assert.equal(view.policy.canSwitch,false);
 const comparison=view.controller.state.comparison.id;
 a.git('worktree','add','-b','nested',a.root+'/nested');
 await view.refreshContext(cx);
 assert.equal(view.policy.canSwitch,true);assert.equal(view.controller.state.comparison.id,comparison);
});

test('a slow repository does not withhold line counts from finished repositories',async()=>{
 let release;
 const slow=new Promise(resolve=>release=resolve);
 const {view}=nativeView(directories,async(_run,repo)=>{
  if(repo.key==='slow')await slow;
  return {additions:1,deletions:2};
 },async()=>true);
 let pending;
 const cx={notify(){},spawn(fn){pending=fn(this);}};
 view.controller={run(){},state:{repo:{key:'fast'}}};
 view.activeContext={key:'project'};
 view.policy={repos:[{key:'slow'},{key:'fast'}]};
 view.loadRepositoryCounts(cx);
 try{
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(view.repositoryCounts.get('fast'),{additions:1,deletions:2});
  assert.equal(view.repositoryCounts.has('slow'),false);
 }finally{release();await pending;}
 assert.equal(view.repositoryCounts.size,2);
});
