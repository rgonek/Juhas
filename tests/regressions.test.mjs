import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,unlinkSync,renameSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {fixture,run} from './helpers/repos.mjs';
import {resolveRepo} from '../mods/juhas/repositories.js';
import {resolveComparison} from '../mods/juhas/comparisons.js';
import {loadPatch,listChangedFiles,parsePatch} from '../mods/juhas/diff.js';
import {Controller} from '../mods/juhas/controller.js';
import {createSubmitter} from '../mods/juhas/submit.js';
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
test('oversized long-line patch is rejected before row parsing and remains explicit',async t=>{
 const f=fixture(t);f.commit('base\n','large.txt');
 const huge='x'.repeat(5*1024*1024),many=Array.from({length:22000},(_,i)=>`row-${i}`).join('\n');
 writeFileSync(join(f.root,'large.txt'),`${huge}\n${many}\n`);
 const repo=await resolveRepo(run,null,f.root),comparison=await resolveComparison(run,repo,{kind:'working-tree',baseRef:'HEAD'});
 const file=(await listChangedFiles(run,comparison))[0],started=performance.now();
 const largeRun=async(root,args)=>{const r=spawnSync('git',args,{cwd:root.root,encoding:'utf8',maxBuffer:16*1024*1024});return {code:r.status??1,stdout:r.stdout??'',stderr:r.stderr??r.error?.message??''};};
 const patch=await loadPatch(largeRun,comparison,file),elapsed=Math.round(performance.now()-started);
 assert.equal(patch.complete,false);assert.equal(patch.reason,'Diff exceeds 4194304 bytes');assert.deepEqual(patch.hunks,[]);
 assert.ok(elapsed<10000,`bounded patch preparation took ${elapsed}ms`);
});
test('selected contiguous commit range can include the root commit',async t=>{
 const f=fixture(t);const first=f.commit('a');f.commit('b');const repo=await resolveRepo(run,null,f.root);const c=await resolveComparison(run,repo,{kind:'range',base:first,target:'HEAD',includeBase:true});assert.equal(c.baseOid,null);assert.equal((await listChangedFiles(run,c))[0].status,'A');
});

test('deleted mode-only and nested Unicode binary paths preserve metadata and patch semantics',async t=>{const f=fixture(t),path="nested folder/żółć [binary] ' file.bin";mkdirSync(join(f.root,'nested folder'));writeFileSync(join(f.root,'gone.txt'),'removed line\n');writeFileSync(join(f.root,'mode.txt'),'mode stays\n');f.git('add','.');f.git('commit','-m','base');const base=f.git('rev-parse','HEAD');unlinkSync(join(f.root,'gone.txt'));f.git('add','-u');f.git('update-index','--chmod=+x','--','mode.txt');f.git('commit','-m','delete and mode');const repo=await resolveRepo(run,null,f.root),c=await resolveComparison(run,repo,{kind:'range',base,target:'HEAD'}),files=await listChangedFiles(run,c),deleted=files.find(x=>x.newPath==='gone.txt'),mode=files.find(x=>x.newPath==='mode.txt');assert.equal(deleted.status,'D');assert.ok((await loadPatch(run,c,deleted)).hunks.flatMap(h=>h.lines).some(l=>l.side==='old'&&l.text==='removed line'));assert.notEqual(mode.oldMode,mode.newMode);assert.equal((await loadPatch(run,c,mode)).modeOnly,true);writeFileSync(join(f.root,path),Buffer.from([0,1,2,255]));const working=await resolveComparison(run,repo,{kind:'working-tree'}),binary=(await listChangedFiles(run,working)).find(x=>x.newPath===path);assert.ok(binary?.untracked);assert.equal((await loadPatch(run,working,binary)).binary,true);});

test('long nested Unicode renamed paths load with Git longpaths enabled',async t=>{const f=fixture(t);f.git('config','core.longpaths','true');const dir=['a'.repeat(70),'b'.repeat(70),'c'.repeat(70)].join('/');mkdirSync(join(f.root,dir),{recursive:true});const oldPath=dir+"/old żółć [a] ' file.txt",newPath=dir+"/new żółć [a] ' file.txt";assert.ok(join(f.root,newPath).length>260);const content=Array.from({length:100},(_,i)=>'stable line '+i).join('\n')+'\n';writeFileSync(join(f.root,oldPath),content);f.git('add','.');f.git('commit','-m','long base');renameSync(join(f.root,oldPath),join(f.root,newPath));writeFileSync(join(f.root,newPath),content+'added line\n');f.git('add','-A');f.git('commit','-m','long rename');const repo=await resolveRepo(run,null,f.root),c=await resolveComparison(run,repo,{kind:'commit',commit:'HEAD'}),files=await listChangedFiles(run,c);assert.equal(files.length,1);assert.equal(files[0].status,'R');assert.equal(files[0].oldPath,oldPath);assert.equal(files[0].newPath,newPath);assert.ok((await loadPatch(run,c,files[0])).hunks.flatMap(h=>h.lines).some(l=>l.text==='added line'));});
