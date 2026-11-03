import {git,oid} from './git.js';
import {comparisonKey} from './model.js';
import {observeWorking} from './working-observation.js';
export function fromHistory(repo,scope,commits){
 if(scope.kind!=='commit')return null;const target=commits.find(c=>c.oid===scope.commit);const i=scope.parentIndex??0;if(!target||!Number.isInteger(i)||i<0||i>=target.parents.length)return null;
 const base=commits.find(c=>c.oid===target.parents[i]);if(!base?.tree||!target.tree)return null;
 return comparison(repo,scope,{baseOid:base.oid,targetOid:target.oid,baseTree:base.tree,targetTree:target.tree,parents:target.parents});
}
function comparison(repo,scope,data){const {baseOid,targetOid,baseTree,targetTree,parents=[]}=data;return {...data,id:comparisonKey(repo.key,baseOid,targetOid,baseTree,targetTree),repoKey:repo.key,repo,root:repo.root,scope,parents,label:`${scope.kind}: ${baseOid?.slice(0,8)||'empty'} → ${targetOid?.slice(0,8)||'working tree'}`,capturedAt:Date.now(),mutableTarget:!!data.observation};}
export async function resolveBase(run,repo,baseRef,targetRef='HEAD'){
 const base=await oid(run,repo,baseRef),target=await oid(run,repo,targetRef);const result=await run(repo,['merge-base','--all',base,target]);if(result.code===1)throw new Error('No merge-base: select an explicit range');if(result.code!==0)throw new Error('Cannot resolve merge-base');const bases=result.stdout.trim().split('\n').filter(Boolean);if(bases.length!==1)throw new Error('No unique merge-base: select an explicit range');return bases[0];
}
export async function resolveComparison(run,repo,scope,checkpoints=[]){
 let baseOid=null,targetOid=null,baseTree,targetTree,parents=[],observation;
 if(scope.kind==='working-tree'){
  try{baseOid=await oid(run,repo,scope.baseRef||'HEAD');}catch(error){if(scope.baseRef&&scope.baseRef!=='HEAD')throw error;const head=await run(repo,['rev-parse','--verify','HEAD']);if(head.code===0)throw error;}
 }else{
  const target=scope.kind==='commit'?scope.commit:scope.kind==='range'?scope.target:scope.targetRef||'HEAD';try{targetOid=await oid(run,repo,target);}catch(error){if(!(scope.kind==='since-review'&&scope.includeWorking&&target==='HEAD'))throw error;const head=await run(repo,['rev-parse','--verify','HEAD']);if(head.code===0)throw error;}
  if(scope.kind==='commit'){parents=(await git(run,repo,['rev-list','--parents','-n','1',targetOid])).trim().split(' ').slice(1);const i=scope.parentIndex??0;if(!Number.isInteger(i)||i<0||i>=Math.max(1,parents.length))throw new Error('Invalid parent selection');baseOid=parents[i]??null;scope={...scope,commit:targetOid};}
  else if(scope.kind==='range'){baseOid=await oid(run,repo,scope.base);if(scope.includeBase){const source=(await git(run,repo,['rev-list','--parents','-n','1',baseOid])).trim().split(' ');baseOid=source[1]||null;}}
  else if(scope.kind==='branch')baseOid=await resolveBase(run,repo,scope.baseRef,targetOid);
  else if(scope.kind==='since-review'){const cp=checkpoints.find(c=>c.id===scope.checkpointId&&c.repoKey===repo.key);if(!cp)throw new Error('Checkpoint not found');try{if(cp.kind==='working-snapshot'){if(!/^[a-z0-9-]+$/.test(cp.id||'')||cp.refName!==`refs/git-review/snapshots/${cp.id}`||await oid(run,repo,cp.refName,'tree')!==cp.treeOid)throw new Error('Snapshot reference changed');baseTree=cp.treeOid;}else baseOid=await oid(run,repo,cp.targetOid);}catch{throw new Error('Checkpoint object is unavailable; select a new baseline');}}
  else throw new Error('Unknown comparison scope');
 }
 baseTree=baseTree||(baseOid?await oid(run,repo,baseOid,'tree'):(await git(run,repo,['hash-object','-t','tree','--stdin'])).trim());
 if(scope.kind==='working-tree'||scope.includeWorking){observation=await observeWorking(run,repo,baseTree);targetOid=null;targetTree=observation.id;}else targetTree=await oid(run,repo,targetOid,'tree');
 return comparison(repo,scope,{baseOid,targetOid,baseTree,targetTree,parents,observation});
}
