import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewVisible,createRefreshScheduler,createRefreshCoordinator} from '../mods/juhas/refresh.js';

const visibleContext=()=>({role:'pane',context:{spaceId:'s',tabId:'t'},focus:{space:'s',tab:'t',pane:'terminal'},spaces:[],panes:[{pane:'review',mod:'juhas',tab:'t'}]});
test('visible review alongside a focused terminal qualifies, inactive tabs and zoomed-away panes do not',()=>{
 const input=visibleContext();assert.equal(reviewVisible(input),true);
 assert.equal(reviewVisible({...input,focus:{space:'s',tab:'other'}}),false);
 assert.equal(reviewVisible({...input,panes:[...input.panes,{pane:'terminal',tab:'t',zoomed:true}]}),false);
 assert.equal(reviewVisible({...input,panes:[{...input.panes[0],zoomed:true}]}),true);
 assert.equal(reviewVisible({...input,role:'bar'}),false);
 assert.equal(reviewVisible({...input,panes:[]}),false);
});
test('legacy review checks hidden ancestors and inactive stack children',()=>{
 const input={...visibleContext(),role:'sidebar',panes:[],layout:{type:'stack',active:'files',children:[{id:'files',content:{mod:'files'}},{id:'review',content:{mod:'juhas',props:{role:'sidebar'}}}]}};
 assert.equal(reviewVisible(input),false);input.layout.active='review';assert.equal(reviewVisible(input),true);
 input.layout.hidden=true;assert.equal(reviewVisible(input),false);
});
test('ambiguous review panes do not poll a zoomed-away copy without its pane identity',()=>{
 const input={...visibleContext(),panes:[{pane:'one',mod:'juhas',tab:'t',zoomed:true},{pane:'two',mod:'juhas',tab:'t'}]};
 assert.equal(reviewVisible(input),false);
 assert.equal(reviewVisible({...input,paneId:'one'}),true);
 assert.equal(reviewVisible({...input,paneId:'two'}),false);
});
test('15-second scheduler coalesces ticks/copies, skips hidden work and stops after close',async()=>{
 let fire,cancelled=false,shown=true,calls=0,release;
 const timer={every:(ms,fn)=>{assert.equal(ms,15000);fire=fn;return {cancel:()=>cancelled=true};}};
 const coordinator=createRefreshCoordinator(),refresh=()=>{calls++;return new Promise(resolve=>release=resolve);};
 const a=createRefreshScheduler({timer,visible:()=>shown,key:()=> 'same',refresh,coordinator}),b=createRefreshScheduler({timer,visible:()=>shown,key:()=> 'same',refresh,coordinator});
 a.start();const one=a.check({});await Promise.resolve();await Promise.resolve();const two=b.check({});assert.equal(calls,1);
 release();await Promise.all([one,two]);shown=false;await fire({});assert.equal(calls,1);
 a.close();shown=true;await a.check({});assert.equal(calls,1);assert.equal(cancelled,true);b.close();
});
test('a failed background check is released for the next eligible request',async()=>{
 let calls=0;const coordinator=createRefreshCoordinator();
 await assert.rejects(()=>coordinator.run('r',async()=>{calls++;throw new Error('offline');}),/offline/);
 await coordinator.run('r',async()=>calls++);assert.equal(calls,2);
});
