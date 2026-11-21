import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,run} from './helpers/repos.mjs';
import {Controller} from '../mods/juhas/controller.js';
import {createCache} from '../mods/juhas/cache.js';
import {resolveConfig,selectBase} from '../mods/juhas/config.js';
import {allowedRepository,contextStorageKey} from '../mods/juhas/context.js';
import {typography} from '../mods/juhas/typography.js';
import {isTestFile,currentBranchFits,branchChoices} from '../mods/juhas/review-ui.js';

test('controller tracks hasWorkingChanges on openRepo and refresh transitions',async t=>{
 const f=fixture(t);f.commit('base\n');
 const data=new Map(),c=new Controller({run,store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});
 await c.openRepo(null,f.root);
 assert.equal(c.state.hasWorkingChanges,false);

 writeFileSync(join(f.root,'untracked.txt'),'hello\n');
 await c.refresh();
 assert.equal(c.state.hasWorkingChanges,true);

 rmSync(join(f.root,'untracked.txt'));
 await c.refresh();
 assert.equal(c.state.hasWorkingChanges,false);

 writeFileSync(join(f.root,'file.txt'),'modified\n');
 await c.refresh();
 assert.equal(c.state.hasWorkingChanges,true);
});

function renderFixture(){
 const element=(id)=>{let proxy;const data={nodes:[],values:{}};if(id)data.id=id;proxy=new Proxy(data,{get:(t,k)=>k in t?t[k]:(...args)=>{if(k==='id')t.id=args[0];else if(k==='child')t.nodes.push(args[0]);else if(k==='children')t.nodes.push(...args[0]);else if(k==='when'){if(args[0])args[1](proxy);}else t.values[k]=args.length===1?args[0]:args;return proxy;}});return proxy;};
 const controls=new Map(),control=(id,label,action,options)=>{const node=element(id);Object.assign(node,{label,action,options});controls.set(id,node);return node;};
 const sharedData=new Map();
 const deps={branchChoices,uiMetrics:()=>typography(14,16),theme:()=>({ansi2:'added',ansi1:'removed',accent:'accent-color',muted:'muted-color',foreground:'fg-color'}),div:element,section:element,h_flex:element,v_flex:element,nativeFrame:element,svg:element,text:(label)=>{const node=element();node.label=label;return node;},button:control,buttonGroup:control,checkbox:(id,label,checked,action,options)=>control(id,label,action,{...options,checked}),toggle:(id,label,pressed,action,options)=>control(id,label,action,{...options,pressed}),popover:(id,label,open,action,content,options)=>{const node=control(id,label,action,options);if(open)node.nodes.push(content());return node;},h_resizable:element,v_resizable:element,resizable_panel:element,filesPane:()=>element('files-content'),historyPane:()=>element('history-content'),draftsPane:()=>element('comments-content'),diffPane:()=>element('diff-content'),shared:k=>sharedData.get(k),setShared:(k,v)=>sharedData.set(k,v)};
 deps.selector=deps.popover;
 deps.optionList=(id,items,_index,_move,_choose,{renderLabel})=>element(id).children(items.map(item=>control(item.id,renderLabel(item))));
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View','isTestFile','currentBranchFits',...Object.keys(deps),'class Juhas extends View'+source+'\nreturn Juhas;')(class{},isTestFile,currentBranchFits,...Object.values(deps));
 const view=Object.create(Native.prototype),state={repo:{key:'repo'},branch:'feature/topic',files:[],history:[],refs:[],hasWorkingChanges:null,comparison:{id:'comparison',scope:{kind:'branch'},targetOid:'abcdef0123456789'}};
 Object.assign(view,{id:'review',role:'pane',contextProps:{},config:{},inputs:{},deferSync(){},baseChoice:()=>({ref:'refs/heads/main'}),hasUnsavedComment:()=>false,footer:()=>null,rememberLoadedView(){},controller:{base:()=>'',state,session:()=>({drafts:[]})}});
 const cx={notify(){}},walk=node=>node?[node,...(node.nodes||[]).flatMap(walk)]:[];
 return {view,state,controls,cx,sharedData,render:()=>walk(view.render(cx)),walk};
}

