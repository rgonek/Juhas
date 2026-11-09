import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectBase} from '../mods/juhas/config.js';
import {rangeSelection} from '../mods/juhas/review-ui.js';
import {fixture,run} from './helpers/repos.mjs';
import {Controller} from '../mods/juhas/controller.js';
function view(sharedData=new Map()){
 let source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export default class')).replace('export default class Juhas extends View','class Juhas extends View');
 const Native=new Function('View','selectBase','rangeSelection','shared','setShared','uid',source+'\nreturn Juhas;')(class{},selectBase,rangeSelection,k=>sharedData.get(k),(k,v)=>sharedData.set(k,v),()=> 'version');
 const v=Object.create(Native.prototype),calls=[];let manual='';v.config={baseRules:[]};v.role='sidebar';v.selectionKey='selection';v.inputs={};for(const key of ['base','target','folder','query','author','path']){let value='';v.inputs[key]={value:()=>value,set_value:next=>value=next};}
 v.controller={state:{repo:{root:'/repo',key:'r'},branch:'feature/topic',refs:[{name:'trunk',fullName:'refs/heads/trunk'}],history:[{oid:'first'},{oid:'last'}],comparison:{id:'old',scope:{kind:'commit'},targetOid:'last'}},base:()=>manual,setBase:value=>manual=value,selectScope:async scope=>{calls.push(scope);v.controller.state.comparison={id:'same-trees',scope,targetOid:scope.commit||'last'};},selectResolved:async snapshot=>{v.controller.state.comparison=snapshot;},lastCheckpoint:async()=>({id:'checkpoint'})};v.handle={focus(){}};v.work=(_cx,action)=>v.pending=action(_cx);return {v,calls,sharedData};
}
test('All changes retains its base across commits and manual commit baseline is exclusive',async()=>{
 const {v,calls}=view(),cx={notify(){}};v.controller.setBase('refs/heads/trunk');v.restoreBase();v.applyAllChanges(cx);await v.pending;assert.equal(calls.at(-1).kind,'branch');assert.equal(v.reviewMode(),'all');
 v.selectCommit('first',cx);await v.pending;assert.equal(v.reviewMode(),'commit');assert.equal(calls.at(-1).commit,'first');v.applyAllChanges(cx);await v.pending;assert.equal(calls.at(-1).baseRef,'refs/heads/trunk');
 v.allChangesFrom='commit';v.manualCommitBase='baseline';v.applyAllChanges(cx);await v.pending;assert.deepEqual(calls.at(-1),{kind:'range',base:'baseline',target:'HEAD',includeBase:false});
});
test('All changes always targets HEAD, including advanced contexts',async()=>{
 const {v,calls}=view(),cx={notify(){}};v.config.showAdvanced=true;v.controller.setBase('trunk');v.restoreBase();v.inputs.target.set_value('earlier');v.applyAllChanges(cx);await v.pending;assert.equal(calls.at(-1).targetRef,'HEAD');
});
test('unresolved base opens the native picker without blocking Commit; legacy advanced ranges and working tree remain',async()=>{
 const {v,calls}=view(),cx={notify(){}};v.applyAllChanges(cx);await v.pending;assert.equal(v.panel,'refs');assert.equal(calls.length,0);assert.equal(v.reviewMode(),'commit');
 v.selectCommit('first',cx);await v.pending;assert.equal(calls.at(-1).kind,'commit');v.applyScope('range',cx);await v.pending;v.selectCommit('first',cx);v.selectCommit('last',cx);await v.pending;assert.equal(calls.at(-1).includeBase,true);
 v.applyScope('working-tree',cx);await v.pending;assert.deepEqual(calls.at(-1),{kind:'working-tree',baseRef:'HEAD'});
});
test('sidebar and expanded synchronize both mode and baseline even for identical tree comparisons',async()=>{
 const data=new Map(),a=view(data).v,b=view(data).v,cx={notify(){}};a.controller.setBase('refs/heads/trunk');a.allChangesFrom='commit';a.manualCommitBase='chosen';a.controller.state.comparison={id:'same-trees',scope:{kind:'range',base:'chosen',target:'HEAD',includeBase:false}};a.publish();
 b.role='full';b.controller.state.comparison={id:'same-trees',scope:{kind:'commit',commit:'head'}};b.sync(cx);await b.pending;assert.equal(b.reviewMode(),'all');assert.equal(b.manualCommitBase,'chosen');assert.equal(b.allChangesFrom,'commit');assert.equal(b.controller.state.comparison.scope.kind,'range');
});


