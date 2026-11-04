import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contextStorageKey} from '../mods/juhas/context.js';
import {reviewTabKey,liveReviewTab} from '../mods/juhas/review-tab.js';
import {openReview} from '../mods/juhas/presentation.js';
function fixture(){
 const data=new Map(),snapshots=new Map(),commands=[],source={key:'source',spaceId:'s',tabId:'agent',folder:'/repo',machine:null},context={...source,key:'review'},repo={key:'r',root:'/repo'};
 const live={spaces:[{id:'s',tabs:[{id:'agent'},{id:'review'}]}],panes:[{pane:'terminal',tab:'agent',terminal:'t1',cwd:'/repo'},{pane:'review-pane',tab:'review',mod:'juhas',terminal:null}],layout:{id:'root',children:[{id:'git-review-sidebar'}]}};
 const deps={contextStorageKey,reviewTabKey,liveReviewTab,openReview,shared:k=>data.get(k),setShared:(k,v)=>data.set(k,v),spaces:()=>live.spaces,panes:()=>live.panes,layout:()=>live.layout,run:(...a)=>commands.push(a)};
 const body=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1],Native=new Function('View',...Object.keys(deps),'class Juhas extends View'+body+'\nreturn Juhas;')(class{},...Object.values(deps)),v=Object.create(Native.prototype),key=reviewTabKey(repo,'s');
 Object.assign(v,{contextProps:{isReviewTab:true,reviewTabKey:key},activeContext:context,sessionId:'s',selectionKey:'review-selection',composerKey:'review-composer',reviewKey:'review-message',controller:{state:{repo},session:()=>({drafts:[]})},persistComposer(){},persistReview(){},viewSnapshots:()=>snapshots,publish(){}});
 data.set(key,{tabId:'review',paneId:'review-pane',sourceContext:source,sourcePresentation:'sidebar',sessionId:'s'});data.set('juhas.review-tabs.v1',[{key,root:'/repo',machine:null,spaceId:'s'}]);
 const selection={root:'/repo',comparison:{id:'exact'},fileId:'file',version:'v'},composer={target:{comparisonId:'exact'},body:'unsaved feedback'},preview={batch:{edited:true,text:'Exact review text',contextKey:'review'}};
 data.set(v.selectionKey,selection);data.set(v.composerKey,composer);data.set(v.reviewKey,preview);snapshots.set(v.selectionKey,{version:'v',state:{patch:{text:'loaded code'}},readingOptions:{wrap:true}});
 return {v,data,snapshots,commands,source,live,key,selection,composer,preview,cx:{notify(){}}};
}
test('return transfers source, loaded diff and unsaved text before closing only the review tab',()=>{
 const f=fixture();assert.equal(f.v.returnToSidebar(f.cx),true);
 assert.deepEqual(f.data.get(contextStorageKey('selection','s',f.source)),f.selection);assert.deepEqual(f.data.get(contextStorageKey('composer','s',f.source)),f.composer);
 assert.equal(f.data.get(contextStorageKey('review','s',f.source)).batch.text,'Exact review text');assert.equal(f.data.get(contextStorageKey('review','s',f.source)).batch.contextKey,'source');
 assert.equal(f.snapshots.get(contextStorageKey('selection','s',f.source)).state.patch.text,'loaded code');assert.equal(f.data.get(f.v.composerKey),null);assert.deepEqual(f.commands.at(-1),['tab.close',{id:'review'}]);assert.equal(f.commands[0][0],'tab.select');assert.equal(f.data.get(f.key).tabId,null);
});
test('return never closes an agent added to the review tab',()=>{
 const f=fixture();f.live.panes.push({pane:'other-agent',tab:'review',terminal:'t2'});assert.equal(f.v.returnToSidebar(f.cx),true);assert.deepEqual(f.commands.at(-1),['pane.close',{pane:'review-pane'}]);assert.ok(!f.commands.some(c=>c[0]==='tab.close'));
});
test('a missing source tab retains the review and its unsaved comment',()=>{
 const f=fixture();f.live.spaces[0].tabs=[{id:'review'}];assert.equal(f.v.returnToSidebar(f.cx),false);assert.deepEqual(f.commands,[]);assert.deepEqual(f.data.get(f.v.composerKey),f.composer);
});
test('conflicting unsaved sidebar text is preserved alongside the expanded comment',()=>{
 const f=fixture(),target=contextStorageKey('composer','s',f.source);f.data.set(target,{target:{comparisonId:'other'},body:'other unsaved text'});assert.equal(f.v.returnToSidebar(f.cx),false);assert.equal(f.data.get(target).body,'other unsaved text');assert.deepEqual(f.commands,[]);
});
test('native fallback opens beside the original terminal, not whichever pane is focused now',()=>{
 const f=fixture();f.live.layout={id:'root'};assert.equal(f.v.returnToSidebar(f.cx),true);assert.ok(f.commands.some(c=>c[0]==='pane.split'&&c[1].pane==='terminal'));
});
test('moving the source terminal to a different checkout does not discard the pinned review',()=>{
 const f=fixture();f.live.panes[0].cwd='/repo-other';assert.equal(f.v.returnToSidebar(f.cx),false);assert.deepEqual(f.commands,[]);assert.equal(f.data.get(f.key).tabId,'review');
});
test('a source without sidebar or terminal retains the review before any layout mutation',()=>{
 const f=fixture();f.live.layout={id:'root'};f.live.panes=f.live.panes.filter(p=>p.tab!=='agent');assert.equal(f.v.returnToSidebar(f.cx),false);assert.deepEqual(f.commands,[]);assert.equal(f.data.get(f.key).tabId,'review');
});
test('conflicting edited review messages are retained in both contexts',()=>{
 const f=fixture(),target=contextStorageKey('review','s',f.source);f.data.set(target,{batch:{edited:true,text:'Other edited review'}});assert.equal(f.v.returnToSidebar(f.cx),false);assert.deepEqual(f.commands,[]);assert.equal(f.data.get(target).batch.text,'Other edited review');assert.equal(f.data.get(f.v.reviewKey).batch.text,'Exact review text');
});
test('a clean incoming composer cannot overwrite unsaved sidebar feedback',()=>{
 const f=fixture(),target=contextStorageKey('composer','s',f.source);f.v.controller.session=()=>({drafts:[{id:'saved',body:'saved text'}]});f.data.set(f.v.composerKey,{id:'saved',target:{comparisonId:'exact'},body:'saved text'});f.data.set(target,{target:{comparisonId:'other'},body:'unsaved sidebar text'});
 assert.equal(f.v.returnToSidebar(f.cx),true);assert.equal(f.data.get(target).body,'unsaved sidebar text');
});
test('an unedited generated preview cannot overwrite an edited sidebar review',()=>{
 const f=fixture(),target=contextStorageKey('review','s',f.source);f.data.set(f.v.reviewKey,{batch:{edited:false,text:'Generated review'}});f.data.set(target,{batch:{edited:true,text:'My sidebar edit',contextKey:'source'}});
 assert.equal(f.v.returnToSidebar(f.cx),true);assert.equal(f.data.get(target).batch.text,'My sidebar edit');assert.equal(f.data.get(target).batch.edited,true);
});
