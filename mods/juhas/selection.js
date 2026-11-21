// Source coordinates stay separate from gutters, expanded tabs and comment rows.
let segmenter;
export function graphemes(text){
 if(typeof Intl!=='undefined'&&typeof Intl.Segmenter==='function')return [...(segmenter??=new Intl.Segmenter(undefined,{granularity:'grapheme'})).segment(text)].map(g=>({text:g.segment,start:g.index,end:g.index+g.segment.length}));
 const result=[];let offset=0,regional=0;
 for(const char of Array.from(text)){const code=char.codePointAt(0),last=result.at(-1),flag=code>=0x1f1e6&&code<=0x1f1ff;
  const join=last&&(/\p{M}/u.test(char)||code===0xfe0f||code===0xfe0e||code===0x200d||last.text.endsWith('\u200d')||code>=0x1f3fb&&code<=0x1f3ff||flag&&regional%2===1||char==='\n'&&last.text==='\r');
  if(join){last.text+=char;last.end+=char.length;}else result.push({text:char,start:offset,end:offset+char.length});
  offset+=char.length;regional=flag?regional+1:0;
 }return result;
}
export function buildSelectionModel(rows,split,context={}){
 const groups=new Map(),points=new Map(),entries=[],rowIndices=new Map();
 const add=(row,line,side,index)=>{if(!line||typeof line.text!=='string')return;const fileId=row.fileId??context.fileId,comparisonId=row.comparisonId??context.comparisonId,key=JSON.stringify([comparisonId,fileId,split?side:'unified']);
  let group=groups.get(key);if(!group){group=[];groups.set(key,group);}const entry={key,line:group.length,rowId:row.id,fileId,comparisonId,text:line.text,side,oldLine:line.oldLine,newLine:line.newLine,source:line,displayIndex:index};
  group.push(entry);entries.push(entry);points.set(row.id+'\0'+(split?side:''),entry);
 };
 rows.forEach((row,index)=>{rowIndices.set(row.id,index);if(row.kind==='pair'){add(row,row.old,'old',index);add(row,row.next,'new',index);}else if(row.kind==='line'){if(split&&row.side==='context'){add(row,row,'old',index);add(row,row,'new',index);}else add(row,row,row.side==='old'?'old':'new',index);}});
 return {groups,entries,rowIndices,signature:JSON.stringify(entries.map(e=>[e.key,e.rowId,e.text,e.oldLine,e.newLine])),point:(id,side)=>{const e=points.get(id+'\0'+(split?side:''));return e?{key:e.key,line:e.line,offset:0,rowId:e.rowId}:null;},entry:point=>point&&groups.get(point.key)?.[point.line]};
}
export function selectionRange(selection){
 if(!selection?.anchor||!selection?.end||selection.anchor.key!==selection.end.key)return null;
 const {anchor:a,end:b}=selection;return a.line<b.line||a.line===b.line&&a.offset<=b.offset?[a,b]:[b,a];
}
export function selectionText(model,selection){
 const range=selectionRange(selection);if(!range)return '';const [a,b]=range,group=model.groups.get(a.key);if(!group||!group[a.line]||!group[b.line])return '';
 return group.slice(a.line,b.line+1).map((entry,i)=>entry.text.slice(i===0?a.offset:0,a.line+i===b.line?b.offset:entry.text.length)).join('\n');
}
export function glyphSelected(selection,point,start,end){const range=selectionRange(selection);if(!range||!point)return false;const [a,b]=range;return a.key===point.key&&point.line>=a.line&&point.line<=b.line&&end>(point.line===a.line?a.offset:0)&&start<(point.line===b.line?b.offset:Infinity);}
export function wordRange(text,offset){
 const chars=graphemes(text),kind=g=>/[\p{L}\p{N}\p{M}_$]/u.test(g.text)?'word':/\s/u.test(g.text)?'space':'symbol';if(!chars.length)return [0,0];
 let index=chars.findIndex(g=>offset<g.end);if(index<0)index=chars.length-1;let a=index,b=index;while(a>0&&kind(chars[a-1])===kind(chars[index]))a--;while(b+1<chars.length&&kind(chars[b+1])===kind(chars[index]))b++;return [chars[a].start,chars[b].end];
}
export function unitSelection(model,point,unit,hitOffset=point.offset){
 const entry=model.entry(point);if(!entry)return null;
 if(unit==='line'){const group=model.groups.get(point.key),next=group[point.line+1];return {anchor:{...point,offset:0},end:next?{key:point.key,line:point.line+1,rowId:next.rowId,offset:0}:{...point,offset:entry.text.length}};}
 const [start,end]=wordRange(entry.text,hitOffset);return {anchor:{...point,offset:start},end:{...point,offset:end}};
}
export function extendUnit(anchor,current){const a=anchor.anchor,b=current.anchor;return b.line<a.line||b.line===a.line&&b.offset<a.offset?{anchor:anchor.end,end:current.anchor}:{anchor:anchor.anchor,end:current.end};}
export function commentSelection(model,startRowId,side,endRowId=startRowId){
 const start=model.entries.find(e=>e.rowId===startRowId&&(!side||e.side===side));if(!start)return null;side??=start.side;
 const end=model.entries.find(e=>e.rowId===endRowId&&e.fileId===start.fileId&&e.comparisonId===start.comparisonId&&(side==='old'?e.oldLine:e.newLine)!=null);if(!end)return null;
 const field=side==='old'?'oldLine':'newLine',first=start[field],last=end[field];if(first==null||last==null)return null;const lo=Math.min(first,last),hi=Math.max(first,last),lines=new Map();
 for(const e of model.entries)if(e.fileId===start.fileId&&e.comparisonId===start.comparisonId&&e[field]!=null&&e[field]>=lo&&e[field]<=hi&&!lines.has(e[field]))lines.set(e[field],e);
 if(lines.size!==hi-lo+1)return null;const ordered=[...lines.values()].sort((a,b)=>a[field]-b[field]);
 return {fileId:start.fileId,comparisonId:start.comparisonId,side,startLine:lo,endLine:hi,quote:ordered.map(e=>e.text).join('\n'),startRowId:ordered[0].rowId,endRowId:ordered.at(-1).rowId};
}
