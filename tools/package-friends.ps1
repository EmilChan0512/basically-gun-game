param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
function Get-TaskFileHash([string]$LiteralPath) {
  $taskStream = [IO.File]::OpenRead($LiteralPath)
  $taskHasher = [Security.Cryptography.SHA256]::Create()
  try { return @{ Hash = [BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-', '') } }
  finally { $taskStream.Dispose(); $taskHasher.Dispose() }
}
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskDist = Join-Path $taskRoot 'dist'
$taskManifest = Get-Content -LiteralPath (Join-Path $taskRoot 'artifacts/project-strike-local/manifest.json') -Raw | ConvertFrom-Json
$taskRuntime = (& $NodePath -p 'JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})') | ConvertFrom-Json
if ($taskRuntime.platform -ne 'win32' -or $taskRuntime.arch -ne 'x64') { throw 'Friend package requires Windows x64 Node.js' }
$taskStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$taskRelease = Join-Path $taskRoot "artifacts/releases/friends-$($taskManifest.contentVersion)-$taskStamp"
if (Test-Path -LiteralPath $taskRelease) { throw 'Release already exists' }
$taskFolder = Join-Path $taskRelease 'Project-Strike-Windows'
New-Item -ItemType Directory -Path (Join-Path $taskFolder 'runtime'), (Join-Path $taskFolder 'tools'), (Join-Path $taskFolder 'licenses') | Out-Null
# Copy only this build's dist into a fresh directory, never an accumulated package.
Copy-Item -LiteralPath $taskDist -Destination (Join-Path $taskFolder 'dist') -Recurse
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $taskFolder 'runtime/node.exe')
foreach ($taskName in @('serve-game.mjs','start-friends.mjs')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $taskName) -Destination (Join-Path $taskFolder 'tools') }
Copy-Item -LiteralPath (Join-Path $taskRoot 'node_modules/phaser/LICENSE.md') -Destination (Join-Path $taskFolder 'licenses/Phaser-MIT.txt')
Copy-Item -LiteralPath (Join-Path $taskRoot 'node_modules/eventemitter3/LICENSE') -Destination (Join-Path $taskFolder 'licenses/EventEmitter3-MIT.txt')
Copy-Item -LiteralPath (Join-Path $taskRoot 'public/assets/audio/SOURCES.txt') -Destination (Join-Path $taskFolder 'licenses/Audio-Sources.txt')
Copy-Item -LiteralPath (Join-Path $taskRoot 'public/assets/audio/Kenney-CC0.txt') -Destination (Join-Path $taskFolder 'licenses/Kenney-CC0.txt')
Copy-Item -LiteralPath (Join-Path $taskRoot 'public/assets/ui-v2/SOURCES.txt') -Destination (Join-Path $taskFolder 'licenses/UI-Art-Sources.txt')
Copy-Item -LiteralPath (Join-Path $taskRoot 'public/assets/architecture/SOURCES.txt') -Destination (Join-Path $taskFolder 'licenses/Architecture-Art-Sources.txt')
Copy-Item -LiteralPath (Join-Path $taskRoot 'public/assets/space-station/SOURCES.txt') -Destination (Join-Path $taskFolder 'licenses/Space-Station-Art-Sources.txt')
$taskCache = Join-Path $taskRoot "tools/vendor/node-$($taskRuntime.version)-LICENSE.txt"
if (!(Test-Path -LiteralPath $taskCache)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $taskCache) -Force | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/nodejs/node/$($taskRuntime.version)/LICENSE" -OutFile $taskCache
}
Copy-Item -LiteralPath $taskCache -Destination (Join-Path $taskFolder 'licenses/Node.js-LICENSE.txt')
foreach ($taskEntry in @(@('PLAY.cmd',''), @('SOLO.cmd',' --solo'))) {
  $taskLauncher = "@echo off`r`nchcp 65001 >nul`r`ncd /d `"%~dp0`"`r`n`"runtime\node.exe`" `"tools\start-friends.mjs`"$($taskEntry[1])`r`nif errorlevel 1 pause`r`n"
  [IO.File]::WriteAllText((Join-Path $taskFolder $taskEntry[0]), $taskLauncher, [Text.Encoding]::ASCII)
}
$taskReadme = @'
Project Strike - 破晓行动（Windows 64位便携版）

1. 将整个 ZIP 解压到一个文件夹，不要直接在压缩软件里运行。
2. 双击 PLAY.cmd 打开联机大厅，或双击 SOLO.cmd 进入单机。
3. 浏览器会自动打开；保持启动窗口开启，退出时关闭窗口。