test('cold startup shows the persisted mode before Git restores the comparison; new contexts default to Branch',()=>{
 const {v,sharedData}=view();v.controller.state.comparison=null;
 assert.equal(v.reviewMode(),'all');
 sharedData.set('selection',JSON.parse(JSON.stringify({scope:{kind:'commit',commit:'chosen',parentIndex:1}})));assert.equal(v.reviewMode(),'commit');
 for(const scope of [{kind:'branch',baseRef:'trunk'},{kind:'since-review',checkpointId:'round'},{kind:'range',base:'chosen',includeBase:false},{kind:'working-tree'}]){sharedData.set('selection',{scope});assert.equal(v.reviewMode(),scope.kind==='working-tree'?'uncommitted':'all');}
 v.controller.state.comparison={scope:{kind:'commit',commit:'current'}};assert.equal(v.reviewMode(),'commit');
});


test('a superseded base resolution does not start another history load',async()=>{const {v}=view();let loads=0;v.controller.setHistoryBase=async()=>false;v.controller.loadHistory=async()=>{loads++;};await v.updateFeatureHistory();assert.equal(loads,0);});

test('All files suppresses a stale expansion failure after the comparison changes',async()=>{
 const {v}=view(),comparison={id:'comparison-1'},file={id:'file-1',newPath:'file.ts'};let rejectRead;const tasks=[];
 v.controller.state.comparison=comparison;v.controller.readFilePatch=()=>new Promise((_,reject)=>rejectRead=reject);v.allFileSections=[{file,comparison,collapsed:true,patch:null}];v.closed=false;v.prepareFileHeaders=()=>{};v.setFindQuery=()=>{};v.message='Current comparison message';
 const cx={notify(){},spawn(action){tasks.push(action(cx));}};v.requestAllFiles(file.id,cx);assert.equal(v.allFileSections[0].loading,true);v.controller.state.comparison={id:'comparison-2'};rejectRead(new Error('stale file read failed'));await tasks[0];
 assert.equal(v.message,'Current comparison message');assert.equal(v.allFileSections[0].patch,null);
});

test('Commit to All changes to Uncommitted keeps the last real selection and suppresses stale errors',async t=>{
 const f=fixture(t),base=f.commit('base\n');f.git('checkout','-b','feature');const commit=f.commit('feature\n');let delayed=false,release,started;const blocked=new Promise(r=>started=r),wait=new Promise(r=>release=r);
 const data=new Map(),c=new Controller({run:async(repo,args)=>{if(delayed&&args[0]==='rev-parse'&&args.includes(`${commit}^{commit}`)){delayed=false;started();await wait;throw new Error('stale commit read failed');}return run(repo,args);},store:{get:k=>data.get(k),set:(k,v)=>data.set(k,structuredClone(v))}});
 await c.openRepo(null,f.root);c.state.history=[];const {v}=view(data);v.controller=c;v.config={baseRules:[],baseRef:'refs/heads/trunk'};v.notifyEditor=()=>{};v.rememberLoadedView=()=>{};const actions=[];v.work=(_cx,action)=>{actions.push(v.workAsync({notify(){}},action));};const cx={notify(){}};
 delayed=true;v.selectCommit(commit,cx);await blocked;v.allChangesFrom='branch';v.applyAllChanges(cx);await actions.at(-1);v.applyScope('working-tree',cx);await actions.at(-1);assert.equal(c.state.comparison.scope.kind,'working-tree');assert.equal(c.state.scopeLoading,false);assert.equal(c.state.patchLoading,false);assert.equal(v.message,'');
 release();await actions[0];assert.equal(c.state.comparison.scope.kind,'working-tree');assert.equal(c.state.scopeLoading,false);assert.equal(c.state.patchLoading,false);assert.equal(v.message,'');assert.notEqual(base,commit);
});

