import test from 'node:test';
import assert from 'node:assert/strict';
import {branchChoices} from '../mods/juhas/review-ui.js';

test('ambiguous remotes prefer origin, preserve extras and respect explicit upstream',()=>{
 const local={name:'topic/nested',fullName:'refs/heads/topic/nested'};
 const remote=prefix=>({name:`${prefix}/topic/nested`,fullName:`refs/remotes/${prefix}/topic/nested`});
 const other=remote('other'),origin=remote('origin');
 assert.equal(branchChoices([local,other])[0].remote,other);
 assert.equal(branchChoices([local,other,origin])[0].remote,origin);
 assert.equal(branchChoices([{...local,upstream:other.fullName},other,origin])[0].remote,other);
 const ambiguous=branchChoices([local,other,remote('third')]);
 assert.equal(ambiguous[0].remote,null);
 assert.equal(ambiguous.length,3);
});

test('branch choices do bounded reference reads for large repositories',()=>{
 let reads=0;
 const count=200,refs=Array.from({length:count},(_,i)=>[
  {name:`topic/${i}`,fullName:`refs/heads/topic/${i}`},
  {name:`origin/topic/${i}`,get fullName(){reads++;return `refs/remotes/origin/topic/${i}`;}},
 ]).flat();
 const choices=branchChoices(refs);
 assert.equal(choices.length,count);
 assert.ok(choices.every((choice,i)=>choice.remote.fullName===`refs/remotes/origin/topic/${i}`));
 assert.ok(reads<count*30,`expected bounded reads, got ${reads}`);
});
