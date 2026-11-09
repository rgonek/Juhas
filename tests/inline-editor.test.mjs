import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as comments from '../mods/juhas/comments.js';
import * as models from '../mods/juhas/review-ui.js';
import * as submission from '../mods/juhas/submit.js';
import {Controller} from '../mods/juhas/controller.js';
function fixture(data=new Map()){
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];let serial=0;
 const deps={...comments,...models,...submission,theme:()=>({}),uiMetrics:()=>({scale:1}),uid:()=>`draft-${++serial}`,shared:k=>data.get(k),setShared:(k,v)=>data.set(k,structuredClone(v)),terminals:()=>[],agents:()=>[]};
 const Native=new Function('View',...Object.keys(deps),'class Juhas extends View'+source+'\nreturn Juhas;')(class{},...Object.values(deps)),v=Object.create(Native.prototype);
 const patch={hunks:[{header:'@@',lines:[{side:'old',oldLine:1,newLine:null,text:'before'},{side:'new',oldLine:null,newLine:1,text:'after'},{side:'context',oldLine:2,newLine:2,text:'shared'}]}]};
 const comparison={id:'c',repoKey:'r',baseOid:'a'.repeat(40),targetOid:'b'.repeat(40)},files=[{id:'a',newPath:'a',oldPath:'a'},{id:'b',newPath:'b',oldPath:'b'}],saved={drafts:[],submittedBatches:[]};
 v.controller={state:{repo:{key:'r'},comparison,file:files[0],files,patch},session:()=>saved,selectResolved:async snapshot=>{v.controller.state.comparison=snapshot;},selectFile:async id=>{v.controller.state.file=files.find(f=>f.id===id);},validateComment:async()=>{},reconcileComments:async()=>{},addComment:(target,body,id)=>{saved.drafts=[...saved.drafts.filter(d=>d.id!==id),{...target,body,id}];}};
 v.controller.mutate=fn=>Object.assign(saved,fn(saved));v.controller.updateCommentBody=Controller.prototype.updateCommentBody;
 const field=()=>{let value='';return {value:()=>value,set_value:next=>value=next,focus(){}};};v.inputs={comment:field(),review:field(),note:field()};v.handle={focus(){}};v.inlineEditor={};v.diffMode='split';v.diffScroll={scroll_to_item(){}};v.patchRows=comments.annotatePatch(patch,[],'c','a');v.diffRows=models.splitRows(v.patchRows);v.composerKey='composer';v.reviewKey='review';v.currentContext=()=>({key:'context',spaceId:'space',tabId:'tab'});v.activeContext=v.currentContext();v.work=(_cx,action)=>v.pending=action(_cx);v.publish=()=>{};
 const cx={notify(){},spawn:action=>action(cx)};return {v,cx,data,saved};
}
test('clicking a visible diff line leaves the diff scroll where it is',()=>{
 const {v,cx}=fixture(),calls=[];v.diffScroll={scroll_to_item:(...args)=>calls.push(args)};v.selectLine('h0l1',cx);assert.deepEqual(calls,[]);assert.equal(v.target.endLine,1);
});
test('inline range selection preserves typed text and original-side context anchors in Split',()=>{
 const {v,cx,data}=fixture();v.selectLine('h0l0',cx);v.inputs.comment.set_value('unsaved range');v.persistComposer();v.selectLine('h0l2',cx,'old');assert.equal(v.target.side,'old');assert.equal(v.target.startLine,1);assert.equal(v.target.endLine,2);assert.equal(v.target.quote,'before\nshared');assert.equal(v.inputs.comment.value(),'unsaved range');assert.equal(data.get('composer').comparison.id,'c');
 const rows=models.splitRows(comments.composerRows(v.patchRows,v.target));assert.equal(rows.at(-1).kind,'editor');assert.equal(rows.at(-1).draft.side,'old');
});
test('navigation retains unsaved text; another view restores it and Resume returns to its source file',async()=>{
 const {v,cx,data}=fixture();v.selectLine('h0l1',cx);v.inputs.comment.set_value('keep this');v.persistComposer();await v.selectFile('b',cx);await v.pending;assert.equal(v.inputs.comment.value(),'keep this');assert.equal(v.composerIsVisible(),false);
 const second=fixture(data);second.v.controller.state.file=second.v.controller.state.files[1];await second.v.syncComposer(second.cx);assert.equal(second.v.inputs.comment.value(),'keep this');assert.equal(second.v.target.newPath,'a');second.v.resumeComment(second.cx);await second.v.pending;assert.equal(second.v.controller.state.file.id,'a');assert.equal(second.v.composerIsVisible(),true);assert.equal(second.v.inputs.comment.value(),'keep this');
 second.v.panel='submit';v.inputs.comment.set_value('new text');v.persistComposer();await second.v.syncComposer(second.cx);assert.equal(second.v.panel,'submit');assert.equal(second.v.inputs.comment.value(),'new text');
});
test('Submit review requires Save or explicit Skip and Skip preserves the unsaved composer',async()=>{
 const {v,cx,saved,data}=fixture();v.selectLine('h0l1',cx);v.inputs.comment.set_value('new feedback');v.preview(cx);assert.equal(v.panel,'unsaved-submit');assert.equal(v.batch,undefined);
 saved.drafts.push({...v.target,id:'saved',body:'already saved'});v.preview(cx,{skipUnsaved:true});assert.equal(v.panel,'submit');assert.deepEqual(v.batch.draftIds,['saved']);assert.equal(v.inputs.comment.value(),'new feedback');assert.equal(data.get('composer').body,'new feedback');
 v.panel='unsaved-submit';v.saveComment(cx,true);await v.pending;assert.equal(v.panel,'submit');assert.equal(v.batch.draftIds.length,2);assert.equal(v.target,null);assert.equal(data.get('composer'),null);
});
test('saving a comment captures the requested text and preserves typing that arrives during validation',async()=>{
 const {v,cx,saved,data}=fixture();v.selectLine('h0l1',cx);v.inputs.comment.set_value('save this');let release;v.controller.validateComment=()=>new Promise(resolve=>release=resolve);v.saveComment(cx);v.inputs.comment.set_value('newer text');v.persistComposer();release();await v.pending;
 assert.equal(saved.drafts[0].body,'save this');assert.equal(v.inputs.comment.value(),'newer text');assert.equal(v.editId,saved.drafts[0].id);assert.equal(data.get('composer').body,'newer text');
});
test('saved edits reuse the same retained inline editor and cancellation only discards the composer',()=>{
 const {v,cx,saved}=fixture(),editor=v.inlineEditor,draft={...comments.commentTarget(v.controller.state.comparison,v.controller.state.file,v.patchRows[2]),id:'saved',body:'saved feedback'};saved.drafts.push(draft);v.editDraft(draft,cx);assert.equal(v.inlineEditor,editor);assert.equal(v.editId,'saved');assert.equal(v.inputs.comment.value(),'saved feedback');v.inputs.comment.set_value('new unsaved edit');v.editDraft(draft,cx);assert.equal(v.inputs.comment.value(),'new unsaved edit');v.cancelComment(cx);assert.equal(v.target,null);assert.equal(saved.drafts[0].body,'saved feedback');
});
test('an unchanged saved editor is not unsaved, while clearing its body still requires an explicit decision',()=>{
 const {v,cx,saved}=fixture(),draft={...comments.commentTarget(v.controller.state.comparison,v.controller.state.file,v.patchRows[2]),id:'saved',body:'existing feedback'};saved.drafts.push(draft);v.editDraft(draft,cx);assert.equal(v.hasUnsavedComment(),false);v.inputs.comment.set_value('');assert.equal(v.hasUnsavedComment(),true);v.preview(cx);assert.equal(v.panel,'unsaved-submit');assert.equal(saved.drafts[0].body,'existing feedback');
});
test('unavailable source context cannot relocate or erase the unsaved feedback',async()=>{
 const {v,cx}=fixture();v.selectLine('h0l1',cx);v.inputs.comment.set_value('retained');v.persistComposer();v.controller.state.comparison={id:'other'};v.controller.selectResolved=async()=>{throw new Error('Source unavailable');};v.resumeComment(cx);await assert.rejects(()=>v.pending,/Source unavailable/);assert.equal(v.inputs.comment.value(),'retained');assert.equal(v.target.comparisonId,'c');
});
test('an outdated saved comment with a missing anchor remains editable with original provenance',async()=>{
 const {v,cx,saved}=fixture(),target={...comments.commentTarget(v.controller.state.comparison,v.controller.state.file,v.patchRows[2]),id:'old-draft',status:'outdated',startLine:80,endLine:82,quote:'original source',body:'old feedback'};saved.drafts.push(target);v.controller.expandFile=async()=>{};
 v.editDraft(target,cx);await assert.rejects(()=>v.pending,/outside the available patch/);assert.equal(v.detachedComposer,true);assert.equal(v.inputs.comment.value(),'old feedback');assert.equal(v.target.endLine,82);v.inputs.comment.set_value('edited historical feedback');v.saveComment(cx);await v.pending;assert.equal(saved.drafts[0].body,'edited historical feedback');assert.equal(saved.drafts[0].quote,'original source');assert.equal(saved.drafts[0].status,'outdated');assert.equal(saved.drafts[0].endLine,82);
});
test('body-only outdated edits preserve all source fields and status without Git, and reject a changed source',()=>{
 const {v,saved}=fixture(),target={id:'old',repoKey:'r',comparisonId:'gone',baseOid:'a',targetOid:'b',side:'old',newPath:'a',startLine:2,endLine:3,quote:'original',body:'before',status:'outdated'};saved.drafts.push(target);
 v.controller.updateCommentBody(target,'after','old');assert.deepEqual(saved.drafts[0],{...target,body:'after'});assert.throws(()=>v.controller.updateCommentBody({...target,endLine:99},'wrong','old'),/source changed/);assert.equal(saved.drafts[0].body,'after');
});

