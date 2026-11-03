export const READ=['--no-optional-locks','-c','core.fsmonitor=false','-c','diff.autoRefreshIndex=false','-c','core.quotepath=false'];
export function createRunner(exec){return (repo,args)=>exec('git',[...READ,...args],{cwd:repo.root,on:repo.machine??null});}
export function withGitBudget(run,{maxCommands=256,deadlineMs=25000,now=()=>Date.now()}={}){const start=now();let calls=0;const check=()=>{if(now()-start>deadlineMs)throw new Error('Git request time budget exceeded; previous source retained');};const limited=async(repo,args)=>{check();if(++calls>maxCommands)throw new Error('Git request command budget exceeded; previous source retained');const result=await run(repo,args);check();return result;};limited.originalRun=run.originalRun||run;return limited;}
export async function git(run,repo,args){const r=await run(repo,args);if(r.code!==0)throw new Error(r.stderr.trim()||`Git exited ${r.code}`);return r.stdout;}
export function revision(value){if(typeof value!=='string'||!value||value.startsWith('-')||/[\0\r\n]/.test(value))throw new Error('Invalid revision');return value;}
const treeCaches=new WeakMap();
export async function oid(run,repo,ref,type='commit'){
 const immutable=type==='tree'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(ref),owner=run.originalRun||run;let cache=treeCaches.get(owner);if(!cache){cache=new Map();treeCaches.set(owner,cache);}const key=JSON.stringify([repo.key,ref]);if(immutable&&cache.has(key))return cache.get(key);
 const result=(await git(run,repo,['rev-parse','--verify','--end-of-options',`${revision(ref)}^{${type}}`])).trim();if(immutable){cache.set(key,result);while(cache.size>128)cache.delete(cache.keys().next().value);}return result;
}
export async function isAncestor(run,repo,base,target){const result=await run(repo,['merge-base','--is-ancestor',revision(base),revision(target)]);if(result.code===0)return true;if(result.code===1)return false;throw new Error(result.stderr?.trim()||'Cannot verify Git ancestry');}
export function utf8Bytes(text){let n=0;for(const c of text){const x=c.codePointAt(0);n+=x<128?1:x<2048?2:x<65536?3:4;}return n;}
export function uid(){return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;}
export function fingerprint(text){let a=2166136261,b=2246822519;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489917);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
