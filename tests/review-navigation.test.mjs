import test from 'node:test';
import assert from 'node:assert/strict';
import {findReviewRoute,routeReview} from '../mods/juhas/review-navigation.js';
import {updateTabsSource,createPaneTabsSource,createTabsSource} from '../scripts/install.mjs';
function state(){const data={'juhas.review-tabs.v1':[{key:'outer',root:'C:/repo',spaceId:'s',machine:null},{key:'inner',root:'C:/repo/work',spaceId:'s',machine:null}],outer:{tabId:'r1',paneId:'p1'},inner:{tabId:'r2',paneId:'p2'}};return {data,shared:k=>data[k],setShared:(k,v)=>data[k]=v,focus:{cwd:'c:\\REPO\\work\\src'},spaces:[{id:'s',active:true,tabs:[{id:'source',active:true},{id:'r1'},{id:'r2'}]}],panes:[{pane:'p1',tab:'r1',mod:'juhas'},{pane:'p2',tab:'r2',mod:'juhas'}],presentation:'sidebar'};}
test('routing uses deepest live matching root and saves actual source',()=>{const s=state(),calls=[];s.panes.push({pane:'term',tab:'source',terminal:'t',cwd:'C:/repo/work/lib'});s.layout={id:'panel',hidden:false,children:[{id:'panel-body',active:'files'}]};assert.equal(findReviewRoute(s).key,'inner');assert.equal(routeReview((...c)=>calls.push(c),s),true);assert.deepEqual(calls,[['tab.select',{id:'r2'}]]);assert.equal(s.data.inner.sourceContext.folder,'C:/repo/work/lib');assert.equal(s.data.inner.sourceContext.tabId,'source');assert.equal(s.data.inner.sourcePresentation,'sidebar');});
test('routing rejects prefix siblings, stale panes, other spaces and machines',()=>{const s=state();s.focus.cwd='C:/repository';assert.equal(findReviewRoute(s),null);s.focus.cwd='C:/repo/work';s.panes=[];assert.equal(findReviewRoute(s),null);s.panes=[{pane:'p2',tab:'r2',mod:'juhas'}];s.spaces[0].machine='remote';assert.equal(findReviewRoute(s),null);s.spaces[0].machine=null;s.spaces[0].id='other';assert.equal(findReviewRoute(s),null);});
test('active review returns through sidebar command even without cwd',()=>{const s=state(),calls=[];s.focus={};s.spaces[0].tabs.forEach(t=>t.active=t.id==='r2');assert.equal(routeReview((...c)=>calls.push(c),s),true);assert.deepEqual(calls,[['juhas.sidebar']]);});
test('only selected Juhas sidebar is hidden on route',()=>{const s=state(),calls=[];s.layout={id:'panel',hidden:false,children:[{id:'panel-body',active:'git-review-sidebar'}]};routeReview((...c)=>calls.push(c),s);assert.deepEqual(calls[0],['layout.hide',{id:'panel'}]);});
test('native toolbar route patch is idempotent and keeps original fallback',()=>{const source=createPaneTabsSource('const custom = 123; root.when(w?.buttons, x=>x);');assert.match(source,/routeReview\(juhasNavigationRun/);assert.match(source,/\|\|togglePane/);assert.match(source,/const custom = 123/);assert.equal(updateTabsSource(source),source);});
test('sidebar patch preserves custom code and adds route styling',()=>{const original='// personal customization\nconst on = panel && !panel.hidden && body?.active === id;\nif (id === "git-review-sidebar") { toggleReview(run, layout()); return; }';const updated=updateTabsSource(original);assert.match(updated,/personal customization/);assert.match(updated,/Boolean\(findReviewRoute/);assert.match(updated,/if \(!routeReview/);assert.equal(updateTabsSource(updated),updated);assert.throws(()=>updateTabsSource('unrelated custom toolbar'),/preserved/);});

test('legacy review command routes first, keeps open explicit, and upgrades existing routed toolbars',()=>{
 const listener='if (command === "review") toggleReview(run, layout()); if (command === "open") openReview(run);';
 const original=listener+'\nconst on = panel && !panel.hidden && body?.active === id;\nif (id === "git-review-sidebar") { toggleReview(run, layout()); return; }';
 const updated=updateTabsSource(original);
 assert.ok(updated.includes('const juhasReviewState = () =>'));
 assert.ok(updated.includes('import { findReviewRoute, routeReview } from "./review-navigation.js";'));
 assert.ok(updated.includes('if (id === "git-review-sidebar") { if (!routeReview(juhasNavigationRun,juhasReviewState()))'));
 assert.match(updated,/if \(command === "review" && !routeReview\(juhasNavigationRun,juhasReviewState\(\)\)\) toggleReview/);
 assert.ok(updated.includes('if (command === "open") openReview(run);'));
 assert.equal(updateTabsSource(updated),updated);
 const oldRouted=updated.replace('if (command === "review" && !routeReview(juhasNavigationRun,juhasReviewState())) toggleReview(run, layout());',listener.split(' if (command === "open")')[0]);
 assert.equal(updateTabsSource(oldRouted),updated);
 const partial=original.replace('if (command === "review") toggleReview(run, layout());','if (command === "review" && !routeReview(juhasNavigationRun,juhasReviewState())) toggleReview(run, layout());');
 assert.equal(updateTabsSource(partial),updated);
 const generated=createTabsSource('export default class Tabs { init() {} render() { const enabled = shared("workspace.panels") ?? ["files", "changes"]; return root.when(w?.buttons, x=>x); } }');
 assert.ok(generated.includes('if (command === "review" && !routeReview(juhasNavigationRun,juhasReviewState())) toggleReview(run, layout());'));
 assert.ok(generated.includes('if (command === "open") openReview(run);'));
});

test('routing tolerates an unfocused window during native checks and startup',()=>{assert.equal(findReviewRoute({focus:null,spaces:[],panes:[],shared:()=>null}),null);});
