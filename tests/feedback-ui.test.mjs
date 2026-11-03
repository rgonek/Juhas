import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generalTarget} from '../mods/juhas/review.js';
import {reviewedState,setFileReviewed,nextUnreviewed} from '../mods/juhas/progress.js';
import {findInPatch} from '../mods/juhas/reading.js';

function fixture(){
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const deps={generalTarget,reviewedState,setFileReviewed,nextUnreviewed,findInPatch};
 const Native=new Function('View',...Object.keys(deps),'class Juhas extends View'+source+'\nreturn Juhas;')(class{},...Object.values(deps)),v=Object.create(Native.prototype),cx={notify(){}};
 const session={drafts:[]},comparison={id:'c',repoKey:'r',targetOid:'a'},file={id:'f',newPath:'f',oldPath:'f'};
 v.controller={state:{repo:{key:'r'},comparison,file,files:[file,{id:'g',newPath:'g'}],patch:{hunks:[{lines:[{side:'new',newLine:2,text:'const total = 1;'}]}]}},session:()=>session,mutate:fn=>Object.assign(session,fn(session))};
 let body='';v.inputs={comment:{value:()=>body,set_value:value=>body=value,focus(){}},find:{value:()=> 'total'}};
 v.hasUnsavedComment=()=>false;v.persistComposer=()=>{};v.notifyEditor=()=>{};v.selectFile=(id)=>v.selected=id;return {v,cx,session};
}
test('general composer has no artificial file/line and participates in the retained editor',()=>{
 const {v,cx}=fixture();v.generalComment(cx);assert.equal(v.target.scope,'general');assert.equal(v.target.newPath,undefined);assert.equal(v.panel,'comment');assert.equal(v.composerIsVisible(),true);
});
test('viewed state changes and next-unreviewed navigation do not read Git',()=>{
 const {v,cx,session}=fixture();v.markFileReviewed(true,cx);assert.equal(v.isFileReviewed(v.controller.state.file),true);
 v.moveUnreviewed(1,cx);assert.equal(v.selected,'g');assert.ok(Object.keys(session.reviewedFiles).length);
});
test('find searches only loaded source and selects its exact displayed line',()=>{
 const {v,cx}=fixture();let at;v.diffRows=[{kind:'hunk'},{kind:'line',side:'new',newLine:2,text:'const total = 1;'}];v.diffScroll={scroll_to_item:i=>at=i};
 v.setFindQuery('total',cx);assert.equal(v.findMatches.length,1);v.moveFind(1,cx);assert.equal(v.findIndex,0);assert.equal(at,1);
});
test('all-files search retains one global 10000-match bound',()=>{
 const {v,cx}=fixture();v.allFiles=true;const patch={hunks:[{lines:Array.from({length:6000},(_,i)=>({side:'new',newLine:i+1,text:'x'}))}]};v.allFileSections=[{file:{id:'a'},patch},{file:{id:'b'},patch}];v.setFindQuery('x',cx);
 assert.equal(v.findMatches.length,10000);assert.equal(v.findMatches.limited,true);
});
test('saved-comment navigation reveals a previously collapsed all-files section',async()=>{
 const {v,cx}=fixture();v.allFiles=true;v.allFilesKey='c';v.allFileSections=[{file:v.controller.state.file,collapsed:true}];v.controller.selectFile=async()=>{};v.work=(_cx,action)=>v.pending=action();v.publish=()=>{};cx.timer={after(){}};
 v.openComment({id:'comment',comparisonId:'c',newPath:'f',oldPath:'f',side:'new',endLine:2},cx);await v.pending;
 assert.equal(v.allFileSections[0].collapsed,false);assert.equal(v.allFileSections[0].patch,v.controller.state.patch);
});
