import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function fixture(){
 const element=(kind,id)=>{let proxy;const data={kind,identity:id,nodes:[],values:{}};proxy=new Proxy(data,{get:(t,k)=>k in t?t[k]:(...args)=>{if(k==='id')t.identity=args[0];else if(k==='child')t.nodes.push(args[0]);else if(k==='children')t.nodes.push(...args[0]);else if(k==='when'){if(args[0])args[1](proxy);}else t.values[k]=args.length===1?args[0]:args;return proxy;}});return proxy;};
 const controls=new Map(),deps={theme:()=>({}),uiMetrics:()=>({px:n=>n}),h_flex:()=>element('row'),v_flex:()=>element('column'),svg:p=>element('icon',p),button:(id,label,action,options)=>{const e=element('button',id);Object.assign(e,{label,action,options});controls.set(id,e);return e;},toggle:(id,label,pressed,action)=>{const e=element('toggle',id);Object.assign(e,{label,pressed,action});controls.set(id,e);return e;},selector:(id,label,open,action,content)=>{const e=element('selector',id);Object.assign(e,{label,open,action,content});controls.set(id,e);return e;},h_resizable:id=>element('horizontal',id),v_resizable:id=>element('vertical',id),resizable_panel:()=>element('panel'),filesPane:()=>element('files'),historyPane:()=>element('history'),draftsPane:()=>element('comments'),diffPane:()=>element('diff')};
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1],Native=new Function('View',...Object.keys(deps),'class Juhas extends View'+source+';return Juhas;')(class{},...Object.values(deps)),view=Object.create(Native.prototype);
 Object.assign(view,{id:'view',showFiles:true,showHistory:false,filePanelPosition:'top',historyPanelPosition:'top',rememberLoadedView(){this.saved=(this.saved||0)+1;},upperView:'changes',controller:{state:{comparison:{id:'c'}}}});
 const cx={notify(){}};return {view,controls,cx};
}
const walk=n=>[n,...(n.nodes||[]).flatMap(walk)];
const leaves=n=>walk(n).filter(x=>['files','history','diff','comments'].includes(x.kind)).map(x=>x.kind);
test('every independent panel placement renders one diff and exactly the visible panels',()=>{
 for(const files of [null,'top','left','right'])for(const history of [null,'top','left','right']){
  const {view,cx}=fixture();Object.assign(view,{showFiles:files!==null,showHistory:history!==null,filePanelPosition:files,historyPanelPosition:history});
  const tree=view.reviewPanels(cx);assert.deepEqual(leaves(tree).sort(),['diff',...(files?['files']:[]),...(history?['history']:[])].sort(),`${files}/${history}`);
  for(const group of walk(tree).filter(n=>['horizontal','vertical'].includes(n.kind))){assert.ok(group.nodes.length>=2);assert.ok(group.nodes.every(n=>n.kind==='panel'&&n.values.size_range>0));}
 }
});
test('same-edge panels use horizontal top or vertical side dividers',()=>{
 for(const position of ['top','left','right']){const {view,cx}=fixture();Object.assign(view,{showHistory:true,filePanelPosition:position,historyPanelPosition:position});const order=position==='top'?['files','history']:['history','files'];const tree=view.reviewPanels(cx),group=walk(tree).find(n=>n.identity===`view-panels-${position}-${order.join('-')}`);assert.ok(group);assert.equal(group.kind,position==='top'?'horizontal':'vertical');assert.deepEqual(group.nodes.map(n=>leaves(n)),order.map(kind=>[kind]));}
});
test('opposite sides surround the diff and both have a draggable separator',()=>{
 const {view,cx}=fixture();Object.assign(view,{showHistory:true,filePanelPosition:'left',historyPanelPosition:'right'});const tree=view.reviewPanels(cx);assert.equal(tree.kind,'horizontal');assert.deepEqual(tree.nodes.map(n=>leaves(n)),[['files'],['diff'],['history']]);
});
test('panel split controls toggle independently and expose top left right without Git work',()=>{
 const {view,cx,controls}=fixture(),comparison=view.controller.state.comparison;view.panelControl('files',cx);view.panelControl('history',cx);
 const files=controls.get('toggle-files'),history=controls.get('toggle-history');assert.equal(files.label.kind,'icon');assert.equal(history.label.kind,'icon');
 files.action(false,cx);assert.equal(view.showFiles,false);assert.equal(view.showHistory,false);assert.equal(view.filePanelPosition,'top');
 const menu=controls.get('position-files');menu.action(true,cx);assert.equal(view.panel,'filesPosition');menu.content();
 for(const position of ['top','left','right'])assert.ok(controls.has('position-files-'+position));controls.get('position-files-right').action({},cx);
 assert.equal(view.showFiles,true);assert.equal(view.filePanelPosition,'right');assert.equal(view.showHistory,false);assert.equal(view.panel,null);assert.equal(view.controller.state.comparison,comparison);
 history.action(true,cx);assert.equal(view.showHistory,true);assert.equal(view.filePanelPosition,'right');
});
test('top panel and side panel stay independently resizable around comments and diff',()=>{
 const {view,cx}=fixture();Object.assign(view,{showHistory:true,filePanelPosition:'left',historyPanelPosition:'top',showComments:true,commentPanelPosition:'top'});const tree=view.reviewPanels(cx);assert.deepEqual(leaves(tree),['files','history','comments','diff']);assert.equal(walk(tree).filter(n=>['horizontal','vertical'].includes(n.kind)).length,3);
});
test('unchanged layout keeps native resize identities independent of diff selection',()=>{
 const {view,cx}=fixture();view.showHistory=true;const ids=()=>walk(view.reviewPanels(cx)).map(n=>n.identity).filter(Boolean);const before=ids();view.controller.state.comparison={id:'another'};assert.deepEqual(ids(),before);view.showFiles=false;view.reviewPanels(cx);view.showFiles=true;assert.deepEqual(ids(),before);
});

test('Comments independently occupies every panel position while the diff stays visible',()=>{
 for(const files of [null,'top','left','right'])for(const history of [null,'top','left','right'])for(const comments of [null,'top','left','right']){
  const {view,cx}=fixture();Object.assign(view,{showFiles:files!==null,showHistory:history!==null,showComments:comments!==null,filePanelPosition:files,historyPanelPosition:history,commentPanelPosition:comments});
  assert.deepEqual(leaves(view.reviewPanels(cx)).sort(),['diff',...(files?['files']:[]),...(history?['history']:[]),...(comments?['comments']:[])].sort(),`${files}/${history}/${comments}`);
 }
});
test('Comments uses an icon split toggle and placement entries have icons and left-aligned text',()=>{
 const {view,cx,controls}=fixture();view.panelControl('comments',cx);const comments=controls.get('toggle-comments');assert.equal(comments.label.kind,'icon');assert.equal(comments.pressed,false);comments.action(true,cx);assert.equal(view.showComments,true);assert.equal(view.showHistory,false);
 controls.get('position-comments').content();for(const position of ['top','left','right']){const option=controls.get('position-comments-'+position);assert.ok(option.values.justify_start!==undefined);assert.ok(walk(option.label).some(n=>n.kind==='icon'&&n.identity.endsWith('panel-'+position+'.svg')));}
 controls.get('position-comments-right').action({},cx);assert.equal(view.commentPanelPosition,'right');assert.equal(view.showComments,true);
});
