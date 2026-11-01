export function openReview(run){
 run('layout.select',{stack:'git-review-work',child:'git-review-terminal'});
 run('layout.show',{id:'git-review-sidebar'});
 run('layout.select',{stack:'panel-body',child:'git-review-sidebar'});
 run('layout.show',{id:'panel'});
}
export function expandReview(run){run('layout.hide',{id:'panel'});run('layout.select',{stack:'git-review-work',child:'git-review-full'});}
export function collapseReview(run){openReview(run);}
function find(node,id){if(node?.id===id)return node;for(const child of node?.children||[]){const match=find(child,id);if(match)return match;}return null;}
export function toggleReview(run,layout){const panel=find(layout,'panel'),body=find(layout,'panel-body'),work=find(layout,'git-review-work');if(panel&&!panel.hidden&&body?.active==='git-review-sidebar'&&work?.active!=='git-review-full')run('layout.hide',{id:'panel'});else openReview(run);}

// The work stack is window-global, while its expanded state belongs to a space.
export function syncReviewSpace(run,state,spaceId,layout){
 if(!spaceId)return;
 const expanded=find(layout,'git-review-work')?.active==='git-review-full';
 state.bySpace??={};
 if(state.space&&state.space!==spaceId){
  state.bySpace[state.space]=Boolean(state.full);
  const want=Boolean(state.bySpace[spaceId]);state.space=spaceId;state.full=want;state.pending={full:want};
  if(want!==expanded)run('layout.select',{stack:'git-review-work',child:want?'git-review-full':'git-review-terminal'});
  if(want)run('layout.hide',{id:'panel'});
  return;
 }
 if(state.pending){if(expanded!==state.pending.full)return;delete state.pending;}
 state.space=spaceId;state.full=expanded;state.bySpace[spaceId]=expanded;
}
