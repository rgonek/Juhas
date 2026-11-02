import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as comments from '../mods/juhas/comments.js';
import {splitRows,changeGroups,filterDrafts} from '../mods/juhas/review-ui.js';
function controls(){
 let layout=false;
 const element=(kind,id)=>{const state={kind,identity:id,nodes:[],handlers:{},values:{}};let proxy;proxy=new Proxy(state,{get(target,key){if(key in target)return target[key];return (...args)=>{if(key==='when'){if(args[0])args[1](proxy);}else if(key==='child')target.nodes.push(args[0]);else if(key==='children')target.nodes.push(...args[0]);else if(key.startsWith('on_')){if(layout)throw new Error('Handler created during virtual layout');target.handlers[key]=args[0];}else target.values[key]=args.length===1?args[0]:args;return proxy;};}});return proxy;};
 const names=['Button','Checkbox','Toggle','Popover'],deps={...comments,splitRows,changeGroups,filterDrafts,div:()=>element('div'),h_flex:()=>element('row'),v_flex:()=>element('column'),svg:path=>element('svg',path),theme:()=>({}),settings:()=>({font_family:'monospace'}),Scrollbar:{vertical:id=>element('scrollbar',id)},v_virtual_list:(id,count,sizes,_key,render)=>{const node=element('virtual',id);node.sizes=sizes;node.renderRows=()=>{layout=true;try{return render({start:0,end:count});}finally{layout=false;}};return node;}};for(const name of names)deps[name]={new:id=>element(name,id)};
 let source=readFileSync(new URL('../mods/juhas/ui.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');return new Function(...Object.keys(deps),source+'\nreturn {button,checkbox,toggle,popover,buttonGroup,commitId,diffPane,draftsPane};')(...Object.values(deps));
}
const descendants=node=>[node,...(node?.nodes||[]).flatMap(descendants)];
function diffView(patch,target){return {id:'fixture',width:360,inlineEditor:{retained:true},target,diffMode:'unified',diffChangeKey:()=> 'c',controller:{state:{comparison:{id:'c'},file:{newPath:'a'},patch},session:()=>({drafts:[]})}};}
test('virtual rows embed the retained editor without registering callbacks during layout',()=>{
 const view=diffView({hunks:[{header:'@@',lines:[{side:'new',newLine:1,text:'code'}]}]},{comparisonId:'c',newPath:'a',side:'new',endLine:1});const root=controls().diffPane(view),list=descendants(root).find(node=>node?.kind==='virtual'),rows=list.renderRows();assert.equal(rows.length,3);assert.ok(descendants(rows[2]).includes(view.inlineEditor));assert.equal(list.sizes[2],comments.INLINE_EDITOR_HEIGHT);assert.equal(root.nodes[0].nodes.at(-1).identity,'diff-more');
});
test('binary and mode-only file comments still display the same inline editor',()=>{
 for(const patch of [{binary:true,hunks:[]},{modeOnly:true,hunks:[]}]){const view=diffView(patch,{comparisonId:'c',newPath:'a',side:null});const list=descendants(controls().diffPane(view)).find(node=>node?.kind==='virtual'),rows=list.renderRows();assert.equal(rows.length,2);assert.deepEqual(list.sizes,[46,comments.INLINE_EDITOR_HEIGHT]);assert.ok(descendants(rows[1]).includes(view.inlineEditor));}
});
test('queued diff clicks keep their displayed line snapshot and cannot target another file',()=>{
 const view=diffView({hunks:[{header:'@@',lines:[{side:'new',newLine:9,text:'shown code'}]}]},null),calls=[];view.diffChangeKey=()=>view.controller.state.file.newPath;view.selectLine=(...args)=>calls.push(args);const list=descendants(controls().diffPane(view)).find(node=>node?.kind==='virtual');
 list.handlers.on_item_click('h0l0',{});assert.equal(calls[0][3].newLine,9);assert.equal(calls[0][3].text,'shown code');view.controller.state.file={newPath:'another'};list.handlers.on_item_click('h0l0',{});assert.equal(calls.length,1);
});
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
test('commit ID has a compact native copy button that copies the complete SHA only on activation',()=>{
 const copied=[],oid='1234567890abcdef1234567890abcdef12345678',row=controls().commitId(oid),button=row.nodes[1];
 assert.deepEqual(copied,[]);assert.equal(button.kind,'Button');assert.equal(button.values.tooltip,'Copy full commit ID');assert.equal(button.values.h,22);
 button.handlers.on_click({}, {write_to_clipboard:value=>copied.push(value)});assert.deepEqual(copied,[oid]);
});


test('native comment filters narrow the list while Clear all stays repository-scoped',()=>{
 let session={drafts:[{id:'one',repoKey:'r',comparisonId:'a',targetOid:'a'.repeat(40),newPath:'a.js',body:'current'},{id:'two',repoKey:'r',comparisonId:'b',targetOid:'b'.repeat(40),newPath:'b.js',status:'outdated',body:'older'},{id:'foreign',repoKey:'elsewhere',comparisonId:'a',newPath:'c.js',body:'keep'}]};
 const view={draftStatus:'outdated',draftSource:'all',draftSourcePicker:true,controller:{state:{repo:{key:'r'}},session:()=>session,mutate:fn=>session=fn(session)},editDraft(){}};const cx={notify(){}};
 const panel=controls().draftsPane(view,cx),nodes=descendants(panel);assert.ok(nodes.some(x=>x.identity==='edit-two'));assert.ok(!nodes.some(x=>x.identity==='edit-one'));assert.ok(!nodes.some(x=>x.identity==='edit-foreign'));
 nodes.find(x=>x.identity==='draft-status-current').handlers.on_click({},cx);assert.equal(view.draftStatus,'current');descendants(nodes.find(x=>x.identity==='draft-source').values.content).find(x=>x.identity==='draft-source-one').handlers.on_click({},cx);assert.equal(view.draftSource,'a');assert.equal(view.draftSourcePicker,false);assert.equal(session.drafts.length,3);
 nodes.find(x=>x.identity==='clear-comments').handlers.on_click({},cx);assert.deepEqual(session.drafts.map(d=>d.id),['foreign']);
});
