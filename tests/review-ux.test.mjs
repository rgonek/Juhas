import {branchChoices,currentBranchFits} from '../mods/juhas/review-ui.js';
import {typography} from '../mods/juhas/typography.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setFileReviewed,reviewedState} from '../mods/juhas/progress.js';
function fixture(){
 const nodes=[];const element=()=>{let proxy;const data={children:[]};proxy=new Proxy(data,{get:(t,k)=>k in t?t[k]:(...a)=>{if(k==='child')t.children.push(a[0]);else if(k==='when'){if(a[0])a[1](proxy);}return proxy;}});return proxy;};
 const deps={branchChoices,currentBranchFits,uiMetrics:()=>typography(14,16),v_flex:element,h_flex:element,svg:element,text:element,theme:()=>({}),section:()=>element(),field:state=>{nodes.push(['field',state]);return element();},button:(id,_label,_action,options)=>{nodes.push(['button',id,options]);return element();},optionList:(_id,items,_index,_move,_choose,options)=>{nodes.push(['refs',items,options]);return element();},selectBase:()=>null,setFileReviewed,reviewedState};
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View',...Object.keys(deps),'class Juhas extends View'+source+'\nreturn Juhas;')(class{},...Object.values(deps)),v=Object.create(Native.prototype);let query='',focused=0;
 v.inputs={refQuery:{value:()=>query,set_value:q=>query=q,focus:()=>focused++}};const session={};v.controller={state:{repo:{key:'r'},comparison:{id:'c',repoKey:'r',baseTree:'a',targetTree:'b'},files:[{id:'one',newPath:'one'},{id:'two',newPath:'two'}],refs:[{name:'dev/XYZ-123',fullName:'refs/heads/dev/XYZ-123'},{name:'feature/other',fullName:'refs/heads/feature/other'}]},base:()=>'',mutate:fn=>Object.assign(session,fn(session)),session:()=>session};
 return {v,nodes,session,setQuery:q=>query=q,focused:()=>focused,cx:{notify(){}}};
}
test('branch picker filters loaded names immediately without querying Git',()=>{
 const {v,nodes,setQuery,focused,cx}=fixture();let after;cx.timer={after:(_delay,fn)=>after=fn};v.setReferencePicker(false,true,cx);assert.equal(focused(),0);after();assert.equal(focused(),1);setQuery('xyz-123');v.referencePicker(false);
 assert.equal(nodes.find(n=>n[0]==='field')[1],v.inputs.refQuery);assert.deepEqual(nodes.find(n=>n[0]==='refs')[1].map(r=>r.name),['dev/XYZ-123']);
});
test('Viewed on an all-files header marks that file independently of the selected file',()=>{
 const {v,cx}=fixture();v.controller.state.file=v.controller.state.files[0];v.markReviewedFile('two',true,cx);
 assert.equal(v.isFileReviewed(v.controller.state.files[0]),false);assert.equal(v.isFileReviewed(v.controller.state.files[1]),true);
});
test('closing a picker before its deferred focus does not steal focus back',()=>{
 const {v,focused,cx}=fixture();let after;cx.timer={after:(_delay,fn)=>after=fn};v.setReferencePicker(false,true,cx);v.setReferencePicker(false,false,cx);after();assert.equal(focused(),0);
});
test('retained header actions wake the parent owner and preserve queued order',async()=>{
 const {v}=fixture();v.headerQueue=[];const pending=v.nextHeaderAction();v.headerAction({kind:'viewed',fileId:'two'});assert.equal((await pending).fileId,'two');v.headerAction({kind:'toggle',fileId:'one'});assert.equal((await v.nextHeaderAction()).fileId,'one');
});
test('a delayed file-header comment never attaches to a superseding selection',async()=>{
 const {v,cx}=fixture();let release,opened=0;v.hasUnsavedComment=()=>false;v.work=(_cx,action)=>v.pending=action(_cx);v.controller.selectFile=()=>new Promise(resolve=>release=resolve);v.fileComment=()=>opened++;v.publish=()=>{};
 v.commentOnFile('two',cx);v.controller.state.file=v.controller.state.files[0];release();await v.pending;assert.equal(opened,0);
});
test('all-files header width follows the viewport and controls retain their own source',()=>{
 const source=readFileSync(new URL('../mods/juhas/file-header.js',import.meta.url),'utf8').split('export default class FileHeader extends View')[1],actions=[],controls=[];
 const node=()=>{let p;const values={};p=new Proxy({values},{get:(t,k)=>k in t?t[k]:(...a)=>{if(k==='when'){if(a[0])a[1](p);}else values[k]=a[0];return p;}});return p;};
 const deps={currentBranchFits,uiMetrics:()=>typography(14,16),div:node,svg:node,fileStatus:node,h_flex:node,popover:(_id,_label,open,_change,content)=>{if(open)content();return node();},theme:()=>({}),text:node,button:(id,label,action)=>{controls.push({id,action});return node();},toggle:(id,label,checked,action)=>{controls.push({id,action});return node();}};
 const Native=new Function('View',...Object.keys(deps),'class FileHeader extends View'+source+'\nreturn FileHeader;')(class{},...Object.values(deps)),header=new Native(),owner={width:600,isFileReviewed:()=>false,headerAction:a=>actions.push(a),allFileSections:[{file:{id:'two',newPath:'two'},comparison:{id:'source'},collapsed:true}]};
 header.init({owner,fileId:'two',comparisonId:'source'});assert.equal(header.render().values.w,600);controls.find(c=>c.id==='viewed-two').action(true,{notify(){},stop_propagation(){}});assert.deepEqual(actions,[{kind:'viewed',fileId:'two',comparisonId:'source',checked:true}]);
});
test('native panes and review tabs omit the heading while the sidebar retains placement controls',()=>{
 const element=(id)=>{let p;const data={nodes:[]};if(id)data.id=id;p=new Proxy(data,{get:(t,k)=>k in t?t[k]:(...a)=>{if(k==='id')t.id=a[0];else if(k==='child')t.nodes.push(a[0]);else if(k==='children')t.nodes.push(...a[0]);else if(k==='when'){if(a[0])a[1](p);}return p;}});return p;};
 const deps={currentBranchFits,uiMetrics:()=>typography(14,16),theme:()=>({}),div:element,h_flex:element,v_flex:element,nativeFrame:(id,options)=>{const e=element(id);e.frameOptions=options;return e;},svg:element,text:element,button:element,buttonGroup:element,checkbox:element,toggle:element,popover:element,selector:element,h_resizable:element,v_resizable:element,resizable_panel:element,filesPane:()=>element('files-content'),historyPane:()=>element('history-content'),draftsPane:()=>element('comments-content'),diffPane:()=>element('diff-content'),shared:()=>null};
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1],Native=new Function('View',...Object.keys(deps),'class Juhas extends View'+source+'\nreturn Juhas;')(class{},...Object.values(deps)),v=Object.create(Native.prototype);
 Object.assign(v,{id:'v',role:'pane',contextProps:{isReviewTab:true},config:{},inputs:{},deferSync(){},baseChoice:()=>null,hasUnsavedComment:()=>false,footer:()=>null,controller:{base:()=>'',state:{repo:{key:'r'},files:[],history:[],refs:[]},session:()=>({drafts:[]})}});
 const walk=n=>n?[n,...(n.nodes||[]).flatMap(walk)]:[];let root=v.render({});assert.deepEqual(root.frameOptions,{framed:false});let nodes=walk(root);assert.ok(nodes.some(n=>n.id==='refresh-review'));assert.ok(!nodes.some(n=>n.id==='open-full'));
 v.contextProps.isReviewTab=false;root=v.render({});assert.deepEqual(root.frameOptions,{framed:false});nodes=walk(root);assert.ok(!nodes.some(n=>n.id==='juhas-heading'||n.id==='open-full'||n.id==='review-sidebar'));
 v.panel='submit';assert.ok(!walk(v.render({})).some(n=>n.id==='juhas-heading'));v.panel=null;
 v.followContext=true;v.activeContext={key:'old'};v.currentContext=()=>({key:'new'});assert.ok(!walk(v.render({})).some(n=>n.id==='juhas-heading'));v.followContext=false;
 v.role='sidebar';v.compact=true;v.headerHovered=true;root=v.render({});assert.deepEqual(root.frameOptions,{framed:true});nodes=walk(root);assert.ok(nodes.some(n=>n.id==='juhas-heading'));assert.ok(['open-right','open-down','open-tab'].every(id=>nodes.some(n=>n.id===id)));v.role='pane';v.compact=false;assert.equal(nodes.filter(n=>n.id==='refresh-review').length,1);
 v.contextProps.isReviewTab=true;v.controller.state.newHead='new-head';nodes=walk(v.render({}));assert.ok(nodes.some(n=>n.id==='comparison-baseline'));assert.ok(nodes.some(n=>n.nodes?.some(c=>c.id==='review-navigation')&&n.nodes?.some(c=>c.id==='submit-preview')));assert.ok(nodes.some(n=>n.nodes?.some(c=>c.id==='review-navigation')&&n.nodes?.some(c=>c.id==='review-latest')));assert.ok(!nodes.some(n=>n.id==='general-comment'));assert.ok(nodes.some(n=>n.id==='toggle-history'));assert.ok(!nodes.some(n=>n.id==='mark-seen'||n.id==='review-baselines'));

 v.controller.state.branchChanged={current:'main'};nodes=walk(v.render({}));assert.ok(nodes.some(n=>n.nodes?.some(c=>c.id==='review-navigation')&&n.nodes?.some(c=>c.id==='adopt-branch')));assert.ok(!nodes.some(n=>n.nodes?.some(c=>String(c.id).startsWith('Checkout changed to'))));
 v.controller.state.missingFile='scripts/install.mjs';nodes=walk(v.render({}));assert.ok(nodes.some(n=>n.nodes?.some(c=>c.id==='review-navigation')&&n.nodes?.some(c=>c.id==='review-status')));assert.ok(!nodes.some(n=>n.nodes?.some(c=>c.id==='scripts/install.mjs no longer has a diff in this source; choose another file')));
 Object.assign(v.controller.state,{sourceStale:true,sourceUnavailable:true});v.message='Fetch completed';nodes=walk(v.render({}));assert.equal(nodes.filter(n=>n.id==='review-status').length,1);assert.ok(!nodes.some(n=>n.id==='Fetch completed'||n.id==='Original commit unavailable; cached code retained'||n.id==='Newer source available · unsaved input retained; save or cancel before updating'));
 v.message='fatal: refresh failed';nodes=walk(v.render({}));assert.ok(nodes.some(n=>n.id==='fatal: refresh failed'));v.message='';
 v.upperView='comments';root=v.render({});nodes=walk(root);const split=nodes.find(n=>n.id==='v-lists-diff');assert.ok(split);assert.ok(walk(split.nodes[0]).some(n=>n.id==='comments-content'));assert.ok(walk(split.nodes[1]).some(n=>n.id==='diff-content'));assert.ok(!nodes.some(n=>n.id==='history-content'||n.id==='files-content'||n.id==='v-workspace-comments'));
 v.upperView='changes';nodes=walk(v.render({}));assert.ok(!nodes.some(n=>n.id==='history-content'));v.showHistory=true;nodes=walk(v.render({}));assert.ok(nodes.some(n=>n.id==='history-content'));assert.ok(nodes.some(n=>n.id==='files-content'));assert.ok(!nodes.some(n=>n.id==='comments-content'));
 v.workspaceLayout='sidebar';nodes=walk(v.render({}));const side=nodes.find(n=>n.id==='v-files-sidebar');assert.ok(side);assert.equal(nodes.filter(n=>n.id==='files-content').length,1);assert.ok(walk(side.nodes[0]).some(n=>n.id==='files-content'));assert.ok(walk(side.nodes[0]).some(n=>n.id==='history-content'));assert.ok(!walk(side).some(n=>n.id==='review-navigation'||n.id==='scope'));assert.ok(!nodes.find(n=>n.id==='v-lists-diff'));assert.ok(walk(side.nodes[1]).some(n=>n.id==='diff-content'));v.workspaceLayout='stacked';
 v.config.showAdvanced=true;v.policy={canSwitch:true,repos:[]};v.controller.state.repo.root='/work/CivicLens';v.controller.state.comparison={id:'c',scope:{kind:'branch'}};v.baseChoice=()=>({ref:'master'});nodes=walk(v.render({}));assert.ok(nodes.some(n=>n.nodes?.some(c=>c.id==='review-navigation')&&n.nodes?.some(c=>c.id==='context-repos')));const baseline=nodes.find(n=>n.id==='comparison-baseline');assert.ok(baseline);assert.ok(walk(baseline).some(n=>n.id==='compare-from'));assert.ok(walk(baseline).some(n=>n.id==='change-base'));assert.ok(walk(baseline).some(n=>n.id==='HEAD'));v.controller.state.branch='feature/example';nodes=walk(v.render({}));assert.ok(nodes.some(n=>n.id==='feature/example'));v.controller.state.branch='(detached)';v.controller.state.comparison.targetOid='abcdef0123456789';nodes=walk(v.render({}));assert.ok(nodes.some(n=>n.id==='abcdef01'));
});


