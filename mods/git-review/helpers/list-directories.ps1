param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
@((Get-ChildItem -LiteralPath $Root -Force -Directory) | ForEach-Object {
 [pscustomobject]@{path=$_.FullName;isDirectory=$true;isLink=[bool]($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint)}
}) | ConvertTo-Json -Compress -Depth 3
