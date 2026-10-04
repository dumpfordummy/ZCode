# Z8.4-I1 guest driver (Windows PowerShell 5.1, runs INSIDE the disposable guest only).
# Every step re-runs the isolation check first; an environment variable alone is never proof.
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('Preflight', 'Inventory', 'Install', 'Uninstall', 'Export')]
  [string]$Step,
  [string]$Label = 'unnamed',
  [ValidateSet('c3', 'z82')]
  [string]$Which = 'c3',
  [string]$Work = 'C:\i1',
  [string]$Export = 'C:\i1-export'
)
$ErrorActionPreference = 'Stop'
$null = New-Item -ItemType Directory -Force -Path (Join-Path $Work 'evidence'), (Join-Path $Work 'logs')

function Test-DisposableGuest {
  $checks = [ordered]@{}
  # Windows Sandbox always runs as WDAGUtilityAccount; a host profile directory must not exist.
  $checks.user = ($env:USERNAME -eq 'WDAGUtilityAccount')
  $checks.noHostProfiles = -not (Get-ChildItem C:\Users -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notin 'WDAGUtilityAccount', 'Public', 'Default', 'Default User', 'All Users' })
  $checks.mappedInputReadOnly = $false
  if (Test-Path 'C:\i1-input') {
    try { New-Item -ItemType File -Path 'C:\i1-input\.ro-probe' -ErrorAction Stop | Out-Null; Remove-Item 'C:\i1-input\.ro-probe' }
    catch { $checks.mappedInputReadOnly = $true }
  }
  $checks.noDefaultRoute = -not (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue)
  $reach = $false
  try { $reach = (Test-Connection -ComputerName 1.1.1.1 -Count 1 -Quiet -ErrorAction Stop) } catch { $reach = $false }
  $checks.noExternalConnectivity = -not $reach
  $checks.noRealProfileDirs = -not (Test-Path (Join-Path $env:USERPROFILE '.zcode-graph-engineering')) -or $Step -ne 'Preflight'
  [pscustomobject]@{
    ok = -not ($checks.Values -contains $false)
    checks = $checks
    os = (Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber)
    computer = $env:COMPUTERNAME
    user = $env:USERNAME
  }
}

$iso = Test-DisposableGuest
$iso | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $Work "evidence\isolation-$Label.json")
if (-not $iso.ok) { Write-Host 'Guest isolation check failed; refusing to continue.'; exit 90 }
if ($Step -eq 'Preflight') { $iso | ConvertTo-Json -Depth 6; exit 0 }

function Get-UninstallEntries {
  foreach ($hive in 'HKCU:', 'HKLM:') {
    $root = "$hive\Software\Microsoft\Windows\CurrentVersion\Uninstall"
    if (Test-Path $root) {
      Get-ChildItem $root | ForEach-Object {
        $p = Get-ItemProperty $_.PSPath
        if ($p.DisplayName -like 'ZCode*') {
          [pscustomobject]@{ hive = $hive; key = $_.PSChildName; displayName = $p.DisplayName; displayVersion = $p.DisplayVersion; uninstallString = $p.UninstallString; installLocation = $p.InstallLocation }
        }
      }
    }
  }
}

function Get-TreeHashes([string]$Path) {
  if (-not (Test-Path $Path)) { return @() }
  Get-ChildItem $Path -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
    [pscustomobject]@{
      path = $_.FullName.Substring($Path.Length).TrimStart('\')
      size = $_.Length
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    }
  }
}

function Get-Inventory {
  $install = Join-Path $env:LOCALAPPDATA 'Programs\ZCode Graph'
  $graphProfile = Join-Path $env:USERPROFILE '.zcode-graph-engineering'
  $ordinary = Join-Path $env:APPDATA 'ZCode'
  [ordered]@{
    label = $Label
    capturedUtc = (Get-Date).ToUniversalTime().ToString('o')
    uninstallEntries = @(Get-UninstallEntries)
    installDir = $install
    installFiles = @(Get-TreeHashes $install)
    graphProfileRoot = $graphProfile
    graphProfileFiles = @(Get-TreeHashes $graphProfile)
    graphAppData = @(Get-TreeHashes (Join-Path $env:APPDATA 'ZCode Graph'))
    ordinaryZCodeAppData = @(Get-TreeHashes $ordinary)
    shortcuts = @(Get-ChildItem -Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs", ([Environment]::GetFolderPath('Desktop')) -Filter '*ZCode*.lnk' -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object { $t = (New-Object -ComObject WScript.Shell).CreateShortcut($_.FullName).TargetPath; [pscustomobject]@{ path = $_.FullName; target = $t } })
    processes = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'ZCode*' -or $_.ProcessName -like 'zcode*' } | Select-Object ProcessName, Id, Path)
  }
}

switch ($Step) {
  'Inventory' {
    Get-Inventory | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $Work "evidence\inventory-$Label.json")
  }
  'Install' {
    $name = if ($Which -eq 'c3') { 'ZCode Graph-3.14.3-z8.303-win-x64.exe' } else { 'ZCode Graph-3.14.3-z8.2-win-x64.exe' }
    $exe = Join-Path $Work $name
    $expected = (Get-Content (Join-Path $Work 'SHA256SUMS.txt') | Where-Object { $_ -like "*$name" }).Split(' ')[0]
    if ((Get-FileHash -Algorithm SHA256 $exe).Hash.ToLowerInvariant() -ne $expected) { throw 'Installer hash mismatch in guest copy' }
    $log = Join-Path $Work "logs\install-$Label.log"
    # Interactive assisted installer: the operator makes the choices; they are recorded in the checklist.
    $p = Start-Process -FilePath $exe -ArgumentList "/LOG=$log" -Wait -PassThru
    [pscustomobject]@{ step = 'install'; which = $Which; exitCode = $p.ExitCode } | ConvertTo-Json | Set-Content (Join-Path $Work "evidence\install-exit-$Label.json")
  }
  'Uninstall' {
    $e = @(Get-UninstallEntries | Where-Object { $_.displayName -eq 'ZCode Graph' })
    if ($e.Count -ne 1) { throw "Expected exactly one ZCode Graph uninstall entry, found $($e.Count)" }
    # Run the registered uninstaller through its real UI path; do not pass --delete-app-data.
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList "/c $($e[0].uninstallString)" -Wait -PassThru
    [pscustomobject]@{ step = 'uninstall'; registeredCommand = $e[0].uninstallString; exitCode = $p.ExitCode } | ConvertTo-Json | Set-Content (Join-Path $Work "evidence\uninstall-exit-$Label.json")
  }
  'Export' {
    # Only reviewed, synthetic summaries leave the guest. Raw logs stay in the guest unless reviewed first.
    Copy-Item (Join-Path $Work 'evidence\*.json') $Export -Force
    Get-ChildItem $Export -Filter '*.json' | Get-FileHash -Algorithm SHA256 |
      ForEach-Object { "$($_.Hash.ToLowerInvariant())  $(Split-Path $_.Path -Leaf)" } | Set-Content (Join-Path $Export 'EXPORT-SHA256.txt')
  }
}
