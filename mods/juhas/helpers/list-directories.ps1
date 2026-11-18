param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$directories=[Collections.Generic.List[object]]::new()
$workspaces=[Collections.Generic.List[string]]::new()
foreach($entry in Get-ChildItem -LiteralPath $Root -Force){
 if($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint){continue}
 if($entry.PSIsContainer){
  if($entry.Name -in '.git','node_modules','.superpowers'){continue}
  $hasGit=Test-Path -LiteralPath (Join-Path $entry.FullName '.git')
  $directories.Add([pscustomobject]@{path=$entry.FullName;isDirectory=$true;isLink=$false;hasGit=$hasGit})
 }elseif($entry.Name.EndsWith('.code-workspace')){
  $workspaces.Add($entry.FullName)
 }
}
@{directories=@($directories.ToArray());workspaces=@($workspaces.ToArray())} | ConvertTo-Json -Compress -Depth 3
