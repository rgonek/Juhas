import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {typography} from '../mods/juhas/typography.js';
import {isTestFile,currentBranchFits,branchChoices} from '../mods/juhas/review-ui.js';

function fixture(){
 const element=(id)=>{let proxy;const data={nodes:[]};if(id)data.id=id;proxy=new Proxy(data,{get:(t,k)=>k in t?t[k]:(...args)=>{if(k==='id')t.id=args[0];else if(k==='child')t.nodes.push(args[0]);else if(k==='children')t.nodes.push(...args[0]);else if(k==='when'){if(args[0])args[1](proxy);}return proxy;}});return proxy;};
 const controls=new Map(),control=(id,label,action,options)=>{const node=element(id);Object.assign(node,{label,action,options});controls.set(id,node);return node;};
 const deps={branchChoices,uiMetrics:()=>typography(14,16),theme:()=>({}),div:element,section:element,h_flex:element,v_flex:element,nativeFrame:element,svg:element,text:(label)=>{const node=element();node.label=label;return node;},button:control,buttonGroup:control,checkbox:(id,label,checked,action)=>control(id,label,action,{checked}),toggle:(id,label,pressed,action)=>control(id,label,action,{pressed}),popover:(id,label,open,action,content)=>{const node=control(id,label,action);if(open)node.nodes.push(content());return node;},h_resizable:element,v_resizable:element,resizable_panel:element,filesPane:()=>element('files-content'),historyPane:()=>element('history-content'),draftsPane:()=>element('comments-content'),diffPane:()=>element('diff-content'),shared:()=>null};
 deps.selector=deps.popover;const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View','isTestFile','currentBranchFits',...Object.keys(deps),'class Juhas extends View'+source+'\nreturn Juhas;')(class{},isTestFile,currentBranchFits,...Object.values(deps));
 const view=Object.create(Native.prototype),state={repo:{key:'repo'},branch:'feature/topic',files:[],history:[],refs:[],comparison:{id:'comparison',scope:{kind:'branch'},targetOid:'abcdef0123456789'}};
 Object.assign(view,{id:'review',role:'pane',contextProps:{},config:{},inputs:{},deferSync(){},baseChoice:()=>({ref:'refs/heads/main'}),hasUnsavedComment:()=>false,footer:()=>null,rememberLoadedView(){},controller:{base:()=>'',state,session:()=>({drafts:[]})}});
 const cx={notify(){}},walk=node=>node?[node,...(node.nodes||[]).flatMap(walk)]:[];
 return {view,state,controls,cx,render:()=>walk(view.render(cx))};
}

test('one source picker shows current branch before base and retains include uncommitted',()=>{
 const {view,state,render,controls}=fixture();let nodes=render();
 assert.ok(!controls.has('scope'),'redundant scope tabs are removed');
 assert.ok(controls.has('compare-from'));assert.ok(controls.has('include-working'));
 const labels=nodes.map(n=>n.label);assert.ok(labels.indexOf('feature/topic')<labels.indexOf('→'),'current branch precedes base');
 const baseline=nodes.find(n=>n.id==='change-base');assert.ok(baseline);
 state.branch='(detached)';assert.ok(render().some(n=>n.label==='abcdef01'));
 view.panel='compareFrom';render();assert.ok(['source-branch','source-uncommitted','source-commit'].every(id=>controls.has(id)));
 view.panel='reviewMore';render();assert.ok(!controls.has('request-walkthrough')&&!controls.has('load-walkthrough'));
});

test('history is optional and all-file mode has no duplicate file list',()=>{
 const {view,state,controls,cx,render}=fixture();view.allFiles=true;
 const original=state.comparison;let nodes=render();
 assert.ok(!nodes.some(n=>n.id==='history-content'||n.id==='files-content'));
 assert.ok(nodes.some(n=>n.id==='diff-content'));
 controls.get('toggle-history').action(true,cx);nodes=render();assert.ok(nodes.some(n=>n.id==='history-content'));assert.ok(!nodes.some(n=>n.id==='files-content'));assert.equal(state.comparison,original);
 controls.get('toggle-history').action(false,cx);view.allFiles=false;nodes=render();assert.ok(nodes.some(n=>n.id==='files-content'));assert.ok(!nodes.some(n=>n.id==='history-content'));assert.equal(state.comparison,original);
 view.showHistory=true;view.workspaceLayout='sidebar';nodes=render();assert.ok(nodes.some(n=>n.id==='history-content'));assert.ok(nodes.some(n=>n.id==='files-content'));
});

