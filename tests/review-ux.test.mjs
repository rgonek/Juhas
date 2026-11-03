import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setFileReviewed,reviewedState} from '../mods/juhas/progress.js';
function fixture(){
 const nodes=[];const element=()=>{let proxy;const data={children:[]};proxy=new Proxy(data,{get:(t,k)=>k in t?t[k]:(...a)=>{if(k==='child')t.children.push(a[0]);else if(k==='when'){if(a[0])a[1](proxy);}return proxy;}});return proxy;};
 const deps={v_flex:element,section:()=>element(),field:state=>{nodes.push(['field',state]);return element();},button:()=>element(),virtualList:(_id,items)=>{nodes.push(['refs',items]);return element();},selectBase:()=>null,setFileReviewed,reviewedState};
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
 const {v,cx}=fixture();let release,opened=0;v.hasUnsavedComment=()=>false;v.work=(_cx,action)=>v.pending=action();v.controller.selectFile=()=>new Promise(resolve=>release=resolve);v.fileComment=()=>opened++;v.publish=()=>{};
 v.commentOnFile('two',cx);v.controller.state.file=v.controller.state.files[0];release();await v.pending;assert.equal(opened,0);
});
test('all-files header width follows the viewport and controls retain their own source',()=>{
 const source=readFileSync(new URL('../mods/juhas/file-header.js',import.meta.url),'utf8').split('export default class FileHeader extends View')[1],actions=[],controls=[];
 const node=()=>{let p;const values={};p=new Proxy({values},{get:(t,k)=>k in t?t[k]:(...a)=>{if(k==='when'){if(a[0])a[1](p);}else values[k]=a[0];return p;}});return p;};
 const deps={div:node,h_flex:node,theme:()=>({}),text:node,button:(id,label,action)=>{controls.push({id,action});return node();},checkbox:(id,label,checked,action)=>{controls.push({id,action});return node();}};
 const Native=new Function('View',...Object.keys(deps),'class FileHeader extends View'+source+'\nreturn FileHeader;')(class{},...Object.values(deps)),header=new Native(),owner={width:600,isFileReviewed:()=>false,headerAction:a=>actions.push(a),allFileSections:[{file:{id:'two',newPath:'two'},comparison:{id:'source'},collapsed:true}]};
 header.init({owner,fileId:'two',comparisonId:'source'});assert.equal(header.render().values.w,582);controls.find(c=>c.id==='viewed-two').action(true,{});assert.deepEqual(actions,[{kind:'viewed',fileId:'two',comparisonId:'source',checked:true}]);
});
test('dedicated review tabs omit the heading but keep Refresh in the common review controls',()=>{
 const element=(id)=>{let p;const data={id,nodes:[]};p=new Proxy(data,{get:(t,k)=>k in t?t[k]:(...a)=>{if(k==='child')t.nodes.push(a[0]);else if(k==='children')t.nodes.push(...a[0]);else if(k==='when'){if(a[0])a[1](p);}return p;}});return p;};
 const deps={theme:()=>({}),div:element,h_flex:element,v_flex:element,nativeFrame:element,svg:element,text:element,button:element,buttonGroup:element,checkbox:element,toggle:element,popover:element,h_resizable:element,v_resizable:element,resizable_panel:element,filesPane:()=>element(),historyPane:()=>element(),diffPane:()=>element(),shared:()=>null};
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1],Native=new Function('View',...Object.keys(deps),'class Juhas extends View'+source+'\nreturn Juhas;')(class{},...Object.values(deps)),v=Object.create(Native.prototype);
 Object.assign(v,{id:'v',role:'pane',contextProps:{isReviewTab:true},config:{},inputs:{},deferSync(){},baseChoice:()=>null,hasUnsavedComment:()=>false,footer:()=>null,controller:{state:{repo:{key:'r'},files:[],history:[],refs:[]},session:()=>({drafts:[]})}});
 const walk=n=>[n,...(n.nodes||[]).flatMap(walk)];let nodes=walk(v.render({}));assert.ok(nodes.some(n=>n.id==='refresh-review'));assert.ok(!nodes.some(n=>n.id==='open-full'));
 v.contextProps.isReviewTab=false;nodes=walk(v.render({}));assert.ok(nodes.some(n=>n.id==='open-full'));assert.equal(nodes.filter(n=>n.id==='refresh-review').length,1);
});
