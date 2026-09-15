$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskAddress = 'http://127.0.0.1:8190'
$taskReady = $false
try { $taskState = Invoke-RestMethod "$taskAddress/catalog" -TimeoutSec 2; $taskReady = $null -ne $taskState.assets } catch { }
if (!$taskReady) {
  $taskNode = (Get-Command node -ErrorAction Stop).Source
  $taskLogs = Join-Path $taskRoot 'artifacts/ui-kit'
  New-Item -ItemType Directory -Force -Path $taskLogs | Out-Null
  $taskStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $taskProcess = Start-Process -FilePath $taskNode -ArgumentList @('tools/ui-art.mjs', 'studio') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskLogs "$taskStamp.studio.log") -RedirectStandardError (Join-Path $taskLogs "$taskStamp.studio-error.log")
  for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
    Start-Sleep -Milliseconds 300
    try { $taskState = Invoke-RestMethod "$taskAddress/catalog" -TimeoutSec 2; if ($null -ne $taskState.assets) { $taskReady = $true; break } } catch { }
    if ($taskProcess.HasExited) { throw "Studio exited; inspect $taskLogs" }
  }
}
if (!$taskReady) { throw 'Art studio did not start on port 8190' }
Start-Process $taskAddress
