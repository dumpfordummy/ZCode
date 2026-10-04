# Z8.4-I1 host-side runner. Refreshes the staged guest scripts, writes a per-case Sandbox config with the SAME
# restrictions as the staged z8-4-i1.wsb (no network/clipboard/audio/video/printer/vGPU; input read-only; one writable
# evidence-export mapping; nothing else), launches the Sandbox for one case, and waits for the guest's DONE/FAILED marker.
# It never runs an installer or an installed app on the host.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Probe', 'A', 'BC')][string]$Case,
  [string]$StagingRoot = 'C:\Users\USER\Desktop\Personal\ZCode-i1-staging',
  [int]$TimeoutMinutes = 60,
  [switch]$NoLaunch
)
$ErrorActionPreference = 'Stop'
$input = Join-Path $StagingRoot 'input'
$evidence = Join-Path $StagingRoot 'evidence-export'
if (-not (Test-Path 'C:\Windows\System32\WindowsSandbox.exe')) { throw 'WindowsSandbox.exe is missing' }
# Only one instance can run, and a finished one needs time to tear down; never force-kill it (that wedges the next start).
$sandboxNames = 'WindowsSandbox', 'WindowsSandboxClient', 'WindowsSandboxRemoteSession', 'WindowsSandboxServer'
$waitUntil = (Get-Date).AddMinutes(3)
while ((Get-Process -Name $sandboxNames -ErrorAction SilentlyContinue) -and (Get-Date) -lt $waitUntil) { Start-Sleep -Seconds 3 }
if (Get-Process -Name $sandboxNames -ErrorAction SilentlyContinue) { throw 'A Windows Sandbox instance is still running; only one can run at a time.' }

# Refresh guest scripts (they are the only files that change between runs); installers/tools are staged separately.
Copy-Item -Path (Join-Path $PSScriptRoot 'guest\*') -Include '*.ps1', '*.mjs' -Destination $input -Force

# Rotate previous evidence out of the writable mapping so each run starts empty (kept on the host, outside both mappings).
if (Get-ChildItem $evidence -Force | Select-Object -First 1) {
  $archive = Join-Path $StagingRoot ('archive\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $archive | Out-Null
  Get-ChildItem $evidence -Force | Move-Item -Destination $archive
}

# The Git for Windows tree (thousands of files) is used in place from the read-only mapping, not copied.
$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command `"robocopy C:\i1-input C:\i1 /E /XD git /NFL /NDL /NJH /NJS /NP | Out-Null; Set-Location C:\i1; .\i1-auto.ps1 -Case $Case *>> C:\i1-export\logon-$Case.out`""
$wsb = @"
<Configuration>
  <VGpu>Disable</VGpu>
  <Networking>Disable</Networking>
  <AudioInput>Disable</AudioInput>
  <VideoInput>Disable</VideoInput>
  <PrinterRedirection>Disable</PrinterRedirection>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <ProtectedClient>Enable</ProtectedClient>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$input</HostFolder>
      <SandboxFolder>C:\i1-input</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$evidence</HostFolder>
      <SandboxFolder>C:\i1-export</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>$([System.Security.SecurityElement]::Escape($command))</Command>
  </LogonCommand>
</Configuration>
"@
$wsbPath = Join-Path $StagingRoot "z8-4-i1-case-$Case.wsb"
$wsb | Set-Content -Encoding UTF8 $wsbPath
"wsb: $wsbPath"
if ($NoLaunch) { return }

Start-Process -FilePath $wsbPath
$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
$caseDir = Join-Path $evidence "case-$Case"
$seen = 0
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 5
  $log = Join-Path $caseDir 'progress.log'
  if (Test-Path $log) {
    $lines = @(Get-Content $log)
    if ($lines.Count -gt $seen) { $lines[$seen..($lines.Count - 1)] | ForEach-Object { $_ }; $seen = $lines.Count }
  }
  if ((Test-Path (Join-Path $caseDir 'DONE')) -or (Test-Path (Join-Path $caseDir 'FAILED'))) { break }
}
if (Test-Path (Join-Path $caseDir 'DONE')) { 'RESULT: DONE' }
elseif (Test-Path (Join-Path $caseDir 'FAILED')) { 'RESULT: FAILED'; Get-Content (Join-Path $caseDir 'FAILED') }
else { 'RESULT: TIMEOUT (sandbox left running)' }
