param([Parameter(Mandatory=$true)][string]$Root,[switch]$Workspaces)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
if ($Workspaces) {
 Get-ChildItem -LiteralPath $Root -Force -File -Filter '*.code-workspace' |
  Where-Object { -not ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) } |
  ForEach-Object { $_.FullName }
 return
}
@((Get-ChildItem -LiteralPath $Root -Force -Directory) | ForEach-Object {
 [pscustomobject]@{path=$_.FullName;isDirectory=$true;isLink=[bool]($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint)}
}) | ConvertTo-Json -Compress -Depth 3
