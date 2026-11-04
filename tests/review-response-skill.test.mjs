import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {packageRelease} from '../scripts/package.mjs';
import {install} from '../scripts/install.mjs';

const skill='mods/juhas/skills/juhas-review-response/SKILL.md';
test('release ships only the intended review-response skill and installation keeps it inside the mod',t=>{
 const root=mkdtempSync(join(tmpdir(),'juhas-skill-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const source=join(root,'source'),release=join(root,'release'),home=join(root,'home');
 const body=readFileSync(fileURLToPath(new URL('../'+skill,import.meta.url)),'utf8');
 for(const file of ['LICENSE',skill,'mods/juhas/skills/private/SKILL.md','mods/juhas/skills/juhas-review-response/private.md']){mkdirSync(join(source,file,'..'),{recursive:true});writeFileSync(join(source,file),file===skill?body:'fixture','utf8');}
 const packaged=packageRelease({source,dest:release});
 assert.deepEqual(packaged.files.filter(file=>file.includes('/skills/')),[skill]);assert.equal(readFileSync(join(release,skill),'utf8'),body);
 const discovery=join(home,'.agents','skills','custom','SKILL.md');mkdirSync(join(discovery,'..'),{recursive:true});writeFileSync(discovery,'personal skill','utf8');
 const first=install({appHome:home,source:release,now:1});assert.equal(readFileSync(join(home,skill),'utf8'),body);
 assert.equal(readFileSync(discovery,'utf8'),'personal skill');assert.equal(existsSync(join(home,'.agents','skills','juhas-review-response')),false);assert.equal(existsSync(join(home,'layouts')),false);
 const custom=join(first.mod,'skills','custom','SKILL.md');mkdirSync(join(custom,'..'),{recursive:true});writeFileSync(custom,'keep custom','utf8');
 const second=install({appHome:home,source,now:2});assert.equal(readFileSync(custom,'utf8'),'keep custom');assert.equal(readFileSync(join(second.backup,'juhas','skills','custom','SKILL.md'),'utf8'),'keep custom');
 assert.equal(existsSync(join(first.mod,'skills','private')),false);assert.equal(existsSync(join(first.mod,'skills','juhas-review-response','private.md')),false);
 assert.equal(readFileSync(join(home,skill),'utf8'),body);
});
