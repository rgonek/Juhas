import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,run,directories} from './helpers/repos.mjs';
import {reviewContext,resolveRepositoryScope,allowedRepository,contextStorageKey} from '../mods/juhas/context.js';
test('active project/tab determines context, including when the review mod has focus',()=>{
 assert.equal(reviewContext(null,null,[],[]).folder,null);
 const spaces=[{id:'one',active:true,machine:null,folder:'/one',tabs:[{id:'tab-one',active:true}]},{id:'two',active:false,machine:'remote',folder:'/two',tabs:[{id:'tab-two',active:true}]}];
 const panes=[{pane:'p1',terminal:'t1',tab:'tab-one',cwd:'/one/repo'},{pane:'p2',terminal:'remote/t2',tab:'tab-two',cwd:'/two/repo'}];
 const a=reviewContext({}, {space:'one',tab:'tab-one',pane:null},spaces,panes);assert.equal(a.folder,'/one/repo');assert.equal(a.machine,null);
 spaces[0].active=false;spaces[1].active=true;const b=reviewContext({}, {space:'two',tab:'tab-two',pane:null},spaces,panes);assert.equal(b.folder,'/two/repo');assert.equal(b.machine,'remote');assert.notEqual(a.key,b.key);assert.notEqual(contextStorageKey('selection','session',a),contextStorageKey('selection','session',b));
 const stale=reviewContext({}, {space:'one',tab:'tab-one',pane:'p1',cwd:'/one/repo'},spaces,panes);assert.equal(stale.folder,'/two/repo');
});
test('single Git context locks to its repository even if sibling repositories exist',async t=>{
 const a=fixture(t);a.commit('one');const sub=join(a.root,'src');mkdirSync(sub);const scope=await resolveRepositoryScope(run,directories,{folder:sub,machine:null});assert.equal(scope.canSwitch,false);assert.equal(scope.repos.length,1);assert.equal(allowedRepository(scope,'/unrelated'),null);assert.equal(allowedRepository(scope,a.git('rev-parse','--show-toplevel')).key,scope.repos[0].key);
});
test('a parent context exposes only repositories below that directory',async t=>{
 const a=fixture(t);a.commit('one');const second=join(a.parent,'second');a.git('worktree','add','-b','second',second);
 const scope=await resolveRepositoryScope(run,directories,{folder:a.parent,machine:null});assert.equal(scope.canSwitch,true);assert.equal(scope.repos.length,2);assert.equal(allowedRepository(scope,'/old-project'),null);
});
test('parent with one repository has no repository switcher',async t=>{
 const a=fixture(t);a.commit('one');const scope=await resolveRepositoryScope(run,directories,{folder:a.parent,machine:null});assert.equal(scope.canSwitch,false);assert.equal(scope.repos.length,1);
});
