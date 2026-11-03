import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectBase} from '../mods/juhas/config.js';
import {rangeSelection} from '../mods/juhas/review-ui.js';
function view(sharedData=new Map()){
 let source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export default class')).replace('export default class Juhas extends View','class Juhas extends View');
 const Native=new Function('View','selectBase','rangeSelection','shared','setShared','uid',source+'\nreturn Juhas;')(class{},selectBase,rangeSelection,k=>sharedData.get(k),(k,v)=>sharedData.set(k,v),()=> 'version');
 const v=Object.create(Native.prototype),calls=[];let manual='';v.config={baseRules:[]};v.role='sidebar';v.selectionKey='selection';v.inputs={};for(const key of ['base','target','folder','query','author','path']){let value='';v.inputs[key]={value:()=>value,set_value:next=>value=next};}
 v.controller={state:{repo:{root:'/repo',key:'r'},branch:'feature/topic',refs:[{name:'trunk',fullName:'refs/heads/trunk'}],history:[{oid:'first'},{oid:'last'}],comparison:{id:'old',scope:{kind:'commit'},targetOid:'last'}},base:()=>manual,setBase:value=>manual=value,selectScope:async scope=>{calls.push(scope);v.controller.state.comparison={id:'same-trees',scope,targetOid:scope.commit||'last'};},selectResolved:async snapshot=>{v.controller.state.comparison=snapshot;},lastCheckpoint:async()=>({id:'checkpoint'})};v.handle={focus(){}};v.work=(_cx,action)=>v.pending=action();return {v,calls,sharedData};
}
test('All changes retains its base across commits and manual commit baseline is exclusive',async()=>{
 const {v,calls}=view(),cx={notify(){}};v.controller.setBase('refs/heads/trunk');v.restoreBase();v.applyAllChanges(cx);await v.pending;assert.equal(calls.at(-1).kind,'branch');assert.equal(v.reviewMode(),'all');
 v.selectCommit('first',cx);await v.pending;assert.equal(v.reviewMode(),'commit');assert.equal(calls.at(-1).commit,'first');v.applyAllChanges(cx);await v.pending;assert.equal(calls.at(-1).baseRef,'refs/heads/trunk');
 v.allChangesFrom='commit';v.manualCommitBase='baseline';v.applyAllChanges(cx);await v.pending;assert.deepEqual(calls.at(-1),{kind:'range',base:'baseline',target:'HEAD',includeBase:false});
 v.allChangesFrom='checkpoint';v.applyAllChanges(cx);await v.pending;assert.deepEqual(calls.at(-1),{kind:'since-review',checkpointId:'checkpoint',targetRef:'HEAD'});
});
test('All changes always targets HEAD, including advanced contexts; failed checkpoint selection retains the applied source',async()=>{
 const {v,calls}=view(),cx={notify(){}};v.config.showAdvanced=true;v.controller.setBase('trunk');v.restoreBase();v.inputs.target.set_value('earlier');v.applyAllChanges(cx);await v.pending;assert.equal(calls.at(-1).targetRef,'HEAD');
 v.controller.lastCheckpoint=async()=>null;v.allChangesFrom='checkpoint';v.applyAllChanges(cx);await assert.rejects(()=>v.pending,/No checkpoint/);assert.equal(v.allChangesFrom,'branch');assert.equal(v.controller.state.comparison.scope.kind,'branch');
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


test('cold startup shows the persisted mode before Git restores the comparison; new contexts default to Commit',()=>{
 const {v,sharedData}=view();v.controller.state.comparison=null;
 assert.equal(v.reviewMode(),'commit');
 sharedData.set('selection',JSON.parse(JSON.stringify({scope:{kind:'commit',commit:'chosen',parentIndex:1}})));assert.equal(v.reviewMode(),'commit');
 for(const scope of [{kind:'branch',baseRef:'trunk'},{kind:'since-review',checkpointId:'round'},{kind:'range',base:'chosen',includeBase:false},{kind:'working-tree'}]){sharedData.set('selection',{scope});assert.equal(v.reviewMode(),scope.kind==='working-tree'?'uncommitted':'all');}
 v.controller.state.comparison={scope:{kind:'commit',commit:'current'}};assert.equal(v.reviewMode(),'commit');
});


test('a superseded base resolution does not start another history load',async()=>{const {v}=view();let loads=0;v.controller.setHistoryBase=async()=>false;v.controller.loadHistory=async()=>{loads++;};await v.updateFeatureHistory();assert.equal(loads,0);});
