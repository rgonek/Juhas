import {utf8Bytes} from './git.js';
export const MAX_REVIEW_BYTES=16000;
export function isLiveTerminal(terminal){return Boolean(terminal&&!terminal.finished&&(terminal.state==null||terminal.state==='live'||terminal.state==='running'));}
export function agentRecipients(terminals,agents=[]){
 const byAddress=new Map(agents.map(agent=>[agent.address,agent]));
 return terminals.filter(terminal=>isLiveTerminal(terminal)&&!terminal.parent&&(terminal.program?.agent||terminal.report?.app||byAddress.get(terminal.address||terminal.id)?.program?.agent||byAddress.get(terminal.address||terminal.id)?.app))
  .map(terminal=>{const address=terminal.address||terminal.id,agent=byAddress.get(address);return {...terminal,address,space:agent?.space||terminal.labels?.['herdr.space'],tab:agent?.tab||terminal.labels?.['herdr.tab'],tab_name:agent?.tab_name};});
}
export function detectRecipient(terminals,agents,context){
 if(!context?.spaceId)return null;
 const candidates=agentRecipients(terminals,agents).filter(agent=>agent.space===context.spaceId),tab=candidates.filter(agent=>agent.tab===context.tabId);
 if(tab.length===1)return tab[0];if(tab.length>1)return null;
 return candidates.length===1?candidates[0]:null;
}
function sourceRevision(draft){return draft.side==='old'?(draft.baseOid||'empty'):(draft.targetOid||`working tree based on ${draft.baseOid||'empty'}${draft.targetTree?' snapshot '+draft.targetTree:''}`);}
function shortRevision(value,all){if(!/^[a-f0-9]{40,64}$/.test(value))return value;let length=12;while(length<value.length&&all.some(other=>other!==value&&other.startsWith(value.slice(0,length))))length+=4;return value.slice(0,length);}
function excerpt(value){const lines=value.split('\n'),head=lines.slice(0,3).join('\n'),short=head.slice(0,240);return short+(lines.length>3||head.length>240?'\n…':'');}
function overlaps(a,b){const path=d=>d.side==='old'?(d.oldPath||d.newPath):d.newPath;return a!==b&&a.side===b.side&&path(a)===path(b)&&sourceRevision(a)!==sourceRevision(b)&&(a.startLine==null||b.startLine==null||a.startLine<=(b.endLine??b.startLine)&&b.startLine<=(a.endLine??a.startLine));}
export function buildBatch(session,comparisons,{agentAddress=null,note='',repoKey=null,includeQuotes=false,includeGitContext=false}={}){
 const drafts=session.drafts.filter(draft=>repoKey==null||draft.repoKey===repoKey).slice().sort((a,b)=>a.repoKey.localeCompare(b.repoKey)||(a.newPath||a.oldPath||'').localeCompare(b.newPath||b.oldPath||'')||(a.startLine??0)-(b.startLine??0)||a.id.localeCompare(b.id));
 if(!drafts.length)throw new Error('No comments to submit for this repository');
 const repositories=new Map();for(const draft of drafts){if(!repositories.has(draft.repoKey))repositories.set(draft.repoKey,new Map());const groups=repositories.get(draft.repoKey);if(!groups.has(draft.comparisonId))groups.set(draft.comparisonId,[]);groups.get(draft.comparisonId).push(draft);}
 const chunks=['# Code review',note];
 for(const [key,groups] of repositories){const repositoryDrafts=[...groups.values()].flat(),sources=[...new Set(repositoryDrafts.map(sourceRevision))],first=repositoryDrafts[0],comparison=comparisons.find(c=>c.id===first.comparisonId);if(includeGitContext)chunks.push('\n## '+(comparison?.root||first.root||key));
  for(const [id,group] of groups){const first=group[0];if(includeGitContext)chunks.push(`${first.baseOid||'empty'} → ${first.targetOid||'working tree'}`);const files=new Map();for(const draft of group){const file=JSON.stringify([draft.oldPath,draft.newPath]);if(!files.has(file))files.set(file,[]);files.get(file).push(draft);}
   for(const file of files.values()){const first=file[0],renamed=first.oldPath&&first.newPath&&first.oldPath!==first.newPath;chunks.push('\n### '+(renamed?first.oldPath+' → ':'')+(first.newPath||first.oldPath));
    for(const draft of file){const location=draft.startLine==null?'file':`${draft.side||'new'} ${draft.startLine}${draft.endLine!=null&&draft.endLine!==draft.startLine?'-'+draft.endLine:''}`;
     // Different commits alone do not make distinct code locations ambiguous.
     // Keep full provenance in draft snapshots regardless of message options.
     const original=sourceRevision(draft),ambiguous=repositoryDrafts.some(other=>overlaps(draft,other)),needSource=ambiguous||Boolean(draft.mutableTarget&&draft.side!=='old');
     chunks.push(`- ${location}${!includeGitContext&&needSource&&draft.status!=='outdated'?' @ '+shortRevision(original,sources):''}${draft.status==='outdated'?` [OUTDATED${includeGitContext?'':' @ '+original}]`:''}: ${draft.body}`);
     const needExcerpt=draft.status==='outdated'||Boolean(draft.mutableTarget&&draft.side!=='old')||ambiguous;
     if(draft.quote&&(includeQuotes||needExcerpt))chunks.push((includeQuotes?draft.quote:excerpt(draft.quote)).split('\n').map(line=>'> '+line).join('\n'));
    }
   }
  }
 }
 const text=chunks.filter(Boolean).join('\n'),draftIds=drafts.map(d=>d.id),draftSnapshots=Object.fromEntries(drafts.map(d=>[d.id,JSON.stringify(d)]));
 const sourceId=JSON.stringify([session.id,draftSnapshots]);return {sourceId,id:JSON.stringify([sourceId,agentAddress,text]),agentAddress,text,generatedText:text,draftIds,draftSnapshots,utf8Bytes:utf8Bytes(text),edited:false,includeQuotes,includeGitContext,repoKey};
}
export function updateBatch(batch,{text=batch.text,agentAddress=batch.agentAddress}={}){
 const sourceId=batch.sourceId||batch.id;return {...batch,sourceId,id:JSON.stringify([sourceId,agentAddress,text]),agentAddress,text,utf8Bytes:utf8Bytes(text),edited:text!==(batch.generatedText??batch.text)};
}
export function createSubmitter({maxBytes=MAX_REVIEW_BYTES}={}){
 const results=new Map();return function submit(batch,transport){
  if(results.has(batch.id))return results.get(batch.id);
  if(!batch.agentAddress)return Promise.resolve({state:'failed',error:'Choose a recipient before sending'});
  if(!batch.text?.trim())return Promise.resolve({state:'failed',error:'Review message is empty'});
  if(utf8Bytes(batch.text)>maxBytes)return Promise.resolve({state:'failed',error:`Review exceeds the ${maxBytes}-byte transport limit; nothing was sent`});
  const pending=(async()=>{try{const ack=await transport.send(batch.agentAddress,batch.text);return ack?.ok?{state:'sent'}:ack?.rejected?{state:'failed',error:ack.error||'Delivery rejected'}:{state:'unknown',error:'Delivery not confirmed; inspect recipient before retrying'};}catch(e){return {state:'unknown',error:e.message};}})();results.set(batch.id,pending);pending.then(result=>{if(result.state==='failed')results.delete(batch.id);});return pending;
 };
}