test('upper-section switching preserves source selection and unsaved input without Git',()=>{
 const {v,cx}=fixture(),state=v.controller.state;v.inputs.comment={value:()=> 'unsaved feedback'};v.target={comparisonId:'original'};v.setUpperView('comments',cx);assert.equal(v.upperView,'comments');assert.equal(v.controller.state,state);assert.equal(v.inputs.comment.value(),'unsaved feedback');assert.equal(v.target.comparisonId,'original');v.setUpperView('changes',cx);assert.equal(v.upperView,'changes');
});

test('routine messages and source notices share the compact status without hiding errors',()=>{
 const {v}=fixture();
 for(const message of ['Fetch completed','No more comments','No more unreviewed files','Start of review','End of review','Review copied','Checkpoint saved at abc12345; comments retained']){
  v.message=message;assert.equal(v.compactMessage(),message);assert.ok(v.reviewNotices().some(n=>n.detail===message));
 }
 v.message='fatal: cannot read repository';assert.equal(v.compactMessage(),null);assert.ok(!v.reviewNotices().some(n=>n.detail===v.message));
 Object.assign(v.controller.state,{sourceStale:true,newHead:'new',sourceUnavailable:true,missingFile:'a.js'});
 assert.deepEqual(v.reviewNotices().map(n=>n.title),['Original source unavailable','Newer source available','No diff for selected file']);
});

