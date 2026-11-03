import {createRunner,git,oid,uid} from './git.js';
const HASH=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const WINDOWS=/^[a-z]:[\\/]|^\\\\/i;
// Scripts are passed as single argv values. Repository paths are never shell text;
// cwd/on select the checkout on either machine, without a remote helper install.
const PS_CAPTURE=String.raw`
$ErrorActionPreference='Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
function G { $value = & git --no-optional-locks -c core.fsmonitor=false @args; if ($LASTEXITCODE -ne 0) { throw 'Snapshot Git command failed' }; return $value }
$snapshotDir = Join-Path ([IO.Path]::GetTempPath()) ('juhas-snapshot-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $snapshotDir
$env:GIT_INDEX_FILE = Join-Path $snapshotDir 'index'
try {
 $branchBefore = & git symbolic-ref --short -q HEAD
 $headBefore = & git rev-parse --verify -q HEAD
 $trees = @()
 foreach ($pass in 1,2) {
  if (Test-Path -LiteralPath $env:GIT_INDEX_FILE) { Remove-Item -LiteralPath $env:GIT_INDEX_FILE -Force }
  if ($headBefore) { $null = G read-tree $headBefore } else { $null = G read-tree --empty }
  $null = G add -A -- .
  $trees += G write-tree
 }
 $branchAfter = & git symbolic-ref --short -q HEAD
 $headAfter = & git rev-parse --verify -q HEAD
 if ($branchBefore -ne $branchAfter -or $headBefore -ne $headAfter -or $trees[0] -ne $trees[1]) { throw 'Working contents changed during snapshot; try again' }
 Write-Output ('JUHAS_TREE=' + $trees[0])
 Write-Output ('JUHAS_BRANCH=' + $branchBefore)
} finally {
 foreach ($path in @($env:GIT_INDEX_FILE,($env:GIT_INDEX_FILE + '.lock'))) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force } }
 Remove-Item -LiteralPath $snapshotDir -Force
}
`;
const SH_CAPTURE=String.raw`
set -eu
snapshot_temp=$(printenv TMPDIR || :)
if [ -z "$snapshot_temp" ]; then snapshot_temp=/tmp; fi
snapshot_dir=$(mktemp -d "$snapshot_temp/juhas-snapshot.XXXXXXXX")
export GIT_INDEX_FILE="$snapshot_dir/index"
trap 'rm -f "$GIT_INDEX_FILE" "$GIT_INDEX_FILE.lock"; rmdir "$snapshot_dir"' EXIT HUP INT TERM
g() { git --no-optional-locks -c core.fsmonitor=false "$@"; }
branch_before=$(g symbolic-ref --short -q HEAD || :)
head_before=$(g rev-parse --verify -q HEAD || :)
capture() {
 rm -f "$GIT_INDEX_FILE"
 if [ -n "$head_before" ]; then g read-tree "$head_before" || return $?; else g read-tree --empty || return $?; fi
 g add -A -- . || return $?
 g write-tree
}
first=$(capture)
second=$(capture)
branch_after=$(g symbolic-ref --short -q HEAD || :)
head_after=$(g rev-parse --verify -q HEAD || :)
if [ "$first" != "$second" ] || [ "$branch_before" != "$branch_after" ] || [ "$head_before" != "$head_after" ]; then echo 'Working contents changed during snapshot; try again' >&2; exit 1; fi
printf 'JUHAS_TREE=%s\nJUHAS_BRANCH=%s\n' "$first" "$branch_before"
`;
export function checkpointBaseline(cp){return cp?.kind==='working-snapshot'?cp.treeOid:cp?.targetOid;}
export async function captureWorkingSnapshot(exec,repo,{branch=null,maxBytes=64*1024*1024,maxFiles=20000,platform=null}={}){
 if(!repo?.key||!repo.root)throw new Error('Snapshot repository is unavailable');
 const windows=platform==='windows'||(platform==null&&WINDOWS.test(repo.root));
 const result=await exec(windows?'powershell.exe':'sh',windows?['-NoProfile','-NonInteractive','-Command',PS_CAPTURE]:['-c',SH_CAPTURE],{cwd:repo.root,on:repo.machine??null});
 if(result.code!==0)throw new Error(result.stderr?.trim()||'Working snapshot capture failed');
 const treeOid=/^JUHAS_TREE=([a-f0-9]+)\r?$/m.exec(result.stdout)?.[1],capturedBranch=/^JUHAS_BRANCH=(.*)\r?$/m.exec(result.stdout)?.[1]?.trim()||'(detached)';
 if(!HASH.test(treeOid||''))throw new Error('Snapshot tree is unavailable');
 if(branch&&branch!==capturedBranch)throw new Error('Branch context changed; refresh before capturing a snapshot');
 const run=createRunner(exec),listing=await git(run,repo,['ls-tree','-r','-l','-z',treeOid]);let bytes=0,files=0;
 for(const entry of listing.split('\0').filter(Boolean)){const size=/^[0-7]+ [^ ]+ [a-f0-9]+\s+([0-9-]+)\t/.exec(entry);if(!size)throw new Error('Cannot verify snapshot size');bytes+=size[1]==='-'?0:Number(size[1]);files++;}
 if(bytes>maxBytes||files>maxFiles)throw new Error('Working snapshot exceeds the size/file limit');
 const id=uid(),refName=`refs/git-review/snapshots/${id}`;
 await git(run,repo,['update-ref',refName,treeOid,'0'.repeat(treeOid.length)]);
 return {kind:'working-snapshot',id,treeOid,refName,repoKey:repo.key,root:repo.root,branch:capturedBranch,markedAt:Date.now(),bytes,files};
}
export async function deleteWorkingSnapshot(exec,repo,cp){
 if(cp?.kind!=='working-snapshot'||cp.repoKey!==repo.key||!HASH.test(cp.treeOid||'')||!/^[a-z0-9-]+$/.test(cp.id||'')||cp.refName!==`refs/git-review/snapshots/${cp.id}`)throw new Error('Invalid snapshot reference');
 const run=createRunner(exec);if(await oid(run,repo,cp.refName,'tree')!==cp.treeOid)throw new Error('Snapshot reference changed; nothing was deleted');
 await git(run,repo,['update-ref','-d',cp.refName,cp.treeOid]);
}
