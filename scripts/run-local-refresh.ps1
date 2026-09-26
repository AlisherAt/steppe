param([Parameter(Mandatory = $true)][string]$NodePath, [switch]$Nike)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if ($Nike) { & $NodePath (Join-Path $PSScriptRoot 'local-refresh.mjs') --nike }
else { & $NodePath (Join-Path $PSScriptRoot 'local-refresh.mjs') }
exit $LASTEXITCODE
