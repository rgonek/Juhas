import test from 'node:test';
import assert from 'node:assert/strict';
import {annotatePatch,composerRows,commentHeight} from '../mods/juhas/comments.js';
import {splitRows,changeGroups} from '../mods/juhas/review-ui.js';
test('saved line and file comments appear only at their exact comparison and side',()=>{
 const patch={hunks:[{header:'@@ -1 +1 @@',lines:[{side:'old',oldLine:1,newLine:null,text:'before'},{side:'new',oldLine:null,newLine:1,text:'after'}]}]};
 const drafts=[{id:'file',comparisonId:'c',newPath:'a',side:null,body:'file note'},{id:'old',comparisonId:'c',newPath:'a',side:'old',endLine:1,body:'old note'},{id:'stale',comparisonId:'other',newPath:'a',side:'new',endLine:1,body:'outdated note'}];const rows=annotatePatch(patch,drafts,'c','a');
 assert.equal(rows[0].draft.id,'file');const index=rows.findIndex(r=>r.draft?.id==='old');assert.equal(rows[index-1].side,'old');assert.equal(rows.some(r=>r.draft?.id==='stale'),false);
});
test('new and edited composers occupy the exact end-line anchor without breaking split replacements',()=>{
 const patch={hunks:[{header:'@@',lines:[{side:'old',oldLine:2,newLine:null,text:'before'},{side:'new',newLine:4,oldLine:null,text:'after'}]}]},target={side:'old',startLine:1,endLine:2};
 const rows=composerRows(annotatePatch(patch,[],'c','a'),target);assert.equal(rows[2].kind,'editor');const split=splitRows(rows);assert.equal(split[1].old.text,'before');assert.equal(split[1].next.text,'after');assert.equal(split[2].kind,'editor');assert.equal(split[2].draft.side,'old');assert.equal(changeGroups(split).length,1);
 const saved={id:'d',comparisonId:'c',newPath:'a',side:'new',startLine:4,endLine:4,body:'saved'};const edited=composerRows(annotatePatch(patch,[saved],'c','a'),saved,'d');assert.equal(edited.filter(r=>r.kind==='editor').length,1);assert.equal(edited.some(r=>r.draft?.id==='d'&&r.kind==='comment'),false);
 assert.equal(composerRows(rows,{side:'new',endLine:99}),rows);assert.equal(composerRows([],{side:null})[0].kind,'editor');
});
test('saved comment heights are compact, respect explicit lines and remain bounded',()=>{
 assert.equal(commentHeight('one'),38);assert.equal(commentHeight('one\ntwo'),59);assert.equal(commentHeight('one\r\ntwo'),59);assert.equal(commentHeight('line\n'.repeat(50)),143);
});

test('both source sides can annotate a shared context line without losing their original anchors',()=>{
 const patch={hunks:[{header:'@@ -3 +5 @@',lines:[{side:'context',oldLine:3,newLine:5,text:'unchanged'}]}]},drafts=[{id:'old',comparisonId:'c',newPath:'file',side:'old',startLine:3,endLine:3,body:'Original-side note'},{id:'new',comparisonId:'c',newPath:'file',side:'new',startLine:5,endLine:5,body:'Modified-side note'}];
 const rows=annotatePatch(patch,drafts,'c','file');assert.deepEqual(rows.filter(row=>row.kind==='comment').map(row=>[row.draft.side,row.draft.endLine]),[['old',3],['new',5]]);
});
