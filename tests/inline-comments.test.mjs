import test from 'node:test';
import assert from 'node:assert/strict';
import {annotatePatch} from '../mods/juhas/comments.js';
test('saved line and file comments appear only at their exact comparison and side',()=>{
 const patch={hunks:[{header:'@@ -1 +1 @@',lines:[{side:'old',oldLine:1,newLine:null,text:'before'},{side:'new',oldLine:null,newLine:1,text:'after'}]}]};
 const drafts=[{id:'file',comparisonId:'c',newPath:'a',side:null,body:'file note'},{id:'old',comparisonId:'c',newPath:'a',side:'old',endLine:1,body:'old note'},{id:'stale',comparisonId:'other',newPath:'a',side:'new',endLine:1,body:'outdated note'}];const rows=annotatePatch(patch,drafts,'c','a');
 assert.equal(rows[0].draft.id,'file');const index=rows.findIndex(r=>r.draft?.id==='old');assert.equal(rows[index-1].side,'old');assert.equal(rows.some(r=>r.draft?.id==='stale'),false);
});

test('both source sides can annotate a shared context line without losing their original anchors',()=>{
 const patch={hunks:[{header:'@@ -3 +5 @@',lines:[{side:'context',oldLine:3,newLine:5,text:'unchanged'}]}]},drafts=[{id:'old',comparisonId:'c',newPath:'file',side:'old',startLine:3,endLine:3,body:'Original-side note'},{id:'new',comparisonId:'c',newPath:'file',side:'new',startLine:5,endLine:5,body:'Modified-side note'}];
 const rows=annotatePatch(patch,drafts,'c','file');assert.deepEqual(rows.filter(row=>row.kind==='comment').map(row=>[row.draft.side,row.draft.endLine]),[['old',3],['new',5]]);
});
