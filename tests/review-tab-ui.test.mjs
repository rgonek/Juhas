import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewTabKey,liveReviewTab,reviewTabProps} from '../mods/juhas/review-tab.js';
import {contextStorageKey} from '../mods/juhas/context.js';
function setup(){
 const data=new Map(),commands=[],live={spaces:[],panes:[]},source={key:'source-y',spaceId:'worktree-x',tabId:'terminal-y',folder:'D:/y'};
 let nextId=0;
 const deps={uid:()=>String(++nextId),reviewTabKey,liveReviewTab,reviewTabProps,contextStorageKey,shared:k=>data.get(k),setShared:(k,v)=>data.set(k,v),spaces:()=>live.spaces,panes:()=>live.panes,run:(...args)=>commands.push(args)};
 const body=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1],Native=new Function('View',...Object.keys(deps),'class Juhas extends View'+body+'\nreturn Juhas;')(class{},...Object.values(deps)),v=Object.create(Native.prototype);
 v.controller={state:{repo:{key:'y',root:'D:/y',machine:null}}};v.contextProps={};v.activeContext=source;v.currentContext=()=>source;v.sessionId='session';v.selectionKey='selection';v.publish=()=>{};v.viewSnapshots=()=>new Map();data.set('selection',{root:'D:/y',comparison:{id:'chosen'},fileId:'file'});
 return {v,data,commands,live,source};
}
test('expand creates a pinned review tab and transfers the chosen source, not the active agent repository',()=>{
 const {v,data,commands}=setup();v.openReviewTab();assert.equal(commands[0][0],'tab.new');const p=commands[0][1].props;assert.equal(p.folder,'D:/y');assert.equal(p.reviewContext.folder,'D:/y');assert.notEqual(p.reviewContext.key,v.activeContext.key);assert.equal(data.get(contextStorageKey('selection','session',p.reviewContext)).comparison.id,'chosen');
 v.openReviewTab();assert.equal(commands.length,2);assert.notEqual(commands[1][1].props.reviewTabKey,p.reviewTabKey);
});
test('an existing review does not intercept an explicit new tab',()=>{
 const {v,data,commands,live}=setup(),context={...v.activeContext,key:'review-y'};live.spaces=[{tabs:[{id:'review-tab'}]}];live.panes=[{pane:'review-pane',tab:'review-tab',mod:'juhas'}];data.set(reviewTabKey(v.controller.state.repo,v.activeContext.spaceId),{tabId:'review-tab',paneId:'review-pane',context,sessionId:'session'});
 v.openReviewTab();assert.equal(commands.length,1);assert.equal(commands[0][0],'tab.new');assert.equal(commands[0][1].space,v.activeContext.spaceId);assert.equal(data.get(contextStorageKey('selection','session',commands[0][1].props.reviewContext)).fileId,'file');
});
test('expand leaves its source pane open while creating a tab beside an existing review',()=>{
 const {v,data,commands,live}=setup(),context={...v.activeContext,key:'review-y'};v.role='pane';v.displayTabId='terminal-y';
 live.spaces=[{tabs:[{id:'review-tab'}]}];live.panes=[{pane:'source-review',tab:'terminal-y',mod:'juhas'},{pane:'agent',tab:'terminal-y',mod:'terminal'},{pane:'review-pane',tab:'review-tab',mod:'juhas'}];
 data.set(reviewTabKey(v.controller.state.repo,v.activeContext.spaceId),{tabId:'review-tab',paneId:'review-pane',context,sessionId:'session'});v.openReviewTab();
 assert.equal(commands.length,1);assert.equal(commands[0][0],'tab.new');
});
test('creating a new review tab retains the source pane until its tab registers',()=>{
 const {v,data,commands,live}=setup();v.role='pane';v.displayTabId='terminal-y';live.panes=[{pane:'source-review',tab:'terminal-y',mod:'juhas'}];v.openReviewTab();
 assert.equal(commands.length,1);assert.equal(commands[0][0],'tab.new');assert.deepEqual(data.get(commands[0][1].props.reviewTabKey).origin,{paneId:'source-review',tabId:'terminal-y'});
});
test('legacy sidebar hides on Expand even if new-tab registration has not completed',()=>{
 const {v,commands}=setup();v.role='sidebar';v.openReviewTab();assert.deepEqual(commands.slice(1),[['layout.hide',{id:'git-review-sidebar'}],['layout.hide',{id:'panel'}]]);
});
test('a review tab registers its new pane even when init still reports the source tab',()=>{
 const {v,data,commands,live,source}=setup(),key=reviewTabKey(v.controller.state.repo,source.spaceId);v.contextProps={isReviewTab:true,reviewTabKey:key,folder:'D:/y',reviewContext:source};v.displayTabId='terminal-y';
 live.spaces=[{id:source.spaceId,tabs:[{id:'terminal-y'},{id:'new-review',name:'Review · y'}]}];live.panes=[{pane:'source-review',tab:'terminal-y',mod:'juhas'},{pane:'new-pane',tab:'new-review',mod:'juhas'}];data.set(key,{opening:Date.now(),previousTabIds:['terminal-y'],origin:{paneId:'source-review',tabId:'terminal-y'}});
 assert.equal(v.registerReviewTab(),true);assert.equal(v.displayTabId,'new-review');assert.equal(data.get(key).paneId,'new-pane');assert.deepEqual(commands,[['pane.close',{pane:'source-review'}]]);
});

