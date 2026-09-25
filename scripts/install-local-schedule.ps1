param([string]$TaskName = 'STEPPE-Catalog-Refresh')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$runner = Join-Path $PSScriptRoot 'run-local-refresh.ps1'
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env.scheduler.local'))) {
    throw 'Missing .env.scheduler.local; see docs/local-scheduler.md'
}
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -NodePath "{1}"' -f $runner, $nodePath
$action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument $arguments -WorkingDirectory $projectRoot
$triggers = @(
    New-ScheduledTaskTrigger -Daily -At '10:00'
    New-ScheduledTaskTrigger -Daily -At '21:00'
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 40) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'STEPPE catalog: daily 10:00 and 21:00, Windows local time. Public scraping, upload, refresh.' -Force | Out-Null
Get-ScheduledTask -TaskName $TaskName | Format-List TaskName,State
Get-ScheduledTaskInfo -TaskName $TaskName | Format-List NextRunTime,LastRunTime,LastTaskResult
