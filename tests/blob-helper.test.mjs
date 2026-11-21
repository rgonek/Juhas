import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRunner,git,withGitBudget} from '../mods/juhas/git.js';
import {observeWorking,workingLineCounts} from '../mods/juhas/working-observation.js';
import {fixture,run as gitOnlyRun} from './helpers/repos.mjs';

test('local working blob hashes use the helper through the Git budget',async()=>{
 const calls=[],hash='a'.repeat(64);
 const run=withGitBudget(createRunner(async(command,args,options)=>{
  calls.push({command,args,options});return {code:0,stdout:hash+'\n'};
 },'C:/app'),{maxCommands:1});
 const args=['hash-object','--no-filters','--','file.js'];
 assert.equal(await git(run,{root:'C:/repo'},args,{blobFormat:'sha256'}),hash+'\n');
 assert.deepEqual(calls,[{command:'C:/app/mods/juhas/helpers/juhas-blob-hash.exe',args:['--hash','sha256','file.js'],options:{cwd:'C:/repo',timeout:3000}}]);
 await assert.rejects(()=>git(run,{root:'C:/repo'},args,{blobFormat:'sha256'}),/budget/);
});

test('missing or invalid helper output falls back and remote hashes use Git',async()=>{
 const calls=[],hash='b'.repeat(40);
 const run=createRunner(async(command,args,options)=>{
  calls.push({command,args,options});
  return {code:0,stdout:command==='git'?hash+'\n':'bad output'};
 },'/herdr');
 const args=['hash-object','--no-filters','--','sample'];
 assert.equal(await git(run,{root:'/repo',machine:'remote'},args,{blobFormat:'sha1'}),hash+'\n');
 assert.equal(await git(run,{root:'/repo'},args,{blobFormat:'sha1'}),hash+'\n');
 assert.equal(await git(run,{root:'/repo'},args,{blobFormat:'sha1'}),hash+'\n');
 assert.deepEqual(calls.map(x=>x.command),['git','/herdr/mods/juhas/helpers/juhas-blob-hash','git','git']);
 assert.equal(calls[0].options.on,'remote');
});

test('context helper preserves source line numbers and returns null for remote or incomplete output',async()=>{
 const calls=[];
 const run=createRunner(async(command,args,options)=>{
  calls.push({command,args,options});return {code:0,stdout:'first\r\n\n'};
 },'C:/herdr');
 const repo={root:'C:/repo'},file={oldOid:'a'.repeat(40),newOid:'b'.repeat(40)};
 const gap={oldStart:4,newStart:9,count:2};
 assert.deepEqual((await run.contextRange(repo,file,gap)).hunks[0].lines,[
  {side:'context',oldLine:4,newLine:9,text:'first\r'},{side:'context',oldLine:5,newLine:10,text:''}
 ]);
 assert.deepEqual(calls[0].args,['--context',file.oldOid,'4',file.newOid,'9','2']);
 assert.equal(await run.contextRange({...repo,machine:'remote'},file,gap),null);
 assert.equal(calls.length,1);
 assert.equal(await run.contextRange(repo,file,{...gap,count:3}),null);
});

test('untrackedMetadata helper batches regular, binary, and fallback entries within Git budget',async()=>{
 const calls=[],oid1='a'.repeat(40),oid2='b'.repeat(40);
 const run=withGitBudget(createRunner(async(command,args,options)=>{
  calls.push({command,args,options});
  return {code:0,stdout:`100644\t12\t${oid1}\n100644\t-\t${oid2}\nFALLBACK\n`};
 },'C:/app'),{maxCommands:1});
 const res=await run.untrackedMetadata({root:'C:/repo'},['a.txt','img.bin','link'],{blobFormat:'sha1'});
 assert.deepEqual(res,[
  {mode:'100644',binary:false,additions:12,deletions:0,oid:oid1},
  {mode:'100644',binary:true,additions:null,deletions:null,oid:oid2},
  null,
 ]);
 assert.deepEqual(calls[0].args,['--untracked','sha1','a.txt','img.bin','link']);
 await assert.rejects(()=>run.untrackedMetadata({root:'C:/repo'},['x.txt']),/budget/);
});

test('compiled Rust --untracked helper matches Git diff --no-index byte-for-byte',async t=>{
 const helperBin=join(process.cwd(),'native','blob-hash','target','release','juhas-blob-hash'+(process.platform==='win32'?'.exe':''));
 if(!existsSync(helperBin)){t.skip('Rust helper binary not built');return;}
 const execFileAsync=promisify(execFile);
 const exec=async(cmd,args,{cwd,timeout=10000}={})=>{
  const bin=cmd.includes('juhas-blob-hash')?helperBin:cmd;
  try{
   const {stdout,stderr}=await execFileAsync(bin,args,{cwd,timeout,maxBuffer:64*1024*1024,encoding:'utf8',windowsHide:true});
   return {code:0,stdout,stderr};
  }catch(e){
   return {code:typeof e.code==='number'?e.code:1,stdout:e.stdout||'',stderr:e.stderr||e.message};
  }
 };
 const f=fixture(t);
 f.commit('base\n');
 writeFileSync(join(f.root,'empty.txt'),'');
 writeFileSync(join(f.root,'trailing-nl.txt'),'one\ntwo\n');
 writeFileSync(join(f.root,'no-trailing-nl.txt'),'one\ntwo');
 writeFileSync(join(f.root,'binary.bin'),Buffer.from([0x61,0x00,0x62,0x0a]));
 writeFileSync(join(f.root,'late-nul.txt'),Buffer.concat([Buffer.alloc(8100,0x61),Buffer.from([0x00,0x0a])]));
 const headTree=f.git('rev-parse','HEAD^{tree}');
 const repo={key:'parity',root:f.root,machine:null};

 const helperCalls=[];
 const helperRunner=createRunner(async(cmd,args,opts)=>{
  helperCalls.push([cmd,args]);
  return exec(cmd,args,opts);
 },'C:/fake-app');

 const [withGit,withHelper]=await Promise.all([
  observeWorking(gitOnlyRun,repo,headTree),
  observeWorking(helperRunner,repo,headTree),
 ]);
 assert.equal(withHelper.id,withGit.id);
 assert.deepEqual(withHelper.files,withGit.files);
 assert.equal(helperCalls.filter(([,args])=>args.includes('--no-index')).length,0,'no per-file git diff --no-index calls');
 assert.equal(helperCalls.filter(([,args])=>args[0]==='hash-object').length,0,'untracked files not hashed twice');
 assert.deepEqual(await workingLineCounts(helperRunner,repo),await workingLineCounts(gitOnlyRun,repo));
});
