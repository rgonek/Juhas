import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,run} from './helpers/repos.mjs';
import {listRefs} from '../mods/juhas/history.js';
import {resolveAutomaticBase} from '../mods/juhas/automatic-base.js';
const repo=f=>({root:f.root,key:f.root});
async function resolve(f,extra={}){return resolveAutomaticBase(run,repo(f),{branch:f.git('branch','--show-current'),refs:await listRefs(run,repo(f)),...extra});}
function graph(t){const f=fixture(t);f.commit('root');f.git('branch','main');f.git('switch','-c','epic');f.commit('epic');f.git('switch','-c','task','HEAD');f.commit('task');return f;}
test('reflog identifies the creation branch without naming rules',async t=>{const f=graph(t);f.git('switch','-c','other','epic');f.commit('other');f.git('switch','task');const result=await resolve(f);assert.equal(result.ref,'refs/heads/epic');assert.equal(result.source,'reflog');});
test('graph picks the closer base when the creation reflog is unavailable',async t=>{const f=graph(t);f.git('reflog','expire','--expire=all','--all');const result=await resolve(f);assert.equal(result.ref,'refs/heads/epic');assert.equal(result.source,'history');});
test('equally plausible bases remain ambiguous instead of falling back to main',async t=>{const f=graph(t);f.git('branch','other','epic');f.git('reflog','expire','--expire=all','--all');const result=await resolve(f);assert.equal(result.ref,null);assert.deepEqual(result.candidates.map(c=>c.ref).sort(),['refs/heads/epic','refs/heads/other']);});
test('configured rules take precedence and Git branch metadata works without rules',async t=>{const f=graph(t);f.git('config','branch.task.t3-merge-base','main');assert.equal((await resolve(f)).ref,'refs/heads/main');assert.equal((await resolve(f,{config:{baseRef:'epic'}})).ref,'refs/heads/epic');});
test('default fallback prefers the remote and excludes the task own upstream',async t=>{const f=fixture(t);const root=f.commit('root');f.git('branch','main');f.git('update-ref','refs/remotes/origin/main',root);f.git('symbolic-ref','refs/remotes/origin/HEAD','refs/remotes/origin/main');f.git('switch','-c','task','HEAD');const task=f.commit('task');f.git('update-ref','refs/remotes/origin/task',task);f.git('reflog','expire','--expire=all','--all');const result=await resolve(f);assert.equal(result.ref,'refs/remotes/origin/main');});
test('a configured missing ref reports unavailable rather than changing the base',async t=>{const f=graph(t);const result=await resolve(f,{config:{baseRef:'missing'}});assert.equal(result.ref,null);assert.match(result.reason,/unavailable/i);});
test('a graph budget limit does not silently select from an incomplete candidate set',async t=>{const f=graph(t);f.git('reflog','expire','--expire=all','--all');const result=await resolve(f,{maxCandidates:1});assert.equal(result.ref,null);assert.match(result.reason,/many/i);});
import {Controller} from '../mods/juhas/controller.js';
test('controller keeps inferred base stable and recalculates only on explicit Automatic',async t=>{
 const f=graph(t),data=new Map(),calls=[];const c=new Controller({run:async(r,a)=>{calls.push(a);return run(r,a);},store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});await c.openRepo(null,f.root,{loadHistory:false});
 const first=await c.ensureAutomaticBase({});assert.equal(first.ref,'refs/heads/epic');const count=calls.length;await c.ensureAutomaticBase({});assert.equal(calls.length,count);
 f.git('branch','other','epic');f.git('reflog','expire','--expire=all','--all');c.state.refs=await listRefs(run,repo(f));assert.equal((await c.ensureAutomaticBase({})).ref,first.ref);assert.equal((await c.ensureAutomaticBase({},{force:true})).ref,null);
});
test('a manual selection supersedes an in-flight automatic result',async()=>{
 const data=new Map();let release;const pending=new Promise(resolve=>release=resolve),r={key:'race',root:'unused'};
 const c=new Controller({run:async()=>pending,store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});Object.assign(c.state,{repo:r,branch:'task',refs:[{name:'main',fullName:'refs/heads/main'}],empty:false});
 const work=c.ensureAutomaticBase({baseRef:'main'});c.setBase('refs/heads/other');release({code:0,stdout:'a'.repeat(40),stderr:''});assert.equal(await work,null);assert.equal(c.state.automaticChoice,undefined);assert.equal(c.base(),'refs/heads/other');
});
test('a newly created task retains its recorded epic base before its first commit',async t=>{const f=fixture(t);f.commit('main');f.git('branch','main');f.git('switch','-c','epic');f.commit('epic');f.git('switch','-c','task');assert.equal((await resolve(f)).ref,'refs/heads/epic');});
test('conflicting configured rules ask for a choice before reflog inference',async t=>{const f=graph(t);f.git('branch','other','epic');const result=await resolve(f,{config:{baseRules:[{pattern:'.*',replacement:'epic'},{pattern:'.*',replacement:'other'}]}});assert.equal(result.ref,null);assert.equal(result.candidates.length,2);});
test('creation evidence is ignored when a task was moved onto another history',async t=>{const f=graph(t);f.git('switch','main');f.commit('new main');f.git('switch','task');f.git('reset','--hard','main');f.commit('new task');const result=await resolve(f);assert.equal(result.ref,'refs/heads/main');assert.notEqual(result.source,'reflog');});
