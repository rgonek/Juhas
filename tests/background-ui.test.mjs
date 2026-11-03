import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function view(){
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1];
 const Native=new Function('View','class Juhas extends View'+source+'\nreturn Juhas;')(class{}),v=Object.create(Native.prototype),cx={notify(){}};
 v.busy=false;v.closed=false;v.hasUnsavedComment=()=>false;v.currentContext=()=>({key:'source'});v.activeContext={key:'source'};v.panel=null;
 v.controller={state:{repo:{key:'r'},history:[],comparison:{id:'c'},file:{id:'f'},patch:{hunks:[]}},refresh:async()=>{}};
 v.publish=()=>{};v.rememberLoadedView=()=>{};v.notifyEditor=()=>{};return {v,cx};
}
test('background refresh retains displayed state and never takes foreground busy lock',async()=>{
 const {v,cx}=view(),display=v.controller.state;let release;
 v.controller.refresh=()=>new Promise(resolve=>release=resolve);
 const pending=v.poll(cx);assert.equal(v.busy,false);assert.equal(v.controller.state,display);assert.ok(display.patch);
 release();await pending;assert.equal(v.busy,false);assert.equal(v.controller.state.patch,display.patch);
});
test('background refresh tells the controller to retain a composer or review preview',async()=>{
 const {v,cx}=view(),options=[];v.controller.refresh=async p=>options.push(p);
 v.hasUnsavedComment=()=>true;await v.poll(cx);v.hasUnsavedComment=()=>false;v.panel='submit';await v.poll(cx);
 assert.deepEqual(options,[{preserveComposer:true},{preserveComposer:true}]);
});
test('late background completions cannot publish after a view changes project',async()=>{
 const {v,cx}=view();let release,publishes=0;v.publish=()=>publishes++;
 v.controller.refresh=()=>new Promise(resolve=>release=resolve);const pending=v.poll(cx);v.activeContext={key:'other'};release();await pending;
 assert.equal(publishes,0);
});
