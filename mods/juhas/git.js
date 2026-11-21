export const READ=['--no-optional-locks','-c','core.fsmonitor=false','-c','diff.autoRefreshIndex=false','-c','core.quotepath=false'];
export function createRunner(exec,appFolder=''){
 const windows=/^[a-z]:/i.test(appFolder)||appFolder.charCodeAt(0)===92;
 const helper=appFolder&&appFolder.replace(/[\\/]+$/,'')+'/mods/juhas/helpers/juhas-blob-hash'+(windows?'.exe':'');
 let available=Boolean(helper);
 const run=async(repo,args,{blobFormat}={})=>{
  const width=blobFormat==='sha1'?40:blobFormat==='sha256'?64:0;
  if(available&&repo.machine==null&&width&&args.length>3&&args[0]==='hash-object'&&args[1]==='--no-filters'&&args[2]==='--'){
   try{
    const result=await exec(helper,['--hash',blobFormat,...args.slice(3)],{cwd:repo.root,timeout:3000});
    if(result.code===0){
     const hashes=result.stdout.trim().split(/\r?\n/);
     if(hashes.length===args.length-3&&hashes.every(hash=>hash.length===width&&/^[a-f0-9]+$/.test(hash)))return result;
    }
    if(result.code!==2)available=false;
   }catch{available=false;}
  }
  return exec('git',[...READ,...args],{cwd:repo.root,on:repo.machine??null});
 };
 run.contextRange=async(repo,file,{oldStart,newStart,count})=>{
  if(!available||repo.machine!=null)return null;
  let raw;
  try{
   const result=await exec(helper,['--context',file.oldOid,String(oldStart),file.newOid,String(newStart),String(count)],{cwd:repo.root,timeout:3000});
   if(result.code!==0)return null;
   raw=result.stdout;
  }catch{return null;}
  if(!raw?.endsWith('\n'))return null;
  const lines=raw.slice(0,-1).split('\n');
  if(lines.length!==count)return null;
  return {hunks:[{lines:lines.map((text,i)=>({side:'context',oldLine:oldStart+i,newLine:newStart+i,text}))}]};
 };
 return run;
}
export function withGitBudget(run,{maxCommands=256,deadlineMs=25000,now=()=>Date.now()}={}){const start=now();let calls=0;const check=()=>{if(now()-start>deadlineMs)throw new Error('Git request time budget exceeded; previous source retained');};const limited=async(repo,args,options)=>{check();if(++calls>maxCommands)throw new Error('Git request command budget exceeded; previous source retained');const result=await run(repo,args,options);check();return result;};limited.originalRun=run.originalRun||run;return limited;}
export async function git(run,repo,args,options){const r=await run(repo,args,options);if(r.code!==0)throw new Error(r.stderr.trim()||`Git exited ${r.code}`);return r.stdout;}
export function revision(value){if(typeof value!=='string'||!value||value.startsWith('-')||/[\0\r\n]/.test(value))throw new Error('Invalid revision');return value;}
const treeCaches=new WeakMap();
export async function oid(run,repo,ref,type='commit'){
 const immutable=type==='tree'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(ref),owner=run.originalRun||run;let cache=treeCaches.get(owner);if(!cache){cache=new Map();treeCaches.set(owner,cache);}const key=JSON.stringify([repo.key,ref]);if(immutable&&cache.has(key))return cache.get(key);
 const result=(await git(run,repo,['rev-parse','--verify','--end-of-options',`${revision(ref)}^{${type}}`])).trim();if(immutable){cache.set(key,result);while(cache.size>128)cache.delete(cache.keys().next().value);}return result;
}
export async function isAncestor(run,repo,base,target){const result=await run(repo,['merge-base','--is-ancestor',revision(base),revision(target)]);if(result.code===0)return true;if(result.code===1)return false;throw new Error(result.stderr?.trim()||'Cannot verify Git ancestry');}
export function utf8Bytes(text){
 let bytes=text.length;
 const runs=/[\u0080-\u07ff]+|[\u0800-\ud7ff\ue000-\uffff]+|(?:[\ud800-\udbff][\udc00-\udfff])+|[\ud800-\udfff]/g;
 for(let match;(match=runs.exec(text));){
  const run=match[0],code=run.charCodeAt(0);
  const pairedSurrogates=code>=0xd800&&code<=0xdbff&&run.length>1;
  bytes+=run.length*(code<0x800||pairedSurrogates?1:2);
 }
 return bytes;
}
export function uid(){return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;}
export function fingerprint(text){let a=2166136261,b=2246822519;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489917);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
