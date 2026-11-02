import test from 'node:test';
import assert from 'node:assert/strict';
import * as models from '../mods/juhas/review-ui.js';
import {annotatePatch} from '../mods/juhas/comments.js';
import {readFileSync} from 'node:fs';
const line=(id,side)=>({id,kind:'line',side,text:id,oldLine:side==='new'?null:1,newLine:side==='old'?null:1});
test('copyable code preserves source whitespace, excludes opposite-side lines and separates unloaded gaps',()=>{
 const patch={hunks:[{lines:[{...line('old','old'),text:'\tbefore <T>'},line('new','new'),line('shared','context')]},{lines:[line('later','new')]}]};
 assert.equal(models.patchCode(patch,'old'),'\tbefore <T>\nshared\n\n');
 assert.equal(models.patchCode(patch,'new'),'new\nshared\n\nlater');assert.equal(models.patchCode(null),'');
});
test('code selection uses one retained readonly native editor and preserves an unsaved comment',()=>{
 const {view}=nativeView(),cx={notify(){}};view.inputs={comment:{value:()=>''}};view.controller.state.patch={hunks:[{lines:[line('before','old'),line('after','new')]}]};
 view.openCodeCopy('new',cx);const editor=view.copyEditor;assert.equal(editor.options.readonly,true);assert.equal(editor.value(),'after');assert.equal(view.panel,'copy-code');
 view.openCodeCopy('old',cx);assert.equal(view.copyEditor,editor);assert.equal(editor.value(),'before');
 view.panel='comment';view.target={comparisonId:'c',newPath:'file'};view.inputs.comment.value=()=> 'unsaved';view.openCodeCopy('new',cx);assert.equal(view.panel,'comment');assert.equal(editor.value(),'before');
});
test('change navigation groups replacements, ignores comments and separates unchanged context',()=>{
 const rows=[{id:'h',kind:'hunk'},line('old','old'),{id:'comment',kind:'comment'},line('new','new'),line('context','context'),line('next','new')];
 assert.deepEqual(models.changeGroups(rows).map(row=>[row.id,row.index]),[['old',1],['next',5]]);
 const split=models.splitRows(rows);assert.deepEqual(models.changeGroups(split).map(row=>row.id),['split:new','split:next']);
});
test('previous/next change wraps within the selected file and has deterministic first targets',()=>{
 const groups=[{id:'one',index:2},{id:'two',index:8}];assert.equal(models.stepChange(groups,null,1).id,'one');assert.equal(models.stepChange(groups,null,-1).id,'two');assert.equal(models.stepChange(groups,'two',1).id,'one');assert.equal(models.stepChange(groups,'one',-1).id,'two');assert.equal(models.stepChange([],null,1),null);
});
test('split replacement lines stay paired when comments are attached to either side',()=>{
 const old=line('old','old'),next=line('new','new'),oldComment={id:'old-comment',kind:'comment',draft:{side:'old'}},newComment={id:'new-comment',kind:'comment',draft:{side:'new'}};
 const rows=models.splitRows([old,oldComment,next,newComment]);assert.equal(rows[0].old,old);assert.equal(rows[0].next,next);assert.deepEqual(rows.slice(1),[oldComment,newComment]);
});
function nativeView(){let source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export default class')).replace('export default class Juhas extends View','class Juhas extends View');const Native=new Function('View','changeGroups','stepChange','annotatePatch','splitRows','patchCode','EditorState',source+'\nreturn Juhas;')(class{},models.changeGroups,models.stepChange,annotatePatch,models.splitRows,models.patchCode,{new:options=>({options,on(){},set_value(value){this.text=value;},value(){return this.text;}})}),view=Object.create(Native.prototype),scroll=[];
 view.controller={state:{comparison:{id:'c'},file:{id:'f'}}};view.diffMode='unified';view.diffRows=[line('one','new'),line('context','context'),line('two','old')];view.diffScroll={scroll_to_item:(...args)=>scroll.push(args)};view.diffRowsKey=JSON.stringify(['c','f','unified']);return {view,scroll};}
test('native navigation scrolls through the retained handle without reading Git or opening a comment',()=>{
 const {view,scroll}=nativeView(),cx={notify(){}};view.navigateChange(1,cx);view.navigateChange(1,cx);view.navigateChange(-1,cx);assert.deepEqual(scroll,[[0,'top'],[2,'top'],[0,'top']]);assert.equal(view.panel,undefined);
});
test('a stale file viewport cannot navigate a newly selected comparison',()=>{
 const {view,scroll}=nativeView();view.controller.state.file.id='different';view.navigateChange(1,{notify(){}});assert.deepEqual(scroll,[]);
});

test('switching display modes clears the change cursor and waits for the new viewport',()=>{
 const {view,scroll}=nativeView(),cx={notify(){}};view.navigateChange(1,cx);view.setDiffMode('split',cx);assert.equal(view.changeCursor,null);view.navigateChange(1,cx);assert.equal(scroll.length,1);
});

test('navigation crosses file boundaries, skips empty patches and stops at review ends',async()=>{
 const {view,scroll}=nativeView(),cx={notify(){}},state=view.controller.state;
 state.files=[{id:'a'},{id:'binary'},{id:'b'}];state.file=state.files[0];
 view.diffRowsKey=view.diffChangeKey();view.changeCursor={source:view.diffRowsKey,id:'two'};
 const selected=[];view.controller.session=()=>({drafts:[]});view.controller.selectFile=async id=>{selected.push(id);state.file=state.files.find(f=>f.id===id);state.patch={hunks:id==='binary'?[]:[{header:'@@',lines:[line('first','new'),line('context','context'),line('last','new')]}]};};
 view.publish=()=>{};view.work=(_cx,action)=>{view.pending=action();};
 view.navigateChange(1,cx);await view.pending;assert.deepEqual(selected,['binary','b']);assert.equal(view.changeCursor.id,'h0l0');assert.deepEqual(scroll.at(-1),[1,'top']);
 view.diffRows=[line('one','new'),line('context','context'),line('two','old')];view.diffRowsKey=view.diffChangeKey();view.changeCursor={source:view.diffRowsKey,id:'two'};
 view.navigateChange(1,cx);await view.pending;assert.equal(view.message,'End of review');assert.equal(state.file.id,'b');
 view.changeCursor={source:view.diffRowsKey,id:'one'};view.navigateChange(-1,cx);await view.pending;assert.equal(state.file.id,'a');assert.equal(view.changeCursor.id,'h0l2');assert.deepEqual(scroll.at(-1),[3,'top']);
});
