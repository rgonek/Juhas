import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunner,git,withGitBudget} from '../mods/juhas/git.js';

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
