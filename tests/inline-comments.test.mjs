import test from 'node:test';
import assert from 'node:assert/strict';
import {annotatePatch} from '../mods/git-review/comments.js';
test('saved line and file comments appear only at their exact comparison and side',()=>{
 const patch={hunks:[{header:'@@ -1 +1 @@',lines:[{side:'old',oldLine:1,newLine:null,text:'before'},{side:'new',oldLine:null,newLine:1,text:'after'}]}]};
 const drafts=[{id:'file',comparisonId:'c',newPath:'a',side:null,body:'file note'},{id:'old',comparisonId:'c',newPath:'a',side:'old',endLine:1,body:'old note'},{id:'stale',comparisonId:'other',newPath:'a',side:'new',endLine:1,body:'outdated note'}];const rows=annotatePatch(patch,drafts,'c','a');
 assert.equal(rows[0].draft.id,'file');const index=rows.findIndex(r=>r.draft?.id==='old');assert.equal(rows[index-1].side,'old');assert.equal(rows.some(r=>r.draft?.id==='stale'),false);
});
