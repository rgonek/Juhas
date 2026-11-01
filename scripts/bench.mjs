import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createCache} from '../mods/juhas/cache.js';
const args=process.argv.slice(2);const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};const root=option('--repo');if(!root)throw new Error('Usage: node scripts/bench.mjs --repo <root> [--commit SHA] [--samples 30]');
const samples=Number(option('--samples','30'));if(!Number.isInteger(samples)||samples<2||samples>1000)throw new Error('Samples must be 2..1000');
const git=(...argv)=>execFileSync('git',['--no-optional-locks','-c','core.fsmonitor=false',...argv],{cwd:root,maxBuffer:64*1024*1024,encoding:'utf8'});
const commit=git('rev-parse','--verify','--end-of-options',`${option('--commit','HEAD')}^{commit}`).trim();
const files=git('diff-tree','--root','--no-commit-id','--name-only','-r',commit).trim().split('\n').filter(Boolean);const file=files[0];
function measure(name,action){const times=[];let bytes=0;for(let i=0;i<=samples;i++){const start=performance.now();const output=action();times.push(performance.now()-start);bytes=Buffer.byteLength(String(output));}const cold=times.shift();times.sort((a,b)=>a-b);console.log(JSON.stringify({name,samples,coldMs:+cold.toFixed(2),p95Ms:+times[Math.ceil(times.length*.95)-1].toFixed(2),bytes}));}
measure('git-history-300',()=>git('log','-300','--format=%H%x00%P%x00%s',commit));
measure('git-files',()=>git('diff-tree','--root','--no-commit-id','--name-status','-r',commit));
if(file)measure('git-file-patch',()=>git('show','--format=','--no-ext-diff','--no-textconv',commit,'--',`:(literal)${file}`));else console.log(JSON.stringify({name:'git-file-patch',skipped:'No changed file; select a nonempty nonmerge commit'}));
const cache=createCache();cache.set(commit,{files});measure('js-cache-lookup',()=>JSON.stringify(cache.get(commit)));
console.log('These measurements exclude input-to-frame UI latency. Repository paths and code are not printed.');
