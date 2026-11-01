import test from 'node:test';
import assert from 'node:assert/strict';
import * as models from '../mods/juhas/review-ui.js';
import {readFileSync} from 'node:fs';
const line=(id,side)=>({id,kind:'line',side,text:id,oldLine:side==='new'?null:1,newLine:side==='old'?null:1});
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
function nativeView(){let source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export default class')).replace('export default class Juhas extends View','class Juhas extends View');const Native=new Function('View','changeGroups','stepChange',source+'\nreturn Juhas;')(class{},models.changeGroups,models.stepChange),view=Object.create(Native.prototype),scroll=[];
 view.controller={state:{comparison:{id:'c'},file:{id:'f'}}};view.diffMode='unified';view.diffRows=[line('one','new'),line('context','context'),line('two','old')];view.diffScroll={scroll_to_item:(...args)=>scroll.push(args)};view.diffRowsKey=JSON.stringify(['c','f','unified']);return {view,scroll};}
test('native navigation scrolls through the retained handle without reading Git or opening a comment',()=>{
 const {view,scroll}=nativeView(),cx={notify(){}};view.navigateChange(1,cx);view.navigateChange(1,cx);view.navigateChange(1,cx);view.navigateChange(-1,cx);assert.deepEqual(scroll,[[0,'top'],[2,'top'],[0,'top'],[2,'top']]);assert.equal(view.panel,undefined);
});
test('a stale file viewport cannot navigate a newly selected comparison',()=>{
 const {view,scroll}=nativeView();view.controller.state.file.id='different';view.navigateChange(1,{notify(){}});assert.deepEqual(scroll,[]);
});

test('switching display modes clears the change cursor and waits for the new viewport',()=>{
 const {view,scroll}=nativeView(),cx={notify(){}};view.navigateChange(1,cx);view.setDiffMode('split',cx);assert.equal(view.changeCursor,null);view.navigateChange(1,cx);assert.equal(scroll.length,1);
});
