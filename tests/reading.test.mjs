import test from 'node:test';
import {revealPatchGap} from '../mods/juhas/diff.js';
import {annotatePatch,measuredCommentRows} from '../mods/juhas/comments.js';
import assert from 'node:assert/strict';
import {tokenizeLine,intraline,findInPatch,findMatchRanges,decorateLine,multiFileRows,withLineInfo} from '../mods/juhas/reading.js';

test('line info counts omitted context across edits and ignores adjacent hunks',()=>{
 const headers=['@@ -1,90 +1,90 @@','@@ -119,0 +120,2 @@','@@ -120 +122 @@'];
 const rows=headers.map((text,i)=>({kind:'hunk',id:`h${i}`,text}));
 assert.deepEqual(withLineInfo(rows),[{kind:'hunk',id:'h1',text:'29 omitted lines',gap:{oldStart:91,newStart:91,count:29}}]);
});
test('revealing one gap preserves other separators and existing row identities',()=>{
 const line=(oldLine,newLine)=>({side:'context',oldLine,newLine,text:'line '+newLine});
 const patch={hunks:[{header:'@@ -3 +3 @@',lines:[line(3,3)]},{header:'@@ -6 +6 @@',lines:[line(6,6)]}]};
 const full={hunks:[{lines:[1,2,3,4,5,6].map(n=>line(n,n))}]};
 const before=withLineInfo(annotatePatch(patch,[],'cmp','a'));
 const gap=before.find(r=>r.id==='h1').gap;
 assert.equal(revealPatchGap(patch,full,gap,'h1',3),null);
 assert.equal(revealPatchGap(patch,{hunks:[{lines:[line(4,4)]}]},gap,'h1'),null);
 const revealed=revealPatchGap(patch,full,gap,'h1');
 const rows=withLineInfo(annotatePatch(revealed,[{id:'draft',comparisonId:'cmp',newPath:'a',side:'new',endLine:4}], 'cmp','a'));
 assert.deepEqual(rows.map(r=>r.id),['h0','h0l0','context-h1l0','comment-draft','context-h1l1','h1l0']);
 assert.equal(patch.hunks.length,2);
 assert.equal(rows[0].text,'2 omitted lines');
 assert.equal(revealPatchGap(revealed,full,gap,'h1'),null);
});

test('trailing omitted lines separator expands remaining lines at end of file and clears when exhausted',()=>{
 const line=(oldLine,newLine)=>({side:'context',oldLine,newLine,text:'line '+newLine});
 const patch={hunks:[{header:'@@ -1,3 +1,3 @@',lines:[1,2,3].map(n=>line(n,n))}]};
 const full={hunks:[{lines:[1,2,3,4,5].map(n=>line(n,n))}]};
 const before=withLineInfo(annotatePatch(patch,[],'cmp','a'),{trailing:true});
 const trailing=before.at(-1);
 assert.equal(trailing.id,'trailing-gap');
 assert.deepEqual(trailing.gap,{oldStart:4,newStart:4,count:null,trailing:true});
 const revealed=revealPatchGap(patch,full,trailing.gap,trailing.id);
 assert.equal(revealed.trailingExhausted,true);
 assert.equal(revealed.hunks.length,2);
 assert.deepEqual(revealed.hunks[1].lines.map(l=>l.newLine),[4,5]);
 assert.equal(revealPatchGap(revealed,full,trailing.gap,trailing.id),null);
 // When last hunk is already at EOF, revealing marks trailingExhausted without adding an empty hunk
 const eof=revealPatchGap(patch,{hunks:[{lines:[1,2,3].map(n=>line(n,n))}]},trailing.gap,trailing.id);
 assert.equal(eof.trailingExhausted,true);
 assert.equal(eof.hunks.length,1);
});

