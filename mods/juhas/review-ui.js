// Pure presentation models; retain original patch rows for comment anchors.
export function currentBranchFits(width,current,base,fontSize=13,summary=''){
 if(!width)return true;const textWidth=value=>String(value||'').length*fontSize*0.56;
 const controls=16+textWidth('Changes')+26+Math.min(width<460?85:160,textWidth(base))+26+28+28+30+28;
 return controls+Math.min(180,textWidth(current))+20+(width>=680?textWidth(summary)+8:0)<=width;
}
export function isTestFile(file){
 const path=String(typeof file==='string'?file:file?.newPath||file?.oldPath||'').replace(/\\/g,'/'),name=path.split('/').at(-1);
 return /(?:^|\/)(?:__tests__|tests?|[^/]+[._-]tests?)(?:\/|$)/i.test(path)
  || /^(?:test|spec)[._-]/i.test(name)||/[._-](?:test|spec)s?\.[^.]+$/i.test(name)
  || /^(?:tests?|specs?)\.[^.]+$/i.test(name)||/(?:Tests?|Specs?)\.(?:cs|java|kt|scala)$/.test(name);
}
export function fileRows(files,tree=false,collapsed=new Set(),query=''){
 const normalized=value=>String(value||'').normalize('NFC').replace(/\\/g,'/').toLowerCase(),needle=normalized(query).trim();
 if(needle)files=files.filter(file=>[file.newPath,file.oldPath].some(path=>normalized(path).includes(needle)));
 if(!tree)return files;
 const node=()=>({dirs:new Map(),files:[],fileCount:0}),root=node();
 for(const file of files){const parts=file.newPath.split('/');let current=root;current.fileCount++;
  for(const name of parts.slice(0,-1)){if(!current.dirs.has(name))current.dirs.set(name,node());current=current.dirs.get(name);current.fileCount++;}
  current.files.push(file);
 }
 const rows=[];
 const walk=(current,prefix='',depth=0)=>{
  for(const [name,child] of [...current.dirs].sort(([a],[b])=>a.localeCompare(b))){
   let branch=child,path=prefix+name+'/',names=[name],paths=[path];
   while(!branch.files.length&&branch.dirs.size===1){const [nextName,next]=branch.dirs.entries().next().value;path+=nextName+'/';names.push(nextName);paths.push(path);branch=next;}
   const closed=!needle&&paths.some(path=>collapsed.has(path));
   rows.push({id:'dir:'+path,directory:true,path,paths,name:names.join('/'),depth,fileCount:child.fileCount,closed});
   if(!closed)walk(branch,path,depth+1);
  }
  for(const file of current.files.sort((a,b)=>a.newPath.localeCompare(b.newPath)))rows.push({...file,name:file.newPath.split('/').at(-1),depth});
 };
 walk(root);return rows;
}
export function splitRows(rows){
 const result=[];let removed=[],added=[],comments=new Map(),lastChange=null;
 const flush=()=>{
  for(let i=0;i<Math.max(removed.length,added.length);i++){const old=removed[i],next=added[i];result.push({id:'split:'+(next?.id||old.id),kind:'pair',old,next});result.push(...(comments.get(old?.id)||[]),...(comments.get(next?.id)||[]));}
  removed=[];added=[];comments=new Map();lastChange=null;
 };
 for(const row of rows){
  if(row.kind==='line'&&(row.side==='old'||row.side==='new')){(row.side==='old'?removed:added).push(row);lastChange=row;}
  else if((row.kind==='comment'||row.kind==='editor')&&lastChange){if(!comments.has(lastChange.id))comments.set(lastChange.id,[]);comments.get(lastChange.id).push(row);}
  else{flush();if(row.kind==='line')result.push({id:'split:'+row.id,kind:'pair',old:row,next:row});else result.push(row);}
 }
 flush();return result;
}
export function changeGroups(rows){
 const groups=[];let changing=false;
 rows.forEach((row,index)=>{if(row.kind==='comment'||row.kind==='editor')return;const changed=row.kind==='line'&&(row.side==='old'||row.side==='new')||row.kind==='pair'&&(row.old?.side==='old'||row.next?.side==='new');if(changed&&!changing)groups.push({id:row.id,index});changing=Boolean(changed);});return groups;
}
export function patchCode(patch,side='new'){
 const field=side==='old'?'oldLine':'newLine';return (patch?.hunks||[]).map(hunk=>hunk.lines.filter(line=>line[field]!=null).map(line=>line.text).join('\n')).join('\n\n');
}
export function stepChange(groups,currentId,direction){
 if(!groups.length)return null;const current=groups.findIndex(group=>group.id===currentId);return groups[current<0?(direction>0?0:groups.length-1):(current+(direction>0?1:-1)+groups.length)%groups.length];
}
export function rangeSelection(history,first,last){const a=history.findIndex(c=>c.oid===first),b=history.findIndex(c=>c.oid===last);if(a<0||b<0)return null;return {kind:'range',base:history[Math.max(a,b)].oid,target:history[Math.min(a,b)].oid,includeBase:true};}
export function filterDrafts(drafts,{repoKey,status='all',source='all'}={}){return drafts.filter(d=>(repoKey==null||d.repoKey===repoKey)&&(status==='all'||(d.status||'current')===status)&&(source==='all'||d.comparisonId===source));}

// Prefer the configured upstream; otherwise pair a unique same-name remote.
export function branchChoices(refs,selected=''){
 const remotes=refs.filter(r=>r.fullName.startsWith('refs/remotes/')&&!r.symref),used=new Set(),choices=[];
 const byFullName=new Map(),byBranch=new Map();
 for(const remote of remotes){
  if(!byFullName.has(remote.fullName))byFullName.set(remote.fullName,remote);
  const name=remote.fullName.slice('refs/remotes/'.length).split('/').slice(1).join('/');
  const match=byBranch.get(name);
  if(match){match.count++;if(!match.origin&&remote.name==='origin/'+name)match.origin=remote;}
  else byBranch.set(name,{first:remote,count:1,origin:remote.name==='origin/'+name?remote:null});
 }
 for(const local of refs.filter(r=>r.fullName.startsWith('refs/heads/'))){
  const match=byBranch.get(local.name);
  const remote=byFullName.get(local.upstream)||(match?.count===1?match.first:match?.origin)||null;
  if(remote)used.add(remote.fullName);const value=remote?.fullName===selected?remote:local;
  choices.push({...value,id:local.fullName,name:local.name,local,remote});
 }
 for(const remote of remotes)if(!used.has(remote.fullName))choices.push({...remote,id:remote.fullName,local:null,remote});
 return choices;
}
