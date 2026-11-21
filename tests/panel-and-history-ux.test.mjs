import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {typography} from '../mods/juhas/typography.js';
import {layoutGraph} from '../mods/juhas/graph.js';
import {fileRows,filterDrafts} from '../mods/juhas/review-ui.js';
import {formatCommitTime} from '../mods/juhas/commit-time.js';

function uiFixture(){
 const element=(kind,identity)=>{let proxy;const data={kind,identity,nodes:[],values:{}};proxy=new Proxy(data,{get:(t,k)=>k in t?t[k]:(...args)=>{if(k==='id')t.identity=args[0];else if(k==='child')t.nodes.push(args[0]);else if(k==='children')t.nodes.push(...args[0]);else if(k==='when'){if(args[0])args[1](proxy);}else t.values[k]=args.length===1?args[0]:args;return proxy;}});return proxy;};
 const controls=new Map(),lists=new Map();
 const Popup={new:(id,trigger)=>{const n=element('popup',id);n.trigger=trigger;n.nodes.push(trigger);n.content=c=>{n.popupContent=c;n.nodes.push(c);return n;};return n;}};
 const Select={new:id=>element('select',id)};
 const Popover={new:id=>{const n=element('popover',id);n.trigger=tr=>{n.triggerNode=tr;n.nodes.push(tr);return n;};n.content=c=>{n.contentNode=c;n.nodes.push(c);return n;};return n;}};
 const Button={new:id=>{const n=element('button',id);controls.set(id,n);return n;}};
 const Toggle={new:id=>{const n=element('toggle',id);controls.set(id,n);return n;}};
 const Checkbox={new:id=>element('checkbox',id)};
 const Switch={new:id=>element('switch',id)};
 const Input={new:()=>element('input')};
 const Scrollbar={vertical:id=>element('scrollbar',id)};
 const PathBuilder={stroke:()=>({move_to:()=>({line_to:()=>({build:()=>({})})})})};
 const v_virtual_list=(id,count,_h,keyFn,renderRange)=>{const n=element('vlist',id);const range={start:0,end:count};n.keys=Array.from({length:count},(_,i)=>keyFn(i));n.nodes.push(...renderRange(range));n.on_item_click=fn=>{n.itemClick=fn;return n;};lists.set(id,n);return n;};
 const themeObj={background:'bg',foreground:'fg',muted:'muted',border:'border',accent:'accent',selected:'selected',hover:'hover',chrome:'chrome',solid:'solid',solid_foreground:'solid-fg',ansi1:'c1',ansi2:'c2',ansi3:'c3',ansi4:'c4',ansi5:'c5',ansi6:'c6'};
 const source=readFileSync(new URL('../mods/juhas/ui.js',import.meta.url),'utf8')
  .replace(/^import .*$/gm,'')
  .replace(/export function /g,'function ')
  .replace(/export const /g,'const ');
 const deps={
  div:()=>element('div'),image:p=>element('image',p),PathBuilder,svg:p=>element('svg',p),list:()=>element('list'),
  pierreFileIcon:()=>'default',
  h_flex:()=>element('h_flex'),v_flex:()=>element('v_flex'),v_virtual_list,Scrollbar,Input,Button,Checkbox,Toggle,Switch,Popover,Select,Popup,
  theme:()=>themeObj,settings:()=>({ui_font_size:14}),typography,layoutGraph,
  fileRows,splitRowBatches:()=>[],changeGroups:()=>[],filterDrafts,isTestFile:()=>false,
  annotatePatchBatches:()=>[],composerRows:()=>[],measuredCommentRows:()=>[],measuredCommentRowBatches:()=>[],commentHeight:()=>20,INLINE_EDITOR_HEIGHT:40,INLINE_EDITOR_MAX_HEIGHT:100,
  formatCommitTime,
  decorateLine:()=>[],findMatchRanges:()=>[],intraline:()=>[],multiFileRowBatches:()=>[],lineInfoBatches:()=>[],DIFF_BATCH_SIZE:100,VIRTUAL_DIFF_ROW_LIMIT:1000,finishDiffBatches:()=>{},runDiffBatches:()=>{},
  graphemes:s=>[...s],
  window:{rem_size:()=>16,paint_path:()=>element('path')}
 };
 const exports=new Function(...Object.keys(deps),source+'\nreturn {historyPane,filesPane,draftsPane,selector};')(...Object.values(deps));
 const walk=n=>n?[n,...(n.nodes||[]).flatMap(walk)]:[];
 return {...exports,controls,lists,walk};
}

