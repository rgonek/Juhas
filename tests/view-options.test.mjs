import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {measuredCommentRows} from '../mods/juhas/comments.js';
function fixture(){
 const data=new Map(),source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View','shared','setShared','CommentCard','measuredCommentRows','class Juhas extends View'+source+';return Juhas;')(class{},key=>data.get(key),(key,value)=>data.set(key,structuredClone(value)),class{},measuredCommentRows);
 const view=()=>Object.assign(Object.create(Native.prototype),{allFiles:true,diffMode:'unified',readingOptions:{wrap:false},showFiles:true,showComments:false,filePanelPosition:'top'});
 return {view,data};
}
test('view choices survive a new copy and are shared across spaces',()=>{
 const {view}=fixture(),first=view();first.applyPreferences();Object.assign(first,{allFiles:false,diffMode:'split',filePanelPosition:'bottom',showComments:true,readingOptions:{wrap:true}});first.syncPreferences();
 const second=view();second.activeContext={key:'other-space'};second.applyPreferences();assert.equal(second.allFiles,false);assert.equal(second.diffMode,'split');assert.equal(second.filePanelPosition,'bottom');assert.equal(second.showComments,true);assert.deepEqual(second.readingOptions,{wrap:true});
});
test('an idle copy accepts shared choices without overwriting them and concurrent choices merge',()=>{
 const {view}=fixture(),first=view(),second=view();first.applyPreferences();second.applyPreferences();first.allFiles=false;first.syncPreferences();second.diffMode='split';second.syncPreferences();first.syncPreferences();assert.equal(second.allFiles,false);assert.equal(first.diffMode,'split');
});
test('scroll identities stay separate per view and space and return on switching back',()=>{
 const {view}=fixture(),first=view(),second=view();first.id='first';second.id='second';first.activeContext={key:'space-a'};second.activeContext={key:'space-a'};const initial=first.scrollIdentity();assert.notEqual(initial,second.scrollIdentity());first.activeContext={key:'space-b'};assert.notEqual(initial,first.scrollIdentity());first.activeContext={key:'space-a'};assert.equal(initial,first.scrollIdentity());
});

test('retained cards are reconciled in a task and failed history requests do not loop',async()=>{
 const {view}=fixture(),v=view(),tasks=[];let created=0,loads=0;v.applyPreferences();Object.assign(v,{id:'view',policy:{ready:true},activeContext:{key:'space'},showHistory:true,filters:()=>({ref:'all'}),controller:{state:{repo:{key:'repo'},comparison:{id:'comparison'}},session:()=>({drafts:[{id:'draft',body:'saved'}]}),loadHistory:async()=>{loads++;throw new Error('offline');}}});
 v.work=(_cx,fn)=>{v.pending=fn().catch(()=>{});};
 const cx={timer:{after:(_delay,fn)=>tasks.push(fn)},notify(){},new(){created++;return {release(){}};}};
 v.deferPresentation(cx);assert.equal(created,0);assert.equal(tasks.length,1);tasks.shift()(cx);await v.pending;assert.equal(created,1);assert.equal(loads,1);
 v.busy=true;v.deferPresentation(cx);tasks.shift()(cx);v.busy=false;v.deferPresentation(cx);tasks.shift()(cx);await v.pending;assert.equal(loads,1);
});

test('wrapped navigation maps source rows and annotations to their measured source item',()=>{
 const {view}=fixture(),v=view(),calls=[];v.diffRows=[{id:'one',kind:'line'},{id:'comment',kind:'comment'},{id:'editor',kind:'editor'},{id:'two',kind:'line'}];v.diffScroll={scroll_to_item:(...args)=>calls.push(args)};v.readingOptions={wrap:true};
 for(const i of [0,1,2,3])v.scrollDiffToItem(i,'center');assert.deepEqual(calls,[[0,'center'],[0,'center'],[0,'center'],[1,'center']]);calls.length=0;v.readingOptions.wrap=false;v.scrollDiffToItem(3,'top');assert.deepEqual(calls,[[3,'top']]);
});