test('fresh comparison defaults to Branch and empty repositories to Uncommitted',()=>{
 const {view,state}=fixture();state.comparison=null;
 assert.equal(view.reviewMode(),'all');assert.deepEqual(view.initialScope(),{kind:'branch',baseRef:'refs/heads/main',targetRef:'HEAD'});
 state.empty=true;assert.deepEqual(view.initialScope(),{kind:'working-tree',baseRef:'HEAD'});
 state.empty=false;view.baseChoice=()=>null;assert.equal(view.initialScope(),null,'missing base requires a branch choice');
});

test('source picker uses existing scope handlers and opens history for choosing a commit',()=>{
 const {view,cx}=fixture(),calls=[];view.applyScope=kind=>calls.push(kind);view.applyAllChanges=()=>calls.push(view.allChangesFrom);
 view.chooseReviewSource('branch',cx);view.chooseReviewSource('uncommitted',cx);view.chooseReviewSource('commit',cx);
 assert.deepEqual(calls,['branch','working-tree','commit']);assert.equal(view.showHistory,true);
});

test('opening history or choosing Commit from Comments reveals history without changing drafts',()=>{
 const {view,cx,render}=fixture(),drafts=[{id:'draft',body:'Keep this feedback'}];view.controller.session=()=>({drafts});view.upperView='comments';
 view.toggleHistory(true,cx);assert.equal(view.upperView,'changes');assert.ok(render().some(node=>node.id==='history-content'));assert.equal(view.controller.session().drafts,drafts);
 view.upperView='comments';view.showHistory=false;view.applyScope=()=>{};view.chooseReviewSource('commit',cx);assert.equal(view.upperView,'changes');assert.ok(render().some(node=>node.id==='history-content'));assert.equal(view.controller.session().drafts,drafts);
});

test('file rows expose icon actions and preserve their own source independently of selection',()=>{
 const controls=new Map(),actions=[],element=()=>{let proxy;const data={nodes:[],values:{}};proxy=new Proxy(data,{get:(t,k)=>k in t?t[k]:(...a)=>{if(k==='child')t.nodes.push(a[0]);else if(k==='when'){if(a[0])a[1](proxy);}else t.values[k]=a[0];return proxy;}});return proxy;};
 const button=(id,label,action)=>{const node=element();node.label=label;controls.set(id,{action,node});return node;};
 const deps={uiMetrics:()=>typography(14,16),div:element,fileStatus:element,h_flex:element,theme:()=>({}),svg:element,text:value=>{const node=element();node.label=value;return node;},button,toggle:(id,label,pressed,action)=>{const node=button(id,label,action);controls.get(id).pressed=pressed;return node;},checkbox:(id,label,checked,action)=>button(id,label,action),popover:(id,label,open,change,content)=>{const node=button(id,label,change);if(open)node.nodes.push(content());return node;}};
 const source=readFileSync(new URL('../mods/juhas/file-header.js',import.meta.url),'utf8').split('export default class FileHeader extends View')[1];
 const Native=new Function('View',...Object.keys(deps),'class FileHeader extends View'+source+'\nreturn FileHeader;')(class{},...Object.values(deps)),header=new Native(),file={id:'file',newPath:'src/example.js',status:'A',additions:12,deletions:0};
 const owner={width:600,isFileReviewed:()=>false,headerAction:action=>actions.push(action),allFileSections:[{file,comparison:{id:'original'},collapsed:true}]};
 header.init({owner,fileId:'file',comparisonId:'original'});const root=header.render();assert.equal(root.values.w,600);assert.ok(!controls.has('viewed-file')&&controls.has('comment-file'));assert.ok(!controls.has('file-options-file'));assert.ok(!controls.has('path-file'),'the path is part of the one clickable row');assert.notEqual(typeof controls.get('comment-file').node.label,'string');
 let stopped=0;const clickCx={stop_propagation(){stopped++;}};controls.get('section-file').action(null,clickCx);assert.equal(stopped,1);assert.deepEqual(actions.pop(),{kind:'toggle',fileId:'file',comparisonId:'original'});
 header.hovered=true;header.render();let copied;controls.get('copy-path-file').action(null,{write_to_clipboard:value=>copied=value,stop_propagation(){}});assert.equal(copied,'src/example.js');
 controls.get('comment-file').action(null,clickCx);assert.equal(stopped,2);assert.deepEqual(actions.pop(),{kind:'comment',fileId:'file',comparisonId:'original'});
});

