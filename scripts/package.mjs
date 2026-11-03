import {existsSync,readFileSync,readdirSync,mkdirSync,copyFileSync} from 'node:fs';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const publicFiles=['README.md','RECIPE.md','preview.png','LICENSE','NOTICE','THIRD_PARTY_NOTICES.md','scripts/install.mjs','scripts/install.ps1','scripts/install.sh','docs/images/review.png','docs/usage.md','docs/publishing.md','docs/compatibility.md','docs/design-brief.md','docs/performance.md','docs/acceptance.md'];
const modules=['cache','comments','comparisons','config','context','controller','diff','git','graph','history','inline-editor','main','model','platform','presentation','repositories','review','review-ui','storage','submit','ui','working-observation','refresh','progress','reading','snapshots','guided','review-tab','pane-presentation'];
export function releaseFiles(source){
 const files=publicFiles.filter(f=>existsSync(join(source,f)));const mod=join(source,'mods','juhas');if(!existsSync(mod))return files;
 for(const name of [...modules.map(m=>m+'.js'),'mod.json','helpers/list-directories.ps1','icons/LICENSE-Lucide.txt',...['juhas','expand','collapse','fetch','refresh','comment','copy','arrow-up','arrow-down','more','chevron-right','chevron-down','check','loader-circle'].map(name=>'icons/'+name+'.svg')])if(existsSync(join(mod,name)))files.push(`mods/juhas/${name}`);
 return files.sort();
}
export function packageRelease({source,dest}){
 const license=join(source,'LICENSE');if(!existsSync(license)||!readFileSync(license,'utf8').trim())throw new Error('Choose and add the author-approved LICENSE before creating a public release');
 if(existsSync(dest)&&readdirSync(dest).length)throw new Error('Release output must be empty; existing files were preserved');
 const out=resolve(dest),from=resolve(source),rel=relative(out,from);if(out===from||(!isAbsolute(rel)&&!rel.startsWith('..')))throw new Error('Release destination cannot contain the source directory');
 const files=releaseFiles(source);
 for(const file of files){if(file.endsWith('.png'))continue;const body=readFileSync(join(source,file),'utf8');if(/\b[A-Za-z]:[\\/][A-Za-z0-9_. -]+[\\/]|\/(?:Users|home)\/[^\s/]+\//.test(body))throw new Error(`Possible private absolute path in ${file}; review before packaging`);}
 mkdirSync(dest,{recursive:true});for(const file of files){const target=join(dest,file);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(source,file),target);}return {files,dest};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const source=resolve(dirname(fileURLToPath(import.meta.url)),'..');const args=process.argv.slice(2);
 if(args.includes('--check'))console.log(JSON.stringify({ready:existsSync(join(source,'LICENSE'))&&Boolean(readFileSync(join(source,'LICENSE'),'utf8').trim()),files:releaseFiles(source),note:'No files copied; ready checks license presence only. See docs/publishing.md for acceptance status.'},null,2));
 else{const i=args.indexOf('--out');const dest=resolve(i>=0?args[i+1]:join(source,'dist','juhas'));console.log(JSON.stringify(packageRelease({source,dest}),null,2));}
}
