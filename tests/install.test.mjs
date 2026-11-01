import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
import {install,buildLayout} from '../scripts/install.mjs';
test('installer creates independent sidebar/full layout without touching shipped layout',t=>{
 const home=mkdtempSync(join(tmpdir(),'juhas-install-'));t.after(()=>rmSync(home,{recursive:true,force:true}));mkdirSync(join(home,'layouts'));
 const original={id:'root',type:'column',children:[{id:'terminal',type:'block',content:{tab:'active'}}]};writeFileSync(join(home,'layouts','main.json'),JSON.stringify(original));
 mkdirSync(join(home,'mods','tabs'),{recursive:true});const shippedTabs='export default class Tabs { init() {} render() { const enabled = shared("workspace.panels") ?? ["files", "changes"]; return root.when(w?.buttons, x=>x); } }';writeFileSync(join(home,'mods','tabs','main.js'),shippedTabs);
 const result=install({appHome:home,layoutName:'main',source:fileURLToPath(new URL('..',import.meta.url)),now:123});
 assert.equal(readFileSync(join(home,'layouts','main.json'),'utf8'),JSON.stringify(original));assert.ok(existsSync(join(home,'mods','juhas','main.js')));assert.ok(existsSync(join(home,'mods','juhas','icons','expand.svg')));assert.ok(existsSync(result.layout));
 const built=JSON.parse(readFileSync(result.layout,'utf8'));assert.match(JSON.stringify(built),/git-review-full/);assert.match(JSON.stringify(built),/git-review-sidebar/);
 assert.equal(readFileSync(join(home,'mods','tabs','main.js'),'utf8'),shippedTabs);assert.ok(existsSync(join(home,'mods','juhas-tabs','main.js')));assert.match(readFileSync(join(home,'mods','juhas-tabs','main.js'),'utf8'),/syncReviewSpace\(run, this\.reviewSpaces/);new Script(readFileSync(join(home,'mods','juhas-tabs','main.js'),'utf8').replace(/^import .*\n/gm,'').replace('export default class','class'));
 const second=install({appHome:home,layoutName:'main',source:fileURLToPath(new URL('..',import.meta.url)),now:124});assert.ok(existsSync(second.backup));
});
test('layout builder refuses layouts without a terminal area and duplicate review identities',()=>{
 assert.throws(()=>buildLayout({id:'root',type:'column',children:[]}),/terminal/i);
 const already={id:'git-review-work',type:'block',content:{tab:'active'}};assert.throws(()=>buildLayout(already),/already/i);
});