test('test-file visibility recognizes common projects and languages without matching production names',()=>{
 for(const path of ['Bsi.Wind.Job.Tests/Clients/Cards.cs','tests/a.cs','src/__tests__/context.js','src/context.test.ts','src/context.spec.ts','src/ContextTests.cs','test_context.py','context_test.go'])assert.equal(isTestFile(path),true,path);
 for(const path of ['src/Contest.cs','src/context.ts','docs/testing.md','src/specification.ts','src/Testimonial.cs'])assert.equal(isTestFile(path),false,path);
 assert.equal(isTestFile({oldPath:'tests/old.js',newPath:'src/new.js'}),false);
});

test('hiding tests preserves the selected source and drafts and excludes tests from file navigation',()=>{
 const {view,state,cx}=fixture(),drafts=[{body:'retained'}];state.files=[{id:'code',newPath:'src/code.js'},{id:'test',newPath:'tests/code.test.js'}];state.file=state.files[0];view.controller.session=()=>({drafts});view.setFindQuery=()=>{};
 const source=state.comparison;view.setHideTests(true,cx);assert.deepEqual(view.visibleFiles().map(f=>f.id),['code']);assert.equal(state.comparison,source);assert.equal(view.controller.session().drafts,drafts);
 let selected;view.selectFile=id=>selected=id;view.moveFile(1,cx);assert.equal(selected,'code');view.setHideTests(false,cx);assert.equal(view.visibleFiles().length,2);
});

test('expand all loads visible files sequentially and obeys the retained row budget',async()=>{
 const {view,state,cx}=fixture();view.allFiles=true;view.hideTests=true;state.files=[{id:'one',newPath:'one.js'},{id:'test',newPath:'tests/one.js'},{id:'two',newPath:'two.js'}];view.rebuildAllSections();view.prepareFileHeaders=()=>{};view.setFindQuery=()=>{};view.work=(_cx,action)=>view.pending=action(cx);
 const reads=[];view.controller.readFilePatch=async file=>{reads.push(file.id);return {hunks:[{lines:Array.from({length:file.id==='one'?20000:1},()=>({text:'code'}))}]};};
 view.expandAllFiles(cx);await view.pending;assert.deepEqual(reads,['one']);assert.equal(view.allFileSections.find(s=>s.file.id==='test').collapsed,true);assert.equal(view.allFileSections.find(s=>s.file.id==='two').limited,true);
});

test('the all-files expansion control collapses when any visible file is open and retains its patch',()=>{
 const {view,cx}=fixture(),patch={hunks:[]};view.allFileSections=[{file:{id:'code',newPath:'code.js'},collapsed:false,patch},{file:{id:'test',newPath:'tests/code.js'},collapsed:false,patch}];view.hideTests=true;view.prepareFileHeaders=()=>{};view.setFindQuery=()=>{};
 view.toggleAllExpansion(cx);assert.equal(view.allFileSections[0].collapsed,true);assert.equal(view.allFileSections[1].collapsed,false);assert.equal(view.allFileSections[0].patch,patch);
 let expanded=0;view.expandAllFiles=()=>expanded++;view.toggleAllExpansion(cx);assert.equal(expanded,1);
});

