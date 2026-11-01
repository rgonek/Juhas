import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,run} from './helpers/repos.mjs';
import {Controller} from '../mods/git-review/controller.js';
test('commit navigation reuses loaded history metadata and cached revisits need no Git reads',async t=>{
 const f=fixture(t);f.commit('first');const head=f.commit('second');let reads=0;const data=new Map();const c=new Controller({run:async(repo,args)=>{reads++;return run(repo,args);},store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});await c.openRepo(null,f.root);reads=0;
 await c.selectScope({kind:'commit',commit:head,parentIndex:0});assert.equal(reads,1,'Only the changed-file list should need Git; commit and parent trees are already in history');reads=0;await c.selectScope({kind:'commit',commit:head,parentIndex:0});assert.equal(reads,0);
});