test('include-working button signals dirty, clean, and unknown working-tree states',()=>{
 const {view,state,controls,render,walk}=renderFixture();

 // Unknown state: no dot, neutral tooltip
 state.hasWorkingChanges=null;
 render();
 let btn=controls.get('include-working');
 assert.ok(btn);
 assert.equal(btn.options.tooltip,'Include uncommitted changes');
 assert.ok(!walk(btn.label).some(n=>n.id==='include-working-dot'));

 // Clean state (off): dimmed muted icon, no dot, clean tooltip
 state.hasWorkingChanges=false;
 view.includeWorking=false;
 render();
 btn=controls.get('include-working');
 assert.match(btn.options.tooltip,/working tree clean/i);
 assert.ok(!walk(btn.label).some(n=>n.id==='include-working-dot'));
 let icon=walk(btn.label).find(n=>n.id==='mods/juhas/icons/file-pen-line.svg');
 assert.equal(icon.values.text_color,'muted-color');
 assert.equal(icon.values.opacity,0.45);

 // Dirty state (off): accent dot, full-color icon, available tooltip
 state.hasWorkingChanges=true;
 view.includeWorking=false;
 render();
 btn=controls.get('include-working');
 assert.match(btn.options.tooltip,/uncommitted changes available/i);
 const dot=walk(btn.label).find(n=>n.id==='include-working-dot');
 assert.ok(dot,'dirty working tree shows status dot');
 assert.equal(dot.values.bg,'accent-color');
 icon=walk(btn.label).find(n=>n.id==='mods/juhas/icons/file-pen-line.svg');
 assert.equal(icon.values.text_color,'fg-color');
 assert.equal(icon.values.opacity,undefined);

 // Dirty state (on): pressed, dot still shown, active tooltip
 view.includeWorking=true;
 render();
 btn=controls.get('include-working');
 assert.equal(btn.options.pressed,true);
 assert.equal(btn.options.tooltip,'Including uncommitted changes');
 assert.ok(walk(btn.label).some(n=>n.id==='include-working-dot'));
});

function persistenceHarness(){
 const data=new Map(),memory={};let version=0;
 let source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');
 source=source.slice(source.indexOf('export default class')).replace('export default class Juhas extends View','class Juhas extends View');
 const store={get:k=>data.get(k),set:(k,v)=>data.set(k,v)};
 const noop=async()=>{};
 const deps={globalThis:memory,Controller,createCache,resolveConfig,selectBase,allowedRepository,contextStorageKey,createRunner:()=>noop,exec:noop,cache:createCache(),store,shared:store.get,setShared:store.set,uid:()=>String(++version),scopeCache:new Map(),resolveRepositoryScope:noop,readDirectories:noop,appHome:()=>'',run:()=>{},resolveRepo:noop,hasWorkingChanges:async()=>false,workingLineCounts:async()=>({additions:0,deletions:0})};
 const Native=new Function('View',...Object.keys(deps),source+'\nreturn Juhas;')(class{},...Object.values(deps));
 const cx={notify(){},spawn(fn){return fn(cx);},timer:{after:(_ms,fn)=>fn(cx)}};
 function makeView(context,repo){
  const v=Object.create(Native.prototype);
  Object.assign(v,{contextProps:{},config:resolveConfig(),contextViews:new Map(),policy:{ready:true,repos:[repo],canSwitch:false},inputs:{},role:'sidebar',sessionId:context.spaceId,followContext:true,activeContext:context,selectionKey:contextStorageKey('selection',context.spaceId,context),allChangesFrom:'branch',includeWorking:false});
  for(const key of ['folder','base','target','query','author','path','comment','note']){let value='';v.inputs[key]={value:()=>value,set_value:x=>value=x};}
  v.controller=new Controller({run:noop,store,sessionId:context.spaceId});
  v.controller.state={...v.controller.state,repo,branch:'feature',refs:[{fullName:'refs/heads/main',name:'main'}],comparison:{id:'comp-'+repo.key,repoKey:repo.key,scope:{kind:'branch',baseRef:'refs/heads/main',targetRef:'HEAD'}},files:[]};
  v.loadConfig=async()=>{};
  v.work=(_cx,fn)=>v.pending=fn(_cx);
  v.applyAllChangesCalls=[];
  v.applyAllChanges=(_cx)=>{v.applyAllChangesCalls.push(v.includeWorking);v.controller.state.comparison={...v.controller.state.comparison,scope:{kind:'branch',baseRef:'refs/heads/main',targetRef:'HEAD',...(v.includeWorking?{includeWorking:true}:{})}};v.publish();};
  v.applyPreferences();
  return v;
 }
 return {makeView,data,memory,cx};
}

