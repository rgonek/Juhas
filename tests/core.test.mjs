import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,renameSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,run,directories} from './helpers/repos.mjs';
import {resolveRepo,discoverRepos} from '../mods/git-review/repositories.js';
import {resolveConfig,suggestBases} from '../mods/git-review/config.js';
import {resolveComparison} from '../mods/git-review/comparisons.js';
import {listHistory,listRefs} from '../mods/git-review/history.js';
import {listChangedFiles,loadPatch} from '../mods/git-review/diff.js';
import {createCache,createRequestGate} from '../mods/git-review/cache.js';
import {layoutGraph} from '../mods/git-review/graph.js';
import {createSession,addDraft,reconcileDrafts,markSeen,deleteCheckpoint} from '../mods/git-review/review.js';
import {loadSession,mutateSession} from '../mods/git-review/storage.js';
import {buildBatch,createSubmitter} from '../mods/git-review/submit.js';

test('repo identity isolates linked worktrees and canonicalises a subfolder',async t=>{
 const f=fixture(t);f.commit('one\n');const sub=join(f.root,'sub');mkdirSync(sub);
 const a=await resolveRepo(run,null,f.root);const b=await resolveRepo(run,null,sub);assert.equal(a.key,b.key);
 const wt=join(f.parent,'worktree');f.git('worktree','add','-b','feature',wt);
 const c=await resolveRepo(run,null,wt);assert.notEqual(a.key,c.key);assert.equal(a.commonDir,c.commonDir);
 assert.equal(await resolveRepo(run,null,f.parent),null);
 const discovered=await discoverRepos(run,directories,null,f.parent,{maxDepth:3,maxRepos:1});assert.equal(discovered.repos.length,1);assert.equal(discovered.complete,false);
 assert.equal(f.git('status','--porcelain'),'');
});
test('config is generic, explicit branch selection overrides all suggestions',()=>{
 assert.equal(resolveConfig({baseRef:'trunk'},{baseRef:'release'},{baseRef:'custom'}).baseRef,'custom');
 assert.deepEqual(suggestBases(['trunk','release'],'feature/thing',[]),[]);
 assert.deepEqual(suggestBases(['integration/thing'],'feature/thing',[{prefix:'feature/',basePrefix:'integration/'}]).map(s=>s.ref),['integration/thing']);
 assert.deepEqual(suggestBases(['trunk'],'other',[{prefix:'feature/',basePrefix:'integration/'}]),[]);
});
test('root commits, merge parents and branch merge-base have exact semantics',async t=>{
 const f=fixture(t);const root=f.commit('one\n');const repo=await resolveRepo(run,null,f.root);
 const first=await resolveComparison(run,repo,{kind:'commit',commit:root,parentIndex:0});assert.equal(first.targetOid,root);assert.equal((await listChangedFiles(run,first))[0].status,'A');
 f.git('checkout','-b','feature');const feature=f.commit('two\n');f.git('checkout','trunk');f.commit('release\n','release.txt');f.git('merge','--no-ff','feature','-m','merge');
 const a=await resolveComparison(run,repo,{kind:'commit',commit:'HEAD',parentIndex:1});assert.equal(a.baseOid,feature);
 const b=await resolveComparison(run,repo,{kind:'branch',baseRef:'trunk',targetRef:'feature'});assert.equal(b.baseOid,feature);
 await assert.rejects(()=>resolveComparison(run,repo,{kind:'commit',commit:'HEAD',parentIndex:8}),/parent/i);
 await assert.rejects(()=>resolveComparison(run,repo,{kind:'range',base:'--all',target:'HEAD'}),/revision/i);
});
test('branch comparison excludes integration-only changes',async t=>{
 const f=fixture(t);const root=f.commit('base\n');f.git('checkout','-b','feature');const tip=f.commit('change\n');f.git('checkout','trunk');f.commit('release\n','release.txt');
 const repo=await resolveRepo(run,null,f.root);const c=await resolveComparison(run,repo,{kind:'branch',baseRef:'trunk',targetRef:'feature'});
 assert.equal(c.baseOid,root);assert.equal(c.targetOid,tip);assert.deepEqual((await listChangedFiles(run,c)).map(f=>f.newPath),['file.txt']);
});
test('history pages pin a revision, search and refs are usable',async t=>{
 const f=fixture(t);f.commit('a');f.commit('b');const head=f.commit('c');const repo=await resolveRepo(run,null,f.root);
 const page=await listHistory(run,repo,{ref:head,limit:2});assert.equal(page.commits.length,2);assert.equal(page.hasMore,true);assert.equal(page.commits[0].oid,head);
 f.commit('d');const next=await listHistory(run,repo,{ref:head,skip:2,limit:2});assert.equal(next.commits.length,1);assert.notEqual(page.commits[1].oid,next.commits[0].oid);
 assert.equal((await listHistory(run,repo,{ref:head,query:'change b'})).commits.length,1);
 assert.equal((await listHistory(run,repo,{ref:head,query:head.slice(0,10)})).commits[0].oid,head);
 assert.ok((await listRefs(run,repo)).some(r=>r.name==='trunk'));
});
test('diff maps removed/new lines, Unicode rename and explicit limits',async t=>{
 const f=fixture(t);f.commit('one\ntwo\n');const base=f.git('rev-parse','HEAD');renameSync(join(f.root,'file.txt'),join(f.root,"new żółć ' name.txt"));writeFileSync(join(f.root,"new żółć ' name.txt"),'one\nthree\n');f.git('add','-A');f.git('commit','-m','rename');
 const repo=await resolveRepo(run,null,f.root);const c=await resolveComparison(run,repo,{kind:'range',base,target:'HEAD'});const files=await listChangedFiles(run,c);assert.equal(files.length,1);assert.equal(files[0].oldPath,'file.txt');assert.equal(files[0].newPath,"new żółć ' name.txt");
 const patch=await loadPatch(run,c,files[0]);const lines=patch.hunks.flatMap(h=>h.lines);assert.ok(lines.some(l=>l.text==='two'&&l.oldLine===2&&l.newLine===null));assert.ok(lines.some(l=>l.text==='three'&&l.newLine===2));
 assert.equal((await loadPatch(run,c,files[0],{maxBytes:20})).complete,false);
});
test('binary changes are visible and never treated as empty text',async t=>{
 const f=fixture(t);const base=f.commit('a');writeFileSync(join(f.root,'binary'),Buffer.from([0,1,2]));f.git('add','binary');f.git('commit','-m','binary');const repo=await resolveRepo(run,null,f.root);
 const c=await resolveComparison(run,repo,{kind:'range',base,target:'HEAD'});const file=(await listChangedFiles(run,c))[0];const patch=await loadPatch(run,c,file);assert.equal(patch.binary,true);
});
test('working tree includes untracked, excludes ignored and does not modify index',async t=>{
 const f=fixture(t);f.commit('a');writeFileSync(join(f.root,'.gitignore'),'ignored\n');writeFileSync(join(f.root,'ignored'),'secret');writeFileSync(join(f.root,'new.txt'),'new');const before=f.git('status','--porcelain');const repo=await resolveRepo(run,null,f.root);
 const c=await resolveComparison(run,repo,{kind:'working-tree',baseRef:'HEAD'});const files=await listChangedFiles(run,c);assert.ok(files.some(x=>x.newPath==='new.txt'));assert.ok(!files.some(x=>x.newPath==='ignored'));assert.equal(f.git('status','--porcelain'),before);
 const patch=await loadPatch(run,c,files.find(x=>x.newPath==='new.txt'));assert.equal(patch.hunks[0].lines[0].text,'new');
});
test('bounded cache evicts old data and request gate rejects late results',()=>{
 const c=createCache({maxEntries:2,maxBytes:40});c.set('a','1234567890');c.set('b','1234567890');c.get('a');c.set('c','1234567890');assert.equal(c.get('b'),undefined);assert.equal(c.get('a'),'1234567890');
 const gate=createRequestGate();const a=gate.begin('a');const b=gate.begin('b');assert.equal(gate.isCurrent(a),false);assert.equal(gate.isCurrent(b),true);
});
test('graph lanes remain stable across pages and octopus parents',()=>{
 const first=layoutGraph([{oid:'a',parents:['b','c','d']}]);assert.equal(first.rows[0].lane,0);assert.equal(first.rows[0].edges.length,3);
 const second=layoutGraph([{oid:'b',parents:['e']}],first.continuation);assert.equal(second.rows[0].lane,0);assert.ok(second.continuation.includes('c'));
});
test('persistent drafts survive reload, cross-repo edits and outdated comparison',()=>{
 const map=new Map();const store={get:k=>map.get(k),set:(k,v)=>map.set(k,JSON.parse(JSON.stringify(v)))};
 mutateSession(store,'one',s=>addDraft(s,{id:'a',repoKey:'repo1',comparisonId:'c1',body:'fix',quote:'old',side:'old',startLine:2,endLine:2}));
 mutateSession(store,'one',s=>addDraft(s,{id:'b',repoKey:'repo2',comparisonId:'c2',body:'other',quote:'code'}));
 const loaded=loadSession(store,'one');assert.equal(loaded.drafts.length,2);const updated=reconcileDrafts(loaded,['c2']);assert.equal(updated.drafts[0].status,'outdated');assert.equal(updated.drafts[0].quote,'old');assert.equal(updated.drafts[1].status,'current');
 store.set('git-review.v1.session.bad',{schemaVersion:99});assert.throws(()=>loadSession(store,'bad'),/version|invalid/i);
});
test('checkpoint retains rewritten commit and since-review compares exact trees',async t=>{
 const f=fixture(t);const a=f.commit('a');const repo=await resolveRepo(run,null,f.root);const comparison=await resolveComparison(run,repo,{kind:'commit',commit:a,parentIndex:0});const cp=await markSeen(run,repo,comparison);
 const b=f.commit('b');const next=await resolveComparison(run,repo,{kind:'since-review',checkpointId:cp.id,targetRef:b},[cp]);assert.equal(next.baseOid,a);assert.equal(next.targetOid,b);assert.equal(f.git('rev-parse',cp.refName),a);
 await assert.rejects(()=>resolveComparison(run,repo,{kind:'since-review',checkpointId:'missing',targetRef:b},[cp]),/checkpoint/i);
 await deleteCheckpoint(run,repo,cp);assert.notEqual((await run(repo,['show-ref','--verify',cp.refName])).code,0);
});
test('multi-repo batch is deterministic and preserves source revisions',()=>{
 let s=createSession('s');s=addDraft(s,{id:'2',repoKey:'b',comparisonId:'c2',baseOid:'bb',targetOid:'tt',newPath:'z',body:'Fix B',quote:'old',side:'old',startLine:3,endLine:4});s=addDraft(s,{id:'1',repoKey:'a',comparisonId:'c1',baseOid:'aa',targetOid:'zz',newPath:'x',body:'Fix A',quote:'code',side:'new',startLine:1,endLine:1});
 const batch=buildBatch(s,[{id:'c1',repoKey:'a',root:'/a'},{id:'c2',repoKey:'b',root:'/b'}],{agentAddress:'t1',note:'Review',includeGitContext:true});assert.ok(batch.text.indexOf('Fix A')<batch.text.indexOf('Fix B'));assert.match(batch.text,/bb/);assert.match(batch.text,/old.*3-4/);assert.deepEqual(batch.draftIds,['1','2']);assert.ok(batch.utf8Bytes>0);
});
test('submit deduplicates in-flight batch and retains uncertain results',async()=>{
 let resolve;let delivered=0;const transport={send:()=>{delivered++;return new Promise(r=>resolve=r);}};const submit=createSubmitter();const batch={id:'batch',agentAddress:'t1',text:'review',utf8Bytes:6};
 const first=submit(batch,transport);const second=submit(batch,transport);resolve({ok:true});assert.equal((await first).state,'sent');assert.equal((await second).state,'sent');assert.equal(delivered,1);
 const uncertain=await submit({...batch,id:'unknown'},{send:async()=>{throw new Error('timeout');}});assert.equal(uncertain.state,'unknown');
 const repeat=await submit({...batch,id:'unknown'},transport);assert.equal(repeat.state,'unknown');assert.equal(delivered,1);
});
