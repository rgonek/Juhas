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
export function buildBatch(session,comparisons,{agentAddress=null,note='',repoKey=null,includeQuotes=false,includeGitContext=false}={}){
 const drafts=session.drafts.filter(draft=>repoKey==null||draft.repoKey===repoKey).slice().sort((a,b)=>a.repoKey.localeCompare(b.repoKey)||(a.newPath||a.oldPath||'').localeCompare(b.newPath||b.oldPath||'')||(a.startLine??0)-(b.startLine??0)||a.id.localeCompare(b.id));
 if(!drafts.length)throw new Error('No comments to submit for this repository');
 const repositories=new Map();for(const draft of drafts){if(!repositories.has(draft.repoKey))repositories.set(draft.repoKey,new Map());const groups=repositories.get(draft.repoKey);if(!groups.has(draft.comparisonId))groups.set(draft.comparisonId,[]);groups.get(draft.comparisonId).push(draft);}
 const chunks=['# Code review',note];
 for(const [key,groups] of repositories){const first=[...groups.values()][0][0],comparison=comparisons.find(c=>c.id===first.comparisonId);if(includeGitContext)chunks.push('\n## '+(comparison?.root||first.root||key));
  for(const [id,group] of groups){const first=group[0];if(includeGitContext)chunks.push(`${first.baseOid||'empty'} → ${first.targetOid||'working tree'}`);const files=new Map();for(const draft of group){const file=JSON.stringify([draft.oldPath,draft.newPath]);if(!files.has(file))files.set(file,[]);files.get(file).push(draft);}
   for(const file of files.values()){const first=file[0],renamed=first.oldPath&&first.newPath&&first.oldPath!==first.newPath;chunks.push('\n### '+(renamed?first.oldPath+' → ':'')+(first.newPath||first.oldPath));
    for(const draft of file){const location=draft.startLine==null?'file':`${draft.side||'new'} ${draft.startLine}${draft.endLine!=null&&draft.endLine!==draft.startLine?'-'+draft.endLine:''}`;
     const original=draft.side==='old'?(draft.baseOid||'empty'):(draft.targetOid||`working tree based on ${draft.baseOid||'empty'}`);
     chunks.push(`- ${location}${draft.status==='outdated'?` [OUTDATED${includeGitContext?'':' @ '+original}]`:''}: ${draft.body}`);
     if(includeQuotes&&draft.quote)chunks.push(draft.quote.split('\n').map(line=>'> '+line).join('\n'));
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
