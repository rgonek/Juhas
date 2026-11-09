import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../mods/juhas/controller.js';
import {filterDrafts} from '../mods/juhas/review-ui.js';
const repo={key:'repo',root:'synthetic'},ids={A:'a'.repeat(40),B:'b'.repeat(40),HEAD:'c'.repeat(40)};
function setup(){let releaseA;const held=new Promise(resolve=>releaseA=resolve),calls=[];const run=async(_repo,args)=>{calls.push(args);if(args[0]==='merge-base'){if(args[2]===ids.A)await held;return {code:0,stdout:args[2]};}if(args[0]==='rev-parse')return {code:0,stdout:ids[args.at(-1).split('^{')[0]]||ids.HEAD};if(args[0]==='rev-list')return {code:0,stdout:'7\n'};throw Error('Unexpected '+args);};const c=new Controller({run,store:{get(){},set(){}}});c.state.repo=repo;return {c,calls,releaseA};}
test('a late base result cannot overwrite the latest choice or clear its loading state',async()=>{
 const {c,releaseA}=setup();const first=c.setHistoryBase('A');assert.equal(c.state.historyBaseLoading,true);await c.setHistoryBase('B');assert.equal(c.state.historyBaseRef,'B');assert.equal(c.state.historyBaseLoading,false);releaseA();assert.equal(await first,false);assert.equal(c.state.historyBaseRef,'B');assert.equal(c.state.featureBaseOid,ids.B);
});
test('clearing a base also invalidates a pending resolution',async()=>{const {c,releaseA}=setup();const first=c.setHistoryBase('A');await c.setHistoryBase(null);releaseA();await first;assert.equal(c.state.featureBaseOid,null);assert.equal(c.state.historyBaseRef,null);assert.equal(c.state.historyBaseLoading,false);});
test('comparison summaries count the resolved DAG range, cache immutable results and avoid counting a single commit',async()=>{
 const {c,calls}=setup(),comparison={repoKey:'repo',repo,baseOid:ids.A,targetOid:ids.HEAD,scope:{kind:'branch'}};
 assert.equal((await c.summarizeComparison(comparison)).commitCount,7);assert.equal((await c.summarizeComparison(comparison)).commitCount,7);assert.deepEqual(calls.filter(x=>x[0]==='rev-list'),[['rev-list','--count',ids.HEAD,'^'+ids.A,'--']]);assert.equal((await c.summarizeComparison({...comparison,scope:{kind:'commit'}})).commitCount,1);assert.equal((await c.summarizeComparison({...comparison,targetOid:null,mutableTarget:true})).commitCount,null);
});
test('comment filters combine repository, status and source without modifying drafts',()=>{
 const drafts=[{id:'a',repoKey:'repo',comparisonId:'one',status:'current'},{id:'b',repoKey:'repo',comparisonId:'two',status:'outdated'},{id:'c',repoKey:'other',comparisonId:'one'}],original=JSON.stringify(drafts);
 assert.deepEqual(filterDrafts(drafts,{repoKey:'repo'}).map(x=>x.id),['a','b']);assert.deepEqual(filterDrafts(drafts,{repoKey:'repo',status:'current'}).map(x=>x.id),['a']);assert.deepEqual(filterDrafts(drafts,{repoKey:'repo',status:'outdated',source:'one'}),[]);assert.deepEqual(filterDrafts(drafts,{repoKey:'repo',source:'two'}).map(x=>x.id),['b']);assert.equal(JSON.stringify(drafts),original);
});
test('an unavailable optional commit count preserves the comparison with an explicit summary error',async()=>{
 const {c}=setup();c.run=async()=>({code:128,stdout:'',stderr:'Count unavailable'});const result=await c.summarizeComparison({id:'source',repoKey:'repo',repo,baseOid:ids.A,targetOid:ids.HEAD,scope:{kind:'branch'}});assert.equal(result.id,'source');assert.equal(result.commitCount,null);assert.match(result.summaryError,/Count unavailable/);
});

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
test('history loading preserves visible rows, distinguishes pagination and clears after errors',async()=>{
 let request={started:deferred(),result:deferred()};const notifications=[];
 const c=new Controller({store:{get(){},set(){}},onChange:()=>notifications.push([c.state.historyLoading,c.state.historyLoadingMore]),run:async(_repo,args)=>{if(args[0]==='rev-parse')return {code:0,stdout:ids.HEAD};const active=request;active.started.resolve();return active.result.promise;}});c.state.repo=repo;c.state.history=[{oid:ids.A}];
 let pending=c.loadHistory();assert.equal(c.state.historyLoading,true);await request.started.promise;assert.equal(c.state.history[0].oid,ids.A);request.result.resolve({code:0,stdout:''});await pending;assert.equal(c.state.historyLoading,false);
 request={started:deferred(),result:deferred()};pending=c.loadHistory({},true);assert.equal(c.state.historyLoadingMore,true);await request.started.promise;request.result.resolve({code:128,stderr:'History read failed'});await assert.rejects(pending,/History read failed/);assert.equal(c.state.historyLoading,false);assert.equal(c.state.historyLoadingMore,false);assert.deepEqual(notifications,[[true,false],[false,false],[true,true],[false,false]]);
});
test('an older history response cannot stop the newer loading indicator',async()=>{
 const requests=[{started:deferred(),result:deferred()},{started:deferred(),result:deferred()}];let index=0;const c=new Controller({store:{get(){},set(){}},run:async(_repo,args)=>{if(args[0]==='rev-parse')return {code:0,stdout:ids.HEAD};const active=requests[index++];active.started.resolve();return active.result.promise;}});c.state.repo=repo;
 const first=c.loadHistory();await requests[0].started.promise;const second=c.loadHistory();await requests[1].started.promise;requests[0].result.resolve({code:0,stdout:''});await first;assert.equal(c.state.historyLoading,true);requests[1].result.resolve({code:0,stdout:''});await second;assert.equal(c.state.historyLoading,false);
});

test('working branch summaries count captured committed target and reuse the same immutable count cache',async()=>{
 const {c,calls}=setup();const comparison={repoKey:'repo',repo,baseOid:ids.A,targetOid:null,committedTargetOid:ids.HEAD,mutableTarget:true,scope:{kind:'branch',includeWorking:true}};
 assert.equal((await c.summarizeComparison(comparison)).commitCount,7);assert.equal((await c.summarizeComparison(comparison)).commitCount,7);assert.equal(calls.filter(args=>args[0]==='rev-list').length,1);
});
