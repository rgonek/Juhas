import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layoutGraph} from '../mods/juhas/graph.js';
import * as comments from '../mods/juhas/comments.js';
import {formatCommitTime} from '../mods/juhas/commit-time.js';
import * as reading from '../mods/juhas/reading.js';
import {fileRows,splitRows,changeGroups,filterDrafts} from '../mods/juhas/review-ui.js';
import {fileReviewKey,setFileReviewed} from '../mods/juhas/progress.js';
function controls(overrides={}){
 let layout=false;
 const element=(kind,id)=>{const state={kind,identity:id,nodes:[],handlers:{},values:{}};let proxy;proxy=new Proxy(state,{get(target,key){if(key in target)return target[key];return (...args)=>{if(key==='when'){if(args[0])args[1](proxy);}else if(key==='child')target.nodes.push(args[0]);else if(key==='children')target.nodes.push(...args[0]);else if(key.startsWith('on_')){if(layout)throw new Error('Handler created during virtual layout');target.handlers[key]=args[0];}else target.values[key]=args.length===1?args[0]:args;return proxy;};}});return proxy;};
 const names=['Button','Checkbox','Toggle','Popover','Input'],deps={...comments,...reading,formatCommitTime,fileRows,splitRows,changeGroups,filterDrafts,layoutGraph,PathBuilder:{stroke:()=>({move_to(){return this;},line_to(){return this;},build(){return [];}})},window:{paint_path:()=>element('path')},div:()=>element('div'),h_flex:()=>element('row'),v_flex:()=>element('column'),svg:path=>element('svg',path),theme:()=>({}),settings:()=>({font_family:'monospace'}),Scrollbar:{vertical:id=>element('scrollbar',id)},list:(id,count,_key,render)=>{const node=element('measured',id);node.renderRows=()=>{layout=true;try{return Array.from({length:count},(_,i)=>render(i));}finally{layout=false;}};return node;},v_virtual_list:(id,count,sizes,_key,render)=>{const node=element('virtual',id);node.sizes=sizes;node.keyAt=_key;node.renderRows=()=>{layout=true;try{return render({start:0,end:count});}finally{layout=false;}};return node;}};for(const name of names)deps[name]={new:id=>element(name,id)};
 Object.assign(deps,overrides);let source=readFileSync(new URL('../mods/juhas/ui.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');return new Function(...Object.keys(deps),source+'\nreturn {button,checkbox,toggle,popover,buttonGroup,commitId,diffPane,draftsPane,historyPane,filesPane,graphCell,historyLoadingIndicator,LIST_ROW_HEIGHT};')(...Object.values(deps));
}
const descendants=node=>[node,...(node?.nodes||[]).flatMap(descendants)];
test('intraline highlighting is calculated only when diff rows are rendered',()=>{
 let calls=0;const ui=controls({intraline:(...args)=>{calls++;return reading.intraline(...args);}}),view=diffView({hunks:[{header:'@@',lines:[{side:'old',oldLine:1,text:'before'},{side:'new',newLine:1,text:'after'}]}]},null);
 const list=descendants(ui.diffPane(view)).find(n=>n.kind==='virtual');assert.equal(calls,0);list.renderRows();assert.ok(calls>0);
});
test('file row cache identity changes when comments are deleted without changing files',()=>{
 const file={id:'f',newPath:'a',status:'M'},saved={drafts:[{id:'d',repoKey:'r',newPath:'a'}]},view={id:'v',controller:{state:{repo:{key:'r'},files:[file]},session:()=>saved},selectFile(){}};
 const ui=controls(),first=descendants(ui.filesPane(view)).find(n=>n.kind==='virtual'),before=first.keyAt(0);
 saved.drafts=[];const next=descendants(ui.filesPane(view)).find(n=>n.kind==='virtual');assert.notEqual(next.keyAt(0),before);
});
test('large review pane reads one session and keeps viewed and comment counts repo-scoped',()=>{
 const comparison={id:'source',repoKey:'r'},files=Array.from({length:2000},(_,i)=>({id:`f${i}`,newPath:`src/f${i}.js`,status:'M',oldOid:`old${i}`,newOid:`new${i}`}));
 const drafts=Array.from({length:500},(_,i)=>({id:`r${i}`,repoKey:'r',comparisonId:'source',newPath:i===0?'src/f0.js':`src/f${i}.js`,body:'note'})).concat(Array.from({length:500},(_,i)=>({id:`other${i}`,repoKey:'other',comparisonId:'other-source',newPath:'src/f0.js',body:'other'})));
 const reviewedFiles=Object.fromEntries(files.map(file=>[fileReviewKey(comparison,file),Date.now()]));let reads=0;
 const view={id:'large-review',controller:{state:{repo:{key:'r'},comparison,files,file:files[0]},session:()=>{reads++;return {drafts,reviewedFiles};}},isFileReviewed:(file,session)=>Boolean(session.reviewedFiles[fileReviewKey(comparison,file)]),selectFile(){}};
 const ui=controls(),root=ui.filesPane(view),list=descendants(root).find(n=>n.kind==='virtual');
 assert.equal(reads,1);assert.equal(list.sizes,29);assert.equal(filterDrafts(drafts,{repoKey:'r'}).length,500);assert.equal(filterDrafts(drafts,{repoKey:'other'}).length,500);
 const first=list.renderRows()[0];assert.ok(descendants(first).some(n=>n.kind==='div'&&n.nodes?.includes('1')));
 const sectionNode=descendants(root).find(n=>n.kind==='div'&&n.nodes?.includes('Files · 2000/2000 viewed'));assert.ok(sectionNode);
});
test('reviewed-file updates preserve the 2,000-entry cap and replace an existing key',()=>{
 const comparison={id:'source',repoKey:'r'},file={oldPath:'a',newPath:'a',status:'M',oldOid:'old',newOid:'new'},reviewedFiles=Object.fromEntries(Array.from({length:2000},(_,i)=>[`entry-${i}`,i]));
 const updated=setFileReviewed({reviewedFiles},comparison,file,true),key=fileReviewKey(comparison,file),entries=Object.entries(updated.reviewedFiles);
 assert.equal(entries.length,2000);assert.equal(entries.at(-1)[0],key);assert.equal(entries[0][0],'entry-1');
 const unchanged=setFileReviewed(updated,comparison,file,false);assert.equal(Object.hasOwn(unchanged.reviewedFiles,key),false);assert.equal(Object.keys(unchanged.reviewedFiles).length,1999);
});
test('saved-comment list offers code navigation separately from editing',()=>{
 const draft={id:'d',repoKey:'r',comparisonId:'c',newPath:'a',body:'fix'},calls=[],view={id:'v',controller:{state:{repo:{key:'r'}},session:()=>({drafts:[draft]})},openComment:(d)=>calls.push(d.id)};
 const root=controls().draftsPane(view,{}),open=descendants(root).find(n=>n.identity==='open-code-d');assert.ok(open);open.handlers.on_click({},{});assert.deepEqual(calls,['d']);
});
test('diff controls separate view options from the selected file and hide search by default',()=>{
 const view=diffView({hunks:[]},null);view.inputs={find:{}};view.toggleAllFiles=()=>{};view.markFileReviewed=()=>{};view.generalComment=()=>{};
 const nodes=descendants(controls().diffPane(view));assert.ok(nodes.some(n=>n.identity==='diff-search'));assert.ok(nodes.some(n=>n.values?.id==='diff-file-header'));assert.ok(!nodes.some(n=>n.identity==='find-next'));assert.ok(!nodes.some(n=>n.identity==='general-comment'));
 view.searchOpen=true;assert.ok(descendants(controls().diffPane(view)).some(n=>n.identity==='find-next'));
 view.allFiles=true;view.allFileSections=[];const all=descendants(controls().diffPane(view));assert.ok(!all.some(n=>n.identity==='file-reviewed'));assert.ok(!all.some(n=>n.values?.id==='diff-file-header'));
});
function diffView(patch,target){return {id:'fixture',width:360,inlineEditor:{retained:true},target,diffMode:'unified',diffChangeKey:()=> 'c',controller:{state:{comparison:{id:'c'},file:{newPath:'a'},patch},session:()=>({drafts:[]})}};}
test('wrapping uses native measured rows and retains pure exact source snapshots',()=>{
 const source='const x = "😀 long line";',view=diffView({hunks:[{header:'@@',lines:[{side:'new',newLine:1,text:source}]}]},null);view.readingOptions={wrap:true};view.controller.state.file.newPath='a.ts';
 const root=controls().diffPane(view),list=descendants(root).find(n=>n?.kind==='measured');assert.ok(list);list.renderRows();assert.equal(view.patchRows[1].text,source);assert.equal(Object.hasOwn(list,'sizes'),false);
 assert.ok(descendants(root).some(n=>n?.identity==='diff-wrap'));
});
test('all-files native clicks carry exact section provenance and headers never become comments',()=>{
 const view=diffView({hunks:[]},null),calls=[];view.allFiles=true;view.requestAllFiles=(id)=>calls.push(['header',id]);view.selectFileLine=(row,id)=>calls.push(['source',row.text,id,row.comparisonId]);view.allFileSections=[{file:{id:'other',newPath:'other.ts'},comparison:{id:'exact'},patch:{hunks:[{header:'@@',lines:[{side:'new',newLine:1,text:'code'}]}]}}];
 const list=descendants(controls().diffPane(view)).find(n=>n?.kind==='virtual');list.renderRows();list.handlers.on_item_click('file:other',{});list.handlers.on_item_click('file:other:h0l0',{});
 assert.deepEqual(calls,[['header','other'],['source','code','other','exact']]);
});
test('All files displays its section headers before an individual file is selected',()=>{
 const view=diffView(null,null);view.controller.state.file=null;view.allFiles=true;view.allFileSections=[{file:{id:'other',newPath:'other.ts'},comparison:{id:'c'},collapsed:true}];
 const list=descendants(controls().diffPane(view)).find(n=>n.kind==='virtual');assert.ok(list);assert.equal(list.renderRows().length,1);
});
test('retained file-header controls do not also toggle the enclosing virtual row',()=>{
 const view=diffView({hunks:[]},null),calls=[];view.allFiles=true;view.allFileSections=[{file:{id:'other',newPath:'other'},comparison:{id:'c'},collapsed:true}];view.fileHeaderViews=new Map([['other',{retained:true}]]);view.requestAllFiles=id=>calls.push(id);
 const list=descendants(controls().diffPane(view)).find(n=>n.kind==='virtual');list.handlers.on_item_click('file:other',{});assert.deepEqual(calls,[]);
});
test('a selected line in one all-files section never highlights another comparison or path',()=>{
 const view=diffView({hunks:[]},{comparisonId:'c',newPath:'a',side:'new',startLine:1,endLine:1});view.allFiles=true;view.allFileSections=[{file:{id:'other',newPath:'other'},comparison:{id:'other-comparison'},patch:{hunks:[{header:'@@',lines:[{side:'new',newLine:1,text:'code'}]}]}}];
 const list=descendants(controls().diffPane(view)).find(n=>n?.kind==='virtual');assert.equal(list.renderRows()[2].values.bg,'undefined18');
});
test('split wrapping measures one aligned native pair and keeps source syntax/match decorations',()=>{
 const view=diffView({hunks:[{header:'@@',lines:[{side:'old',oldLine:1,text:'const x = "old😀";'},{side:'new',newLine:1,text:'const x = "new😀";'}]}]},null);view.diffMode='split';view.readingOptions={wrap:true};view.controller.state.file.newPath='a.ts';view.findMatches=[{side:'new',line:1,start:11,end:14}];
 const root=controls().diffPane(view),list=descendants(root).find(n=>n?.kind==='measured'),rows=list.renderRows(),pair=rows[1];assert.equal(rows.length,2);assert.equal(pair.values.min_h,22);assert.ok(Object.hasOwn(pair.values,'items_stretch'));assert.equal(Object.hasOwn(pair.values,'h'),false);assert.ok(descendants(pair).some(n=>n?.nodes?.includes('new')));assert.ok(descendants(pair).some(n=>n&&Object.hasOwn(n.values||{},'underline')));
});
test('loaded-source find and comment navigation use guarded existing callbacks outside layout',()=>{
 const view=diffView({hunks:[]},null),calls=[];view.inputs={find:{retained:true}};view.searchOpen=true;view.findMatches=[{side:'new',line:1,start:0,end:1}];view.findIndex=0;view.moveFind=(direction)=>calls.push(['find',direction]);view.navigateComment=direction=>calls.push(['comment',direction]);
 const root=controls().diffPane(view);for(const id of ['find-previous','find-next'])descendants(root).find(n=>n?.identity===id).handlers.on_click({},{});
 view.controller.state.repo={key:'r'};for(const id of ['comment-previous','comment-next'])descendants(controls().draftsPane(view,{})).find(n=>n?.identity===id).handlers.on_click({},{});assert.deepEqual(calls,[['find',-1],['find',1],['comment',-1],['comment',1]]);assert.ok(descendants(root).some(n=>n?.nodes?.includes('1/1 · loaded context only')));
});
test('wrapped source rows route measured-list clicks to the displayed code',()=>{
 const view=diffView({hunks:[{header:'@@',lines:[{side:'new',newLine:9,text:'wrapped code'}]}]},null),calls=[];view.readingOptions={wrap:true};view.selectLine=(...args)=>calls.push(args);
 const list=descendants(controls().diffPane(view)).find(n=>n?.kind==='measured');list.handlers.on_item_click('h0l0',{});
 assert.equal(calls[0][3].newLine,9);assert.equal(calls[0][3].text,'wrapped code');
});
test('saved general feedback has a review label without a fabricated file anchor',()=>{
 const view=diffView({hunks:[]},null);view.controller.state.repo={key:'repo'};view.controller.session=()=>({drafts:[{id:'general',scope:'general',repoKey:'repo',comparisonId:'c',body:'Review feedback'}]});
 const root=controls().draftsPane(view,{});assert.ok(descendants(root).some(n=>n?.nodes?.includes('General review')));
});
test('virtual rows embed the retained editor without registering callbacks during layout',()=>{
 const view=diffView({hunks:[{header:'@@',lines:[{side:'new',newLine:1,text:'code'}]}]},{comparisonId:'c',newPath:'a',side:'new',endLine:1});const root=controls().diffPane(view),list=descendants(root).find(node=>node?.kind==='measured'),rows=list.renderRows();assert.equal(rows.length,3);assert.ok(descendants(rows[2]).includes(view.inlineEditor));assert.equal(rows[2].values.min_h,comments.INLINE_EDITOR_HEIGHT);assert.equal(rows[2].values.max_h,comments.INLINE_EDITOR_MAX_HEIGHT);assert.equal(root.nodes[0].nodes.at(-1).identity,'select-code');
});
test('binary and mode-only file comments still display the same inline editor',()=>{
 for(const patch of [{binary:true,hunks:[]},{modeOnly:true,hunks:[]}]){const view=diffView(patch,{comparisonId:'c',newPath:'a',side:null});const list=descendants(controls().diffPane(view)).find(node=>node?.kind==='measured'),rows=list.renderRows();assert.equal(rows.length,2);assert.equal(rows[0].values.h,46);assert.equal(rows[1].values.min_h,comments.INLINE_EDITOR_HEIGHT);assert.ok(descendants(rows[1]).includes(view.inlineEditor));}
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


test('history and files use the same row height and graph cells span a full row',()=>{
 const ui=controls(),view={id:'rows',controller:{state:{repo:{key:'r'},history:[{oid:'a',parents:[],subject:'Example',author:'Author',timestamp:0,refs:[]}],files:[{id:'file',newPath:'a.js',status:'M'}]},session:()=>({drafts:[]})},selectCommit(){},selectFile(){}},cx={notify(){}};
 view.controller.session=()=>({drafts:[]});const history=descendants(ui.historyPane(view,cx)).find(x=>x.kind==='virtual'),files=descendants(ui.filesPane(view)).find(x=>x.kind==='virtual');assert.equal(history.sizes,files.sizes);assert.equal(history.renderRows()[0].values.h,ui.LIST_ROW_HEIGHT);assert.equal(files.renderRows()[0].values.h,ui.LIST_ROW_HEIGHT);assert.equal(ui.graphCell({before:[],after:[],lane:0,edges:[]}).values.h,ui.LIST_ROW_HEIGHT);
});
test('history omits redundant HEAD branch text but retains tags and full-ref tooltips',()=>{
 const view={id:'history',controller:{state:{history:[{oid:'a'.repeat(40),parents:[],subject:'Fix something',author:'Author',timestamp:0,refs:['HEAD -> feature/topic','tag: v1']}],comparison:null}},selectCommit(){}};
 const row=descendants(controls().historyPane(view,{})).find(n=>n.kind==='virtual').renderRows()[0],texts=descendants(row).flatMap(n=>n.nodes||[]).filter(n=>typeof n==='string');
 assert.ok(texts.includes('[tag: v1] Fix something'));assert.ok(!texts.some(t=>t.includes('HEAD ->')));assert.match(row.values.tooltip,/HEAD -> feature\/topic/);
});
test('history loading uses native SVG animation and disables duplicate pagination',()=>{
 const ui=controls(),indicator=ui.historyLoadingIndicator({historyLoadingMore:true}),icon=descendants(indicator).find(x=>x.kind==='svg');assert.equal(icon.values.spin,900);assert.match(indicator.values.accessibility_label,/Loading more/);
 const view={id:'loading',controller:{state:{history:[],files:[],historyLoading:true,historyLoadingMore:true,hasMore:true}}};const nodes=descendants(ui.historyPane(view,{}));assert.equal(nodes.find(x=>x.identity==='history-more').values.disabled,true);assert.ok(nodes.some(x=>x.kind==='svg'&&x.values.spin===900));
});

test('diff file heading is bold and shows file-list totals, including zero and unknown counts',()=>{
 const view=diffView({hunks:[]},null);Object.assign(view.controller.state.file,{newPath:'mods/juhas/main.js',additions:14,deletions:9});
 const header=()=>descendants(controls().diffPane(view)).find(n=>n.values?.id==='diff-file-header');
 let row=header(),name=row.nodes.find(n=>n.nodes?.includes('mods/juhas/main.js'));
 assert.ok(name);assert.deepEqual(name.values.font_semibold,[]);
 assert.equal(name.values.flex_1,undefined);const plus=row.nodes.findIndex(n=>n.nodes?.includes('+14')),minus=row.nodes.findIndex(n=>n.nodes?.includes('−9'));assert.equal(plus,row.nodes.indexOf(name)+1);assert.equal(minus,plus+1);assert.ok(row.nodes.slice(minus+1).some(n=>n.values?.flex_1));
 assert.ok(row.nodes.some(n=>n.nodes?.includes('+14')));assert.ok(row.nodes.some(n=>n.nodes?.includes('−9')));
 Object.assign(view.controller.state.file,{additions:0,deletions:0});row=header();assert.ok(row.nodes.some(n=>n.nodes?.includes('+0')));assert.ok(row.nodes.some(n=>n.nodes?.includes('−0')));
 Object.assign(view.controller.state.file,{additions:null,deletions:null});row=header();assert.ok(!row.nodes.some(n=>n.nodes?.includes('+null')||n.nodes?.includes('−null')));
});

test('large file pane reads session once and calculates progress once per file',()=>{let reads=0,checks=0;const files=Array.from({length:1000},(_,i)=>({id:String(i),newPath:`group-${i%10}/file${i}`,status:'M'})),session={drafts:[]};const view={id:'large',fileTree:true,controller:{state:{repo:{key:'r'},files},session:()=>{reads++;return session;}},isFileReviewed:(_f,s)=>{checks++;assert.equal(s,session);return false;},selectFile(){}};const ui=controls(),root=ui.filesPane(view),nodes=descendants(root),list=nodes.find(n=>n.kind==='virtual'),rows=list.renderRows();assert.equal(reads,1);assert.equal(checks,files.length);assert.ok(nodes.some(n=>n.nodes?.includes(`Files · 0/${files.length} viewed`)));assert.ok(nodes.some(n=>n.kind==='Toggle'&&n.identity==='file-tree'&&n.values.pressed));assert.equal(rows.length,fileRows(files,true).length);assert.equal(checks,files.length);});

test('All files header preparation snapshots session once for a large range',()=>{let reads=0,created=0,notified=0;const saved={reviewedFiles:{}};const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1],Native=new Function('View','FileHeader','reviewedState','class Juhas extends View'+source+'\nreturn Juhas;')(class{},class{},(session,_comparison,file)=>Boolean(session.reviewedFiles[file.id])),v=Object.create(Native.prototype);v.allFiles=true;v.controller={state:{comparison:{id:'c'}},session:()=>{reads++;return structuredClone(saved);}};v.allFileSections=Array.from({length:1000},(_,i)=>({file:{id:String(i)},comparison:{id:'c'},collapsed:true}));const cx={new(){created++;return {release(){}};},notify(){notified++;}};v.prepareFileHeaders(cx);assert.equal(created,1000);assert.equal(reads,1);v.prepareFileHeaders(cx);assert.equal(created,1000);assert.equal(reads,2);assert.equal(notified,0);saved.reviewedFiles[0]=true;v.prepareFileHeaders(cx);assert.equal(reads,3);assert.equal(notified,1);v.controller.state.files=[{id:"0",additions:5,deletions:2}];v.prepareFileHeaders(cx);assert.equal(v.allFileSections[0].file.additions,5);assert.equal(v.allFileSections[0].collapsed,true);assert.equal(notified,2);});

test('clicking a filtered folder never changes the saved tree collapse state',()=>{
 const files=[{id:'a',newPath:'src/a.js',status:'M'},{id:'b',newPath:'src/b.js',status:'M'}],view={id:'filtered',fileTree:true,collapsedDirs:new Set(),inputs:{fileQuery:{value:()=> 'src'}},controller:{state:{repo:{key:'r'},files},session:()=>({drafts:[]})},selectFile(){}};
 const nodes=descendants(controls().filesPane(view)),list=nodes.find(n=>n.kind==='virtual');list.renderRows();nodes.find(n=>n?.handlers?.on_item_click).handlers.on_item_click('dir:src/',{notify(){}});assert.deepEqual([...view.collapsedDirs],[]);
});
