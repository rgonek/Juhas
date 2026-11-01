import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,run} from './helpers/repos.mjs';
import {resolveRepo} from '../mods/git-review/repositories.js';
import {resolveComparison} from '../mods/git-review/comparisons.js';
import {loadPatch,listChangedFiles,parsePatch} from '../mods/git-review/diff.js';
import {Controller} from '../mods/git-review/controller.js';
import {createSubmitter} from '../mods/git-review/submit.js';
test('working tree identity stays stable until contents actually change',async t=>{
 const f=fixture(t);f.commit('base');writeFileSync(join(f.root,'new.txt'),'one');const repo=await resolveRepo(run,null,f.root);
 const scope={kind:'working-tree',baseRef:'HEAD'};const a=await resolveComparison(run,repo,scope);const b=await resolveComparison(run,repo,scope);assert.equal(a.id,b.id);
 writeFileSync(join(f.root,'new.txt'),'two');const c=await resolveComparison(run,repo,scope);assert.notEqual(a.id,c.id);
});
test('full SHA-256 root commit and unusual literal filenames load correctly',async t=>{
 const f=fixture(t,{format:'sha256'});const root=f.commit('a\r\nb',"literal [a] ' żółć.txt");const repo=await resolveRepo(run,null,f.root);const c=await resolveComparison(run,repo,{kind:'commit',commit:root,parentIndex:0});assert.equal(c.targetOid.length,64);
 const file=(await listChangedFiles(run,c))[0];assert.equal(file.newPath,"literal [a] ' żółć.txt");const patch=await loadPatch(run,c,file);assert.equal(patch.hunks.flatMap(h=>h.lines).length,2);
});
test('since-review scope fails explicitly when history has no shared ancestor',async t=>{
 const f=fixture(t);f.commit('a');f.git('checkout','--orphan','other');f.commit('b');const repo=await resolveRepo(run,null,f.root);await assert.rejects(()=>resolveComparison(run,repo,{kind:'branch',baseRef:'trunk',targetRef:'other'}),/merge-base|Git exited/i);
});
test('history ref filter can browse a branch not reachable from HEAD',async t=>{
 const f=fixture(t);f.commit('base');f.git('checkout','-b','feature');const feature=f.commit('feature');f.git('checkout','trunk');const data=new Map();const c=new Controller({run,store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});await c.openRepo(null,f.root);await c.loadHistory({ref:'feature'});assert.equal(c.state.history[0].oid,feature);
});
test('old file result cannot overwrite a newer selection',async t=>{
 const f=fixture(t);f.commit('base');f.commit('first','one');f.commit('second','two');const data=new Map();let release;let held=false;
 const delayed=async(repo,args)=>{if(held&&args.includes(':(literal)one')){held=false;await new Promise(r=>release=r);}return run(repo,args);};
 const c=new Controller({run:delayed,store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});await c.openRepo(null,f.root);await c.selectScope({kind:'range',base:'trunk~2',target:'HEAD'});held=true;const first=c.selectFile(c.state.files.find(f=>f.newPath==='one').id);await Promise.resolve();const second=c.selectFile(c.state.files.find(f=>f.newPath==='two').id);await second;release();await first;assert.equal(c.state.file.newPath,'two');assert.equal(c.state.patch.hunks[0].lines[0].text,'second');
});
test('a definitive rejected delivery can be explicitly retried, an uncertain one cannot',async()=>{
 const submit=createSubmitter();const batch={id:'retry',text:'review',agentAddress:'t1',utf8Bytes:6};assert.equal((await submit(batch,{send:async()=>({rejected:true,error:'not found'})})).state,'failed');assert.equal((await submit(batch,{send:async()=>({ok:true})})).state,'sent');
});
test('truncated rows are never silently marked complete',()=>{const p=parsePatch('@@ -1,3 +1,3 @@\n a\n b\n c\n','file',{maxRows:2});assert.equal(p.complete,false);assert.equal(p.hunks[0].lines.length,1);});
test('selected contiguous commit range can include the root commit',async t=>{
 const f=fixture(t);const first=f.commit('a');f.commit('b');const repo=await resolveRepo(run,null,f.root);const c=await resolveComparison(run,repo,{kind:'range',base:first,target:'HEAD',includeBase:true});assert.equal(c.baseOid,null);assert.equal((await listChangedFiles(run,c))[0].status,'A');
});
