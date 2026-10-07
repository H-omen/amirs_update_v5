# Portable runtime bootstrap for Windows Server 2012+
# Python lives only under runtime\python — nothing installed system-wide.
$ErrorActionPreference = 'Stop'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $Root

$PyVer = '3.11.9'
$RuntimeDir = Join-Path $Root 'runtime'
$PyDir = Join-Path $RuntimeDir 'python'
$PyZip = Join-Path $RuntimeDir 'python-embed.zip'
$GetPip = Join-Path $RuntimeDir 'get-pip.py'
$PyUrl = "https://www.python.org/ftp/python/$PyVer/python-$PyVer-embed-amd64.zip"
$PipUrl = 'https://bootstrap.pypa.io/get-pip.py'
$Req = Join-Path $Root 'backend\requirements.txt'
$StaticIndex = Join-Path $Root 'backend\static\index.html'

Write-Host '=== Portable runtime setup ==='
Write-Host "Root: $Root"
Write-Host ''

if (-not (Test-Path $StaticIndex)) {
    Write-Host '[ERROR] backend\static\index.html not found.'
    Write-Host 'Build UI first: cd frontend && npm install && npm run build'
    exit 1
}

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'backend\data') | Out-Null

function Get-File([string]$Url, [string]$OutFile) {
    if (Test-Path $OutFile) { return }
    Write-Host "Downloading $Url"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
    } catch {
        Write-Host "[ERROR] Download failed: $Url"
        Write-Host 'Put the file manually and re-run:'
        Write-Host "  $OutFile"
        throw
    }
}

if (-not (Test-Path (Join-Path $PyDir 'python.exe'))) {
    Get-File $PyUrl $PyZip
    Write-Host "Extracting to $PyDir"
    if (Test-Path $PyDir) { Remove-Item -Recurse -Force $PyDir }
    New-Item -ItemType Directory -Force -Path $PyDir | Out-Null
    # Expand-Archive needs PS4+ / .NET; fallback for older hosts
    try {
        Expand-Archive -LiteralPath $PyZip -DestinationPath $PyDir -Force
    } catch {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($PyZip, $PyDir)
    }
}

# Enable site-packages in embeddable python*._pth
Get-ChildItem -Path $PyDir -Filter 'python*._pth' | ForEach-Object {
    Write-Host "Patching $($_.Name)"
    $lines = Get-Content -LiteralPath $_.FullName
    $out = @()
    foreach ($line in $lines) {
        if ($line -match '^\s*#\s*import site') {
            $out += 'import site'
        } else {
            $out += $line
        }
    }
    if ($out -notcontains 'Lib\site-packages' -and $out -notcontains 'Lib/site-packages') {
        $out += 'Lib\site-packages'
    }
    Set-Content -LiteralPath $_.FullName -Value $out -Encoding ASCII
}

$Python = Join-Path $PyDir 'python.exe'
$PipOk = Test-Path (Join-Path $PyDir 'Scripts\pip.exe')
if (-not $PipOk) {
    # pip may live as module after get-pip
    $hasPip = $false
    try {
        & $Python -m pip --version | Out-Null
        if ($LASTEXITCODE -eq 0) { $hasPip = $true }
    } catch { $hasPip = $false }

    if (-not $hasPip) {
        Get-File $PipUrl $GetPip
        Write-Host 'Installing pip...'
        & $Python $GetPip --no-warn-script-location
        if ($LASTEXITCODE -ne 0) { throw 'get-pip failed' }
    }
}

Write-Host 'Installing app requirements...'
& $Python -m pip install --no-warn-script-location -r $Req
if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }

Write-Host ''
Write-Host '=== Done ==='
Write-Host "Python: $PyDir"
Write-Host 'Start:  deploy\portable\start.bat'
Write-Host 'Service: deploy\portable\install-service.bat'
Write-Host 'Copy the whole project folder to another offline server if needed.'