test('saving closes the composer before slow reconciliation and does not publish unchanged selection',async()=>{
 const {v,cx,saved}=fixture();v.selectLine('h0l1',cx);v.inputs.comment.set_value('feedback');let release,publishes=0;
 v.publish=()=>publishes++;v.controller.reconcileComments=()=>new Promise(resolve=>release=resolve);
 v.saveComment(cx);await Promise.resolve();assert.equal(saved.drafts.length,1);assert.equal(v.target,null);assert.equal(publishes,0);release();await v.pending;
});

function nativeEditorFixture({modern=true}={}){
 const source=readFileSync(new URL('../mods/juhas/inline-editor.js',import.meta.url),'utf8').split('export default class InlineEditor extends View')[1];
 const Native=new Function('View','class InlineEditor extends View'+source+'\nreturn InlineEditor;')(class{}),editor=new Native(),events=new Map(),input={set_rows:rows=>input.rows=rows,set_auto_grow:(min,max)=>input.growth=[min,max],on:(event,fn)=>events.set(event,fn)};
 if(modern)input.set_submit_on_enter=value=>input.submitOnEnter=value;
 let saves=0,stops=0;const bindings=[],owner={busy:false},cx={focus_handle:()=>({}),bind_keys:items=>bindings.push(...items),stop_propagation:()=>stops++};
 editor.init({owner,input,save:()=>saves++},cx);return {editor,input,owner,cx,events,bindings,saves:()=>saves,stops:()=>stops};
}

