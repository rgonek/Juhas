import test from 'node:test';
import assert from 'node:assert/strict';
import * as review from '../mods/juhas/review.js';
import * as progress from '../mods/juhas/progress.js';
import {buildBatch,createSubmitter} from '../mods/juhas/submit.js';
import {loadSession,saveSession} from '../mods/juhas/storage.js';
const c={id:'comparison',repoKey:'repo',root:'/project',baseOid:'a',targetOid:null,baseTree:'old',targetTree:'working:content',mutableTarget:true};
test('general-only feedback is durable, source-bound and delivered through existing batch rules',async()=>{
 const target=review.generalTarget(c);assert.equal(target.scope,'general');assert.equal(target.targetTree,c.targetTree);assert.ok(!('newPath' in target));
 let s=review.addDraft(review.createSession('s'),{...target,id:'g',body:'Review the error policy'});
 const data=new Map(),store={get:k=>data.get(k),set:(k,v)=>data.set(k,v)};saveSession(store,s);s=loadSession(store,'s');
 const batch=buildBatch(s,[c]);assert.match(batch.text,/### General feedback/);assert.ok(!batch.text.includes('undefined'));assert.match(batch.text,/Review the error policy/);assert.equal(batch.draftSnapshots.g,JSON.stringify(s.drafts[0]));
 let calls=0;const send=createSubmitter(),ready={...batch,id:'delivery',agentAddress:'agent'};assert.equal((await send(ready,{send:async()=>{calls++;return {ok:true};}})).state,'sent');await send(ready,{});assert.equal(calls,1);
 assert.throws(()=>review.addDraft(s,{...target,id:'empty',body:'  '}),/Comment cannot be empty/);
 assert.throws(()=>buildBatch({...s,drafts:[{...s.drafts[0],body:'  '}]},[c]),/Comment cannot be empty/);
});
test('mixed feedback separates general remarks from real file anchors',()=>{
 const s={id:'s',drafts:[{...review.generalTarget(c),id:'g',body:'General'},{repoKey:'repo',comparisonId:c.id,id:'f',newPath:'file.js',body:'Specific',startLine:3,side:'new'}]};
 const batch=buildBatch(s,[c]);assert.match(batch.text,/### General feedback/);assert.match(batch.text,/### file.js/);assert.match(batch.text,/new 3: Specific/);assert.ok(!batch.text.includes('file: General'));
});
test('progress is pure, content/mode/path sensitive and bounded navigation stops at edges',()=>{
 const f={id:'f',oldPath:'a',newPath:'b',status:'R',oldOid:'old',newOid:'new',oldMode:'100644',newMode:'100755'},g={...f,id:'g',newPath:'c'};
 const s=review.createSession('s'),marked=progress.setFileReviewed(s,c,f,true);assert.equal(progress.reviewedState(s,c,f),false);assert.equal(progress.reviewedState(marked,c,f),true);
 for(const change of [{newOid:'edit'},{oldOid:'edit'},{newMode:'100644'},{oldPath:'z'},{status:'M'}])assert.equal(progress.reviewedState(marked,c,{...f,...change}),false);
 assert.equal(progress.reviewedState(marked,{...c,id:'different',targetTree:'working:other-file'},f),true);
 assert.equal(progress.nextUnreviewed([f,g],marked,c,'f'),g);assert.equal(progress.nextUnreviewed([f,g],marked,c,'g'),null);assert.equal(progress.nextUnreviewed([f,g],marked,c,'g',-1),null);
 assert.equal(progress.reviewedState(progress.setFileReviewed(marked,c,f,false),c,f),false);
});