test('Automatic stays selected when its resolved base points at a named branch',()=>{
 const {v,nodes}=fixture();let base='';v.controller.base=()=>base;v.baseChoice=()=>({ref:'refs/heads/epics/bsi-26989'});
 v.referencePicker(false);assert.equal(nodes.find(n=>n[0]==='button'&&n[1]==='automatic-base')[2].active,true);assert.equal(nodes.find(n=>n[0]==='refs')[2].selected,'');
 nodes.length=0;base='refs/heads/epics/bsi-26989';v.refIndex=0;v.referencePicker(false);assert.equal(nodes.find(n=>n[0]==='button'&&n[1]==='automatic-base')[2].active,false);assert.equal(nodes.find(n=>n[0]==='refs')[2].selected,base);
});

test('opening Automatic focuses only Automatic and arrow navigation can return to it',()=>{
 const {v,cx}=fixture();v.controller.base=()=>'';v.setReferencePicker(false,true,cx);assert.equal(v.refIndex,-1);
 v.moveReferenceChoice(1,cx);assert.equal(v.refIndex,0);v.moveReferenceChoice(-1,cx);assert.equal(v.refIndex,-1);
 let chosen;v.chooseReference=(ref,history)=>chosen=[ref,history];v.chooseReferenceChoice(false,cx);assert.deepEqual(chosen,['',false]);
});

