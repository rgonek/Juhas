import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,symlinkSync,realpathSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixture} from './helpers/repos.mjs';
import {readDirectories} from '../mods/juhas/platform.js';

test('native directory discovery handles spaces and Unicode and lists only immediate directories',async t=>{
 const f=fixture(t),child=join(f.root,"child [one] ' ż");mkdirSync(child);mkdirSync(join(child,'nested'));writeFileSync(join(f.root,'ordinary.txt'),'file');
 const exec=async(command,args)=>{const r=spawnSync(command,args,{encoding:'utf8'});return {code:r.status??1,stdout:r.stdout||'',stderr:r.stderr||r.error?.message||''};};
 const rows=await readDirectories(exec,resolve('.'),null,f.root);
 const canonical=path=>{const resolved=realpathSync.native(path);return process.platform==='win32'?resolved.toLowerCase():resolved;};
 assert.ok(rows.some(row=>canonical(row.path)===canonical(child)),JSON.stringify({child,rows}));
 assert.ok(!rows.some(row=>/nested|ordinary\.txt/.test(row.path)));
});

test('POSIX discovery escapes find patterns and does not descend into symlinks',async t=>{
 const f=fixture(t),root=join(f.parent,"folder [one] ' ż");mkdirSync(root);mkdirSync(join(root,'child'));mkdirSync(join(root,'child','nested'));symlinkSync(join(root,'child'),join(root,'linked'),process.platform==='win32'?'junction':'dir');
 const exec=async(command,args)=>{const executable=process.platform==='win32'?'C:/Program Files/Git/usr/bin/find.exe':command;const r=spawnSync(executable,args,{cwd:f.parent,encoding:'utf8'});return {code:r.status??1,stdout:r.stdout||'',stderr:r.stderr||r.error?.message||''};};
 const rows=await readDirectories(exec,'unused',null,basename(root));
 assert.deepEqual(rows.map(row=>row.path),[`${basename(root)}/child`]);
});