test('comment editor keeps Enter for newlines and binds Ctrl/Cmd Enter only inside its own context',()=>{
 const f=nativeEditorFixture();assert.equal(f.input.rows,2);assert.deepEqual(f.input.growth,[2,5]);assert.equal(f.input.submitOnEnter,false);assert.equal(f.events.has('submit'),true);
 assert.deepEqual(f.bindings,['JuhasComment','JuhasComment > Input','JuhasComment > Textarea'].flatMap(context=>[{keystroke:'ctrl-enter',action:'juhas.comment.submit',context},{keystroke:'cmd-enter',action:'juhas.comment.submit',context}]));
 f.editor.submit(f.cx);assert.equal(f.saves(),1);f.owner.busy=true;f.editor.submit(f.cx);assert.equal(f.saves(),1);assert.equal(f.stops(),2);
});

test('older textarea hosts retain multiline editing and the explicit comment action',()=>{
 const f=nativeEditorFixture({modern:false});assert.equal(f.events.has('submit'),true);assert.equal(f.bindings.length,6);f.editor.submit(f.cx);assert.equal(f.saves(),1);
});


test('native textarea submit saves through the same guarded action',()=>{
 const f=nativeEditorFixture();f.events.get('submit')({},f.cx);assert.equal(f.saves(),1);f.owner.busy=true;f.events.get('submit')({},f.cx);assert.equal(f.saves(),1);
});
