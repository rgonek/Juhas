export const DIFF_BATCH_SIZE=256;
export const VIRTUAL_DIFF_ROW_LIMIT=10000;
export function runDiffBatches(cx,steps,current,complete){
 const advance=cx=>{
  if(!current())return;
  const deadline=Date.now()+3;
  do{
   const step=steps.next();
   if(step.done){complete(step.value,cx);return;}
  }while(Date.now()<deadline);
  cx.timer.after(1,advance);
 };
 cx.timer.after(1,advance);
}
export function finishDiffBatches(steps){
 let step;
 do{step=steps.next();}while(!step.done);
 return step.value;
}
// Decoration only: offsets are UTF-16 source offsets; nothing mutates patch text.
const tokenCache=new Map();let cachedBytes=0;
const MAX_LINE=8192,MAX_CACHE=512,MAX_BYTES=1024*1024;
const keywords=new Set('const let var function return if else for while class import export from new async await throw try catch public private static void using namespace def in None True False SELECT FROM WHERE JOIN AS INSERT UPDATE DELETE CREATE TABLE null true false'.split(' '));
export function tokenizeLine(text,path=''){
 const language=path.split('.').at(-1).toLowerCase(),supported=/^(js|jsx|ts|tsx|mjs|cjs|json|cs|rs|go|py|sql|css|java|c|cpp|h)$/.test(language);
 if(!supported||text.length>MAX_LINE)return [{text,kind:'plain'}];
 const key=language+'\0'+text;if(tokenCache.has(key))return tokenCache.get(key);
 const spans=[],pattern=/(\/\/.*|#.*|--.*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;let end=0;
 for(const match of text.matchAll(pattern)){if(match.index>end)spans.push({text:text.slice(end,match.index),kind:'plain'});const token=match[0],kind=/^(\/\/|#|--)/.test(token)?'comment':/^["'`]/.test(token)?'string':/^\d/.test(token)?'number':keywords.has(token)?'keyword':'plain';spans.push({text:token,kind});end=match.index+token.length;}
 if(end<text.length||!spans.length)spans.push({text:text.slice(end),kind:'plain'});
 const result=Object.freeze(spans.map(Object.freeze));tokenCache.set(key,result);cachedBytes+=key.length*2;
 while(tokenCache.size>MAX_CACHE||cachedBytes>MAX_BYTES){const first=tokenCache.keys().next().value;cachedBytes-=first.length*2;tokenCache.delete(first);}
 return result;
}
export function intraline(oldText,newText){
 if(oldText===newText)return {old:[],new:[]};
 if(oldText.length+newText.length>MAX_LINE)return {old:[{start:0,end:oldText.length}],new:[{start:0,end:newText.length}]};
 const a=Array.from(oldText),b=Array.from(newText);let start=0,end=0;
 while(start<a.length&&start<b.length&&a[start]===b[start])start++;
 while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
 const range=chars=>{const begin=chars.slice(0,start).join('').length,finish=chars.slice(0,chars.length-end).join('').length;return finish>begin?[{start:begin,end:finish}]:[];};
 return {old:range(a),new:range(b)};
}
export function findInPatch(patch,query){
 if(!query)return [];const result=[];let rowIndex=0;
 for(const hunk of patch?.hunks||[]){rowIndex++;for(const row of hunk.lines){for(const side of ['old','new']){const line=row[side==='old'?'oldLine':'newLine'];if(line==null)continue;let start=0,index;while((index=row.text.indexOf(query,start))>=0){if(result.length===10000){result.limited=true;return result;}result.push({side,line,start:index,end:index+query.length,rowIndex});start=index+query.length;}}rowIndex++;}}
 return result;
}
export function decorateLine(text,path,changed=[],matches=[],compact=false){
 const result=[];
 const push=(text,kind,changed,match)=>{
  if(!text)return;
  const previous=result.at(-1);
  if(compact&&previous?.kind===kind&&previous.changed===changed&&previous.match===match)previous.text+=text;
  else result.push({text,kind,changed,match});
 };
 const tokens=tokenizeLine(text,path);
 if(!changed.length&&!matches.length){
  for(const token of tokens)push(token.text,token.kind,false,false);
  return result;
 }
 const ranges=[...changed,...matches];
 let offset=0;
 for(const token of tokens){
  const end=offset+token.text.length,bounds=new Set([offset,end]);
  for(const range of ranges){
   if(range.start>offset&&range.start<end)bounds.add(range.start);
   if(range.end>offset&&range.end<end)bounds.add(range.end);
  }
  const sorted=[...bounds].sort((a,b)=>a-b);
  for(let i=0;i<sorted.length-1;i++){
   const start=sorted[i],finish=sorted[i+1];
   push(text.slice(start,finish),token.kind,changed.some(r=>r.start<finish&&r.end>start),matches.some(r=>r.start<finish&&r.end>start));
  }
  offset=end;
 }
 return result;
}
export function withLineInfo(rows){return finishDiffBatches(lineInfoBatches(rows));}
export function* lineInfoBatches(rows){
 const visible=[];
 let oldEnd=1,newEnd=1,count=0;
 for(const row of rows){
  if(++count%DIFF_BATCH_SIZE===0)yield;
  if(row.kind!=='hunk'){visible.push(row);continue;}
  const header=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(row.text);
  if(!header)continue;
  const oldCount=Number(header[2]??1),newCount=Number(header[4]??1);
  const oldStart=Number(header[1])+Number(oldCount===0);
  const newStart=Number(header[3])+Number(newCount===0);
  const skipped=newStart-newEnd;
  if(skipped>0&&oldStart-oldEnd===skipped){
   visible.push({...row,text:`${skipped} omitted ${skipped===1?'line':'lines'}`});
  }
  oldEnd=oldStart+oldCount;
  newEnd=newStart+newCount;
 }
 return visible;
}
export function multiFileRows(sections){return finishDiffBatches(multiFileRowBatches(sections));}
export function* multiFileRowBatches(sections){
 const result=[];let count=0;for(const section of sections){
  if(++count%DIFF_BATCH_SIZE===0)yield;const {file,comparison,collapsed,loading,limited}=section,context={fileId:file.id,comparisonId:comparison?.id,filePath:file.newPath};
  result.push({...context,id:`file:${file.id}`,kind:'file-header',text:file.newPath,collapsed,loading,limited});if(collapsed)continue;
  if(!section.rows||limited){result.push({...context,id:`notice:${file.id}`,kind:'notice',text:limited?'Diff limited · open this file to load available context':loading?'Loading diff…':'Diff not loaded · expand to load'});continue;}
  for(const row of section.rows){
   if(++count%DIFF_BATCH_SIZE===0)yield;
   result.push({...row,...context,sourceId:row.id,id:`file:${file.id}:${row.id}`});
  }
 }return result;
}
