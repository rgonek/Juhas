import {git,oid,uid,isAncestor} from './git.js';
export function createSession(id){return {id,schemaVersion:1,repoKeys:[],comparisonIds:[],drafts:[],checkpoints:[],submittedBatches:[]};}
export function generalTarget(comparison){if(!comparison?.id||!comparison.repoKey)throw new Error('Review source is unavailable');const {repoKey,root,baseOid,targetOid,baseTree,targetTree,mutableTarget}=comparison;return {scope:'general',repoKey,root,comparisonId:comparison.id,baseOid,targetOid,baseTree,targetTree,mutableTarget};}
export function addDraft(s,draft){if(!draft.body?.trim())throw new Error('Comment cannot be empty');const d={createdAt:Date.now(),status:'current',...draft};return {...s,repoKeys:[...new Set([...s.repoKeys,d.repoKey])],comparisonIds:[...new Set([...s.comparisonIds,d.comparisonId])],drafts:[...s.drafts.filter(x=>x.id!==d.id),d]};}
export function reconcileDrafts(s,ids){return {...s,drafts:s.drafts.map(d=>({...d,status:ids.includes(d.comparisonId)?'current':'outdated'}))};}
export async function markSeen(run,repo,c,branch=null){if(c.mutableTarget||!c.targetOid)throw new Error('Checkpoint requires a committed target');const id=uid();const refName=`refs/git-review/checkpoints/${id}`;await git(run,repo,['update-ref',refName,c.targetOid,'0'.repeat(c.targetOid.length)]);return {id,repoKey:repo.key,targetOid:c.targetOid,refName,markedAt:Date.now(),...(branch?{branch}:{})};}
export async function lastCheckpoint(run,repo,branch,checkpoints){
 if(!repo||!branch||branch==='(detached)')return null;
 const current=await run(repo,['symbolic-ref','--short','-q','HEAD']);if(current.code===1)return null;if(current.code!==0)throw new Error(current.stderr?.trim()||'Cannot verify current branch');if(current.stdout.trim()!==branch)throw new Error('Branch context changed; refresh before choosing a checkpoint');
 let head;
 for(const cp of checkpoints.filter(cp=>cp.repoKey===repo.key&&cp.branch===branch).slice().reverse().sort((a,b)=>b.markedAt-a.markedAt)){
  if(cp.kind==='working-snapshot'){
   if(!/^[a-z0-9-]+$/.test(cp.id||'')||cp.refName!==`refs/git-review/snapshots/${cp.id}`||!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(cp.treeOid||''))continue;
   if(await oid(run,repo,cp.refName,'tree')!==cp.treeOid)throw new Error('Snapshot reference changed; select a new baseline');return cp;
  }
  if(!/^[a-f0-9]{40,64}$/.test(cp.targetOid))continue;
  head??=await oid(run,repo,'HEAD');
  if(await isAncestor(run,repo,cp.targetOid,head))return cp;
 }
 return null;
}
export async function deleteCheckpoint(run,repo,cp){if(cp.repoKey!==repo.key||!/^refs\/git-review\/checkpoints\/[a-z0-9-]+$/.test(cp.refName))throw new Error('Invalid checkpoint reference');await oid(run,repo,cp.targetOid);await git(run,repo,['update-ref','-d',cp.refName,cp.targetOid]);}
