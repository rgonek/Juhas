import test from 'node:test';
import assert from 'node:assert/strict';
import {withGitBudget} from '../mods/juhas/git.js';
test('a Git operation stops starting queries at the command or request-time limit',async()=>{
 let calls=0,now=0;const run=async()=>{calls++;return {code:0,stdout:''};},budget=withGitBudget(run,{maxCommands:2,now:()=>now});
 await budget({},[]);await budget({},[]);await assert.rejects(()=>budget({},[]),/budget/i);assert.equal(calls,2);
 const timed=withGitBudget(run,{now:()=>now});now=25001;await assert.rejects(()=>timed({},[]),/budget/i);assert.equal(calls,2);
});
test('late commands cannot pass a request deadline merely because they started in time',async()=>{
 let now=0;const budget=withGitBudget(async()=>{now=25001;return {code:0};},{now:()=>now});await assert.rejects(()=>budget({},[]),/budget/i);
});
