// Pure presentation models; retain original patch rows for comment anchors.
export function fileRows(files,tree=false,collapsed=new Set()){
 if(!tree)return files;
 const root={dirs:new Map(),files:[]};
 for(const file of files){const parts=file.newPath.split('/');let node=root;for(const name of parts.slice(0,-1)){if(!node.dirs.has(name))node.dirs.set(name,{dirs:new Map(),files:[]});node=node.dirs.get(name);}node.files.push(file);}
 const rows=[];
 const walk=(node,prefix='',depth=0)=>{for(const [name,child] of [...node.dirs].sort(([a],[b])=>a.localeCompare(b))){const path=prefix+name+'/';rows.push({id:'dir:'+path,directory:true,path,name,depth,closed:collapsed.has(path)});if(!collapsed.has(path))walk(child,path,depth+1);}for(const file of node.files.sort((a,b)=>a.newPath.localeCompare(b.newPath)))rows.push({...file,name:file.newPath.split('/').at(-1),depth});};
 walk(root);return rows;
}
export function splitRows(rows){
 const result=[];let removed=[],added=[];
 const flush=()=>{for(let i=0;i<Math.max(removed.length,added.length);i++){const old=removed[i],next=added[i];result.push({id:'split:'+(next?.id||old.id),kind:'pair',old,next});}removed=[];added=[];};
 for(const row of rows){if(row.kind==='line'&&row.side==='old')removed.push(row);else if(row.kind==='line'&&row.side==='new')added.push(row);else{flush();if(row.kind==='line')result.push({id:'split:'+row.id,kind:'pair',old:row,next:row});else result.push(row);}}flush();return result;
}
export function rangeSelection(history,first,last){const a=history.findIndex(c=>c.oid===first),b=history.findIndex(c=>c.oid===last);if(a<0||b<0)return null;return {kind:'range',base:history[Math.max(a,b)].oid,target:history[Math.min(a,b)].oid,includeBase:true};}
