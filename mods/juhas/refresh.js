// Background scheduling is independent of foreground busy/focus state.
export function reviewVisible({role,context,focus,spaces=[],panes=[],layout,paneId=null}){
 if(role==='bar'||!context)return false;
 const space=spaces.find(s=>s.active),spaceId=space?.id||focus?.space,tab=space?.tabs?.find(t=>t.active)?.id||focus?.tab;
 if(!spaceId||!tab||context.spaceId!==spaceId||context.tabId!==tab)return false;
 if(role==='pane'){
  const active=panes.filter(p=>p.tab===tab),reviews=active.filter(p=>p.mod==='juhas'&&(!paneId||p.pane===paneId));
  if(!paneId&&reviews.length>1&&active.some(p=>p.zoomed))return false;
  return reviews.some(p=>!active.some(other=>other.zoomed&&other.pane!==p.pane));
 }
 const walk=(node,hidden=false)=>{
  if(!node)return false;hidden=hidden||Boolean(node.hidden);
  if(node.content?.mod==='juhas'&&(node.content.props?.role||'sidebar')===role)return !hidden;
  return (node.children||[]).some(child=>walk(child,hidden||node.type==='stack'&&Boolean(node.active)&&node.active!==child.id));
 };
 return walk(layout);
}

export function createRefreshCoordinator(){
 const pending=new Map();
 return {run(key,action){if(pending.has(key))return pending.get(key);const promise=Promise.resolve().then(action).finally(()=>{if(pending.get(key)===promise)pending.delete(key);});pending.set(key,promise);return promise;}};
}

export function createRefreshScheduler({timer,visible,key,refresh,onError=()=>{},coordinator=createRefreshCoordinator(),interval=15000}){
 let handle=null,closed=false;
 const check=async cx=>{
  if(closed||!visible())return false;
  return coordinator.run(key(),async()=>{if(closed||!visible())return false;return refresh(cx);});
 };
 return {
  start(){if(!closed&&!handle)handle=timer.every(interval,cx=>{const task=check(cx);task.catch(error=>onError(error,cx));return task;});},
  check,
  close(){closed=true;handle?.cancel();handle=null;},
 };
}
