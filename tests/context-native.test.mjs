import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,run,directories} from './helpers/repos.mjs';
import {resolveConfig,selectBase,readLocalConfig} from '../mods/juhas/config.js';
import {Controller} from '../mods/juhas/controller.js';
import {createCache} from '../mods/juhas/cache.js';
import {createRunner} from '../mods/juhas/git.js';
import {resolveRepositoryScope,allowedRepository,contextStorageKey} from '../mods/juhas/context.js';
function nativeView(){
 const data=new Map(),store={get:k=>data.get(k),set:(k,v)=>data.set(k,v)};let id=0;
 let source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export default class')).replace('export default class Juhas extends View','class Juhas extends View');
 const deps={createCache,resolveConfig,selectBase,readLocalConfig,readTextFile:async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});},shared:store.get,setShared:store.set,store,Controller,createRunner,cache:createCache(),exec:(_command,args,options)=>run({root:options.cwd},args),scopeCache:new Map(),resolveRepositoryScope,allowedRepository,contextStorageKey,readDirectories:(_exec,_home,machine,path)=>directories(machine,path),appHome:()=>'',uid:()=>String(++id)};
 const Native=new Function('View',...Object.keys(deps),source+'\nreturn Juhas;')(class{},...Object.values(deps));const view=Object.create(Native.prototype);
 view.contextProps={};view.config={maxDepth:3,maxRepos:20};view.contextViews=new Map();view.policy={repos:[],canSwitch:false};view.inputs={};view.role='sidebar';view.sessionId='initial';
 for(const key of ['folder','base','target','query','author','path','comment','note']){let value='';view.inputs[key]={value:()=>value,set_value:next=>value=next};}
 view.work=(_cx,fn)=>view.pending=fn(_cx);return {view,store};
}
test('switching projects replaces Git and comments; returning restores the correct cached project',async t=>{
 const a=fixture(t),b=fixture(t);a.commit('project A');b.commit('project B');const {view,store}=nativeView();const cx={notify(){},spawn(fn){return fn(this);}};
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
test('single-repository context cannot be switched to another saved repository',async t=>{
 const a=fixture(t);a.commit('a');const {view}=nativeView(),cx={notify(){}};view.activateContext({key:'a',spaceId:'a',folder:a.root,machine:null},cx);await view.pending;const before=view.controller.state.repo.root;view.openFolder('/outside',cx);assert.equal(view.controller.state.repo.root,before);assert.match(view.message,/active project/);
});
test('choosing another repository in a parent context resets ref and search controls',async t=>{
 const a=fixture(t);a.commit('one');a.git('worktree','add','-b','another',a.parent+'/another');const {view}=nativeView(),cx={notify(){}};
 view.activateContext({key:'parent',spaceId:'parent',folder:a.parent,machine:null},cx);await view.pending;assert.equal(view.policy.canSwitch,true);const next=view.policy.repos.find(r=>r.root!==view.controller.state.repo.root);
 view.inputs.target.set_value('commit-from-first-repo');view.inputs.query.set_value('old search');view.historyRef='old-branch';view.openFolder(next.root,cx);await view.pending;
 assert.equal(view.controller.state.repo.root,next.root);assert.equal(view.inputs.target.value(),'HEAD');assert.equal(view.inputs.query.value(),'');assert.equal(view.historyRef,'HEAD');
});
