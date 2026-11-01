import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,run} from './helpers/repos.mjs';
import {selectBase} from '../mods/git-review/config.js';
import {Controller} from '../mods/git-review/controller.js';
import {resolveComparison} from '../mods/git-review/comparisons.js';
import {resolveRepo} from '../mods/git-review/repositories.js';
import {createSession,addDraft,reconcileDrafts} from '../mods/git-review/review.js';
import {buildBatch,createSubmitter,isLiveTerminal,MAX_REVIEW_BYTES} from '../mods/git-review/submit.js';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
function nativeClass(deps){deps={selectBase,isLiveTerminal,MAX_REVIEW_BYTES,...deps};let source=readFileSync(new URL('../mods/git-review/main.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export default class')).replace('export default class GitReview extends View','class GitReview extends View');return new Function('View',...Object.keys(deps),source+'\nreturn GitReview;')(class{},...Object.values(deps));}
test('amend with identical trees still makes comments on original revisions outdated',async t=>{
 const f=fixture(t);f.commit('a');f.commit('b');const repo=await resolveRepo(run,null,f.root);const a=await resolveComparison(run,repo,{kind:'commit',commit:'HEAD',parentIndex:0});f.git('commit','--amend','-m','amended message');const b=await resolveComparison(run,repo,{kind:'commit',commit:'HEAD',parentIndex:0});assert.equal(a.targetTree,b.targetTree);assert.notEqual(a.targetOid,b.targetOid);assert.notEqual(a.id,b.id);
 let s=createSession('s');s=addDraft(s,{id:'d',repoKey:repo.key,comparisonId:a.id,body:'fix'});assert.equal(reconcileDrafts(s,[b.id]).drafts[0].status,'outdated');
});
test('second native view syncs a refreshed HEAD even when scope text is unchanged',async()=>{
 const scope={kind:'commit',commit:'HEAD',parentIndex:0};const old={id:'old',repoKey:'r',scope,targetOid:'old-sha'};const fresh={...old,id:'new',targetOid:'new-sha'};const selected={root:'/r',scope,comparison:fresh,fileId:null,version:'new'};
 const Native=nativeClass({shared:()=>selected,setShared:()=>{}});const view=Object.create(Native.prototype);view.role='full';view.selectionKey='key';view.controller={state:{repo:{root:'/r'},comparison:old},selectResolved:async c=>{view.controller.state.comparison=c;},base:()=>''};view.inputs={folder:{set_value(){}},base:{set_value(){}}};view.work=(_cx,action)=>view.pending=action();view.sync({});await view.pending;assert.equal(view.controller.state.comparison.targetOid,'new-sha');
});
test('successful native submit keeps comments edited after preview or during delivery',async()=>{
 const data=new Map(),store={get:k=>data.get(k),set:(k,v)=>data.set(k,v)};const controller=new Controller({run,store,sessionId:'s'});const draft={id:'d',repoKey:'r',comparisonId:'c',newPath:'a',quote:'code',body:'old'};controller.addComment(draft,'old','d');
 let resolveDelivery;const Native=nativeClass({shared:store.get,setShared:store.set,uid:()=>String(Math.random()),buildBatch,submit:createSubmitter(),terminals:()=>[{id:'t1',finished:false}],exec:()=>new Promise(r=>resolveDelivery=r)});const view=Object.create(Native.prototype);view.controller=controller;view.batch=buildBatch(controller.session(),[],{agentAddress:'t1'});view.work=(_cx,action)=>view.pending=action();view.send({});controller.addComment(draft,'edited while sending','d');resolveDelivery({code:0});await view.pending;assert.equal(controller.session().drafts[0]?.body,'edited while sending');assert.match(controller.session().submittedBatches[0].text,/old/);
});
test('pinned comparison can be restored after HEAD moves without following the new HEAD',async t=>{
 const f=fixture(t);f.commit('a');f.commit('b');const map=new Map(),store={get:k=>map.get(k),set:(k,v)=>map.set(k,v)};const first=new Controller({run,store});await first.openRepo(null,f.root);await first.selectScope({kind:'commit',commit:'HEAD',parentIndex:0});const snapshot=first.state.comparison;f.commit('c');const second=new Controller({run,store});await second.openRepo(null,f.root);await second.selectResolved(snapshot);assert.equal(second.state.comparison.targetOid,snapshot.targetOid);assert.notEqual(second.state.history[0].oid,snapshot.targetOid);
});
test('late history request and concurrent load-more cannot overwrite or duplicate rows',async t=>{
 const f=fixture(t);const first=f.commit('a');const second=f.commit('b');const data=new Map();let release;let hold=false;
 const delayed=async(repo,args)=>{if(hold&&args[0]==='log'&&args.includes(first)){hold=false;await new Promise(r=>release=r);}return run(repo,args);};const c=new Controller({run:delayed,store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});await c.openRepo(null,f.root);hold=true;
 const stale=c.loadHistory({ref:first});while(!release)await new Promise(r=>setImmediate(r));await c.loadHistory({ref:second});release();await stale;assert.equal(c.state.historyRef,second);
 await Promise.all([c.loadHistory({},true),c.loadHistory({},true)]);assert.equal(new Set(c.state.history.map(x=>x.oid)).size,c.state.history.length);
});
test('changed working file cannot display under the old comment identity',async t=>{
 const f=fixture(t);f.commit('base');writeFileSync(join(f.root,'file.txt'),'first mutable version');const data=new Map();const c=new Controller({run,store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});await c.openRepo(null,f.root);await c.selectScope({kind:'working-tree',baseRef:'HEAD'});const oldId=c.state.comparison.id;const file=c.state.files[0];await c.selectFile(file.id);c.addComment({repoKey:c.state.repo.key,comparisonId:oldId,newPath:'file.txt',quote:'first mutable version'},'fix');
 writeFileSync(join(f.root,'file.txt'),'entirely different second mutable version');await assert.rejects(()=>c.selectFile(file.id),/changed|refresh/i);assert.notEqual(c.state.comparison.id,oldId);assert.equal(c.session().drafts[0].status,'outdated');assert.equal(c.state.patch,null);
});
test('native shared-state updates run after render rather than notifying from the render stack',async()=>{
 const scope={kind:'commit',commit:'HEAD',parentIndex:0},old={id:'old',scope,targetOid:'old'},fresh={id:'new',scope,targetOid:'new'};const selected={root:'/r',scope,comparison:fresh};const Native=nativeClass({shared:()=>selected,setShared:()=>{}});const view=Object.create(Native.prototype);view.role='full';view.selectionKey='key';view.controller={state:{repo:{root:'/r'},comparison:old},selectResolved:async c=>{view.controller.state.comparison=c;},base:()=>''};view.inputs={folder:{set_value(){}},base:{set_value(){}}};view.work=(_cx,fn)=>view.pending=fn();view.syncComposer=()=>{};let fire;
 view.deferSync({timer:{after:(_ms,fn)=>fire=fn}});assert.equal(view.controller.state.comparison.targetOid,'old');fire({});await view.pending;assert.equal(view.controller.state.comparison.targetOid,'new');
});
test('finished recipient is rejected before sending and keeps drafts intact',async()=>{
 const data=new Map(),store={get:k=>data.get(k),set:(k,v)=>data.set(k,v)};const controller=new Controller({run,store,sessionId:'s'});controller.addComment({id:'d',repoKey:'r',comparisonId:'c',newPath:'a'},'fix','d');let deliveries=0;
 const Native=nativeClass({shared:store.get,setShared:store.set,uid:()=>String(Math.random()),buildBatch,submit:createSubmitter(),terminals:()=>[{id:'dead',state:'finished'}],exec:async()=>{deliveries++;return {code:0};}});const view=Object.create(Native.prototype);view.controller=controller;view.batch=buildBatch(controller.session(),[],{agentAddress:'dead'});view.work=(_cx,fn)=>view.pending=fn();view.send({});try{await view.pending;}catch{}
 assert.equal(deliveries,0);assert.equal(controller.session().drafts.length,1);assert.equal(controller.session().submittedBatches.length,0);
});
