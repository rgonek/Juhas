import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {packageRelease,releaseFiles} from '../scripts/package.mjs';
import {fileURLToPath} from 'node:url';
test('release contains every local runtime dependency, including new review features',()=>{
 const source=fileURLToPath(new URL('..',import.meta.url)),files=new Set(releaseFiles(source));
 for(const file of files){if(!file.startsWith('mods/juhas/')||!file.endsWith('.js'))continue;const body=readFileSync(join(source,file),'utf8');for(const match of body.matchAll(/from ['"]\.\/([^'"]+)['"]/g))assert.ok(files.has('mods/juhas/'+match[1]),`${file} needs ${match[1]}`);}
 assert.ok(files.has('mods/juhas/pane-presentation.js'));
});
test('release allowlist excludes review data, generated types and local plans',t=>{
 const root=mkdtempSync(join(tmpdir(),'juhas-package-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const source=join(root,'source'),dest=join(root,'output');
 for(const path of ['mods/juhas/icons','docs/superpowers','data','scripts','docs'])mkdirSync(join(source,path),{recursive:true});
 for(const path of ['mods/juhas/icons/LICENSE-Lucide.txt','mods/juhas/icons/arrow-up.svg','mods/juhas/main.js','mods/juhas/mod.json','mods/juhas/gpui-kit.d.ts','mods/juhas/secret.log','mods/juhas/private.js','docs/superpowers/private.md','docs/design-brief.md','docs/usage.md','docs/publishing.md','preview.png','NOTICE','data/session.json','git-review.json','juhas.json','README.md','RECIPE.md','THIRD_PARTY_NOTICES.md','LICENSE'])writeFileSync(join(source,path),'synthetic fixture');
 const result=packageRelease({source,dest});assert.equal(existsSync(join(dest,'git-review.json')),false);assert.equal(existsSync(join(dest,'juhas.json')),false);assert.ok(existsSync(join(dest,'docs/design-brief.md')));assert.ok(result.files.includes('mods/juhas/main.js'));assert.ok(result.files.includes('mods/juhas/icons/LICENSE-Lucide.txt'));assert.ok(existsSync(join(dest,'mods/juhas/icons/arrow-up.svg')));assert.ok(existsSync(join(dest,'LICENSE')));for(const file of ['NOTICE','preview.png','docs/usage.md','docs/publishing.md'])assert.ok(existsSync(join(dest,file)),file);assert.equal(existsSync(join(dest,'data')),false);assert.equal(existsSync(join(dest,'docs/superpowers')),false);assert.equal(existsSync(join(dest,'mods/juhas/gpui-kit.d.ts')),false);assert.equal(existsSync(join(dest,'mods/juhas/secret.log')),false);assert.equal(existsSync(join(dest,'mods/juhas/private.js')),false);
});
test('release packaging refuses absent license and nonempty output',t=>{
 const root=mkdtempSync(join(tmpdir(),'juhas-release-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const source=join(root,'source'),dest=join(root,'output');mkdirSync(source);assert.throws(()=>packageRelease({source,dest}),/license/i);writeFileSync(join(source,'LICENSE'),'Author chosen license');mkdirSync(dest);writeFileSync(join(dest,'keep'),'existing');assert.throws(()=>packageRelease({source,dest}),/empty|exists/i);assert.ok(existsSync(join(dest,'keep')));
});
