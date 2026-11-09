import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSelectionModel,selectionText,selectionRange,unitSelection,extendUnit,graphemes,commentSelection} from '../mods/juhas/selection.js';
const context={comparisonId:'c',fileId:'f',filePath:'a.js'};
const rows=[{...context,id:'a',kind:'pair',old:{id:'o',side:'old',oldLine:2,text:'const rate = 1.23;'},next:{id:'n',side:'new',newLine:2,text:'const rate = 1.08;'}},{...context,id:'saved',kind:'comment',draft:{id:'d'}},{...context,id:'b',kind:'pair',old:{id:'s',side:'context',oldLine:3,newLine:3,text:'\tżółć 😀'},next:{id:'s',side:'context',oldLine:3,newLine:3,text:'\tżółć 😀'}}];
const point=(model,row,side,offset)=>({...model.point(row,side),offset});
test('split selection copies exact source through comments in either direction',()=>{
 const m=buildSelectionModel(rows,true),a=point(m,'a','old',6),b=point(m,'b','old',8),s={anchor:a,end:b};
 assert.equal(selectionText(m,s),'rate = 1.23;\n\tżółć 😀');assert.equal(selectionText(m,{anchor:b,end:a}),selectionText(m,s));
 assert.equal(selectionText(m,{anchor:a,end:point(m,'b','new',1)}),'');
});
test('unified selection follows displayed code while comments retain source side',()=>{
 const lines=[{...context,id:'o',kind:'line',side:'old',oldLine:2,text:'old'},{...context,id:'n',kind:'line',side:'new',newLine:2,text:'new'},{...context,id:'s',kind:'line',side:'context',oldLine:3,newLine:3,text:'shared'}],m=buildSelectionModel(lines,false);
 assert.equal(selectionText(m,{anchor:point(m,'o',null,0),end:point(m,'s',null,6)}),'old\nnew\nshared');
 assert.deepEqual(commentSelection(m,'o',null,'s'),{fileId:'f',comparisonId:'c',side:'old',startLine:2,endLine:3,quote:'old\nshared',startRowId:'o',endRowId:'s'});
 assert.equal(commentSelection(m,'o',null,'n'),null);
});
test('words, complete lines and reverse word dragging respect original offsets',()=>{
 const m=buildSelectionModel(rows,true),a=point(m,'a','new',7),word=unitSelection(m,a,'word',7);
 assert.equal(selectionText(m,word),'rate');assert.equal(selectionText(m,unitSelection(m,a,'line')),'const rate = 1.08;\n');
 const back=extendUnit(unitSelection(m,point(m,'b','new',2),'word',2),word);assert.equal(selectionText(m,back),'rate = 1.08;\n\tżółć');
});
test('graphemes preserve tabs, combining marks, surrogate pairs and joined emoji',()=>{
 assert.deepEqual(graphemes('a\te\u0301😀👩‍💻').map(g=>[g.text,g.start,g.end]),[['a',0,1],['\t',1,2],['é',2,4],['😀',4,6],['👩‍💻',6,11]]);
});
test('file changes and missing hunk context cannot make an invented comment quote',()=>{
 const m=buildSelectionModel([...rows,{...context,id:'gap',kind:'pair',old:{side:'old',oldLine:8,text:'gap'},next:null},{...context,fileId:'other',id:'other',kind:'line',side:'new',newLine:1,text:'foreign'}],true);
 assert.equal(commentSelection(m,'a','old','gap'),null);assert.equal(commentSelection(m,'a','old','other'),null);
 assert.equal(selectionText(m,{anchor:point(m,'a','old',0),end:point(m,'other','new',2)}),'');
 assert.ok(selectionRange({anchor:point(m,'a','old',2),end:point(m,'b','old',2)}));
});
