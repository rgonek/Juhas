import {git,fingerprint} from './git.js';
const options=['--no-color','--no-ext-diff','--no-textconv','--find-renames=20%'];
export function parseFiles(raw){
 const tokens=raw.split('\0'),files=[],stats=[];
 for(let i=0;i<tokens.length&&tokens[i];){const header=tokens[i++];if(header.startsWith(':')){const [oldMode,newMode,oldOid,newOid,status]=header.slice(1).split(' '),oldPath=tokens[i++],newPath=/^[RC]/.test(status)?tokens[i++]:oldPath;files.push({id:JSON.stringify([oldPath,newPath]),oldPath,newPath,status:status[0],oldMode,newMode,oldOid,newOid,binary:false,additions:null,deletions:null});}else{const m=/^([^\t]+)\t([^\t]+)\t(.*)$/s.exec(header);if(!m)continue;let path=m[3];if(!path){i++;path=tokens[i++];}stats.push({path,additions:m[1]==='-'?null:Number(m[1]),deletions:m[2]==='-'?null:Number(m[2])});}}
 const byPath=new Map(files.map(f=>[f.newPath,f]));for(const s of stats){const f=byPath.get(s.path);if(f)Object.assign(f,s,{binary:s.additions==null});}return files;
}
export async function readFiles(run,repo,ends){return parseFiles(await git(run,repo,['diff',...options,'--raw','--numstat','--no-abbrev','-z',...ends,'--']));}
// Raw metadata covers deletes, modes, rename paths and submodule identities.
// Content hashing is batched; full-repository binary patches are never probed.
export async function observeWorking(run,repo,baseTree){
 const files=await readFiles(run,repo,[baseTree]);
 const untracked=(await git(run,repo,['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(Boolean);
 if(files.length+untracked.length>10000)throw new Error('Working observation exceeds 10000 changed paths; previous source retained');
 // --no-index raw/numstat observes untracked modes (including symlinks) and
 // binary status without serializing their potentially enormous binary patch.
 for(const path of untracked){const result=await run(repo,['diff',...options,'--no-index','--raw','--numstat','--no-abbrev','-z','--','/dev/null',path]);if(result.code!==0&&result.code!==1)throw new Error(result.stderr||'Cannot inspect untracked file');const metadata=parseFiles(result.stdout)[0];if(!metadata)throw new Error('Untracked file disappeared during observation');files.push({...metadata,id:JSON.stringify([null,path]),oldPath:null,newPath:path,untracked:true});}
 if(files.length>10000)throw new Error('Working observation exceeds 10000 changed paths; previous source retained');
 const regular=files.filter(f=>!['000000','120000','160000'].includes(f.newMode));
 for(let i=0;i<regular.length;i+=40){const batch=regular.slice(i,i+40),hashes=(await git(run,repo,['hash-object','--no-filters','--',...batch.map(f=>f.newPath)])).trim().split('\n');if(hashes.length!==batch.length||hashes.some(h=>! /^[a-f0-9]{40,64}$/.test(h)))throw new Error('Cannot verify working file contents');batch.forEach((f,j)=>f.newOid=hashes[j]);}
 for(const file of files.filter(f=>f.newMode==='120000')){
  const args=file.untracked?['diff',...options,'--no-index','--','/dev/null',file.newPath]:['diff',...options,baseTree,'--',`:(literal)${file.newPath}`];const result=await run(repo,args);if(result.code!==0&&!(file.untracked&&result.code===1))throw new Error(result.stderr||'Cannot inspect symlink');file.newOid=`symlink:${fingerprint(result.stdout)}`;
 }
 for(const file of files)file.contentIdentity=JSON.stringify([file.oldPath,file.newPath,file.oldMode,file.newMode,file.oldOid,file.newOid]);
 return {id:`working:${fingerprint(JSON.stringify(files.map(f=>f.contentIdentity)))}`,files,untracked};
}
