import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixture,gitTool} from './helpers/repos.mjs';
import * as snapshots from '../mods/juhas/snapshots.js';
import {lastCheckpoint} from '../mods/juhas/review.js';
import {run} from './helpers/repos.mjs';
const exec=async(command,args,options)=>{assert.deepEqual(Object.keys(options).sort(),['cwd','on']);const r=spawnSync(command,args,{cwd:options.cwd,encoding:'utf8',env:process.platform==='win32'?{...process.env,PATH:join(gitTool('sh'),'..')+';'+process.env.PATH}:process.env});return {code:r.status??1,stdout:r.stdout||'',stderr:r.stderr||r.error?.message||''};};
function before(f){const index=join(f.root,'.git','index');return {index:existsSync(index)?readFileSync(index).toString('hex'):null,status:f.git('status','--porcelain=v1','--untracked-files=all'),head:f.git('symbolic-ref','HEAD'),refs:f.git('show-ref','--heads')};}
test('explicit snapshot includes staged, unstaged, untracked and excludes ignored without touching real checkout',async t=>{
 const f=fixture(t);f.commit('base\n');writeFileSync(join(f.root,'file.txt'),'staged\n');f.git('add','file.txt');writeFileSync(join(f.root,'file.txt'),'unstaged\n');writeFileSync(join(f.root,"untracked ' ż.txt"),'new\n');writeFileSync(join(f.root,'.gitignore'),'ignored\n');writeFileSync(join(f.root,'ignored'),'secret');const original=before(f),repo={root:f.root,key:'repo'};
 const cp=await snapshots.captureWorkingSnapshot(exec,repo,{branch:'trunk'});assert.equal(cp.kind,'working-snapshot');assert.equal(snapshots.checkpointBaseline(cp),cp.treeOid);assert.equal(f.git('rev-parse',cp.refName),cp.treeOid);assert.equal(f.git('show',cp.treeOid+':file.txt'),'unstaged');assert.equal(f.git('show',cp.treeOid+":untracked ' ż.txt"),'new');assert.ok(!f.git('ls-tree','-r','--name-only',cp.treeOid).includes('ignored'));assert.deepEqual(before(f),original);
 assert.equal((await lastCheckpoint(run,repo,'trunk',[cp]))?.id,cp.id);
 await snapshots.deleteWorkingSnapshot(exec,repo,cp);assert.equal(f.git('for-each-ref','refs/git-review/snapshots/'),'');assert.deepEqual(before(f),original);
 await assert.rejects(()=>snapshots.deleteWorkingSnapshot(exec,repo,{...cp,refName:'refs/heads/trunk'}),/Invalid snapshot/);
});
for(const platform of [null,'posix'])test(`same-size edit during ${platform||'native'} capture is rejected and temporary indexes are cleaned on success and failure`,async t=>{
 const f=fixture(t);f.commit('AAAA');const repo={root:f.root,key:'race'},original=before(f),temp=()=>readdirSync(tmpdir()).filter(n=>n.startsWith('juhas-snapshot-')).sort(),prior=temp();
 const portableExec=(command,args,options)=>exec(command==='sh'?gitTool('sh'):command,args,options);
 const race=async(command,args,options)=>{let injected=false;const modified=args.map(a=>{const needle=command==='sh'?'first=$(capture)':'$trees += G write-tree',replacement=command==='sh'?"first=$(capture)\nprintf BBBB > file.txt":"$trees += G write-tree; if ($pass -eq 1) { [IO.File]::WriteAllText((Join-Path (Get-Location) 'file.txt'), 'BBBB') }";if(a.includes(needle)){injected=true;return a.replace(needle,replacement);}return a;});assert.ok(injected,'the race must change the file between capture passes');return portableExec(command,modified,options);};
 await assert.rejects(()=>snapshots.captureWorkingSnapshot(race,repo,{branch:'trunk',platform}),/changed during snapshot/);assert.deepEqual(temp(),prior);assert.equal(f.git('for-each-ref','refs/git-review/snapshots/'),'');assert.equal(readFileSync(join(f.root,'.git','index')).toString('hex'),original.index);assert.equal(f.git('rev-parse','HEAD'),f.git('rev-parse','trunk'));assert.equal(readFileSync(join(f.root,'file.txt'),'utf8'),'BBBB');
 f.git('config','filter.broken.clean','exit 1');f.git('config','filter.broken.required','true');writeFileSync(join(f.root,'.gitattributes'),'file.txt filter=broken\n');
 await assert.rejects(()=>snapshots.captureWorkingSnapshot(portableExec,repo,{branch:'trunk',platform}),/Snapshot Git command failed|clean filter.*failed/s);assert.deepEqual(temp(),prior);
});
test('snapshot works before initial commit and failure leaves index and owned refs untouched',async t=>{
 const f=fixture(t);writeFileSync(join(f.root,'new.txt'),'first');const repo={root:f.root,key:'empty'},cp=await snapshots.captureWorkingSnapshot(exec,repo,{branch:'trunk'});assert.equal(f.git('show',cp.treeOid+':new.txt'),'first');assert.equal(existsSync(join(f.root,'.git','index')),false);await snapshots.deleteWorkingSnapshot(exec,repo,cp);
 await assert.rejects(()=>snapshots.captureWorkingSnapshot(exec,repo,{branch:'wrong'}),/Branch context changed/);assert.equal(f.git('for-each-ref','refs/git-review/snapshots/'),'');assert.equal(existsSync(join(f.root,'.git','index')),false);
 await assert.rejects(()=>snapshots.captureWorkingSnapshot(exec,repo,{branch:'trunk',maxBytes:1}),/limit/);assert.equal(f.git('for-each-ref','refs/git-review/snapshots/'),'');
});
test('portable sh capture carries argv/cwd/on without requiring a helper installed remotely',async t=>{
 const f=fixture(t);f.commit('base');writeFileSync(join(f.root,'file.txt'),'unix snapshot');const original=before(f),repo={root:f.root,key:'shell',machine:'remote-test'};
 const remote=async(command,args,options)=>{assert.equal(options.on,'remote-test');return exec(command==='sh'?gitTool('sh'):command,args,options);};
 const cp=await snapshots.captureWorkingSnapshot(remote,repo,{branch:'trunk',platform:'posix'});assert.equal(f.git('show',cp.treeOid+':file.txt'),'unix snapshot');assert.deepEqual(before(f),original);await snapshots.deleteWorkingSnapshot(remote,repo,cp);
 f.git('config','filter.broken.clean','exit 1');f.git('config','filter.broken.required','true');writeFileSync(join(f.root,'.gitattributes'),'file.txt filter=broken\n');await assert.rejects(()=>snapshots.captureWorkingSnapshot(remote,repo,{branch:'trunk',platform:'posix'}),/clean filter.*failed/s);assert.equal(f.git('for-each-ref','refs/git-review/snapshots/'),'');
});
