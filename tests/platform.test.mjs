import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,symlinkSync,realpathSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixture,gitTool} from './helpers/repos.mjs';
import {readDirectories,readWorkspacePaths} from '../mods/juhas/platform.js';

test('workspace discovery lists only files directly in the project directory',async t=>{
 const f=fixture(t),file=join(f.root,'project ż.code-workspace');
 mkdirSync(join(f.root,'sub'));
 writeFileSync(file,'{}');writeFileSync(join(f.root,'sub','hidden.code-workspace'),'{}');
 writeFileSync(join(f.root,'code-workspace'),'{}');
 const exec=async(command,args,options)=>{
  const result=spawnSync(command,args,{cwd:options?.cwd,encoding:'utf8'});
  return {code:result.status??1,stdout:result.stdout||'',stderr:result.stderr||''};
 };
 assert.deepEqual(await readWorkspacePaths(exec,resolve('.'),f.root),[file]);
});

test('native directory discovery handles spaces and Unicode and lists only immediate directories',async t=>{
 const f=fixture(t),child=join(f.root,"child [one] ' ż");mkdirSync(child);mkdirSync(join(child,'nested'));writeFileSync(join(f.root,'ordinary.txt'),'file');
 const exec=async(command,args)=>{const r=spawnSync(command,args,{encoding:'utf8'});return {code:r.status??1,stdout:r.stdout||'',stderr:r.stderr||r.error?.message||''};};
 const rows=await readDirectories(exec,resolve('.'),null,f.root);
 const canonical=path=>{const resolved=realpathSync.native(path);return process.platform==='win32'?resolved.toLowerCase():resolved;};
 assert.ok(rows.some(row=>canonical(row.path)===canonical(child)),JSON.stringify({child,rows}));
 assert.ok(!rows.some(row=>/nested|ordinary\.txt/.test(row.path)));
});

test('native discovery uses no process for Git markers and workspace files',async t=>{
 const f=fixture(t),worktree=join(f.root,'backend'),workspace=join(f.root,'project.code-workspace');
 f.commit('base');f.git('worktree','add','-b','backend',worktree);writeFileSync(workspace,'{}');
 symlinkSync(worktree,join(f.root,'linked'),process.platform==='win32'?'junction':'dir');
 const exec=async()=>assert.fail('Native discovery launched an external process');
 const listings=new Map();
 const rows=await readDirectories(exec,'unused',null,f.root,{markersOnly:true,listings});
 assert.deepEqual(rows.map(row=>row.path),[worktree]);
 assert.deepEqual(await readWorkspacePaths(exec,'unused',f.root,{listings}),[workspace]);
});

test('Windows fallback shares one listing for repositories and workspaces',{skip:process.platform!=='win32'},async t=>{
 const f=fixture(t),worktree=join(f.root,'backend'),workspace=join(f.root,'project.code-workspace');
 f.commit('base');f.git('worktree','add','-b','backend',worktree);writeFileSync(workspace,'{}');
 const listings=new Map([[f.root,Promise.reject(new Error('Outside granted read roots'))]]);
 let calls=0;
 const exec=async(command,args)=>{
  calls++;
  const r=spawnSync(command,args,{encoding:'utf8'});
  return {code:r.status??1,stdout:r.stdout||'',stderr:r.stderr||''};
 };
 const rows=await readDirectories(exec,resolve('.'),null,f.root,{markersOnly:true,listings});
 assert.ok(rows.some(row=>row.path===worktree&&row.hasGit));
 assert.deepEqual(await readWorkspacePaths(exec,resolve('.'),f.root,{listings}),[workspace]);
 assert.equal(calls,1);
});

test('POSIX discovery escapes find patterns and does not descend into symlinks',async t=>{
 const f=fixture(t),root=join(f.parent,"folder [one] ' ż");mkdirSync(root);mkdirSync(join(root,'child'));mkdirSync(join(root,'child','nested'));symlinkSync(join(root,'child'),join(root,'linked'),process.platform==='win32'?'junction':'dir');
 const exec=async(command,args)=>{const executable=gitTool(command);const r=spawnSync(executable,args,{cwd:f.parent,encoding:'utf8'});return {code:r.status??1,stdout:r.stdout||'',stderr:r.stderr||r.error?.message||''};};
 const rows=await readDirectories(exec,'unused',null,basename(root));
 assert.deepEqual(rows.map(row=>row.path),[`${basename(root)}/child`]);
});

test('the POSIX marker scan finds direct Git directories and worktree files only',async t=>{
 const f=fixture(t),root=f.parent;
 const worktree=join(root,'linked worktree');
 f.commit('base');f.git('worktree','add','-b','linked',worktree);
 mkdirSync(join(root,'group','nested','.git'),{recursive:true});
 const exec=async(command,args,options)=>{
  const result=spawnSync(gitTool(command),args,{cwd:join(root,options.cwd),encoding:'utf8'});
  return {code:result.status??1,stdout:result.stdout||'',stderr:result.stderr||''};
 };
 const rows=await readDirectories(exec,'unused',null,'.',{markersOnly:true});
 // Use the POSIX path spelling on Windows too, while running Git for Windows find.
 assert.deepEqual(rows.map(row=>row.path).sort(),[`./${basename(f.root)}`,`./${basename(worktree)}`].sort());
});
