param(
  [string]$Core = 'C:\AI\comfyui-core',
  [string]$ModelPaths = 'C:\AI\ai-game-art\comfy-extra-model-paths.yaml',
  [int]$Port = 8188
)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid port' }
$python = Join-Path $Core '.venv\Scripts\python.exe'
foreach ($file in @($python, (Join-Path $Core 'main.py'), $ModelPaths)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing local ComfyUI dependency: $file" }
}
try {
  $null = Invoke-RestMethod "http://127.0.0.1:$Port/system_stats" -TimeoutSec 3
  Write-Output "ComfyUI is already running at http://127.0.0.1:$Port"
  exit 0
} catch { }
$logs = Join-Path $PSScriptRoot '..\artifacts\comfy-ui'
$null = New-Item -ItemType Directory -Force -Path $logs
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$process = Start-Process -FilePath $python -ArgumentList @('main.py', '--listen', '127.0.0.1', '--port', "$Port", '--extra-model-paths-config', ('"' + $ModelPaths + '"')) -WorkingDirectory $Core -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "$stamp.stdout.log") -RedirectStandardError (Join-Path $logs "$stamp.stderr.log")
Write-Output "Started ComfyUI PID $($process.Id). Run npm run art:doctor when startup finishes. Logs: $logs"
