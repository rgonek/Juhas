// Standalone: copied beside personal toolbar mods as well as shipped with Juhas.
function pathKey(value){const path=String(value||'').replace(/\\/g,'/').replace(/\/+$/,'');return /^[a-z]:|^\/\//i.test(path)?path.toLowerCase():path;}
function node(tree,id){if(tree?.id===id)return tree;for(const child of tree?.children||[]){const found=node(child,id);if(found)return found;}return null;}
export function findReviewRoute(state={}){
 const {shared}=state,focus=state.focus||{},spaces=state.spaces||[],panes=state.panes||[];
 const space=spaces.find(s=>s.active)||spaces.find(s=>s.id===focus.space);
 const tabId=space?.tabs?.find(t=>t.active)?.id||focus.tab;
 if(!space||!tabId||typeof shared!=='function')return null;
 const terminal=panes.find(p=>p.tab===tabId&&p.terminal&&(p.pane===focus.pane||p.terminal===focus.terminal))||panes.find(p=>p.tab===tabId&&p.terminal);
 const folder=terminal?.cwd||focus.cwd||space.folder;
 const cwd=pathKey(folder),machine=space.machine??null;
 const entries=shared('juhas.review-tabs.v1');if(!Array.isArray(entries))return null;
 const routes=[];
 for(const entry of entries){
  if(entry.spaceId!==space.id||(entry.machine??null)!==machine)continue;
  const record=shared(entry.key);
  if(!record?.tabId||!space.tabs?.some(t=>t.id===record.tabId)||!panes.some(p=>p.pane===record.paneId&&p.tab===record.tabId&&p.mod==='juhas'))continue;
  const active=record.tabId===tabId,root=pathKey(entry.root);
  if(active)return {key:entry.key,record,active:true};
  if(root&&cwd&&(cwd===root||cwd.startsWith(root+'/')))routes.push({key:entry.key,record,active:false,root,sourceContext:{spaceId:space.id,tabId,machine,folder,key:JSON.stringify([space.id,tabId,machine,folder])}});
 }
 return routes.sort((a,b)=>b.root.length-a.root.length)[0]||null;
}
export function routeReview(run,state){
 const route=findReviewRoute(state);if(!route)return false;
 if(route.active){run('juhas.sidebar');return true;}
 state.setShared?.(route.key,{...route.record,sourceContext:route.sourceContext,sourcePresentation:state.presentation||'sidebar'});
 const panel=node(state.layout,'panel'),body=node(state.layout,'panel-body');
 if(panel&&!panel.hidden&&body?.active==='git-review-sidebar')run('layout.hide',{id:'panel'});
 run('tab.select',{id:route.record.tabId});return true;
}
