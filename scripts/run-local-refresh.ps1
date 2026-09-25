param([Parameter(Mandatory = $true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
& $NodePath (Join-Path $PSScriptRoot 'local-refresh.mjs')
exit $LASTEXITCODE
