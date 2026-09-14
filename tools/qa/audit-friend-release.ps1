$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskReport = Get-Content artifacts/friends-latest.json -Raw | ConvertFrom-Json
$taskHash = (Get-FileHash -LiteralPath $taskReport.latest -Algorithm SHA256).Hash.ToLowerInvariant()
if ($taskHash -ne $taskReport.sha256 -or $taskHash -ne (Get-FileHash -LiteralPath $taskReport.archive -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'Archive hash mismatch' }
$taskZip = [IO.Compression.ZipFile]::OpenRead($taskReport.latest)
try {
  $taskNames = @($taskZip.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
  foreach ($taskRequired in @('PLAY.cmd','SOLO.cmd','README.txt','manifest.json','runtime/node.exe','dist/index.html','licenses/Node.js-LICENSE.txt','licenses/Phaser-MIT.txt')) {
    if ($taskNames -notcontains ('Project-Strike-Windows/' + $taskRequired)) { throw "Missing $taskRequired" }
  }
  $taskUnexpected = @($taskNames | Where-Object { $_ -match '/(accounts|credentials|saves|research|src|tests|node_modules)/|/\.env' })
  if ($taskUnexpected.Count) { throw 'Forbidden ZIP paths' }
  $taskEntry = $taskZip.Entries | Where-Object { $_.FullName.Replace('\','/') -eq 'Project-Strike-Windows/runtime/node.exe' }
  $taskStream = $taskEntry.Open(); $taskMemory = [IO.MemoryStream]::new()
  try { $taskStream.CopyTo($taskMemory); $taskData=$taskMemory.ToArray() } finally { $taskStream.Dispose(); $taskMemory.Dispose() }
  $taskOffset=[BitConverter]::ToInt32($taskData,60)
  if ([BitConverter]::ToUInt32($taskData,$taskOffset) -ne 17744 -or [BitConverter]::ToUInt16($taskData,$taskOffset+4) -ne 34404) { throw 'Runtime is not Windows x64 PE' }
  $taskAudit=[ordered]@{
    date=(Get-Date).ToUniversalTime().ToString('o'); archive=$taskReport.archive; latest=$taskReport.latest
    content=$taskReport.contentVersion; entries=$taskNames.Count; bytes=$taskReport.bytes; sha256=$taskHash
    runtimePEMachine='0x8664'; requiredEntriesPresent=$true; unexpected=$taskUnexpected
    scope='ZIP hash, required paths, forbidden directories and runtime architecture only; runtime launch and production tests are separate release evidence'
    status='verified local candidate; full acceptance remains open'
  }
  $taskAudit | ConvertTo-Json -Depth 4 | Set-Content artifacts/qa/growth-v3-release-audit.json -Encoding UTF8
  $taskAudit | ConvertTo-Json -Depth 4
} finally { $taskZip.Dispose() }
