import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Controller} from '../mods/juhas/controller.js';
import {createCache} from '../mods/juhas/cache.js';
import {resolveConfig,selectBase} from '../mods/juhas/config.js';
import {allowedRepository,contextStorageKey} from '../mods/juhas/context.js';
import {expandReview,collapseReview} from '../mods/juhas/presentation.js';
function harness(){
 const data=new Map(),memory={},calls=[];let version=0;
 let source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export default class')).replace('export default class Juhas extends View','class Juhas extends View');
 const store={get:k=>data.get(k),set:(k,v)=>data.set(k,v)},fail=async()=>{calls.push('Git');throw new Error('Unexpected Git read during presentation change');};
 const deps={globalThis:memory,Controller,createCache,resolveConfig,selectBase,allowedRepository,contextStorageKey,createRunner:()=>fail,exec:fail,cache:createCache(),store,shared:store.get,setShared:store.set,uid:()=>String(++version),scopeCache:new Map(),resolveRepositoryScope:fail,readDirectories:fail,appHome:()=>'',expandReview,collapseReview,run:()=>{}};
 const Native=new Function('View',...Object.keys(deps),source+'\nreturn Juhas;')(class{},...Object.values(deps));
 const context={key:'project',spaceId:'space',folder:'/repo',machine:null},cx={notify(){},spawn(fn){return fn(cx);}};
 function view(){const v=Object.create(Native.prototype);Object.assign(v,{contextProps:{},config:resolveConfig(),contextViews:new Map(),policy:{repos:[],canSwitch:false},inputs:{},role:'sidebar',sessionId:'space',followContext:true});for(const key of ['folder','base','target','query','author','path','comment','note']){let value='';v.inputs[key]={value:()=>value,set_value:x=>value=x};}v.controller=new Controller({run:fail,store,sessionId:'space'});v.loadConfig=async()=>{};v.work=(_cx,fn)=>v.pending=fn();return v;}
 const sidebar=view(),repo={key:'repo',root:'/repo',machine:null};Object.assign(sidebar,{activeContext:context,selectionKey:contextStorageKey('selection','space',context),policy:{ready:true,repos:[repo],canSwitch:false},diffMode:'split',fileTree:true});
 sidebar.controller.state={...sidebar.controller.state,repo,branch:'feature',history:[{oid:'head'}],refs:[],comparison:{id:'comparison',repoKey:'repo',targetOid:'head',scope:{kind:'commit',commit:'head'}},files:[{id:'file',newPath:'file.txt'}],file:{id:'file',newPath:'file.txt'},patch:{hunks:[{lines:[{newLine:1,text:'loaded code'}]}],complete:true},hasMore:true,details:{subject:'Loaded details'}};sidebar.inputs.query.set_value('filter');
 return {sidebar,view,context,cx,calls,data};
}
test('first expansion reuses loaded history, files, full diff and filters without Git reads',async()=>{
 const h=harness();h.sidebar.publish();const full=h.view();full.role='full';full.activateContext(h.context,h.cx);if(full.pending)await full.pending;
 assert.equal(h.calls.length,0);assert.deepEqual(full.controller.state,h.sidebar.controller.state);assert.notEqual(full.controller.state,h.sidebar.controller.state);assert.equal(full.inputs.query.value(),'filter');assert.equal(full.diffMode,'split');assert.equal(full.fileTree,true);
 full.controller.state.history.push({oid:'next'});assert.equal(h.sidebar.controller.state.history.length,1);
});
test('returning to the existing sidebar adopts the expanded selection without Git reads',async()=>{
 const h=harness();h.sidebar.publish();const full=h.view();full.activateContext(h.context,h.cx);if(full.pending)await full.pending;
 full.controller.state.comparison={...full.controller.state.comparison,id:'next',targetOid:'next'};full.controller.state.patch={hunks:[],complete:true};full.publish();h.sidebar.sync(h.cx);if(h.sidebar.pending)await h.sidebar.pending;
 assert.equal(h.calls.length,0);assert.equal(h.sidebar.controller.state.comparison.id,'next');assert.deepEqual(h.sidebar.controller.state.patch,full.controller.state.patch);
});
test('loaded view transfer retains the include-uncommitted control with its comparison',()=>{
 const h=harness();h.sidebar.includeWorking=true;h.sidebar.publish();const full=h.view();full.activateContext(h.context,h.cx);
 assert.equal(full.includeWorking,true);assert.equal(h.calls.length,0);
});
test('loaded view transfer retains the chosen upper Comments section without Git',()=>{
 const h=harness();h.sidebar.upperView='comments';h.sidebar.publish();const full=h.view();full.activateContext(h.context,h.cx);
 assert.equal(full.upperView,'comments');assert.equal(h.calls.length,0);
});
test('loaded view transfer retains wrapping and All files with the selected patch',()=>{
 const h=harness();h.sidebar.readingOptions={wrap:true};h.sidebar.allFiles=true;h.sidebar.publish();const full=h.view();full.activateContext(h.context,h.cx);
 assert.equal(full.readingOptions.wrap,true);assert.equal(full.allFiles,true);assert.equal(full.allFileSections[0].patch.hunks[0].lines[0].text,'loaded code');assert.equal(h.calls.length,0);
});
test('cached presentation is rejected after Refresh or a different context/configuration',()=>{
 const h=harness();h.sidebar.publish();const full=h.view();full.activeContext={...h.context,key:'other'};full.selectionKey=contextStorageKey('selection','space',full.activeContext);assert.equal(full.restoreLoadedView(h.data.get(h.sidebar.selectionKey),h.cx),false);
 full.activeContext=h.context;full.selectionKey=h.sidebar.selectionKey;full.contextProps.config={maxDepth:1};assert.equal(full.restoreLoadedView(h.data.get(h.sidebar.selectionKey),h.cx),false);
 full.contextProps={};h.sidebar.refreshContext(h.cx);assert.equal(full.restoreLoadedView(h.data.get(h.sidebar.selectionKey),h.cx),false);
});
test('collapse transfers whole-file expansion and paginated history even without a selection change',async()=>{
 const h=harness();h.sidebar.publish();const full=h.view();full.role='full';full.activateContext(h.context,h.cx);if(full.pending)await full.pending;
 full.controller.state.patch.hunks[0].lines.push({newLine:2,text:'unchanged context'});full.controller.state.history.push({oid:'older'});full.controller.state.hasMore=false;full.terminal();
 h.sidebar.sync(h.cx);if(h.sidebar.pending)await h.sidebar.pending;
 assert.equal(h.calls.length,0);assert.equal(h.sidebar.controller.state.patch.hunks[0].lines.length,2);assert.equal(h.sidebar.controller.state.history.length,2);assert.equal(h.sidebar.controller.state.hasMore,false);
});
