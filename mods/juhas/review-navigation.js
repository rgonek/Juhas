// Standalone: copied beside personal toolbar mods as well as shipped with Juhas.
export function findReviewRoute(state={}){
 const {shared}=state,focus=state.focus||{},spaces=state.spaces||[],panes=state.panes||[];
 const space=spaces.find(s=>s.active)||spaces.find(s=>s.id===focus.space);
 const tabId=space?.tabs?.find(t=>t.active)?.id||focus.tab;
 if(!space?.tabs?.some(t=>t.id===tabId)||typeof shared!=='function')return null;
 const entries=shared('juhas.review-tabs.v1');
 if(!Array.isArray(entries))return null;
 for(const entry of entries){
  if(entry.spaceId!==space.id||(entry.machine??null)!==(space.machine??null))continue;
  const record=shared(entry.key);
  if(record?.tabId===tabId&&panes.some(p=>p.pane===record.paneId&&p.tab===tabId&&p.mod==='juhas'))return {key:entry.key,record,active:true};
 }
 return null;
}
export function routeReview(run,state){
 if(!findReviewRoute(state))return false;
 run('juhas.sidebar');
 return true;
}