已内置 Node.js，无需安装 Node、npm 或开发工具。请完整保留所有文件夹。
单机免登录；进度保存在同一浏览器及本地地址下，不包含发行者的账号或存档。
“太空站 · 轨道狙击”地图：4800宽的轨道设施，双侧悬浮高地、四条连续坡道、中央三级悬浮平台，支持团队交火和据点争夺。A/D沿坡道移动，S可穿过坡面回到下层，中央新增1440宽的高地观测舱与四处掩体，据点在舱内；进入两侧地面传送门按S上舱，舱内橙色门按S返回下层，两端平台可向下射击。高地之间保留远距离狙击射界，下层舱道和货箱提供掩护。独立太空站素材由本地ComfyUI生成。屏幕右侧“拉远/拉近/视野”按钮可手动调节1至3.5倍屏幕范围，点击中间按钮恢复默认；所有职业均可使用，与静止姿态无关。
职业专属Perk：技能强化随E技能自动匹配，战斗收益和连锁奖励各二选一。突击连杀补弹、重装蓄力反击、狙击强化首发、医疗双人增益；技能和Perk触发时显示强化光环与提示。旧配装会自动迁移，保留武器和改装。
单机菜单点击“四干员成长训练”，可配装突击兵、重装兵、狙击手或医疗兵，进行4v4机器人训练。专属E/G、18枪与36配件均可离线使用，训练不计入联网账号资产。保存配装后开始，可暂停或返回配装重开。
“大楼 · 四层攻坚”地图：四层楼、24间房间、左侧折返楼梯、右侧连续斜坡和逐层掩体。沿楼梯移动上楼，按住S穿过楼梯踏步下楼（不会穿透实心楼板）；大厅与单机菜单的“成长实验室”可测试联机同源成长规则。
公文包争夺：大楼双方公文包位于四楼两端，抢到敌方公文包后只能使用副武器，带回一楼己方出生点得1分，先得3分获胜。携带者死亡或离场时公文包立即归位，每队只有一个公文包。
联机需要网络与可用的配套服务器；本包不附带服务器账号或管理信息。
端口占用时自动尝试其他端口。换端口后浏览器会使用另一份单机存档。
操作：A/D移动，W/空格跳跃，S蹲伏，鼠标射击，Q切枪，R换弹，E主动技能，G道具。
经典规则的隐匿为可装配被动技能，装备后站定5秒自动触发；成长规则的四干员使用各自专属技能。
音效与角色语音全部内置：首次点击或按键后启用。右下角“声音设置”可调整总音量、音效、语音、静音和中文字幕；设置保存在当前浏览器。
联机需要与此包内容版本一致的配套服务器。音频来源与许可见 licenses/Audio-Sources.txt 和 licenses/Kenney-CC0.txt。
'@
[IO.File]::WriteAllText((Join-Path $taskFolder 'README.txt'), $taskReadme, [Text.UTF8Encoding]::new($true))
$taskInventory = @(Get-ChildItem -LiteralPath $taskFolder -Recurse -File | Sort-Object FullName | ForEach-Object {
  [ordered]@{ path=$_.FullName.Substring($taskFolder.Length+1).Replace('\','/'); bytes=$_.Length; sha256=(Get-TaskFileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant() }
})
$taskReport = [ordered]@{ builtAt=(Get-Date).ToUniversalTime().ToString('o'); contentVersion=$taskManifest.contentVersion; platform='Windows x64'; runtime=$taskRuntime.version; entry='PLAY.cmd'; offlineEntry='SOLO.cmd'; files=$taskInventory }
$taskReport | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskFolder 'manifest.json') -Encoding UTF8
& $NodePath (Join-Path $PSScriptRoot 'verify-friends-package.mjs') $taskFolder
if ($LASTEXITCODE -ne 0) { throw 'Portable runtime smoke test failed' }
$taskZip = Join-Path $taskRelease "Project-Strike-Windows-$taskStamp.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($taskFolder, $taskZip, [IO.Compression.CompressionLevel]::Optimal, $true)
$taskArchive = [IO.Compression.ZipFile]::OpenRead($taskZip)
try {
  foreach ($taskFile in Get-ChildItem -LiteralPath $taskFolder -Recurse -File) {
    $taskRelative = 'Project-Strike-Windows/' + $taskFile.FullName.Substring($taskFolder.Length+1).Replace('\','/')
    $taskEntry = @($taskArchive.Entries | Where-Object { $_.FullName.Replace('\','/') -eq $taskRelative })
    if ($taskEntry.Count -ne 1) { throw "Missing ZIP entry: $taskRelative" }
    $taskStream = $taskEntry[0].Open(); $taskHasher = [Security.Cryptography.SHA256]::Create()
    try { $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-','') }
    finally { $taskStream.Dispose(); $taskHasher.Dispose() }
    if ($taskHash -ne (Get-TaskFileHash -LiteralPath $taskFile.FullName).Hash) { throw "ZIP checksum mismatch: $taskRelative" }
  }
} finally { $taskArchive.Dispose() }
$taskLatest = Join-Path $taskRoot 'artifacts/Project-Strike-Windows-latest.zip'
Copy-Item -LiteralPath $taskZip -Destination $taskLatest -Force
$taskReleaseReport = [ordered]@{ archive=$taskZip; latest=$taskLatest; contentVersion=$taskManifest.contentVersion; bytes=(Get-Item -LiteralPath $taskZip).Length; sha256=(Get-TaskFileHash -LiteralPath $taskZip).Hash.ToLowerInvariant(); filesVerified=$taskInventory.Count+1 }
$taskReleaseReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'artifacts/friends-latest.json') -Encoding UTF8
$taskReleaseReport | ConvertTo-Json
