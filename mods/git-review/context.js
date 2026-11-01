import {resolveRepo,discoverRepos} from './repositories.js';
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
 const own=await resolveRepo(run,context.machine,context.folder);
 if(own)return {repos:[own],canSwitch:false,complete:true,kind:'single'};
 const found=await discoverRepos(run,readDirectories,context.machine,context.folder,limits);
 return {...found,canSwitch:found.repos.length>1,kind:found.repos.length?'parent':'empty'};
}
