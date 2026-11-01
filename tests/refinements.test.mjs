import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,run} from './helpers/repos.mjs';
import {resolveRepo} from '../mods/juhas/repositories.js';
import {selectBase} from '../mods/juhas/config.js';
import {Controller} from '../mods/juhas/controller.js';
import {fileRows,splitRows,rangeSelection} from '../mods/juhas/review-ui.js';
import {syncReviewSpace} from '../mods/juhas/presentation.js';
import {listHistory} from '../mods/juhas/history.js';

test('expanded review belongs to a space and restores only that space',()=>{
 const state={},work={id:'git-review-work',active:'git-review-full'},layout={children:[work]};
 const calls=[],dispatch=(command,args)=>{calls.push([command,args]);if(command==='layout.select')work.active=args.child;};
 syncReviewSpace(dispatch,state,'a',layout);syncReviewSpace(dispatch,state,'b',layout);
 assert.equal(work.active,'git-review-terminal');syncReviewSpace(dispatch,state,'b',layout);syncReviewSpace(dispatch,state,'a',layout);
 assert.equal(work.active,'git-review-full');assert.equal(calls.at(-1)[0],'layout.hide');
});
test('range selects both endpoints regardless of click direction',()=>{
 const history=['new','middle','old'].map(oid=>({oid}));
 const expected={kind:'range',base:'old',target:'new',includeBase:true};
 assert.deepEqual(rangeSelection(history,'new','old'),expected);assert.deepEqual(rangeSelection(history,'old','new'),expected);assert.equal(rangeSelection(history,'missing','new'),null);
});
test('tree groups directories, collapses descendants and preserves file ids',()=>{
 const files=[{id:'1',newPath:'src/a.cs'},{id:'2',newPath:'src/nested/b.cs'},{id:'3',newPath:'readme.md'}];
 const rows=fileRows(files,true);assert.deepEqual(rows.filter(r=>!r.directory).map(r=>r.id),['2','1','3']);assert.equal(rows.find(r=>r.id==='2').depth,2);
 assert.deepEqual(fileRows(files,true,new Set(['src/'])).map(r=>r.id),['dir:src/','3']);assert.equal(fileRows(files),files);
});
test('side by side aligns replacement runs and retains original comment anchors',()=>{
 const old={id:'old',kind:'line',side:'old',text:'before',oldLine:1},next={id:'new',kind:'line',side:'new',text:'after',newLine:1},comment={id:'comment',kind:'comment'};
 const rows=splitRows([old,next,comment]);assert.equal(rows.length,2);assert.equal(rows[0].old,old);assert.equal(rows[0].next,next);assert.equal(rows[1],comment);
});
test('stats, full unchanged context and optional commit details come from real Git',async t=>{
 const f=fixture(t),lines=Array.from({length:150},(_,i)=>'line '+(i+1));f.commit(lines.join('\n'));
 lines[10]='changed 11';lines[120]='changed 121';const tip=f.commit(lines.join('\n'));f.git('commit','--amend','-m','Subject','-m','Long body for review');
 const data=new Map(),controller=new Controller({run,store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});
 await controller.openRepo(null,f.root);await controller.selectScope({kind:'commit',commit:'HEAD'});
 const file=controller.state.files[0];assert.equal(file.additions,2);assert.equal(file.deletions,2);
 await controller.selectFile(file.id);assert.equal(controller.state.patch.hunks.length,2);assert.ok(!controller.state.patch.hunks.flatMap(h=>h.lines).some(l=>l.text==='line 60'));
 await controller.expandFile();assert.ok(controller.state.patch.hunks.flatMap(h=>h.lines).some(l=>l.text==='line 60'));assert.equal(controller.state.patch.complete,true);
 await controller.loadDetails();assert.equal(controller.state.details.subject,'Subject');assert.match(controller.state.details.author,/test@example.invalid/);assert.equal(controller.state.details.body,'Long body for review');
});
test('all branches includes local and optionally remote graph tips without changing HEAD',async t=>{
 const f=fixture(t);f.commit('base');f.git('checkout','-b','other');const local=f.commit('local');f.git('checkout','trunk');f.git('checkout','-b','remote-temp');const remote=f.commit('remote');f.git('checkout','trunk');f.git('update-ref','refs/remotes/origin/only-remote',remote);f.git('branch','-D','remote-temp');
 const repo=await resolveRepo(run,null,f.root);const current=await listHistory(run,repo);assert.ok(!current.commits.some(c=>c.oid===local));
 const locals=await listHistory(run,repo,{ref:'all',remotes:false});assert.ok(locals.commits.some(c=>c.oid===local));assert.ok(!locals.commits.some(c=>c.oid===remote));
 const byHash=await listHistory(run,repo,{ref:'all',query:local.slice(0,8)});assert.equal(byHash.commits[0].oid,local);const all=await listHistory(run,repo,{ref:'all',remotes:true});assert.ok(all.commits.some(c=>c.oid===remote));const firstPage=await listHistory(run,repo,{ref:'all',limit:1});assert.equal(firstPage.ref,'all');const secondPage=await listHistory(run,repo,{ref:firstPage.ref,skip:1,limit:1});assert.notEqual(secondPage.commits[0].oid,firstPage.commits[0].oid);assert.equal(f.git('branch','--show-current'),'trunk');
});