for(const direction of ['right','down'])test(`sidebar opens ${direction} at the focused source pane and retains review context`,()=>{
 const {v,commands,live,source}=setup();v.role='sidebar';v.persistComposer=()=>{};v.persistReview=()=>{};
 live.panes=[{pane:'existing-review',tab:source.tabId,mod:'juhas'},{pane:'first',tab:source.tabId,terminal:'t1'},{pane:'chosen',tab:source.tabId,terminal:'t2',focused:true},{pane:'foreign',tab:'other',terminal:'t3',focused:true}];
 v.openReviewPane(direction);const [name,args]=commands[0];assert.equal(name,'pane.split');assert.equal(args.direction,direction);assert.equal(args.pane,'chosen');assert.equal(args.mod,'juhas');assert.equal(args.props.role,'pane');assert.equal(args.props.sessionId,v.sessionId);assert.deepEqual(args.props.reviewContext,source);
 assert.deepEqual(commands.slice(1),[['layout.hide',{id:'git-review-sidebar'}],['layout.hide',{id:'panel'}]]);
});
test('missing source terminal leaves sidebar and selection intact',()=>{
 const {v,commands}=setup();v.role='sidebar';v.openReviewPane('right');assert.deepEqual(commands,[]);
});
test('pane placement actions are unavailable outside the sidebar',()=>{
 const {v,commands,live,source}=setup();live.panes=[{pane:'agent',tab:source.tabId,terminal:'t1'}];
 for(const role of ['pane','bar']){v.role=role;v.openReviewPane('down');}assert.deepEqual(commands,[]);
});

for(const direction of ['right','down'])test(`loading sidebar can move ${direction} before repository discovery`,()=>{
 const {v,commands,live,source}=setup();v.role='sidebar';v.busy=true;v.controller.state.repo=null;v.persistComposer=()=>{};v.persistReview=()=>{};live.panes=[{pane:'agent',tab:source.tabId,terminal:'t1'}];
 v.openReviewPane(direction);assert.equal(commands[0][0],'pane.split');assert.equal(commands[0][1].props.reviewContext.folder,source.folder);
});
test('loading review can open a tab before repository discovery',()=>{
 const {v,commands,source}=setup();v.busy=true;v.controller.state.repo=null;v.openReviewTab();assert.equal(commands[0][0],'tab.new');assert.equal(commands[0][1].props.folder,source.folder);
});

test('a tab opened from a parent folder adopts the discovered repository identity',()=>{
 const {v,data,live,source}=setup(),parent={root:'D:/',machine:null},key=reviewTabKey(parent,source.spaceId);
 v.contextProps={isReviewTab:true,reviewTabKey:key,folder:parent.root,reviewContext:source};live.spaces=[{id:source.spaceId,tabs:[{id:'new-review'}]}];live.panes=[{pane:'new-pane',tab:'new-review',mod:'juhas'}];data.set(key,{previousTabIds:[]});
 assert.equal(v.registerReviewTab(),true);assert.equal(v.contextProps.reviewTabKey,key);assert.equal(data.get(key).paneId,'new-pane');assert.equal(data.get('juhas.review-tabs.v1')[0].root,'D:/y');
});

test('discovery keeps both tabs open when they resolve to the same repository',()=>{
 const {v,data,commands,live,source}=setup(),key=reviewTabKey({root:'D:/',machine:null},source.spaceId),canonical=reviewTabKey(v.controller.state.repo,source.spaceId),context={...source,key:'existing-review'};
 v.contextProps={isReviewTab:true,reviewTabKey:key,folder:'D:/',reviewContext:source};live.spaces=[{id:source.spaceId,tabs:[{id:'opening'},{id:'existing'}]}];live.panes=[{pane:'opening-pane',tab:'opening',mod:'juhas'},{pane:'existing-pane',tab:'existing',mod:'juhas'}];data.set(key,{previousTabIds:['existing']});data.set(canonical,{tabId:'existing',paneId:'existing-pane',sessionId:'other',context});
 assert.equal(v.registerReviewTab(),true);assert.equal(data.get(canonical).paneId,'existing-pane');assert.equal(data.get(key).paneId,'opening-pane');assert.deepEqual(commands,[]);
});

test('new reviews retain independent return targets across worktrees and projects',()=>{
 const {v,data,commands,source}=setup();
 const sources=[source,{...source,spaceId:'worktree-z',tabId:'terminal-z',folder:'D:/z'},{...source,spaceId:'project-a',tabId:'terminal-a',folder:'D:/a'}];
 for(const context of sources){
  v.activeContext=context;v.currentContext=()=>context;v.controller.state.repo={root:context.folder,machine:null};
  v.openReviewTab();
 }
 assert.deepEqual(commands.map(([name,args])=>[name,args.space,args.folder]),sources.map(context=>['tab.new',context.spaceId,context.folder]));
 for(const [i,[,args]] of commands.entries()){
  v.contextProps=args.props;
  assert.equal(v.recipientContext(),sources[i]);
  assert.equal(data.get(args.props.reviewTabKey).sourceContext,sources[i]);
 }
});