test('includeWorking remembers last toggle on reopen without live-syncing other open Juhas instances',()=>{
 const h=persistenceHarness();
 const repoA={key:'repoA',root:'/repoA',machine:null};
 const repoB={key:'repoB',root:'/repoB',machine:null};
 const ctx1={key:'c1',spaceId:'s1',tabId:'t1',folder:'/repoA',machine:null};
 const ctx2={key:'c2',spaceId:'s2',tabId:'t2',folder:'/repoB',machine:null};

 const juhas1=h.makeView(ctx1,repoA);
 const juhas2=h.makeView(ctx2,repoB);
 juhas1.publish();
 juhas2.publish();

 // Toggle ON in juhas1: juhas2 stays OFF even after syncPreferences & sync
 juhas1.setIncludeWorking(true,h.cx);
 assert.equal(juhas1.includeWorking,true);
 juhas2.syncPreferences();
 juhas2.sync(h.cx);
 assert.equal(juhas2.includeWorking,false,'open second Juhas must not auto-enable');

 // Reopen juhas2 (new instance, cached loadedViews snapshot had includeWorking=false): picks up true
 const reopened2=h.makeView(ctx2,repoB);
 reopened2.activeContext=null;
 reopened2.activateContext(ctx2,h.cx);
 assert.equal(reopened2.includeWorking,true,'reopened Juhas picks up last toggled state (true)');
 assert.deepEqual(reopened2.applyAllChangesCalls,[true]);

 // Toggle ON then OFF in reopened2: remembers OFF as the last state change
 reopened2.setIncludeWorking(true,h.cx);
 reopened2.setIncludeWorking(false,h.cx);
 assert.equal(juhas1.includeWorking,true,'first open Juhas stays unaffected');

 // Reopen juhas1: picks up false (last state change)
 const reopened1=h.makeView(ctx1,repoA);
 reopened1.activeContext=null;
 reopened1.activateContext(ctx1,h.cx);
 assert.equal(reopened1.includeWorking,false,'reopened first Juhas picks up last toggled state (false)');
 assert.deepEqual(reopened1.applyAllChangesCalls,[false]);
});

test('cold restart overrides stale selection.includeWorking with last remembered toggle and switchRepository inherits it',async()=>{
 const h=persistenceHarness();
 const repoA={key:'repoA',root:'/repoA',machine:null};
 const repoB={key:'repoB',root:'/repoB',machine:null};
 const ctx1={key:'c1',spaceId:'s1',tabId:'t1',folder:'/repoA',machine:null};

 // Simulate persisted selection with includeWorking=false, while last toggle is true, and empty loadedViews cache (cold restart)
 const selKey=contextStorageKey('selection',ctx1.spaceId,ctx1);
 h.data.set(selKey,{root:'/repoA',machine:null,scope:{kind:'branch',baseRef:'refs/heads/main',targetRef:'HEAD'},comparison:{id:'stale',repoKey:'repoA',scope:{kind:'branch',baseRef:'refs/heads/main',targetRef:'HEAD'}},includeWorking:false,version:'v1'});
 h.data.set('juhas.include-working.v1',true);

 const scopes=[];
 const v=h.makeView(ctx1,repoA);
 v.activeContext=null;
 v.repositoryDiscovery=()=>({primary:Promise.resolve(repoA),scope:Promise.resolve({repos:[repoA,repoB],canSwitch:true,kind:'multi'})});
 const origController=v.controller;
 origController.openRepo=async(_m,_r,{repo})=>{origController.state={...origController.state,repo,branch:'feature',refs:[{fullName:'refs/heads/main',name:'main'}]};};
 origController.selectScope=async(scope)=>{scopes.push(scope);origController.state={...origController.state,comparison:{id:'fresh',repoKey:repoA.key,scope},files:[]};};
 origController.selectResolved=async()=>{throw new Error('Should not reuse stale comparison when remembered includeWorking differs');};
 v.updateFeatureHistory=async()=>{};
 v.registerReviewTab=()=>{};
 v.contextViews.set(ctx1.key,{controller:origController,policy:{repos:[repoA,repoB],canSwitch:true,ready:false}});
 v.activateContext(ctx1,h.cx);
 await v.pending;
 assert.equal(v.includeWorking,true);
 assert.deepEqual(scopes,[{kind:'branch',baseRef:'refs/heads/main',targetRef:'HEAD',includeWorking:true}]);

 // Switching to a fresh repoB inherits remembered includeWorking=true
 v.policy={repos:[repoA,repoB],canSwitch:true,ready:true};
 let switchedInitialIncludeWorking=null;
 v.selectInitialScope=async()=>{switchedInitialIncludeWorking=v.includeWorking;};
 const origOpen=Controller.prototype.openRepo;
 Controller.prototype.openRepo=async function(_m,_r,{repo}){this.state={...this.state,repo,branch:'main',refs:[{fullName:'refs/heads/main',name:'main'}]};};
 try{
  await v.switchRepository(repoB,h.cx);
  await v.pending;
 }finally{Controller.prototype.openRepo=origOpen;}
 assert.equal(v.includeWorking,true);
 assert.equal(switchedInitialIncludeWorking,true);
});

test('poll notifies view when only hasWorkingChanges changes without republishing selection',async()=>{
 const h=persistenceHarness();
 const repoA={key:'repoA',root:'/repoA',machine:null};
 const ctx1={key:'c1',spaceId:'s1',tabId:'t1',folder:'/repoA',machine:null};
 const v=h.makeView(ctx1,repoA);
 v.controller.state.hasWorkingChanges=false;
 v.publish();
 const beforeVersion=h.data.get(v.selectionKey).version;
 let notified=0;
 v.controller.refresh=async()=>{v.controller.state.hasWorkingChanges=true;return true;};
 await v.poll({notify(){notified++;}});
 assert.equal(notified,1);
 assert.equal(h.data.get(v.selectionKey).version,beforeVersion);
});