test('range mode waits for two explicit endpoints and other scopes cancel it',async()=>{
 let source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export default class')).replace('export default class Juhas extends View','class Juhas extends View');
 const Native=new Function('View','rangeSelection','selectBase',source+'\nreturn Juhas;')(class{},rangeSelection,selectBase),view=Object.create(Native.prototype),selected=[];
 view.handle={focus(){}};view.inputs={base:{value:()=>'',set_value(){}},target:{value:()=> 'HEAD',set_value(){}}};view.controller={base:()=>'',state:{refs:[],history:['new','old'].map(oid=>({oid}))},selectScope:async scope=>selected.push(scope)};view.config={};view.publish=()=>{};view.work=(_cx,fn)=>view.pending=fn();const cx={notify(){}};
 view.applyScope('range',cx);await view.pending;assert.equal(selected.length,0);view.selectCommit('new',cx);assert.equal(selected.length,0);view.selectCommit('old',cx);await view.pending;assert.deepEqual(selected[0],{kind:'range',base:'old',target:'new',includeBase:true});
 view.applyScope('range',cx);await view.pending;view.applyScope('commit',cx);await view.pending;assert.equal(view.rangePicking,false);assert.equal(selected.at(-1).kind,'commit');
 view.applyScope('branch',cx);await view.pending;assert.equal(view.panel,'refs');assert.equal(selected.length,2);
});
test('delayed layout restore never records the old expanded state in the new space',()=>{
 const state={},work={id:'git-review-work',active:'git-review-full'},layout={children:[work]},calls=[];
 const run=(cmd,args)=>calls.push([cmd,args]);syncReviewSpace(run,state,'a',layout);syncReviewSpace(run,state,'b',layout);syncReviewSpace(run,state,'b',layout);assert.equal(state.full,false);assert.notEqual(state.bySpace.b,true);
 work.active='git-review-terminal';syncReviewSpace(run,state,'b',layout);assert.equal(state.bySpace.b,false);syncReviewSpace(run,state,'a',layout);assert.equal(state.full,true);
});

test('Fetch updates references from a local remote and preserves the checked-out branch',async t=>{
 const local=fixture(t),remote=fixture(t),head=local.commit('local');const remoteHead=remote.commit('remote');local.git('remote','add','origin',remote.root);
 const data=new Map(),controller=new Controller({run,store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)}});await controller.openRepo(null,local.root);await controller.selectScope({kind:'commit',commit:head});await controller.fetch();
 assert.equal(controller.state.refs.find(r=>r.fullName==='refs/remotes/origin/trunk').oid,remoteHead);assert.equal(local.git('rev-parse','HEAD'),head);assert.equal(local.git('branch','--show-current'),'trunk');assert.equal(controller.state.comparison.targetOid,head);assert.equal(local.git('status','--porcelain'),'');
});