test('Git request budget failure clears loading, retains the displayed comparison, and later navigation recovers',async t=>{
 const f=fixture(t);f.commit('first\n');const head=f.commit('second\n');const data=new Map(),c=new Controller({run,store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});
 await c.openRepo(null,f.root);await c.selectScope({kind:'commit',commit:'HEAD~1',parentIndex:0});const retained=c.state.comparison;
 const {v}=view(data);v.controller=c;v.config={baseRules:[],prefetch:false};v.notifyEditor=()=>{};v.rememberLoadedView=()=>{};const cx={notify(){}};
 const assertRetained=()=>{assert.equal(c.state.comparison,retained);assert.equal(c.state.scopeLoading,false);assert.equal(c.state.patchLoading,false);};
 const originalNow=Date.now;let clockReads=0;Date.now=()=>clockReads++===0?0:25001;
 try{await v.workAsync(cx,()=>c.selectScope({kind:'commit',commit:head,parentIndex:0}));}finally{Date.now=originalNow;}
 assert.match(v.message,/time budget/i);assertRetained();
 await v.workAsync(cx,()=>c.selectScope({kind:'commit',commit:'f'.repeat(40),parentIndex:0}));assert.match(v.message,/fatal|unknown|needed|bad/i);assertRetained();
 let rejectNext=true;c.run=async(repo,args)=>{if(rejectNext){rejectNext=false;throw new Error('injected child process rejection');}return run(repo,args);};
 await v.workAsync(cx,()=>c.selectScope({kind:'range',base:'HEAD~1',target:'HEAD',includeBase:true}));assert.match(v.message,/injected child process rejection/);assertRetained();
 c.run=run;
 await v.workAsync(cx,()=>c.selectScope({kind:'commit',commit:head,parentIndex:0}));assert.equal(c.state.comparison.scope.commit,head);assert.equal(c.state.scopeLoading,false);assert.equal(v.message,'');
});

test('superseded branch failure does not reopen the base picker',async()=>{const {v}=view();let rejectOld;v.controller.setBase('refs/heads/trunk');v.restoreBase();v.setReferencePicker=()=>{v.panel='refs';};v.controller.selectScope=async scope=>{if(scope.kind==='branch')await new Promise((_,reject)=>rejectOld=reject);else v.controller.state.comparison={scope};};v.applyScope('branch',{notify(){}});const old=v.pending;v.applyScope('working-tree',{notify(){}});await v.pending;rejectOld(new Error('old base failure'));await old;assert.equal(v.panel,undefined);assert.equal(v.pendingScope,null);});
test('returning to the same file does not revive an older failure',async()=>{const {v}=view();v.config.prefetch=false;v.notifyEditor=()=>{};v.rememberLoadedView=()=>{};v.revealSelectedSection=()=>{};let rejectOld,first=true;v.controller.selectFile=async id=>{v.controller.state.file={id};if(first){first=false;await new Promise((_,reject)=>rejectOld=reject);}};const actions=[];v.work=(_cx,action)=>actions.push(v.workAsync({notify(){}},action));v.selectFile('a',{});v.selectFile('b',{});await actions[1];v.selectFile('a',{});await actions[2];rejectOld(new Error('obsolete first a read'));await actions[0];assert.equal(v.message,'');});
test('delayed Automatic never replaces a newer source selection',async()=>{
 const {v}=view(),cx={notify(){}};let release;const actions=[],original=v.applyScope;v.applyScope=function(kind,cx){actions.push(kind);return original.call(this,kind,cx);};v.controller.ensureAutomaticBase=()=>release?Promise.resolve():new Promise(resolve=>release=resolve);v.updateFeatureHistory=async()=>{};
 v.chooseAutomaticBase(cx);const old=v.pending;v.applyScope('commit',cx);await v.pending;release({ref:'refs/heads/trunk'});await old;assert.deepEqual(actions,['commit']);assert.equal(v.controller.state.comparison.scope.kind,'commit');
});