test('whole-file context can be unfolded and folded without replacing source or feedback',async()=>{
 const {view,state,cx}=fixture(),file={id:'code',newPath:'code.js'},calls=[];state.file=file;state.files=[file];state.patch={hunks:[],fullContext:false};view.work=(_cx,action)=>view.pending=action(cx);view.controller.expandFile=async full=>{calls.push(full);state.patch={hunks:[],fullContext:full};};view.prepareFileHeaders=()=>{};
 const comparison=state.comparison;view.toggleFileContext('code',cx);await view.pending;view.toggleFileContext('code',cx);await view.pending;assert.deepEqual(calls,[true,false]);assert.equal(state.comparison,comparison);
});

test('source and branch keyboard choices clamp to visible options and confirm the filtered branch',()=>{
 const {view,cx}=fixture(),chosen=[];view.chooseReviewSource=value=>chosen.push(value);view.moveSourceChoice(2,cx);view.chooseSourceChoice(cx);assert.deepEqual(chosen,['commit']);
 view.controller.state.refs=[{name:'feature/one',fullName:'refs/heads/feature/one'},{name:'main',fullName:'refs/heads/main'}];view.inputs.refQuery={value:()=> 'main'};view.chooseReference=ref=>chosen.push(ref);view.moveReferenceChoice(1,cx);view.chooseReferenceChoice(false,cx);assert.equal(chosen.at(-1),'refs/heads/main');
});

test('fold context uses the displayed single-file patch and ignores stale aggregate context',async()=>{
 const {view,state,cx}=fixture(),file={id:'code',newPath:'code.js'},calls=[];state.file=file;state.files=[file];state.patch={hunks:[],fullContext:false};view.allFiles=false;view.allFileSections=[{file,comparison:state.comparison,patch:{hunks:[],fullContext:true}}];view.work=(_cx,action)=>view.pending=action(cx);view.controller.expandFile=async full=>{calls.push(full);state.patch={hunks:[],fullContext:full};};view.prepareFileHeaders=()=>{};
 view.toggleFileContext('code',cx);await view.pending;assert.deepEqual(calls,[true]);
});

test('a pending whole-file read does not reopen a file after Collapse all',async()=>{
 const {view,state,cx}=fixture(),file={id:'code',newPath:'code.js'};state.file=file;state.files=[file];state.patch={hunks:[]};view.allFiles=true;view.allFileSections=[{file,comparison:state.comparison,collapsed:false,patch:state.patch}];view.work=(_cx,action)=>view.pending=action(cx);view.prepareFileHeaders=()=>{};view.setFindQuery=()=>{};let release;view.controller.expandFile=()=>new Promise(resolve=>release=()=>{state.patch={hunks:[],fullContext:true};resolve();});
 view.toggleFileContext('code',cx);view.toggleAllExpansion(cx);release();await view.pending;assert.equal(view.allFileSections[0].collapsed,true);assert.equal(view.allFileSections[0].patch.fullContext,true);
});

test('checkpoint and hunk options are absent and old checkpoint selections are not restored',()=>{
 const {view,controls,render,cx}=fixture();view.panel='reviewMore';render();for(const id of ['mark-seen','review-baselines','save-snapshot','show-hunk-headers'])assert.ok(!controls.has(id),id);
 view.panel='compareFrom';render();assert.ok(!controls.has('source-checkpoint'));view.activeContext={key:'repo'};assert.equal(view.restoreLoadedView({scope:{kind:'since-review'}},cx),false);
});

test('current branch remains visible whenever the names and fixed controls fit',()=>{
 assert.equal(currentBranchFits(760,'ui/simplify-review','main',13,'58 files'),true);assert.equal(currentBranchFits(400,'topic','main',13,''),true);assert.equal(currentBranchFits(320,'feature/a-very-long-branch-name','epics/a-long-base',13,''),false);
});

test('review toolbar omits the more menu and layout choices',()=>{
 const {view,controls,render}=fixture();view.allFiles=true;view.panel='reviewMore';render();assert.ok(!controls.has('reset-viewed'));assert.ok(!controls.has('workspace-layout'));view.showHistory=true;controls.clear();render();assert.ok(!controls.has('workspace-layout'));assert.ok(!controls.has('review-more'));view.showHistory=false;view.allFiles=false;controls.clear();render();assert.ok(!controls.has('workspace-layout'));assert.ok(!controls.has('review-more'));
});
