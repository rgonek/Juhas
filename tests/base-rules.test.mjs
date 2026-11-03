import test from 'node:test';
import assert from 'node:assert/strict';
import * as config from '../mods/juhas/config.js';
const rules=[{pattern:'^feature/([^/]+)/[^/]+$',replacement:'integration/$1'}];
const refs=[{name:'integration/project-42',fullName:'refs/heads/integration/project-42'},{name:'trunk',fullName:'refs/heads/trunk'}];
test('capture rules resolve existing branches without project conventions in defaults',()=>{
 assert.deepEqual(config.resolveConfig().baseRules,[]);
 assert.equal(config.suggestBases(refs,'feature/project-42/task-9',rules)[0]?.ref,'refs/heads/integration/project-42');
 assert.deepEqual(config.suggestBases(refs,'feature/other/task-9',rules),[]);
 assert.deepEqual(config.suggestBases(refs,'unrelated',rules),[]);
});
test('manual base overrides rules; a sole automatic candidate is selected without saving it',()=>{
 assert.deepEqual(config.selectBase(refs,'feature/project-42/task-9',{baseRules:rules},'refs/heads/trunk'),{ref:'refs/heads/trunk',source:'manual'});
 assert.deepEqual(config.selectBase(refs,'feature/project-42/task-9',{baseRules:rules}),{ref:'refs/heads/integration/project-42',source:'auto'});
 assert.equal(config.selectBase(refs,'feature/project-42/task-9',{}),null);
});
test('remote-only matching works and multiple remotes or rules require explicit choice',()=>{
 const remote=name=>({name:name+'/integration/project-42',fullName:'refs/remotes/'+name+'/integration/project-42'});
 assert.equal(config.selectBase([remote('server')],'feature/project-42/task-9',{baseRules:rules}).ref,'refs/remotes/server/integration/project-42');
 assert.equal(config.selectBase([remote('one'),remote('two')],'feature/project-42/task-9',{baseRules:rules}),null);
 assert.equal(config.selectBase(refs,'feature/project-42/task-9',{baseRules:[...rules,{prefix:'feature/',basePrefix:''}]}).ref,'refs/heads/integration/project-42');
 assert.equal(config.selectBase(refs,'feature/project-42/task-9',{baseRules:[...rules,{pattern:'^feature/.*$',replacement:'trunk'}]}),null);
});
test('invalid capture rules fail configuration validation with a useful error',()=>{
 assert.throws(()=>config.resolveConfig({baseRules:[{pattern:'(',replacement:'target'}]}),/base rule/i);
 assert.throws(()=>config.resolveConfig({baseRules:[{pattern:'.*'}]}),/base rule/i);
});
test('optional local config tolerates only a missing file and exposes bad JSON or read errors',async()=>{
 assert.deepEqual(await config.readLocalConfig(async()=>'{"baseRules":[]}', '/local/config'),{baseRules:[]});
 assert.deepEqual(await config.readLocalConfig(async()=>null,'/missing-native'),{});
 assert.deepEqual(await config.readLocalConfig(async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});},'/missing'),{});
 await assert.rejects(()=>config.readLocalConfig(async()=>'{bad','/bad'),/configuration/i);
 await assert.rejects(()=>config.readLocalConfig(async()=>{throw Object.assign(new Error('denied'),{code:'EACCES'});},'/denied'),/denied/);
});
import {readFileSync} from 'node:fs';
function nativeBranchView(saved=''){
 let source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export default class')).replace('export default class Juhas extends View','class Juhas extends View');
 const Native=new Function('View','selectBase',source+'\nreturn Juhas;')(class{},config.selectBase),view=Object.create(Native.prototype),calls=[];let base='';
 view.config={baseRules:rules};view.inputs={base:{value:()=>base,set_value:v=>base=v},target:{value:()=> 'HEAD'}};view.controller={state:{refs,branch:'feature/project-42/task-9'},base:()=>saved,setBase:v=>{saved=v;calls.push(['save',v]);},selectScope:async scope=>calls.push(['scope',scope])};view.publish=()=>{};view.work=(_cx,action)=>view.pending=action();return {view,calls};
}
test('native Branch automatically applies a rule without pinning it as a manual override',async()=>{
 const {view,calls}=nativeBranchView();view.restoreBase();assert.equal(view.inputs.base.value(),'refs/heads/integration/project-42');assert.equal(view.baseSource,'auto');view.applyScope('branch',{notify(){}});await view.pending;
 assert.deepEqual(calls,[['scope',{kind:'branch',baseRef:'refs/heads/integration/project-42',targetRef:'HEAD'}]]);
});
test('native Branch preserves a manual choice and missing rule candidates open the chooser',async()=>{
 const {view,calls}=nativeBranchView('refs/heads/trunk');view.restoreBase();view.applyScope('branch',{notify(){}});await view.pending;assert.equal(view.baseSource,'manual');assert.equal(calls[0][1].baseRef,'refs/heads/trunk');
 const other=nativeBranchView();other.view.controller.state.refs=[];other.view.applyScope('branch',{notify(){}});await other.view.pending;assert.equal(other.view.panel,'refs');assert.deepEqual(other.calls,[]);
});

import {fixture,run} from './helpers/repos.mjs';
import {Controller} from '../mods/juhas/controller.js';
test('automatic rule compares HEAD from the chosen target common ancestor using real Git',async t=>{
 const f=fixture(t);const base=f.commit('base');f.git('branch','integration/project-42');f.git('checkout','-b','feature/project-42/task-9');const tip=f.commit('feature');
 const data=new Map(),controller=new Controller({run,store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});await controller.openRepo(null,f.root);
 const chosen=config.selectBase(controller.state.refs,controller.state.branch,{baseRules:rules},controller.base());assert.equal(chosen.source,'auto');await controller.selectScope({kind:'branch',baseRef:chosen.ref,targetRef:'HEAD'});assert.equal(controller.state.comparison.baseOid,base);assert.equal(controller.state.comparison.targetOid,tip);assert.equal(controller.base(),'');assert.equal(f.git('status','--porcelain'),'');
});
