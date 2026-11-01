import {mkdtempSync,writeFileSync,mkdirSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
export function fixture(t,{format='sha1'}={}){
 const parent=mkdtempSync(join(tmpdir(),'juhas-'));const root=join(parent,"repo żółć ' one");mkdirSync(root);
 t.after(()=>rmSync(parent,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-b','trunk',`--object-format=${format}`);git('config','user.name','Test Author');git('config','user.email','test@example.invalid');git('config','core.autocrlf','false');
 const commit=(text,name='file.txt')=>{writeFileSync(join(root,name),text);git('add','--',name);git('commit','-m',`change ${text.slice(0,12)}`);return git('rev-parse','HEAD');};
 return {root,parent,git,commit};
}
export async function run(repo,args){const r=spawnSync('git',args,{cwd:repo.root,encoding:'utf8'});return {code:r.status??1,stdout:r.stdout??'',stderr:r.stderr??r.error?.message??''};}
export async function directories(_machine,root){return readdirSync(root,{withFileTypes:true}).map(d=>({path:join(root,d.name),isDirectory:d.isDirectory(),isLink:d.isSymbolicLink()}));}
