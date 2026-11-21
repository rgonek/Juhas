import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {commentHeight} from '../mods/juhas/comments.js';
function fixture(row,split=true,experimentalDiff=false){
 const nodes=[],element=()=>{let proxy;const data={nodes:[],handlers:{},values:{}};proxy=new Proxy(data,{get:(t,k)=>k in t?t[k]:(...args)=>{if(k==='child')t.nodes.push(args[0]);else if(k==='when'){if(args[0])args[1](proxy);}else if(k.startsWith('on_'))t.handlers[k]=args.length===2?args[1]:args[0];else t.values[k]=args[0];return proxy;}});return proxy;};
 const deps={div:element,h_flex:element,svg:path=>{const node=element();node.path=path;return node;},text:element,theme:()=>({accent:'accent',ansi4:'modified-blue'}),uiMetrics:()=>({px:n=>n}),commentHeight,button:(id,label,click)=>{const node=element();node.id=id;node.label=label;node.click=click;nodes.push(node);return node;}};
 const source=readFileSync(new URL('../mods/juhas/diff-row.js',import.meta.url),'utf8').split('export default class DiffRow extends View')[1],Native=new Function('View',...Object.keys(deps),'class DiffRow extends View'+source+';return DiffRow;')(class{},...Object.values(deps));
 const actions=[],gestures=[],view=new Native(),cx={notify(){},stop_propagation(){}};view.init({row,split,source:'original',owner:{experimentalDiff,diffSelection:experimentalDiff?{model:{},point:()=>null,send:event=>gestures.push(event)}:null,headerAction:a=>actions.push(a)},content:element});return {view,cx,nodes,actions,gestures};
}
const event=x=>({local_position:{x,y:5},bounds:{width:800,height:22}});
test('standard rows do not render a plus when the pointer crosses either side',()=>{
 const f=fixture({id:'pair',kind:'pair',old:{id:'old'},next:{id:'new'}});
 for(const x of [100,650]){f.view.render().handlers.on_mouse_move(event(x),f.cx);f.view.render();}
 assert.equal(f.nodes.length,0);
});
test('hover exposes the plus only over an existing source cell',()=>{
 const f=fixture({id:'pair',kind:'pair',old:null,next:{id:'new',side:'new'}},true,true);let root=f.view.render();root.handlers.on_hover(true,f.cx);root.handlers.on_mouse_move(event(100),f.cx);f.view.render();assert.equal(f.nodes.length,0);
 root.handlers.on_mouse_move(event(650),f.cx);root=f.view.render();const plus=f.nodes.find(n=>n.id==='add-pair-new');assert.ok(plus);plus.handlers.on_mouse_down({},f.cx);assert.equal(f.gestures.at(-1).side,'new');
});
test('saved comment shows deletion only on hover and does not also edit',()=>{
 const f=fixture({id:'comment-c',kind:'comment',draft:{id:'c'},text:'Short comment'});let root=f.view.render();assert.equal(root.values.h,38);assert.equal(root.values.px,12);assert.equal(root.values.py,6);assert.equal(root.values.gap,10);assert.equal(f.nodes.length,0);root.handlers.on_hover(true,f.cx);root=f.view.render();f.nodes.find(n=>n.id==='delete-c').click({},f.cx);assert.deepEqual(f.actions.map(a=>a.operation),['delete']);root.handlers.on_click({},f.cx);assert.equal(f.actions.at(-1).operation,'edit');
});


test('unified lines show a centered SVG plus in the modified icon color and preserve source side',()=>{
 for(const side of ['old','new','context']){const f=fixture({id:'line',kind:'line',side},false,true);f.view.render().handlers.on_hover(true,f.cx);f.view.render();const expected=side==='old'?'old':'new',plus=f.nodes.find(n=>n.id==='add-line-'+expected);assert.ok(plus);assert.equal(plus.values.bg,'modified-blue');assert.equal(plus.values.w,20);assert.equal(plus.values.h,20);assert.equal(plus.values.gap,0);assert.ok('items_center' in plus.values);assert.ok('justify_center' in plus.values);assert.equal(plus.label.path,'mods/juhas/icons/plus.svg');assert.equal(plus.label.values.size,12);plus.handlers.on_mouse_down({},f.cx);assert.equal(f.gestures.at(-1).side,expected);}
});
