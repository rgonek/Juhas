import test from 'node:test';
import assert from 'node:assert/strict';
import {observeWorking} from '../mods/juhas/working-observation.js';

const paths=Array.from({length:11},(_,i)=>`new-${i}.txt`);
const raw=path=>`:000000 100644 ${'0'.repeat(40)} ${'0'.repeat(40)} A\0/dev/null\0${path}\0${1}\t0\t\0/dev/null\0${path}\0`;
test('untracked observation uses bounded concurrency and preserves Git path order',async()=>{
 let active=0,peak=0;
 const run=async(_repo,args)=>{
  if(args[0]==='ls-files')return {code:0,stdout:paths.join('\0')+'\0'};
  if(args.includes('--no-index')){const path=args.at(-1);active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,(11-paths.indexOf(path))*2));active--;return {code:1,stdout:raw(path)};}
  if(args[0]==='hash-object')return {code:0,stdout:args.slice(3).map((_,i)=>String(i+1).padStart(40,'a')).join('\n')+'\n'};
  return {code:0,stdout:''};
 };
 const result=await observeWorking(run,{key:'repo'},'a'.repeat(40));
 assert.ok(peak>1,'untracked files must not launch serially');assert.ok(peak<=4,'at most four metadata processes');
 assert.deepEqual(result.files.map(f=>f.newPath),paths);assert.ok(result.files.every(f=>f.contentIdentity&&f.untracked));
});

test('failed concurrent metadata rejects the observation and drains in-flight reads',async()=>{
 let active=0,started=0;
 const run=async(_repo,args)=>{
  if(args[0]==='ls-files')return {code:0,stdout:paths.join('\0')+'\0'};
  if(args.includes('--no-index')){active++;started++;await new Promise(r=>setTimeout(r,2));active--;return {code:2,stdout:'',stderr:'untracked disappeared'};}
  return {code:0,stdout:''};
 };
 await assert.rejects(()=>observeWorking(run,{key:'repo'},'a'.repeat(40)),/untracked disappeared/);
 assert.equal(active,0);assert.ok(started<=4);
});
