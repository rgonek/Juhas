import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {formatCommitTime} from '../mods/juhas/commit-time.js';

const now=new Date(2026,10,3,15,30).getTime();
const seconds=ms=>ms/1000;
test('recent commit times use seconds and readable relative labels',()=>{
 for(const [age,label] of [[0,'just now'],[59,'just now'],[60,'1 minute ago'],[119,'1 minute ago'],[120,'2 minutes ago'],[3599,'59 minutes ago'],[3600,'1 hour ago'],[10799,'2 hours ago']]){
  assert.equal(formatCommitTime(seconds(now)-age,now),label);
 }
 assert.equal(formatCommitTime(now,now),'');
});
test('three-hour threshold switches to the local clock',()=>{
 assert.equal(formatCommitTime(seconds(now)-10800,now),'Today 12:30');
 assert.equal(formatCommitTime(seconds(new Date(2026,10,2,23,5).getTime()),now),'Yesterday 23:05');
 assert.equal(formatCommitTime(seconds(new Date(2026,9,31,9,7).getTime()),now),'2026-10-31 09:07');
});
test('relative age takes precedence across midnight',()=>{
 const midnight=new Date(2026,10,3,0,30).getTime();
 assert.equal(formatCommitTime(seconds(new Date(2026,10,2,23,30).getTime()),midnight),'1 hour ago');
});
test('future clock skew never produces negative relative ages',()=>{
 assert.equal(formatCommitTime(seconds(now)+60,now),'just now');
 assert.equal(formatCommitTime(seconds(now)+61,now),'Today 15:31');
 assert.equal(formatCommitTime(seconds(new Date(2026,10,4,8,5).getTime()),now),'2026-11-04 08:05');
});
test('invalid and missing values render nothing',()=>{
 for(const value of [undefined,null,'',NaN,Infinity,-Infinity,{},'1700000000'])assert.equal(formatCommitTime(value,now),'');
 assert.equal(formatCommitTime(0,NaN),'');
 assert.equal(formatCommitTime(9e15,now),'');
});
test('yesterday follows local calendar boundaries across DST and year changes',()=>{
 const moduleUrl=new URL('../mods/juhas/commit-time.js',import.meta.url).href;
 const script=`import assert from 'node:assert/strict';import {formatCommitTime} from ${JSON.stringify(moduleUrl)};
 const cases=[[[2026,2,30,0,30],[2026,2,29,0,15],'Yesterday 00:15'],[[2026,9,26,0,30],[2026,9,25,0,15],'Yesterday 00:15'],[[2027,0,1,12,0],[2026,11,31,8,5],'Yesterday 08:05'],[[2026,9,26,23,30],[2026,9,25,23,45],'Yesterday 23:45']];
 for(const [nowParts,thenParts,label] of cases)assert.equal(formatCommitTime(new Date(...thenParts).getTime()/1000,new Date(...nowParts).getTime()),label);`;
 execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TZ:'Europe/Warsaw'}});
});
