# Z8.4-I1 host-side tool staging (idempotent). Adds, next to the already staged installers in the read-only `input`
# mapping: the pinned Node.js runtime, the existing native acceptance harness (+ playwright-core, nothing else), and the
# expected-payload hash manifests of the two builds. Records a manifest so the report can cite exactly what ran in the guest.
# It never launches the Sandbox, an installer or an installed app.
[CmdletBinding()]
param(
  [string]$StagingRoot = 'C:\Users\USER\Desktop\Personal\ZCode-i1-staging',
  [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,
  [string]$GitDir = 'C:\Program Files\Git',
  [string]$NodeDir = 'C:\Users\USER\Desktop\Personal\ZCode\.tmp\z1-toolchain\node-v24.14.0-win-x64',
  [string]$W1Worktree = 'C:\Users\USER\Desktop\Personal\ZCode\.claude\worktrees\z8-3-w1-windows-validation-21dcde',
  [string]$AuditWorktree = 'C:\Users\USER\Desktop\Personal\ZCode\.claude\worktrees\z8-release-delta-audit-d7525f'
)
$ErrorActionPreference = 'Stop'
$input = Join-Path $StagingRoot 'input'
if (-not (Test-Path $input)) { throw "Staging input missing: $input" }

# Node runtime (single binary; the harness needs node:sqlite, so 24.x as pinned by mise.toml).
$nodeOut = Join-Path $input 'tools\node'
New-Item -ItemType Directory -Force -Path $nodeOut | Out-Null
Copy-Item -LiteralPath (Join-Path $NodeDir 'node.exe') -Destination $nodeOut -Force
$nodeVersion = & (Join-Path $nodeOut 'node.exe') --version

# Git for Windows (the Graph runtime shells out to git; a fresh guest has none). Copied unchanged from the host install.
$gitSrc = $GitDir
if (-not (Test-Path (Join-Path $gitSrc 'cmd\git.exe'))) { throw "Not a Git for Windows root (no cmd\git.exe): $gitSrc" }
$gitOut = Join-Path $input 'tools\git'
robocopy $gitSrc $gitOut /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy of Git failed ($LASTEXITCODE)" }
$gitVersion = & (Join-Path $gitOut 'cmd\git.exe') --version

# Harness: only the scripts folder, graph-profile.mjs and playwright-core (the single bare-package dependency).
$h = Join-Path $input 'harness'
if (Test-Path $h) { Remove-Item -LiteralPath $h -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $h 'scripts\graph-engineering'), (Join-Path $h 'packages\desktop\scripts'), (Join-Path $h 'node_modules') | Out-Null
Get-ChildItem -LiteralPath (Join-Path $Repo 'scripts\graph-engineering') -File | Copy-Item -Destination (Join-Path $h 'scripts\graph-engineering') -Force
Copy-Item -LiteralPath (Join-Path $Repo 'packages\desktop\scripts\graph-profile.mjs') -Destination (Join-Path $h 'packages\desktop\scripts') -Force
Copy-Item -LiteralPath (Join-Path $Repo 'node_modules\playwright-core') -Destination (Join-Path $h 'node_modules\playwright-core') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $Repo 'scripts\graph-engineering\i1\guest\i1-asar-check.mjs') -Destination $input -Force

# Expected payload hashes of the two builds under test (from their own packaging records).
$exp = Join-Path $input 'expected'
New-Item -ItemType Directory -Force -Path $exp | Out-Null
Copy-Item (Join-Path $W1Worktree 'packages\desktop\dist-graph-w3\unpacked-file-hashes.json') (Join-Path $exp 'c3-unpacked-file-hashes.json') -Force
Copy-Item (Join-Path $W1Worktree 'packages\desktop\dist-graph-w3\RELEASE_MANIFEST.json') (Join-Path $exp 'c3-RELEASE_MANIFEST.json') -Force
Copy-Item (Join-Path $AuditWorktree 'packages\desktop\dist-graph-z82c\unpacked-file-hashes.json') (Join-Path $exp 'z82c-unpacked-file-hashes.json') -Force
Copy-Item (Join-Path $AuditWorktree 'packages\desktop\dist-graph-z82c\RELEASE_MANIFEST.json') (Join-Path $exp 'z82c-RELEASE_MANIFEST.json') -Force

# Manifest of what was staged (harness digest = SHA-256 over the sorted per-file hashes, excluding playwright-core).
$files = Get-ChildItem -LiteralPath $h -Recurse -File | Where-Object { $_.FullName -notlike '*\node_modules\*' } | Sort-Object FullName
$digestInput = ($files | ForEach-Object { '{0}:{1}' -f $_.FullName.Substring($h.Length), (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLowerInvariant() }) -join "`n"
$sha = [System.Security.Cryptography.SHA256]::Create()
$harnessDigest = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($digestInput)) | ForEach-Object { $_.ToString('x2') })
[ordered]@{
  nodeVersion = $nodeVersion
  gitVersion = $gitVersion
  gitExeSha256 = (Get-FileHash -Algorithm SHA256 (Join-Path $gitOut 'cmd\git.exe')).Hash.ToLowerInvariant()
  nodeSha256 = (Get-FileHash -Algorithm SHA256 (Join-Path $nodeOut 'node.exe')).Hash.ToLowerInvariant()
  harnessFileCount = $files.Count
  harnessDigestSha256 = $harnessDigest
  playwrightCoreVersion = (Get-Content (Join-Path $h 'node_modules\playwright-core\package.json') -Raw | ConvertFrom-Json).version
  repoHead = (git -C $Repo rev-parse HEAD)
  repoDirty = [bool](git -C $Repo status --porcelain)
} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $input 'TOOLS-MANIFEST.json')
Get-Content (Join-Path $input 'TOOLS-MANIFEST.json')
