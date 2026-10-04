# Z8.4-I1 host-side staging. Copies and hash-verifies the two installers into a dedicated
# staging folder and writes a locked-down Windows Sandbox config. It NEVER runs an installer
# and NEVER launches the Sandbox; launching is a separate, explicit step once the feature exists.
[CmdletBinding()]
param(
  [string]$StagingRoot = 'C:\Users\USER\Desktop\Personal\ZCode-i1-staging',
  [string]$W1Worktree = 'C:\Users\USER\Desktop\Personal\ZCode\.claude\worktrees\z8-3-w1-windows-validation-21dcde',
  [string]$AuditWorktree = 'C:\Users\USER\Desktop\Personal\ZCode\.claude\worktrees\z8-release-delta-audit-d7525f',
  [string]$GuestScripts = (Join-Path $PSScriptRoot 'guest')
)
$ErrorActionPreference = 'Stop'

$c3 = @{
  Name = 'ZCode Graph-3.14.3-z8.303-win-x64.exe'
  Path = Join-Path $W1Worktree 'packages\desktop\dist-graph-w3\ZCode Graph-3.14.3-z8.303-win-x64.exe'
  Sha256 = '7c42e4b5a0ba20a01f70620830e5d8ad5af8c823b09de904016bb106a78c6386'
}
$z82 = @{
  Name = 'ZCode Graph-3.14.3-z8.2-win-x64.exe'
  Path = Join-Path $AuditWorktree 'packages\desktop\dist-graph-z82c\ZCode Graph-3.14.3-z8.2-win-x64.exe'
  Sha256 = '90d75fb022d06e2adadff428872188fb151f337aa763737f91c9cf2252cf413b'
}

$input = Join-Path $StagingRoot 'input'
$evidence = Join-Path $StagingRoot 'evidence-export'
New-Item -ItemType Directory -Force -Path $input, $evidence | Out-Null
if (Get-ChildItem $evidence -Force | Select-Object -First 1) {
  throw "Evidence-export folder must start empty: $evidence"
}

$lines = @()
foreach ($a in $c3, $z82) {
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $a.Path).Hash.ToLowerInvariant()
  if ($actual -ne $a.Sha256) { throw "Hash mismatch for $($a.Name): $actual" }
  Copy-Item -LiteralPath $a.Path -Destination (Join-Path $input $a.Name) -Force
  $copied = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $input $a.Name)).Hash.ToLowerInvariant()
  if ($copied -ne $a.Sha256) { throw "Copy hash mismatch for $($a.Name)" }
  $lines += "$copied  $($a.Name)"
}
Copy-Item -Path (Join-Path $GuestScripts '*.ps1') -Destination $input -Force
$lines | Set-Content -Encoding ASCII (Join-Path $input 'SHA256SUMS.txt')

# Windows Sandbox config: no network, no clipboard/audio/video/printer, no vGPU.
# Only `input` (read-only) and the empty `evidence-export` (writable) are mapped.
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
    <Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -Command "Copy-Item C:\i1-input C:\i1 -Recurse -Force; Set-Location C:\i1; .\i1-guest.ps1 -Step Preflight"</Command>
  </LogonCommand>
</Configuration>
"@
$wsbPath = Join-Path $StagingRoot 'z8-4-i1.wsb'
$wsb | Set-Content -Encoding UTF8 $wsbPath
Write-Output "Staged: $input"
Write-Output "Evidence export (empty, writable from guest): $evidence"
Write-Output "Sandbox config (not launched): $wsbPath"
$lines