test('syntax tokens retain exact Unicode and whitespace and reuse theme-independent cache',()=>{
 const source='const café = "😀\t"; // x  ';const tokens=tokenizeLine(source,'a.ts');
 assert.equal(tokens.map(t=>t.text).join(''),source);assert.ok(tokens.some(t=>t.kind==='keyword'));assert.ok(tokens.some(t=>t.kind==='string'));
 assert.strictEqual(tokens,tokenizeLine(source,'a.ts'));assert.ok(Object.isFrozen(tokens));
 assert.deepEqual(tokenizeLine(source,'a.unknown').map(t=>t.kind),['plain']);
 assert.equal(tokenizeLine('x'.repeat(9000),'a.ts').length,1);
});
test('bounded intraline emphasis never splits Unicode or touches source',()=>{
 assert.deepEqual(intraline('a😀x','a😁x'),{old:[{start:1,end:3}],new:[{start:1,end:3}]});
 assert.deepEqual(intraline('same','same'),{old:[],new:[]});
 assert.deepEqual(intraline('a'.repeat(9000),'b'.repeat(9000)).old,[{start:0,end:9000}]);
 const source='const a = "😀"';assert.equal(decorateLine(source,'x.js',[{start:6,end:7}],[{start:11,end:13}]).map(s=>s.text).join(''),source);
});
test('find searches loaded source on both sides, preserving exact offsets and row identity',()=>{
 const patch={hunks:[{header:'@@ query',lines:[{side:'old',oldLine:1,text:'query 😀 query'},{side:'new',newLine:1,text:'😀 query'},{side:'context',oldLine:2,newLine:2,text:'query'}]}]};
 const matches=findInPatch(patch,'query');assert.deepEqual(matches.map(m=>[m.side,m.line,m.start,m.end]),[['old',1,0,5],['old',1,9,14],['new',1,3,8],['old',2,0,5],['new',2,0,5]]);
 assert.ok(matches.every(m=>Number.isInteger(m.rowIndex)));assert.deepEqual(findInPatch(patch,''),[]);
});
test('find bounds result allocation with an explicit limited marker',()=>{
 const matches=findInPatch({hunks:[{lines:[{newLine:1,text:'a'.repeat(30000)}]}]},'a');assert.equal(matches.length,10000);assert.equal(matches.limited,true);
});
test('multifile sections retain exact file and comparison identity, with unloaded/collapsed notices',()=>{
 const rows=multiFileRows([{file:{id:'a',newPath:'a'},comparison:{id:'c'},rows:[{id:'new:1',kind:'line',text:'A'}]},{file:{id:'b',newPath:'b'},comparison:{id:'c'},collapsed:true},{file:{id:'d',newPath:'d'},comparison:{id:'other'},limited:true}]);
 assert.equal(rows[1].fileId,'a');assert.equal(rows[1].comparisonId,'c');assert.equal(rows[1].sourceId,'new:1');
 assert.equal(rows.filter(r=>r.kind==='file-header').length,3);assert.ok(rows.some(r=>r.kind==='notice'&&r.text.includes('limited')));
 assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
});

test('unwrapped runs merge only adjacent text with identical decoration',()=>{
 const text='const value = items.length + 3;';
 const changed=[{start:6,end:11}],matches=[{start:14,end:19}];
 const plain=decorateLine(text,'sample.js',changed,matches);
 const compact=decorateLine(text,'sample.js',changed,matches,true);
 const positions=spans=>spans.flatMap(({text,...style})=>Array.from(text,char=>[char,style]));
 assert.ok(compact.length<plain.length);
 assert.deepEqual(positions(compact),positions(plain));
});

test('unchanged syntax decoration is reused across visible renders',()=>{
 const text='const value = items.length + 3;';
 const compact=decorateLine(text,'sample.js',[],[],true);
 assert.equal(decorateLine(text,'sample.js',[],[],true),compact);
 assert.notEqual(decorateLine(text,'sample.js'),compact);
 assert.notEqual(decorateLine(text,'sample.js',[{start:6,end:11}],[],true),compact);
 assert.ok(Object.isFrozen(compact));
});

test('find highlights use exact file, side and line while preserving match order',()=>{
 const a={fileId:'a',side:'new',line:7,start:0,end:1};
 const b={...a,start:3,end:4},other={...a,fileId:'b'},old={...a,side:'old'};
 const matches=[a,other,old,b],lookup=findMatchRanges(matches,true);
 const row={fileId:'a',oldLine:7,newLine:7};
 assert.equal(findMatchRanges(matches,true),lookup);
 assert.deepEqual(lookup(row,'new'),[a,b]);
 assert.deepEqual(lookup(row,'old'),[old]);
 assert.deepEqual(lookup({...row,fileId:'b'},'new'),[other]);
 assert.deepEqual(findMatchRanges(matches,false)(row,'new'),[a,other,b]);
 assert.deepEqual(findMatchRanges([b],true)(row,'new'),[b]);
 assert.deepEqual(lookup(null,'new'),[]);
});

test('revealing mid-file or trailing omitted lines preserves measured list item count',()=>{
 const full={hunks:[{header:'@@ -1,8 +1,8 @@',lines:Array.from({length:8},(_,i)=>({side:'context',oldLine:i+1,newLine:i+1,text:`line ${i+1}`}))}]};
 const patch={hunks:[
  {header:'@@ -1,1 +1,1 @@',lines:[{side:'context',oldLine:1,newLine:1,text:'line 1'}]},
  {header:'@@ -4,1 +4,1 @@',lines:[{side:'context',oldLine:4,newLine:4,text:'line 4'}]}
 ]};
 const before=withLineInfo(annotatePatch(patch,[],'c','a'),{trailing:true});
 const beforeCount=measuredCommentRows(before).length;
 const midGap=before.find(row=>row.gap&&!row.gap.trailing);
 const afterMid=revealPatchGap(patch,full,midGap.gap,midGap.id,100);
 const midRows=withLineInfo(annotatePatch(afterMid,[],'c','a'),{trailing:true});
 assert.equal(measuredCommentRows(midRows).length,beforeCount);
 const trailGap=midRows.find(row=>row.gap?.trailing);
 const afterTrail=revealPatchGap(afterMid,full,trailGap.gap,trailGap.id,100);
 const trailRows=withLineInfo(annotatePatch(afterTrail,[],'c','a'),{trailing:false});
 assert.equal(measuredCommentRows(trailRows).length,beforeCount);
});
