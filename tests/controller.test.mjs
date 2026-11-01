import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,run} from './helpers/repos.mjs';
import {Controller} from '../mods/git-review/controller.js';
import {commentTarget} from '../mods/git-review/comments.js';
test('controller opens selected commit, file, patch and restores drafts between views',async t=>{
 const f=fixture(t);f.commit('before\n');const head=f.commit('after\n');const data=new Map();const store={get:k=>data.get(k),set:(k,v)=>data.set(k,structuredClone(v))};
 const c=new Controller({run,store,sessionId:'session'});await c.openRepo(null,f.root);await c.selectScope({kind:'commit',commit:head,parentIndex:0});await c.selectFile(c.state.files[0].id);
 assert.equal(c.state.patch.hunks.length,1);const target=commentTarget(c.state.comparison,c.state.file,c.state.patch.hunks[0].lines[0]);c.addComment(target,'Please fix');
 const second=new Controller({run,store,sessionId:'session'});assert.equal(second.session().drafts[0].body,'Please fix');assert.equal(second.session().drafts[0].targetOid,head);
 await c.markSeen();assert.equal(c.session().checkpoints.length,1);assert.equal(c.session().drafts.length,1);
});
test('range comments refuse mixed sides or files and retain exact code',()=>{
 const c={id:'c',repoKey:'r',root:'/r',baseOid:'a',targetOid:'b'};const f={oldPath:'a',newPath:'b'};
 const target=commentTarget(c,f,{side:'new',newLine:2,text:'hello'},{side:'new',newLine:3,text:'world'},[{side:'new',newLine:2,text:'hello'},{side:'new',newLine:3,text:'world'}]);
 assert.equal(target.startLine,2);assert.equal(target.endLine,3);assert.equal(target.quote,'hello\nworld');
 assert.throws(()=>commentTarget(c,f,{side:'old',oldLine:2,text:'a'},{side:'new',newLine:2,text:'b'}),/side/i);
});
