import {git} from './git.js';
import {repoKey} from './model.js';
export async function resolveRepo(run,machine,folder){
 const place={root:folder,machine};const result=await run(place,['rev-parse','--path-format=absolute','--show-toplevel','--absolute-git-dir','--git-common-dir','--show-object-format']);if(result.code!==0)return null;
 const [top,gitDir,commonDir,objectFormat]=result.stdout.trim().split('\n');if(!top||!gitDir||!commonDir||!objectFormat)throw new Error('Incomplete repository metadata');
 const root=top.replace(/\\/g,'/');return {root,machine:machine??null,key:repoKey(machine,root),gitDir:gitDir.replace(/\\/g,'/'),commonDir:commonDir.replace(/\\/g,'/'),objectFormat};
}
export async function discoverRepos(run,readDirectories,machine,folder,{maxDepth=3,maxRepos=200,signal}={}){
 const repos=new Map();const queue=[{path:folder,depth:0}];let complete=true;
 while(queue.length){
  if(signal?.aborted){complete=false;break;}
  const item=queue.shift();const repo=await resolveRepo(run,machine,item.path);
  if(repo){repos.set(repo.key,repo);if(repos.size>=maxRepos){complete=false;break;}continue;}
  if(item.depth>=maxDepth){complete=false;continue;}
  try{for(const d of await readDirectories(machine,item.path)){if(d.isDirectory&&!d.isLink&&!/[\\/](?:\.git|node_modules|\.superpowers)$/.test(d.path))queue.push({path:d.path,depth:item.depth+1});}}
  catch{complete=false;}
 }
 return {repos:[...repos.values()],complete};
}
