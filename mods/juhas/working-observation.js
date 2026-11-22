import {git,fingerprint,withGitBudget} from './git.js';
const options=['--no-color','--no-ext-diff','--no-textconv','--find-renames=20%'];
export function parseFiles(raw){
 const tokens=raw.split('\0'),files=[],stats=[];
 for(let i=0;i<tokens.length&&tokens[i];){const header=tokens[i++];if(header.startsWith(':')){const [oldMode,newMode,oldOid,newOid,status]=header.slice(1).split(' '),oldPath=tokens[i++],newPath=/^[RC]/.test(status)?tokens[i++]:oldPath;files.push({id:JSON.stringify([oldPath,newPath]),oldPath,newPath,status:status[0],oldMode,newMode,oldOid,newOid,binary:false,additions:null,deletions:null});}else{const m=/^([^\t]+)\t([^\t]+)\t(.*)$/s.exec(header);if(!m)continue;let path=m[3];if(!path){i++;path=tokens[i++];}stats.push({path,additions:m[1]==='-'?null:Number(m[1]),deletions:m[2]==='-'?null:Number(m[2])});}}
 const byPath=new Map(files.map(f=>[f.newPath,f]));for(const s of stats){const f=byPath.get(s.path);if(f)Object.assign(f,s,{binary:s.additions==null});}return files;
}
export async function readFiles(run,repo,ends){return parseFiles(await git(run,repo,['diff',...options,'--raw','--numstat','--no-abbrev','-z',...ends,'--']));}
// Raw metadata covers deletes, modes, rename paths and submodule identities.
// Content hashing is batched; full-repository binary patches are never probed.
async function readWorkingFiles(run,repo,baseTree){
 const [files,untrackedRaw]=await Promise.all([readFiles(run,repo,[baseTree]),
  git(run,repo,['ls-files','--others','--exclude-standard','-z'])]);
 const untracked=untrackedRaw.split('\0').filter(Boolean);
 if(files.length+untracked.length>10000)throw new Error('Working observation exceeds 10000 changed paths; previous source retained');
 // --no-index raw/numstat observes untracked modes (including symlinks) and
 // binary status without serializing their potentially enormous binary patch.
 // Bound process fan-out while preserving path order and exact metadata checks.
 const metadataFiles=new Array(untracked.length);
 const blobFormat=baseTree.length===64?'sha256':'sha1',zeroOid='0'.repeat(baseTree.length===64?64:40);
 const helperMeta=untracked.length&&run.untrackedMetadata?await run.untrackedMetadata(repo,untracked,{blobFormat}):null;
 const fallbackIndices=[];
 if(helperMeta&&helperMeta.length===untracked.length){
  for(let index=0;index<untracked.length;index++){
   const m=helperMeta[index],path=untracked[index];
   if(m)metadataFiles[index]={id:JSON.stringify([null,path]),oldPath:null,newPath:path,status:'A',oldMode:'000000',newMode:m.mode,oldOid:zeroOid,newOid:m.oid,binary:m.binary,additions:m.additions,deletions:m.deletions,path,untracked:true};
   else fallbackIndices.push(index);
  }
 }else{
  for(let index=0;index<untracked.length;index++)fallbackIndices.push(index);
 }
 let next=0,stopped=false;
 const workers=Array.from({length:Math.min(4,fallbackIndices.length)},async()=>{
  while(!stopped&&next<fallbackIndices.length){const index=fallbackIndices[next++],path=untracked[index];try{const result=await run(repo,['diff',...options,'--no-index','--raw','--numstat','--no-abbrev','-z','--','/dev/null',path]);if(result.code!==0&&result.code!==1)throw new Error(result.stderr||'Cannot inspect untracked file');const metadata=parseFiles(result.stdout)[0];if(!metadata)throw new Error('Untracked file disappeared during observation');metadataFiles[index]=({...metadata,id:JSON.stringify([null,path]),oldPath:null,newPath:path,untracked:true});}catch(error){stopped=true;throw error;}}
 });
 const results=await Promise.allSettled(workers),failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
 files.push(...metadataFiles);
 if(files.length>10000)throw new Error('Working observation exceeds 10000 changed paths; previous source retained');
 return {files,untracked};
}
export async function hasWorkingChanges(run,repo){
 return Boolean(await git(run,repo,['status','--porcelain=v1','-z','--untracked-files=normal']));
}
export async function readRepoStatus(run,repo){
 const r=await run(repo,['status','--porcelain=v2','--branch','-z','--untracked-files=normal']);
 if(r.code!==0)return null;
 let branch='(detached)',head=null,dirty=false,seenHeader=false;
 for(const entry of r.stdout.split('\0')){
  if(!entry)continue;
  if(entry.startsWith('# branch.head ')){seenHeader=true;const b=entry.slice(14);branch=b&&b!=='(detached)'?b:'(detached)';}
  else if(entry.startsWith('# branch.oid ')){seenHeader=true;const o=entry.slice(13);head=o&&o!=='(initial)'?o:null;}
  else if(!entry.startsWith('#')){dirty=true;break;}
 }
 return seenHeader?{branch,head,dirty}:null;
}
export async function workingLineCounts(runner,repo){
 const run=withGitBudget(runner);
 const trackedPromise=readFiles(run,repo,['HEAD']).catch(async()=>{
  const emptyTree=(await git(run,repo,['hash-object','-t','tree','--stdin'])).trim();
  return readFiles(run,repo,[emptyTree]);
 });
 const [tracked,untrackedRaw]=await Promise.all([trackedPromise,git(run,repo,['ls-files','--others','--exclude-standard','-z'])]);
 const untracked=untrackedRaw.split('\0').filter(Boolean);
 const total=tracked.reduce((acc,file)=>{acc.additions+=file.additions??0;acc.deletions+=file.deletions??0;return acc;},{additions:0,deletions:0});
 if(!untracked.length)return total;
 const helperMeta=run.untrackedMetadata?await run.untrackedMetadata(repo,untracked,{blobFormat:'sha1'}):null;
 const fallback=[];
 if(helperMeta&&helperMeta.length===untracked.length){
  for(let i=0;i<untracked.length;i++){const m=helperMeta[i];if(m)total.additions+=m.additions??0;else fallback.push(untracked[i]);}
 }else fallback.push(...untracked);
 let next=0;
 await Promise.all(Array.from({length:Math.min(4,fallback.length)},async()=>{
  while(next<fallback.length){
   const path=fallback[next++];
   const result=await run(repo,['diff',...options,'--no-index','--raw','--numstat','--no-abbrev','-z','--','/dev/null',path]);
   if(result.code!==0&&result.code!==1)throw new Error(result.stderr||'Cannot inspect untracked file');
   const meta=parseFiles(result.stdout)[0];
   if(meta)total.additions+=meta.additions??0;
  }
 }));
 return total;
}
export async function observeWorking(run,repo,baseTree){
 const {files,untracked}=await readWorkingFiles(run,repo,baseTree);
 const regular=files.filter(f=>!['000000','120000','160000'].includes(f.newMode)&&!(f.untracked&&f.newOid&&!/^0+$/.test(f.newOid)));
 for(let i=0;i<regular.length;i+=40){const batch=regular.slice(i,i+40),hashes=(await git(run,repo,['hash-object','--no-filters','--',...batch.map(f=>f.newPath)],{blobFormat:baseTree.length===64?'sha256':'sha1'})).trim().split('\n');if(hashes.length!==batch.length||hashes.some(h=>! /^[a-f0-9]{40,64}$/.test(h)))throw new Error('Cannot verify working file contents');batch.forEach((f,j)=>f.newOid=hashes[j]);}
 for(const file of files.filter(f=>f.newMode==='120000')){
  const args=file.untracked?['diff',...options,'--no-index','--','/dev/null',file.newPath]:['diff',...options,baseTree,'--',`:(literal)${file.newPath}`];const result=await run(repo,args);if(result.code!==0&&!(file.untracked&&result.code===1))throw new Error(result.stderr||'Cannot inspect symlink');file.newOid=`symlink:${fingerprint(result.stdout)}`;
 }
 for(const file of files)file.contentIdentity=JSON.stringify([file.oldPath,file.newPath,file.oldMode,file.newMode,file.oldOid,file.newOid]);
 return {id:`working:${fingerprint(JSON.stringify(files.map(f=>f.contentIdentity)))}`,files,untracked};
}