test('historyPane shows Uncommitted changes row above HEAD when dirty and selects working-tree on click',()=>{
 const {historyPane,lists,walk}=uiFixture();
 const chosen=[];
 const view={
  id:'v',width:600,panel:null,
  panelPosition:()=>'top',
  positionPanel(){},
  chooseReviewSource:(src)=>chosen.push(src),
  selectCommit:(oid)=>chosen.push('commit:'+oid),
  inputs:{query:{value:()=>''},author:{value:()=>''},path:{value:()=>''}},
  controller:{state:{hasWorkingChanges:true,history:[{oid:'aaa111',subject:'First commit',author:'Alice',timestamp:1700000000,parents:[],refs:['HEAD -> main']}],comparison:{scope:{kind:'branch'},targetOid:'aaa111'}}}
 };
 const cx={notify(){}};
 const tree=historyPane(view,cx);
 const listKey=()=>[...lists.keys()].find(k=>k.startsWith('v-history-'));
 const list=lists.get(listKey());
 assert.ok(list);
 assert.deepEqual(list.keys,['__uncommitted__','aaa111']);
 assert.ok(walk(tree).some(n=>n.nodes?.includes('Uncommitted changes')));

 // Clicking uncommitted row switches to uncommitted source
 list.itemClick('__uncommitted__',cx);
 assert.deepEqual(chosen,['uncommitted']);

 // Clicking commit row still selects commit
 list.itemClick('aaa111',cx);
 assert.deepEqual(chosen,['uncommitted','commit:aaa111']);

 // When active scope is working-tree, uncommitted row is selected and commit row is not
 view.controller.state.comparison={scope:{kind:'working-tree'},targetOid:null};
 historyPane(view,cx);
 const activeList=lists.get(listKey());
 assert.equal(activeList.nodes[0].values.bg,'selected');
 assert.equal(activeList.nodes[1].values.bg,undefined);

 // When clean, uncommitted row is hidden
 view.controller.state.hasWorkingChanges=false;
 historyPane(view,cx);
 assert.deepEqual(lists.get(listKey()).keys,['aaa111']);

 // When search filter is active, uncommitted row is hidden even if dirty
 view.controller.state.hasWorkingChanges=true;
 view.inputs.query={value:()=>'First'};
 historyPane(view,cx);
 assert.deepEqual(lists.get(listKey()).keys,['aaa111']);
});

test('panel headers expose a position control for Files, History, and Comments',()=>{
 const {historyPane,filesPane,draftsPane,controls}=uiFixture();
 const moved=[];
 const view={
  id:'v',width:600,panel:null,
  filePanelPosition:'left',historyPanelPosition:'top',commentPanelPosition:'right',
  panelPosition:kind=>kind==='files'?'left':kind==='history'?'top':'right',
  positionPanel:(kind,place)=>moved.push([kind,place]),
  inputs:{query:{value:()=>''},author:{value:()=>''},path:{value:()=>''},fileQuery:{value:()=>''}},
  controller:{state:{repo:{key:'r'},files:[],history:[],hasWorkingChanges:false,comparison:{scope:{kind:'branch'}}},session:()=>({drafts:[]})}
 };
 const cx={notify(){}};
 filesPane(view,cx);
 historyPane(view,cx);
 draftsPane(view,cx);
 assert.ok(controls.has('header-position-files-trigger'),'Files header has position button');
 assert.ok(controls.has('header-position-history-trigger'),'History header has position button');
 assert.ok(controls.has('header-position-comments-trigger'),'Comments header has position button');
});
