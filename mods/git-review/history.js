import {git,oid} from './git.js';
export async function listHistory(run,repo,{ref='HEAD',skip=0,limit=300,query='',author='',path='',remotes=true}={}){
 const all=ref==='all',head=all?null:await oid(run,repo,ref);let selected=head;
 if(/^[0-9a-f]{7,64}$/i.test(query)){const match=await oid(run,repo,query);if(!all){const reachable=await run(repo,['merge-base','--is-ancestor',match,head]);if(reachable.code!==0)return {commits:[],hasMore:false,ref:head};}selected=match;}
 const args=['log',`--skip=${Math.max(0,skip)}`,`--max-count=${Math.max(1,Math.min(limit,1000))+1}`,'--topo-order','--format=%H%x00%P%x00%s%x00%an%x00%at%x00%D%x00%T%x00'];
 if(query&&selected===head&&!/^[0-9a-f]{7,64}$/i.test(query))args.push('--fixed-strings',`--grep=${query}`);if(author)args.push(`--author=${author}`);
 if(all&&!selected)args.push('--branches',...(remotes?['--remotes']:[]));else args.push(selected);args.push('--');if(path)args.push(path);
 const fields=(await git(run,repo,args)).split('\0');const commits=[];
 for(let i=0;i+6<fields.length;i+=7){const id=fields[i].trim();if(id)commits.push({oid:id,parents:fields[i+1].split(' ').filter(Boolean),subject:fields[i+2],author:fields[i+3],timestamp:Number(fields[i+4]),refs:fields[i+5].split(', ').filter(Boolean),tree:fields[i+6]});}
 return {commits:commits.slice(0,limit),hasMore:commits.length>limit,ref:all?'all':head};
}
export async function listRefs(run,repo){return (await git(run,repo,['for-each-ref','--format=%(refname)%00%(objectname)%00%(symref)','refs/heads','refs/remotes','refs/tags'])).trim().split('\n').filter(Boolean).map(line=>{const [fullName,oid,symref]=line.split('\0');return {name:fullName.replace(/^refs\/(heads|remotes|tags)\//,''),fullName,oid,symref};});}
