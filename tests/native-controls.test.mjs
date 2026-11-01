import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function controls(){
 const element=(kind,id)=>{const state={kind,identity:id,nodes:[],handlers:{},values:{}};let proxy;proxy=new Proxy(state,{get(target,key){if(key in target)return target[key];return (...args)=>{if(key==='when'){if(args[0])args[1](proxy);}else if(key==='child')target.nodes.push(args[0]);else if(key==='children')target.nodes.push(...args[0]);else if(key.startsWith('on_'))target.handlers[key]=args[0];else target.values[key]=args.length===1?args[0]:args;return proxy;};}});return proxy;};
 const names=['Button','Checkbox','Toggle','Popover'],deps={div:()=>element('div'),h_flex:()=>element('row'),v_flex:()=>element('column'),theme:()=>({})};for(const name of names)deps[name]={new:id=>element(name,id)};
 let source=readFileSync(new URL('../mods/juhas/ui.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');return new Function(...Object.keys(deps),source+'\nreturn {button,checkbox,toggle,popover,buttonGroup};')(...Object.values(deps));
}
test('action controls use native Button selection, accessible labels and one activation callback',()=>{
 const ui=controls(),calls=[],button=ui.button('save','Save',(e,cx)=>calls.push(cx),{active:true});assert.equal(button.kind,'Button');assert.equal(button.values.selected,true);assert.equal(button.values.accessibility_label,'Save');button.handlers.on_click({},'context');assert.deepEqual(calls,['context']);
});
test('Checkbox and Toggle use native controlled values rather than click-to-invert handlers',()=>{
 const ui=controls(),changes=[],checkbox=ui.checkbox('code','Include code',true,(value,cx)=>changes.push([value,cx])),toggle=ui.toggle('tree','Tree',false,(value,cx)=>changes.push([value,cx]));
 assert.equal(checkbox.kind,'Checkbox');assert.equal(checkbox.values.checked,true);assert.equal(toggle.kind,'Toggle');assert.equal(toggle.values.pressed,false);assert.equal(checkbox.handlers.on_click,undefined);assert.equal(toggle.handlers.on_click,undefined);
 checkbox.handlers.on_change(false,'c1');toggle.handlers.on_change(true,'c2');assert.deepEqual(changes,[[false,'c1'],[true,'c2']]);
});
test('button groups preserve activation of an already selected range',()=>{
 const ui=controls(),calls=[],tabs=ui.buttonGroup('scope',[{value:'commit',label:'Commit'},{value:'range',label:'Range'}],'range',(value,cx)=>calls.push([value,cx]));
 assert.equal(tabs.values.role,'group');assert.deepEqual(tabs.nodes.map(tab=>tab.kind),['Button','Button']);assert.equal(tabs.nodes[0].values.selected,false);assert.equal(tabs.nodes[1].values.selected,true);tabs.nodes[1].handlers.on_click({},'cx');assert.deepEqual(calls,[['range','cx']]);
});
test('Popover delegates opening and dismissal to the native control and builds content only when open',()=>{
 const ui=controls(),changes=[];let builds=0;const create=()=>{builds++;return 'picker';};const closed=ui.popover('refs','Branches',false,(value,cx)=>changes.push([value,cx]),create);assert.equal(closed.kind,'Popover');assert.equal(builds,0);assert.equal(closed.values.trigger.handlers.on_click,undefined);
 const opened=ui.popover('refs','Branches',true,(value,cx)=>changes.push([value,cx]),create);assert.equal(builds,1);opened.handlers.on_open_change(false,'cx');assert.deepEqual(changes,[[false,'cx']]);
});

test('diff modes use grouped native Buttons with selected state rather than tabs',()=>{
 const ui=controls(),calls=[],group=ui.buttonGroup('mode',[{value:'unified',label:'Unified'},{value:'split',label:'Split'}],'split',(value,cx)=>calls.push([value,cx]));assert.equal(group.values.role,'group');assert.deepEqual(group.nodes.map(button=>button.kind),['Button','Button']);assert.equal(group.nodes[1].values.selected,true);group.nodes[0].handlers.on_click({},'cx');assert.deepEqual(calls,[['unified','cx']]);
});
