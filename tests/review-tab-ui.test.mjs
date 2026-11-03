import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewTabKey,liveReviewTab,reviewTabProps} from '../mods/juhas/review-tab.js';
import {contextStorageKey} from '../mods/juhas/context.js';
function setup(){
 const data=new Map(),commands=[],live={spaces:[],panes:[]},source={key:'source-y',spaceId:'worktree-x',tabId:'terminal-y',folder:'D:/y'};
 const deps={reviewTabKey,liveReviewTab,reviewTabProps,contextStorageKey,shared:k=>data.get(k),setShared:(k,v)=>data.set(k,v),spaces:()=>live.spaces,panes:()=>live.panes,run:(...args)=>commands.push(args)};
 const body=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1],Native=new Function('View',...Object.keys(deps),'class Juhas extends View'+body+'\nreturn Juhas;')(class{},...Object.values(deps)),v=Object.create(Native.prototype);
 v.controller={state:{repo:{key:'y',root:'D:/y',machine:null}}};v.contextProps={};v.activeContext=source;v.currentContext=()=>source;v.sessionId='session';v.selectionKey='selection';v.publish=()=>{};v.viewSnapshots=()=>new Map();data.set('selection',{root:'D:/y',comparison:{id:'chosen'},fileId:'file'});
 return {v,data,commands,live,source};
}
test('expand creates a pinned review tab and transfers the chosen source, not the active agent repository',()=>{
 const {v,data,commands}=setup();v.openReviewTab();assert.equal(commands[0][0],'tab.new');const p=commands[0][1].props;assert.equal(p.folder,'D:/y');assert.equal(p.reviewContext.folder,'D:/y');assert.notEqual(p.reviewContext.key,v.activeContext.key);assert.equal(data.get(contextStorageKey('selection','session',p.reviewContext)).comparison.id,'chosen');
 v.openReviewTab();assert.equal(commands.length,1);
});
test('an existing per-worktree review is reused and receives the explicit source selection',()=>{
 const {v,data,commands,live}=setup(),context={...v.activeContext,key:'review-y'};live.spaces=[{tabs:[{id:'review-tab'}]}];live.panes=[{pane:'review-pane',tab:'review-tab',mod:'juhas'}];data.set(reviewTabKey(v.controller.state.repo,v.activeContext.spaceId),{tabId:'review-tab',paneId:'review-pane',context,sessionId:'session'});
 v.openReviewTab();assert.deepEqual(commands,[['tab.select',{id:'review-tab'}]]);assert.equal(data.get(contextStorageKey('selection','session',context)).fileId,'file');
});
test('expand closes only its originating Juhas pane after an existing tab is confirmed',()=>{
 const {v,data,commands,live}=setup(),context={...v.activeContext,key:'review-y'};v.role='pane';v.displayTabId='terminal-y';
 live.spaces=[{tabs:[{id:'review-tab'}]}];live.panes=[{pane:'source-review',tab:'terminal-y',mod:'juhas'},{pane:'agent',tab:'terminal-y',mod:'terminal'},{pane:'review-pane',tab:'review-tab',mod:'juhas'}];
 data.set(reviewTabKey(v.controller.state.repo,v.activeContext.spaceId),{tabId:'review-tab',paneId:'review-pane',context,sessionId:'session'});v.openReviewTab();
 assert.deepEqual(commands,[['tab.select',{id:'review-tab'}],['pane.close',{pane:'source-review'}]]);
});
test('creating a new review tab retains the source pane until its tab registers',()=>{
 const {v,data,commands,live}=setup();v.role='pane';v.displayTabId='terminal-y';live.panes=[{pane:'source-review',tab:'terminal-y',mod:'juhas'}];v.openReviewTab();
 assert.equal(commands.length,1);assert.equal(commands[0][0],'tab.new');assert.deepEqual(data.get(reviewTabKey(v.controller.state.repo,v.activeContext.spaceId)).origin,{paneId:'source-review',tabId:'terminal-y'});
});
