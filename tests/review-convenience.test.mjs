import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileRows} from '../mods/juhas/review-ui.js';
import {agentRecipients,isLiveTerminal} from '../mods/juhas/submit.js';

test('file filter matches renamed paths and normalized separators without changing input or collapse state',()=>{
 const files=[{id:'a',newPath:'src/New.js',oldPath:'legacy/Old.js'},{id:'b',newPath:'other/test.js'}],collapsed=new Set(['src/']);
 assert.deepEqual(fileRows(files,false,collapsed,' LEGACY\\OLD ' ).map(f=>f.id),['a']);
 const rows=fileRows(files,true,collapsed,'new.js');assert.deepEqual(rows.filter(f=>!f.directory).map(f=>f.id),['a']);assert.ok(rows.filter(f=>f.directory).every(f=>!f.closed));assert.ok(collapsed.has('src/'));assert.equal(files.length,2);
 assert.deepEqual(fileRows(files,false,collapsed,'missing'),[]);assert.equal(fileRows(files,false,collapsed,''),files);
});

test('recipient search remains inside project or all-live scope and matches directory or address',()=>{
 const terminals=[{address:'t1',state:'live',program:{name:'pwsh.exe',agent:true},labels:{'herdr.space':'one'},cwd:'D:/Projects/CivicLens'},{address:'t2',state:'live',program:{name:'pwsh.exe',agent:true},labels:{'herdr.space':'two'},cwd:'D:/Other'},{address:'t3',state:'finished',cwd:'D:/Projects/CivicLens'}];
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1],Native=new Function('View','terminals','agents','agentRecipients','isLiveTerminal','class Juhas extends View'+source+'\nreturn Juhas;')(class{},()=>terminals,()=>[],agentRecipients,isLiveTerminal),view=Object.create(Native.prototype);
 let query='civiclens';Object.assign(view,{inputs:{recipientQuery:{value:()=>query}},recipientContext:()=>({spaceId:'one'})});
 assert.deepEqual(view.recipientOptions().map(t=>t.address),['t1']);query='t2';assert.deepEqual(view.recipientOptions(),[]);view.showAllRecipients=true;assert.deepEqual(view.recipientOptions().map(t=>t.address),['t2']);query='missing';assert.deepEqual(view.recipientOptions(),[]);assert.equal(view.recipientOptions(false).length,2);
});
