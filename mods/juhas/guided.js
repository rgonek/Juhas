import {utf8Bytes} from './git.js';
const MAX_BYTES=64*1024,MAX_STEPS=50,MAX_FILES=200;
function text(value,label,max=16000){if(typeof value!=='string'||!value.trim()||value.length>max||value.includes('\0'))throw new Error(`Invalid guided reading ${label}`);return value;}
function sourceFiles(files){if(!Array.isArray(files)||files.length>MAX_FILES)throw new Error('Guided reading supports at most 200 changed files');return files.map(file=>({...file,path:text(file.newPath||file.oldPath,'path',8192)}));}
export function guidedSourceId(comparison){text(comparison?.id,'source');text(comparison?.repoKey,'repository');return JSON.stringify(['guided-reading.v1',comparison.repoKey,comparison.id]);}
export function guidedRequest(comparison,files,responsePath){
 const sourceId=guidedSourceId(comparison),sources=sourceFiles(files);text(responsePath,'response path',8192);
 const request={sourceId,repository:comparison.root||null,baseOid:comparison.baseOid??null,targetOid:comparison.targetOid??null,baseTree:comparison.baseTree??null,targetTree:comparison.targetTree??null,files:sources.map(({path,oldPath,newPath,status,binary})=>({path,oldPath,newPath,status,binary:Boolean(binary)}))};
 const message=[
  'Human-requested guided reading. Inspect only the exact repository/source below. Confirm the source still matches; if it changed, stop and ask for a new request. Do not modify source files.',
  JSON.stringify(request,null,2),
  'Explain related changed fragments in plain text. Preserve the complete raw diff as the authoritative review; never mark files reviewed or comments addressed. Do not ingest transcripts, create threads, invoke another model, or send replies automatically.',
  'Account for every changed file by its canonical path in at least one step.paths entry or uncovered. Explicitly explain omitted, binary, limited or unsupported sections in uncovered[].reason; never imply they were inspected.',
  `Write JSON only to this explicitly selected response path: ${JSON.stringify(responsePath)}. Maximum 64 KiB UTF-8, 50 steps. All titles, bodies and reasons must be plain text strings.`,
  JSON.stringify({sourceId,steps:[{title:'Reading step',body:'Explain this exact change and what the human should inspect.',paths:sources.length?[sources[0].path]:[]}],uncovered:[{path:'canonical omitted path',reason:'Why this source was omitted or unsupported'}]},null,2)
 ].join('\n\n');
 if(utf8Bytes(message)>MAX_BYTES)throw new Error('Guided reading request exceeds the 64 KiB limit');
 return {sourceId,text:message};
}
export function parseGuidedResponse(value,comparison,files){
 if(typeof value!=='string'||utf8Bytes(value)>MAX_BYTES)throw new Error('Guided reading response exceeds the 64 KiB UTF-8 limit');
 let response;try{response=JSON.parse(value);}catch{throw new Error('Guided reading response must be valid JSON');}
 const sourceId=guidedSourceId(comparison),known=new Set(sourceFiles(files).map(file=>file.path)),covered=new Set();
 if(!response||Array.isArray(response)||response.sourceId!==sourceId)throw new Error('Guided reading source is stale or does not match');
 if(!Array.isArray(response.steps)||response.steps.length>MAX_STEPS||!Array.isArray(response.uncovered)||response.uncovered.length>MAX_FILES)throw new Error('Invalid guided reading steps or uncovered sections (maximum 50 steps)');
 function path(value){text(value,'path',8192);if(!known.has(value))throw new Error('Guided reading references an unknown path');covered.add(value);return value;}
 const steps=response.steps.map(step=>{
  if(!step||!Array.isArray(step.paths)||!step.paths.length||step.paths.length>MAX_FILES)throw new Error('Each guided reading step requires source paths');
  return {title:text(step.title,'title',500),body:text(step.body,'body'),paths:[...new Set(step.paths.map(path))]};
 });
 const uncovered=response.uncovered.map(item=>{if(!item||typeof item!=='object')throw new Error('Uncovered paths require an explicit reason');return {path:path(item.path),reason:text(item.reason,'omission reason',4000)};});
 if([...known].some(file=>!covered.has(file)))throw new Error('Guided reading must account for every changed file, including omitted sections');
 return {sourceId,steps,uncovered};
}
