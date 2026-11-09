import {oid,withGitBudget} from './git.js';
import {selectBase,suggestBases} from './config.js';
import {branchChoices} from './review-ui.js';
const failure=(reason,candidates=[])=>({ref:null,source:'unresolved',reason,candidates});
export async function resolveAutomaticBase(originalRun,repo,{branch,refs,config={},maxCandidates=64}={}){
 const run=withGitBudget(originalRun,{maxCommands:160,deadlineMs:15000});
 const read=async args=>{const r=await run(repo,args);if(r.code!==0&&r.code!==1)throw new Error(r.stderr?.trim()||'Cannot inspect automatic base');return r.code===0?r.stdout.trim():'';};
 const resolve=async ref=>{try{return await oid(run,repo,ref);}catch(error){if(/budget/i.test(error.message))throw error;return null;}};
 const canonical=ref=>refs.find(r=>r.fullName===ref||r.name===ref)?.fullName||ref;
 const configured=selectBase(refs,branch,config);const suggestions=suggestBases(refs,branch,config.baseRules||[]);if(!configured&&suggestions.length>1)return failure('Several configured branch rules match',suggestions.map(c=>({ref:c.ref,name:c.ref.replace(/^refs\/(heads|remotes)\//,'')})));
 if(configured){const ref=canonical(configured.ref);return await resolve(ref)?{ref,source:configured.source,reason:configured.source==='auto'?'Configured branch rule':'Configured base'}:failure('Configured base is unavailable');}
 if(branch&&branch!=='(detached)')for(const suffix of ['juhas-base','t3-merge-base-ref','t3-merge-base','gh-merge-base']){
  const value=await read(['config','--get','branch.'+branch+'.'+suffix]);if(!value)continue;const ref=canonical(value);
  return await resolve(ref)?{ref,source:'git-config',reason:'Base saved in Git branch configuration'}:failure('Saved Git base is unavailable');
 }
 const head=await resolve('HEAD');if(!head)return failure('No commits to compare');
 const own=refs.find(r=>r.fullName==='refs/heads/'+branch),ownRemote=own?.upstream;
 const choices=branchChoices(refs).filter(c=>(!own||c.local?.fullName!==own.fullName)&&(!ownRemote||c.remote?.fullName!==ownRemote)&&c.name!==branch&&!(!c.local&&c.remote?.name.split('/').slice(1).join('/')===branch));
 const preferred=c=>c.remote||c.local;
 const merge=async ref=>{const r=await run(repo,['merge-base','--all',ref,head]);if(r.code===1)return null;if(r.code!==0)throw new Error(r.stderr?.trim()||'Cannot inspect base ancestry');const values=r.stdout.trim().split('\n').filter(Boolean);return values.length===1?values[0]:null;};
 // A creation entry and a matching HEAD checkout provide local provenance.
 if(branch&&branch!=='(detached)'){
  const log=await read(['reflog','show','--max-count=128','--format=%H%x00%gs','refs/heads/'+branch]);
  const creation=log.split('\n').map(line=>line.split('\0')).find(([,subject])=>subject?.startsWith('branch: Created from '));
  const creationReachable=creation?await run(repo,['merge-base','--is-ancestor',creation[0],head]):null;if(creationReachable&&![0,1].includes(creationReachable.code))throw new Error('Cannot verify branch creation ancestry');
  if(creation&&creationReachable.code===0){let name=creation[1].slice('branch: Created from '.length);
   if(name==='HEAD'){
    const headLog=await read(['reflog','show','--max-count=256','--format=%H%x00%gs','HEAD']);
    const entry=headLog.split('\n').map(line=>line.split('\0')).find(([hash,subject])=>hash===creation[0]&&subject?.startsWith('checkout: moving from ')&&subject.endsWith(' to '+branch));
    if(entry)name=entry[1].slice('checkout: moving from '.length,-(' to '+branch).length);
   }
   const candidate=choices.find(c=>[c.name,c.local?.fullName,c.remote?.fullName,c.remote?.name].includes(name));
   if(candidate)for(const value of [candidate.remote,candidate.local].filter(Boolean)){const ref=value.fullName,base=await merge(ref);if(base){const ancestor=await run(repo,['merge-base','--is-ancestor',creation[0],ref]);if(ancestor.code===0)return {ref,source:'reflog',reason:'Branch creation recorded in local reflog'};if(ancestor.code!==1)throw new Error('Cannot verify branch creation');}}
  }
 }
 const remoteHead=refs.find(r=>r.fullName==='refs/remotes/origin/HEAD'&&r.symref)||refs.find(r=>r.fullName.startsWith('refs/remotes/')&&r.symref);
 const defaultNames=[remoteHead?.symref,'refs/remotes/origin/main','refs/remotes/origin/master','refs/heads/main','refs/heads/master'];
 const fallback=defaultNames.map(name=>refs.find(r=>r.fullName===name&&!r.symref)).find(Boolean);
 if(choices.length>maxCandidates)return failure('Too many branch candidates; choose a base explicitly');
 const candidates=[];const mergeCache=new Map();
 for(const choice of choices){const ref=preferred(choice),key=ref.oid||ref.fullName;if(!mergeCache.has(key))mergeCache.set(key,await merge(ref.fullName));const base=mergeCache.get(key);if(base&&base!==head)candidates.push({ref:ref.fullName,name:choice.name,base});}
 if(candidates.length){
  const bases=[...new Set(candidates.map(c=>c.base))];
  const independent=(await read(['merge-base','--independent',...bases])).split('\n').filter(Boolean);
  const closest=candidates.filter(c=>independent.includes(c.base));
  const defaultBase=fallback?await merge(fallback.fullName):null;
  if(independent.length===1&&defaultBase===independent[0])return {ref:fallback.fullName,source:'default',reason:'Default branch of the repository'};
  if(closest.length===1)return {ref:closest[0].ref,source:'history',reason:'Closest unambiguous base in commit history'};
  return failure('Several branches are equally plausible bases',closest.map(({ref,name})=>({ref,name})));
 }
 if(fallback&&await merge(fallback.fullName))return {ref:fallback.fullName,source:'default',reason:'Default branch of the repository'};
 return failure('No reliable base found; choose a branch');
}
