import {resolveRepo,discoverRepos} from './repositories.js';
import {workspaceFolders} from './workspace.js';
export function reviewContext(props={},focus={},spaces=[],panes=[]){
 props=props||{};focus=focus||{};spaces=spaces||[];panes=panes||[];
 const space=spaces.find(s=>s.active)||spaces.find(s=>s.id===focus.space);const tab=space?.tabs?.find(t=>t.active)?.id||focus.tab;
 const terminal=panes.find(p=>p.terminal&&(!tab||p.tab===tab)&&(p.pane===focus.pane||p.terminal===focus.terminal))||panes.find(p=>p.terminal&&p.tab===tab);
 const folder=props.folder||terminal?.cwd||((!tab||!focus.tab||tab===focus.tab)?focus.cwd:null)||space?.folder||null;
 const machine=props.machine??(props.folder?null:space?.machine??null);
 const key=JSON.stringify([space?.id||focus.space||null,tab||null,machine,folder]);
 return {key,spaceId:space?.id||focus.space||null,tabId:tab||null,machine,folder};
}
export function contextStorageKey(kind,sessionId,context){return `git-review.v1.${kind}.${sessionId}.${context.key}`;}
function pathKey(path){const normal=String(path||'').replace(/\\/g,'/').replace(/\/$/,'');return /^[a-z]:/i.test(normal)?normal.toLowerCase():normal;}
export function allowedRepository(scope,root){return scope?.repos?.find(r=>pathKey(r.root)===pathKey(root))||null;}
export async function resolveRepositoryScope(run,readDirectories,context,limits={}){
 if(!context.folder)return {repos:[],canSwitch:false,complete:true,kind:'empty'};
 const own=limits.primary===undefined?await resolveRepo(run,context.machine,context.folder):await limits.primary;
 const folder=own?.root||context.folder;
 const found=context.machine
  ?{repos:own?[own]:[],complete:Boolean(own)}
  :await discoverRepos(run,readDirectories,context.machine,folder,{...limits,own});
 const warnings=[];
 if(!context.machine&&limits.readWorkspaceFiles&&!limits.signal?.aborted&&found.repos.length===(own?1:0)){
  try{
   const files=await limits.readWorkspaceFiles(context.machine,folder);
   for(const file of [...files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)){
    try{
     for(const entry of workspaceFolders(file.text,file.path)){
      if(limits.signal?.aborted||found.repos.length>=(limits.maxRepos??200)){found.complete=false;break;}
      try{
       if(!entry)throw new Error('Invalid folder entry');
       const repo=await resolveRepo(run,context.machine,entry.path);
       if(!repo)throw new Error('No Git repository');
       if(!allowedRepository(found,repo.root))found.repos.push({...repo,name:entry.name});
      }catch{warnings.push(`Skipped workspace folder: ${entry?.path||file.path}`);}
     }
    }catch{warnings.push(`Could not read workspace: ${file.path}`);}
   }
  }catch{warnings.push('Could not list workspace files');}
 }
 return {...found,warnings,homeKey:own?.key??null,canSwitch:found.repos.length>1,kind:found.repos.length>1||(!own&&found.repos.length)?'parent':own?'single':'empty'};
}