test('branch choices merge local/upstream pairs without losing distinct remotes',()=>{
 const refs=[{name:'feature',fullName:'refs/heads/feature',upstream:'refs/remotes/upstream/renamed'},{name:'upstream/renamed',fullName:'refs/remotes/upstream/renamed'},{name:'origin/feature',fullName:'refs/remotes/origin/feature'},{name:'origin/main',fullName:'refs/remotes/origin/main'},{name:'origin/HEAD',fullName:'refs/remotes/origin/HEAD',symref:'refs/remotes/origin/main'}];
 const choices=branchChoices(refs,'refs/remotes/upstream/renamed');assert.equal(choices.length,3);const feature=choices.find(c=>c.name==='feature');assert.equal(feature.local.fullName,'refs/heads/feature');assert.equal(feature.remote.fullName,'refs/remotes/upstream/renamed');assert.equal(feature.fullName,feature.remote.fullName);assert.ok(choices.some(c=>c.name==='origin/main'&&!c.local));
});
test('branch filtering hides Automatic while preserving both versions of a matching branch',()=>{
 const {v,setQuery,nodes,cx}=fixture();v.controller.state.refs=[{name:'topic',fullName:'refs/heads/topic'},{name:'origin/topic',fullName:'refs/remotes/origin/topic'}];setQuery('topic');v.referencePicker(false);assert.equal(v.filteredReferences().length,1);assert.ok(!nodes.some(n=>n[1]==='automatic-base'));v.refIndex=0;v.moveReferenceChoice(-1,cx);assert.equal(v.refIndex,0);
});
test('ambiguous automatic bases show candidates first and searching can choose another branch',()=>{
 const {v,nodes,setQuery}=fixture();v.controller.state.automaticChoice={ref:null,reason:'Several bases',candidates:[{ref:'refs/heads/feature/other'}]};assert.deepEqual(v.filteredReferences().map(r=>r.name),['feature/other']);setQuery('xyz');assert.deepEqual(v.filteredReferences().map(r=>r.name),['dev/XYZ-123']);
});
