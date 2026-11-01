param([string]$AppHome=$env:HERDR_APP_HOME,[string]$Layout='main',[switch]$Activate)
$ErrorActionPreference='Stop'
$installArgs=@((Join-Path $PSScriptRoot 'install.mjs'),'--layout',$Layout)
if($AppHome){$installArgs+=@('--app-home',$AppHome)}
if($Activate){$installArgs+='--activate'}
& node @installArgs
if($LASTEXITCODE -ne 0){throw "Installation failed with exit code $LASTEXITCODE"}
