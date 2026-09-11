$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskClient = Join-Path $taskRoot 'artifacts/project-strike-local'
$taskServer = Join-Path $taskRoot 'artifacts/project-strike-server'
$taskClientManifest = Get-Content (Join-Path $taskClient 'manifest.json') -Raw | ConvertFrom-Json
$taskServerManifest = Get-Content (Join-Path $taskServer 'manifest.json') -Raw | ConvertFrom-Json
if (!$taskClientManifest.contentVersion -or $taskClientManifest.contentVersion -ne $taskServerManifest.contentVersion) { throw 'Client/server content mismatch' }
if ((Get-FileHash (Join-Path $taskServer 'server.cjs')).Hash.ToLowerInvariant() -ne $taskServerManifest.sha256) { throw 'Server checksum mismatch' }
# Use current dist to omit obsolete hashed bundles retained by incremental packaging.
# Verify every current file is byte-identical to the tested client candidate first.
$taskDist = Join-Path $taskRoot 'dist'
foreach ($taskFile in Get-ChildItem -LiteralPath $taskDist -Recurse -File) {
  $taskRelative = $taskFile.FullName.Substring($taskDist.Length + 1)
  $taskPackaged = Join-Path (Join-Path $taskClient 'dist') $taskRelative
  if (!(Test-Path -LiteralPath $taskPackaged) -or (Get-FileHash -LiteralPath $taskFile.FullName).Hash -ne (Get-FileHash -LiteralPath $taskPackaged).Hash) { throw "Untested dist file: $taskRelative" }
}
$taskStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$taskRelease = Join-Path $taskRoot "artifacts/releases/$($taskClientManifest.contentVersion)-$taskStamp"
if (Test-Path -LiteralPath $taskRelease) { throw 'Release directory already exists' }
New-Item -ItemType Directory -Path $taskRelease | Out-Null
$taskStage = Join-Path $taskRelease 'files'
$taskClientStage = Join-Path $taskStage 'project-strike-local'
$taskServerStage = Join-Path $taskStage 'project-strike-server'
New-Item -ItemType Directory -Path $taskClientStage, $taskServerStage | Out-Null
Copy-Item -LiteralPath $taskDist -Destination (Join-Path $taskClientStage 'dist') -Recurse
foreach ($taskName in @('tools', 'licenses', 'README.txt', 'PLAY.cmd', 'manifest.json')) { Copy-Item -LiteralPath (Join-Path $taskClient $taskName) -Destination $taskClientStage -Recurse }
foreach ($taskName in @('server.cjs', 'licenses', 'README.txt', 'START.cmd', 'manifest.json')) { Copy-Item -LiteralPath (Join-Path $taskServer $taskName) -Destination $taskServerStage -Recurse }
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/MULTIPLAYER_DEVICE_ACCEPTANCE.md') -Destination $taskStage
$taskInventory = @(Get-ChildItem -LiteralPath $taskStage -Recurse -File | Sort-Object FullName | ForEach-Object {
  [ordered]@{ path = $_.FullName.Substring($taskStage.Length + 1).Replace('\', '/'); bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant() }
})
$taskInventory | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskStage 'checksums.json') -Encoding UTF8
$taskZip = Join-Path $taskRelease 'project-strike-candidate.zip'
Compress-Archive -LiteralPath $taskClientStage, $taskServerStage, (Join-Path $taskStage 'MULTIPLAYER_DEVICE_ACCEPTANCE.md'), (Join-Path $taskStage 'checksums.json') -DestinationPath $taskZip
# Read and hash archive streams, verifying packaged bytes rather than only source files.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskArchive = [IO.Compression.ZipFile]::OpenRead($taskZip)
try {
  foreach ($taskEntry in $taskInventory) {
    $taskArchived = $taskArchive.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq $taskEntry.path }
    if (@($taskArchived).Count -ne 1) { throw "Missing or duplicate archive entry: $($taskEntry.path)" }
    $taskStream = $taskArchived.Open()
    $taskHasher = [Security.Cryptography.SHA256]::Create()
    try { $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-', '').ToLowerInvariant() }
    finally { $taskStream.Dispose(); $taskHasher.Dispose() }
    if ($taskHash -ne $taskEntry.sha256) { throw "Archive checksum mismatch: $($taskEntry.path)" }
  }
} finally { $taskArchive.Dispose() }
$taskReport = [ordered]@{ contentVersion = $taskClientManifest.contentVersion; archive = $taskZip; sha256 = (Get-FileHash -LiteralPath $taskZip).Hash.ToLowerInvariant(); filesVerified = $taskInventory.Count; status = 'candidate'; deviceAcceptance = 'pending' }
$taskReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRelease 'release.json') -Encoding UTF8
$taskReport | ConvertTo-Json
