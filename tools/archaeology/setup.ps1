param([ValidateSet('all', 'ffdec', 'java', 'ruffle')][string]$Component = 'all')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$strikeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$vendorRoot = Join-Path $strikeRoot 'tools/vendor'
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'toolchain.json') -Raw | ConvertFrom-Json
$names = if ($Component -eq 'all') { @('ffdec', 'java', 'ruffle') } else { @($Component) }
New-Item -ItemType Directory -Path $vendorRoot -Force | Out-Null
foreach ($name in $names) {
    $tool = $manifest.$name
    $archive = Join-Path $vendorRoot "$name.zip"
    $destination = Join-Path $vendorRoot $name
    if (!(Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $tool.sha256) {
        Write-Host "Downloading $name $($tool.version) from official release..."
        Invoke-WebRequest -UseBasicParsing -Uri $tool.url -OutFile $archive
    }
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $tool.sha256) { throw "Checksum mismatch for $name. Expected $($tool.sha256), got $actual. Archive was NOT executed." }
    Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
    Write-Host "$name ready: $destination (SHA256 verified). No global installation or PATH modification."
}
