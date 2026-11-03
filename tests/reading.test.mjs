import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenizeLine,intraline,findInPatch,decorateLine,multiFileRows} from '../mods/juhas/reading.js';
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
