import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {annotatePatch,composerRows} from '../mods/juhas/comments.js';
import {splitRows} from '../mods/juhas/review-ui.js';

test('revealing a line composer uses a scroll strategy supported by native Herdr',()=>{
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View','annotatePatch','composerRows','splitRows','class Juhas extends View'+source+'\nreturn Juhas;')(class{},annotatePatch,composerRows,splitRows);
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
