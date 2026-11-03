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
