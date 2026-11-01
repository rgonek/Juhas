import {git,oid,fingerprint} from './git.js';
import {comparisonKey} from './model.js';
export function fromHistory(repo,scope,commits){
 if(scope.kind!=='commit')return null;const target=commits.find(c=>c.oid===scope.commit);const i=scope.parentIndex??0;if(!target||!Number.isInteger(i)||i<0||i>=target.parents.length)return null;
 const base=commits.find(c=>c.oid===target.parents[i]);if(!base?.tree||!target.tree)return null;
 return comparison(repo,scope,{baseOid:base.oid,targetOid:target.oid,baseTree:base.tree,targetTree:target.tree,parents:target.parents});
}
function comparison(repo,scope,{baseOid,targetOid,baseTree,targetTree,parents=[]}){return {id:comparisonKey(repo.key,baseOid,targetOid,baseTree,targetTree),repoKey:repo.key,repo,root:repo.root,scope,parents,baseOid,targetOid,baseTree,targetTree,label:`${scope.kind}: ${baseOid?.slice(0,8)||'empty'} → ${targetOid?.slice(0,8)||'working tree'}`,capturedAt:Date.now(),mutableTarget:scope.kind==='working-tree'};}
export async function resolveComparison(run,repo,scope,checkpoints=[]){
 let baseOid,targetOid,baseTree,targetTree,parents=[];
 if(scope.kind==='working-tree'){
  baseOid=await oid(run,repo,scope.baseRef||'HEAD');baseTree=await oid(run,repo,baseOid,'tree');targetOid=null;
  const patch=await git(run,repo,['diff','--no-ext-diff','--no-textconv','--binary',baseTree,'--']);
  const untracked=(await git(run,repo,['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(Boolean);const hashes=[];
  for(let i=0;i<untracked.length;i+=40)hashes.push(await git(run,repo,['hash-object','--no-filters','--',...untracked.slice(i,i+40)]));
  targetTree=`working:${fingerprint(JSON.stringify([patch,untracked,hashes]))}`;
 }else{
  const target=scope.kind==='commit'?scope.commit:scope.kind==='range'?scope.target:scope.targetRef||'HEAD';targetOid=await oid(run,repo,target);
  if(scope.kind==='commit'){
   parents=(await git(run,repo,['rev-list','--parents','-n','1',targetOid])).trim().split(' ').slice(1);const i=scope.parentIndex??0;
   if(!Number.isInteger(i)||i<0||i>=Math.max(1,parents.length))throw new Error('Invalid parent selection');
   baseOid=parents[i]??null;
  }else if(scope.kind==='range'){
   baseOid=await oid(run,repo,scope.base);
   if(scope.includeBase){const source=(await git(run,repo,['rev-list','--parents','-n','1',baseOid])).trim().split(' ');baseOid=source[1]||null;}
  }
  else if(scope.kind==='branch'){
   const base=await oid(run,repo,scope.baseRef);const result=await run(repo,['merge-base','--all',base,targetOid]);if(result.code===1)throw new Error('No merge-base: select an explicit range');if(result.code!==0)throw new Error(result.stderr||'Cannot resolve merge-base');const bases=result.stdout.trim().split('\n').filter(Boolean);
   if(bases.length!==1)throw new Error('No unique merge-base: select an explicit range');baseOid=bases[0];
  }else if(scope.kind==='since-review'){
   const cp=checkpoints.find(c=>c.id===scope.checkpointId&&c.repoKey===repo.key);if(!cp)throw new Error('Checkpoint not found');
   try{baseOid=await oid(run,repo,cp.targetOid);}catch{throw new Error('Checkpoint object is unavailable; select a new baseline');}
  }else throw new Error('Unknown comparison scope');
  baseTree=baseOid?await oid(run,repo,baseOid,'tree'):(await git(run,repo,['mktree'])).trim();targetTree=await oid(run,repo,targetOid,'tree');
 }
 return comparison(repo,scope,{baseOid,targetOid,baseTree,targetTree,parents});
}
