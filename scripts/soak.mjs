import {execFile,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {Controller} from '../mods/juhas/controller.js';
import {createCache} from '../mods/juhas/cache.js';
import {resolveRepo} from '../mods/juhas/repositories.js';

const duration=15*60*1000, parent=mkdtempSync(join(tmpdir(),'juhas-soak-')), root=join(parent,'repo');
try {
mkdirSync(root); const fixtureGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const lineCount=3200, fileCount=68;
fixtureGit('init','-b','trunk'); fixtureGit('config','user.name','Juhas soak'); fixtureGit('config','user.email','soak@example.invalid'); fixtureGit('config','core.autocrlf','false');
for(let n=0;n<fileCount;n++){const name=`file-${String(n).padStart(3,'0')}.txt`;writeFileSync(join(root,name),Array.from({length:lineCount},(_,i)=>`old-${n}-${i}-`+'a'.repeat(250)).join('\n')+'\n');}
fixtureGit('add','.');fixtureGit('commit','-m','fixture baseline');
for(let n=0;n<fileCount;n++){const name=`file-${String(n).padStart(3,'0')}.txt`;writeFileSync(join(root,name),Array.from({length:lineCount},(_,i)=>`new-${n}-${i}-`+'b'.repeat(250)).join('\n')+'\n');}
fixtureGit('add','.');fixtureGit('commit','-m','large review fixture');
const head=fixtureGit('rev-parse','HEAD'), base=fixtureGit('rev-parse','HEAD^');
const run=(repo,args)=>new Promise(resolve=>execFile('git',['--no-optional-locks','-c','core.fsmonitor=false','-c','diff.autoRefreshIndex=false','-c','core.quotepath=false',...args],{cwd:repo.root,encoding:'utf8',maxBuffer:128*1024*1024,windowsHide:true},(error,stdout,stderr)=>resolve({code:error?(Number(error.code)||1):0,stdout:stdout||'',stderr:stderr||''})));
const cache=createCache(), data=new Map(), controller=new Controller({run,store:{get:k=>data.get(k),set:(k,v)=>data.set(k,v)},cache});
const repo=await resolveRepo(run,null,root); await controller.openRepo(null,root,{repo});
await controller.selectScope({kind:'range',base,target:head});
if(controller.state.files.length!==fileCount)throw new Error(`Expected ${fileCount} fixture files; saw ${controller.state.files.length}`);
const startedAt=Date.now();
const report={started:new Date().toISOString(),durationMs:duration,fixture:{fileCount,lineCount,head,base},samples:[],latencies:{scope:[],file:[],refresh:[]},operations:{fileSelections:0,scopeSelections:0,mutableEdits:0,refreshes:0},cacheEviction:{entryLimitSeen:false,byteLimitSeen:false,maximumBytes:0,maximumEntries:0},errors:[]};
const sample=minute=>{global.gc?.();const m=process.memoryUsage();const s={minute,at:new Date().toISOString(),rss:m.rss,heapUsed:m.heapUsed,external:m.external,arrayBuffers:m.arrayBuffers,cacheEntries:cache.size,cacheBytes:cache.bytes};report.samples.push(s);report.cacheEviction.maximumBytes=Math.max(report.cacheEviction.maximumBytes,cache.bytes);report.cacheEviction.maximumEntries=Math.max(report.cacheEviction.maximumEntries,cache.size);if(cache.size===64)report.cacheEviction.entryLimitSeen=true;if(cache.bytes===64*1024*1024)report.cacheEviction.byteLimitSeen=true;console.log(JSON.stringify(s));};
console.log(`SOAK_STARTED ${report.started} durationMs=${duration} repo=${root}`);sample(0);
let nextSample=startedAt+60000, minute=0, fileIndex=0, iteration=0;
try{while(Date.now()-startedAt<duration){
 const tick=performance.now();await controller.selectFile(controller.state.files[fileIndex].id);report.latencies.file.push(performance.now()-tick);report.operations.fileSelections++;fileIndex=(fileIndex+1)%fileCount;
 if(fileIndex===0){const scopeTick=performance.now();await controller.selectScope({kind:'range',base,target:head});report.latencies.scope.push(performance.now()-scopeTick);report.operations.scopeSelections++;}
 if(++iteration%12===0){const path=join(root,'file-000.txt');writeFileSync(path,`mutable-${iteration}\n`);report.operations.mutableEdits++;const refreshTick=performance.now();await controller.selectScope({kind:'working-tree'});await controller.selectFile(controller.state.files[0]?.id);const refreshed=await controller.refresh();report.latencies.refresh.push(performance.now()-refreshTick);report.operations.refreshes++;if(!refreshed&&controller.state.refreshError)report.errors.push(controller.state.refreshError);writeFileSync(path,Array.from({length:lineCount},(_,i)=>`new-0-${i}-`+'b'.repeat(250)).join('\n')+'\n');await controller.selectScope({kind:'range',base,target:head});}
 if(Date.now()>=nextSample){minute++;sample(minute);nextSample+=60000;}
 }
}catch(error){report.errors.push(error.stack||String(error));}
report.finished=new Date().toISOString();report.elapsedMs=Date.now()-startedAt;report.finalMemory=process.memoryUsage();report.finalCache={entries:cache.size,bytes:cache.bytes};
report.latencySummary={file:thirds(report.latencies.file),scope:thirds(report.latencies.scope),refresh:thirds(report.latencies.refresh)};
rmSync(parent,{recursive:true,force:true});console.log('SOAK_RESULT '+JSON.stringify({...report,latencies:undefined}));
if(report.elapsedMs<duration||report.errors.length)process.exitCode=1;

}finally{rmSync(parent,{recursive:true,force:true});}
