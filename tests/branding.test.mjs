import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildLayout,createTabsSource} from '../scripts/install.mjs';
import {releaseFiles} from '../scripts/package.mjs';
test('the distributable Herdr mod is named juhas',()=>{
 assert.equal(existsSync(new URL('../mods/juhas/main.js',import.meta.url)),true);
 assert.equal(JSON.parse(readFileSync(new URL('../mods/juhas/mod.json',import.meta.url),'utf8')).title,'Juhas');
 const tree=buildLayout({id:'root',type:'column',children:[{id:'terminal',type:'block',content:{tab:'active'}}]});
 const mods=[];const walk=node=>{if(node.content?.mod)mods.push(node.content.mod);for(const child of node.children||[])walk(child);};walk(tree);assert.ok(mods.includes('juhas'));assert.ok(!mods.includes('git-review'));
 const files=releaseFiles(fileURLToPath(new URL('..',import.meta.url)));assert.ok(files.includes('mods/juhas/main.js'));assert.ok(!files.some(file=>file.startsWith('mods/git-review/')));
});
test('the generated tabs integration labels the helper Juhas',()=>{
 const source='export default class Tabs { init() {} render() { const enabled = shared("workspace.panels") ?? ["files", "changes"]; return root.when(w?.buttons, x=>x); } }';
 assert.match(createTabsSource(source),/panelButton\([^\n]*"Juhas"/);
});
test('Juhas config takes precedence and legacy config is read only when the new file is missing',async()=>{
 const {readLocalConfig}=await import('../mods/juhas/config.js');const calls=[];
 const local={baseRules:[{prefix:'feature/',basePrefix:'integration/'}]};
 const read=async path=>{calls.push(path);return path==='juhas.json'?null:JSON.stringify(local);};
 assert.deepEqual(await readLocalConfig(read,'juhas.json','git-review.json'),local);assert.deepEqual(calls,['juhas.json','git-review.json']);calls.length=0;
 assert.deepEqual(await readLocalConfig(async path=>{calls.push(path);return '{}';},'juhas.json','git-review.json'),{});assert.deepEqual(calls,['juhas.json']);
 await assert.rejects(()=>readLocalConfig(async()=>'{bad','juhas.json','git-review.json'),/configuration/);
});
