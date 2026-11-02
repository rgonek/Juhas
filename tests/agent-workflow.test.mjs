import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,run} from './helpers/repos.mjs';
import {Controller} from '../mods/juhas/controller.js';
import {commentTarget} from '../mods/juhas/comments.js';
import {buildBatch} from '../mods/juhas/submit.js';
import {listHistory} from '../mods/juhas/history.js';
import {lastCheckpoint} from '../mods/juhas/review.js';
const store=()=>{const data=new Map();return {get:k=>data.get(k),set:(k,v)=>data.set(k,structuredClone(v))};};
test('Git ancestry errors preserve draft statuses and do not silently select another checkpoint',async()=>{
 const fail=async(_repo,args)=>args[0]==='symbolic-ref'?{code:0,stdout:'feature'}:args[0]==='rev-parse'?{code:0,stdout:'a'.repeat(40)}:{code:128,stderr:'Unable to read repository'};
 const c=new Controller({run:fail,store:store()});c.state.repo={key:'r'};c.state.comparison={id:'comparison'};c.mutate(s=>({...s,drafts:[{id:'d',repoKey:'r',comparisonId:'comparison',targetOid:'b'.repeat(40),status:'current'}]}));
 await assert.rejects(()=>c.reconcileComments(c.state.comparison),/Unable to read/);assert.equal(c.session().drafts[0].status,'current');
 await assert.rejects(()=>lastCheckpoint(fail,c.state.repo,'feature',[{id:'cp',repoKey:'r',branch:'feature',targetOid:'b'.repeat(40)}]),/Unable to read/);
});
test('checkpoint choice skips rewritten ancestry, foreign worktrees and unknown legacy branch metadata',async()=>{
 const valid='a'.repeat(40),rewritten='b'.repeat(40),calls=[],runner=async(_repo,args)=>{if(args[0]==='symbolic-ref')return {code:0,stdout:'feature'};if(args[0]==='rev-parse')return {code:0,stdout:'c'.repeat(40)};calls.push(args[2]);return {code:args[2]===valid?0:1};};
 const checkpoints=[{id:'valid',repoKey:'r',branch:'feature',targetOid:valid,markedAt:1},{id:'rewritten',repoKey:'r',branch:'feature',targetOid:rewritten,markedAt:2},{id:'legacy',repoKey:'r',targetOid:valid,markedAt:3},{id:'foreign',repoKey:'other',branch:'feature',targetOid:valid,markedAt:4}];
 assert.equal((await lastCheckpoint(runner,{key:'r'},'feature',checkpoints)).id,'valid');assert.deepEqual(calls,[rewritten,valid]);
});
async function setup(t){const f=fixture(t);const base=f.commit('base\n');f.git('checkout','-b','feature/topic');const first=f.commit('intermediate\n'),head=f.commit('final\n');const c=new Controller({run,store:store()});await c.openRepo(null,f.root);return {f,c,base,first,head};}
test('agent review uses final branch trees, feature history and exclusive manual baselines',async t=>{
 const {c,base,first,head}=await setup(t);await c.setHistoryBase('trunk');await c.loadHistory({exclude:c.state.featureBaseOid});assert.deepEqual(c.state.history.map(x=>x.oid),[head,first]);
 await c.selectScope({kind:'commit',commit:head});await c.selectFile(c.state.files[0].id);assert.equal(c.state.comparison.baseOid,first);assert.equal(c.state.comparison.commitCount,1);assert.match(c.state.patch.hunks[0].lines.map(x=>x.text).join('\n'),/intermediate/);
 await c.selectScope({kind:'branch',baseRef:'trunk',targetRef:'HEAD'});await c.selectFile(c.state.files[0].id);assert.equal(c.state.comparison.baseOid,base);assert.equal(c.state.comparison.commitCount,2);const text=c.state.patch.hunks[0].lines.map(x=>x.text).join('\n');assert.match(text,/final/);assert.doesNotMatch(text,/intermediate/);
 await c.selectScope({kind:'range',base:first,target:'HEAD',includeBase:false});assert.equal(c.state.comparison.baseOid,first);assert.equal(c.state.comparison.commitCount,1);
});
test('comments across commit and branch views retain revisions and batch together; amend invalidates only removed source',async t=>{
 const {c,f,first,head}=await setup(t);for(const id of [first,head]){await c.selectScope({kind:'commit',commit:id});await c.selectFile(c.state.files[0].id);const line=c.state.patch.hunks[0].lines.find(l=>l.side==='new');c.addComment(commentTarget(c.state.comparison,c.state.file,line),'fix '+id,id);}
 const original=c.session().drafts.map(d=>({targetOid:d.targetOid,quote:d.quote,startLine:d.startLine}));await c.selectScope({kind:'branch',baseRef:'trunk',targetRef:'HEAD'});assert.deepEqual(c.session().drafts.map(d=>d.status),['current','current']);assert.deepEqual(c.session().drafts.map(d=>({targetOid:d.targetOid,quote:d.quote,startLine:d.startLine})),original);assert.equal(buildBatch(c.session(),[c.state.comparison]).draftIds.length,2);
 f.git('commit','--amend','-m','amended');await c.refresh();assert.deepEqual(c.session().drafts.map(d=>d.status),['current','outdated']);
});
test('automatic checkpoints are scoped to worktree, branch and ancestry; mark seen pins the selected commit',async t=>{
 const {c,f,first,head}=await setup(t);await c.selectScope({kind:'commit',commit:first});const cp=await c.markSeen();assert.equal(cp.targetOid,first);assert.equal(cp.branch,'feature/topic');assert.equal((await c.lastCheckpoint()).id,cp.id);
 await c.selectScope({kind:'since-review',checkpointId:cp.id,targetRef:'HEAD'});assert.equal(c.state.comparison.baseOid,first);assert.equal(c.state.comparison.targetOid,head);
 f.git('checkout','-b','other');await assert.rejects(()=>c.lastCheckpoint(),/Branch context changed/);await c.refresh();assert.equal(await c.lastCheckpoint(),null);
 c.mutate(s=>({...s,checkpoints:[...s.checkpoints,{...cp,id:'foreign',repoKey:'other',branch:'other'},{...cp,id:'legacy',branch:undefined}]}));assert.equal(await c.lastCheckpoint(),null);
});
test('history falls back to HEAD without a usable base and advanced full/all browsing remains available',async t=>{
 const {c,head}=await setup(t);await c.setHistoryBase('missing');assert.equal(c.state.featureBaseOid,null);assert.match(c.state.historyBaseError,/./);await c.loadHistory();assert.equal(c.state.history[0].oid,head);await c.loadHistory({ref:'all',remotes:false});assert.equal(c.state.historyRef,'all');
});
test('feature history preserves merged commits, pinned pagination and bounded hash queries',async t=>{
 const {c,f,base,first,head}=await setup(t);f.git('checkout','-b','feature/helper',first);const helper=f.commit('helper\n','helper.txt');f.git('checkout','feature/topic');f.git('merge','--no-ff','feature/helper','-m','Merge helper');const merge=f.git('rev-parse','HEAD');await c.refresh();await c.setHistoryBase('trunk');
 const options={exclude:c.state.featureBaseOid,limit:2};const page=await listHistory(run,c.state.repo,options);const next=await listHistory(run,c.state.repo,{...options,ref:page.ref,skip:2});assert.deepEqual(new Set([...page.commits,...next.commits].map(c=>c.oid)),new Set([merge,helper,head,first]));assert.equal(page.hasMore,true);assert.equal(page.commits[0].parents.length,2);
 assert.equal((await listHistory(run,c.state.repo,{...options,query:base.slice(0,8)})).commits.length,0);assert.equal((await listHistory(run,c.state.repo,{...options,query:helper.slice(0,8)})).commits[0].oid,helper);
 await c.selectScope({kind:'commit',commit:merge,parentIndex:1});assert.equal(c.state.comparison.baseOid,helper);
});
