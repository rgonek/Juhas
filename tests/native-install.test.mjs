import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {install} from '../scripts/install.mjs';
test('native installer leaves personal layout and toolbar untouched and backs up updates',t=>{
 const home=mkdtempSync(join(tmpdir(),'juhas-native-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 mkdirSync(join(home,'layouts'));const layout=join(home,'layouts','custom.json');writeFileSync(layout,'personal layout');
 const first=install({appHome:home,now:1});assert.ok(existsSync(join(first.mod,'main.js')));assert.equal(readFileSync(layout,'utf8'),'personal layout');assert.equal(existsSync(join(home,'mods','juhas-tabs')),false);assert.equal(existsSync(join(home,'layouts','juhas.json')),false);
 const second=install({appHome:home,now:2});assert.ok(existsSync(join(second.backup,'juhas','main.js')));
});

test('updating an existing personal toolbar backs up source and copies standalone navigation',t=>{
 const home=mkdtempSync(join(tmpdir(),'juhas-update-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const toolbar=join(home,'mods','personal-tabs');mkdirSync(toolbar,{recursive:true});
 const original='// custom branding\nconst on = panel && !panel.hidden && body?.active === id;\nif (id === "git-review-sidebar") { toggleReview(run, layout()); return; }';
 writeFileSync(join(toolbar,'main.js'),original,'utf8');
 const result=install({appHome:home,updateTabsName:'personal-tabs',now:3});
 assert.equal(result.tabsMod,toolbar);assert.equal(readFileSync(join(result.backup,'personal-tabs','main.js'),'utf8'),original);
 assert.match(readFileSync(join(toolbar,'main.js'),'utf8'),/custom branding/);assert.match(readFileSync(join(toolbar,'main.js'),'utf8'),/routeReview/);assert.ok(existsSync(join(toolbar,'review-navigation.js')));
 const updated=readFileSync(join(toolbar,'main.js'),'utf8');install({appHome:home,updateTabsName:'personal-tabs',now:4});assert.equal(readFileSync(join(toolbar,'main.js'),'utf8'),updated);
 assert.throws(()=>install({appHome:home,updateTabsName:'tabs'}),/personal/);
});
