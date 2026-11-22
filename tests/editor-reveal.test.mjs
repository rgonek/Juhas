import {withLineInfo} from '../mods/juhas/reading.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {annotatePatch,composerRows,measuredCommentRows} from '../mods/juhas/comments.js';
import {splitRows} from '../mods/juhas/review-ui.js';

test('revealing a line composer uses a scroll strategy supported by native Herdr',()=>{
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View','annotatePatch','composerRows','withLineInfo','splitRows','class Juhas extends View'+source+'\nreturn Juhas;')(class{},annotatePatch,composerRows,withLineInfo,splitRows);
 for(const diffMode of ['unified','split']){
  const view=Object.create(Native.prototype),calls=[];
  Object.assign(view,{diffMode,target:{comparisonId:'c',newPath:'a.js',side:'new',startLine:1,endLine:1},prepareFileHeaders(){},controller:{state:{comparison:{id:'c'},file:{newPath:'a.js'},patch:{hunks:[{header:'@@',lines:[{id:'line',kind:'line',side:'new',newLine:1,text:'code'}]}]}},session:()=>({drafts:[]})},diffScroll:{scroll_to_item(index,strategy){assert.ok(['top','center'].includes(strategy),`Unsupported native strategy: ${strategy}`);calls.push(index);}}});
  view.notifyEditor({notify(){}},true);assert.equal(calls.length,1);
 }
});

test('async work forwards its live native context to actions',async()=>{
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View','class Juhas extends View'+source+'\nreturn Juhas;')(class{}),view=Object.create(Native.prototype),live={notify(){}};
 Object.assign(view,{config:{},notifyEditor(){},rememberLoadedView(){}});
 await view.workAsync(live,async cx=>{assert.equal(cx,live);});
 assert.equal(view.message,'');
});

test('controller changes queue one main-view notification without capturing a host context',()=>{
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View','class Juhas extends View'+source+'\nreturn Juhas;')(class{}),view=Object.create(Native.prototype);
 view.controllerChanged();view.controllerChanged();assert.deepEqual(view.headerQueue,[{kind:'controller-change'}]);
 view.closed=true;view.controllerChanged();assert.equal(view.headerQueue.length,1);
});
test('file comment reveals the editor in the rendered multi-file diff and focuses it',()=>{
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View','commentTarget','measuredCommentRows','class Juhas extends View'+source+'\nreturn Juhas;')(class{},()=>({scope:'file'}),measuredCommentRows);
 const view=Object.create(Native.prototype),events=[],timers=[],cx={notify(){},timer:{after(_ms,fn){timers.push(fn);}}};
 Object.assign(view,{allFiles:true,reviewIsVisible:()=>true,controller:{state:{comparison:{id:'c'},file:{id:'b'}}},inputs:{comment:{set_value(){},focus(){events.push('focus');}}},hasUnsavedComment:()=>false,persistComposer(){},notifyEditor(){},revealSelectedSection(){},diffScroll:{scroll_to_item:(...args)=>events.push(args)}});
 view.fileComment(cx);
 view.diffRows=[{kind:'file-header',fileId:'a'},{kind:'line',fileId:'a'},{kind:'file-header',fileId:'b'},{kind:'editor',fileId:'b'}];
 view.diffRowsKey=view.diffChangeKey();
 while(timers.length)timers.shift()();
 assert.deepEqual(events,[[3,'center'],'focus']);
});

test('single-file comment scrolls to top, resets wrapped scroll, and focuses the input',()=>{
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View','commentTarget','measuredCommentRows','class Juhas extends View'+source+'\nreturn Juhas;')(class{},()=>({scope:'file'}),measuredCommentRows);
 const view=Object.create(Native.prototype),events=[],timers=[],cx={notify(){},timer:{after(_ms,fn){timers.push(fn);}}};
 Object.assign(view,{allFiles:false,readingOptions:{wrap:true},reviewIsVisible:()=>true,controller:{state:{comparison:{id:'c'},file:{id:'a'}}},inputs:{comment:{set_value(){},focus(){events.push('focus');}}},hasUnsavedComment:()=>false,persistComposer(){},notifyEditor(){},revealSelectedSection(){},diffScroll:{scroll_to_item:(...args)=>events.push(args)}});
 view.fileComment(cx);
 assert.equal(view.wrapScrollReset,1);
 view.diffRows=[{kind:'editor'},{kind:'line'}];
 view.diffRowsKey=view.diffChangeKey();
 while(timers.length)timers.shift()();
 assert.deepEqual(events,[[0,'top'],'focus']);
});

test('selecting a file scrolls to its header in the rendered multi-file diff',async()=>{
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View','class Juhas extends View'+source+'\nreturn Juhas;')(class{});
 const view=Object.create(Native.prototype),events=[],timers=[],cx={notify(){},timer:{after(_ms,fn){timers.push(fn);}}};
 const state={comparison:{id:'c'},file:{id:'a'}};
 Object.assign(view,{allFiles:true,reviewIsVisible:()=>true,controller:{state,async selectFile(id){state.file={id};}},handle:{focus(){}},publish(){},revealSelectedSection(){},work(cx,action){this.pending=action(cx);},diffScroll:{scroll_to_item:(...args)=>events.push(args)}});
 view.selectFile('b',cx);
 await view.pending;
 view.diffRows=[{kind:'file-header',fileId:'a'},{kind:'line',fileId:'a'},{kind:'file-header',fileId:'b'}];
 view.diffRowsKey=view.diffChangeKey();
 while(timers.length)timers.shift()();
 assert.deepEqual(events,[[2,'top']]);
});
