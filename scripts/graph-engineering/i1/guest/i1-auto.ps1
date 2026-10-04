# Z8.4-I1 unattended guest driver (Windows PowerShell 5.1). Runs INSIDE the disposable Windows Sandbox guest only.
#   -Case Probe  platform check: isolation gate, baseline inventory, UI Automation availability
#   -Case A      clean install of Candidate 3, hash/ASAR checks, installed-app smoke, restart persistence, support bundle
#   -Case BC     z8.2 install + synthetic state, real upgrade to Candidate 3, then uninstall/retention/reinstall (one boot)
# Evidence is written under C:\i1-export\case-<Case> (path-sanitized, synthetic). The guest never touches the host.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Probe', 'A', 'BC')][string]$Case
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'i1-lib.ps1')
$script:OutDir = Join-Path $script:Export "case-$Case"
New-Item -ItemType Directory -Force -Path $script:OutDir, (Join-Path $script:Work 'evidence'), (Join-Path $script:Work 'logs') | Out-Null

try {
  Write-Log "i1-auto start case=$Case user=$env:USERNAME"
  Write-Log ('C:\Users entries: ' + ((Get-ChildItem C:\Users -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) -join ', '))
  $iso = Assert-Guest "start-$Case"
  Save-Evidence 'isolation-start.json' $iso
  Write-Log 'isolation gate passed'

  if ($Case -eq 'Probe') {
    Save-Evidence 'inventory-baseline.json' (Get-Inventory 'baseline')
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    Save-Evidence 'uia-probe.json' ([ordered]@{ rootName = $root.Current.Name; psVersion = $PSVersionTable.PSVersion.ToString(); osBuild = [Environment]::OSVersion.Version.ToString(); is64 = [Environment]::Is64BitProcess })
    Save-Screenshot 'probe'
    Write-Log 'probe complete'
  }
  if ($Case -eq 'A') {
    . (Join-Path $PSScriptRoot 'i1-ui.ps1')
    . (Join-Path $PSScriptRoot 'i1-flows.ps1')
    Save-Evidence 'inventory-baseline.json' (Get-Inventory 'A-baseline')
    $exit = Invoke-Install 'c3' 'A-install'
    Save-Evidence 'inventory-after-install.json' (Get-Inventory 'A-after-install')
    $real = Get-RealInstall
    Save-Evidence 'real-install.json' $real
    Write-Log "install dir (registry): $($real.installDir) ; default would be $($real.defaultDir)"
    if ($real.installDir) {
      Save-Evidence 'payload-compare.json' (Compare-Tree $real.installDir (Join-Path $script:Work 'expected\c3-unpacked-file-hashes.json'))
      Save-Evidence 'asar-check.json' (Invoke-AsarCheck $real.installDir)
      Save-Evidence 'launch-shortcut.json' (Start-FromShortcut 'A-launch')
      Write-Log ("graceful-close leftovers: " + (Stop-ZCodeGracefully 'A-launch'))
      $exe = Join-Path $real.installDir 'ZCode Graph.exe'
      # Representative acceptance on the installed copy (loopback only; no external traffic is possible in this guest).
      $tool = Invoke-Harness 'A-tool-support' $exe @('scripts\graph-engineering\w1-native.mjs', '--case=tool-only-support')
      $bundle = @((Join-Path $env:USERPROFILE '.zcode-graph-engineering\home\Desktop\zcode-graph-support-bundle.json'), (Join-Path $env:USERPROFILE 'Documents\w1-support-bundle.json')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
      if ($bundle) { Copy-Evidence $bundle 'support-bundle-A.json' }
      $chat = Invoke-Harness 'A-chat-n1' $exe @('scripts\graph-engineering\w1-native.mjs', '--case=n1')
      $review = Invoke-Harness 'A-workflow-reviewer' $exe @('scripts\graph-engineering\reviewer-native.mjs', '--scenario=pass')
      Save-Evidence 'inventory-after-smoke.json' (Get-Inventory 'A-after-smoke')
      # Restart persistence: open the installed app again on the same profile for each workspace that holds a run.
      foreach ($w in @(@{ n = 'tool'; r = $tool }, @{ n = 'review'; r = $review })) {
        $home_ = $w.r.result.home
        if ($home_) {
          [void](Invoke-Inspect "A-$($w.n)" $exe (Join-Path $home_ 'workspace') 1)
          Copy-Evidence (Join-Path $script:Work "logs\inspect-A-$($w.n).json") "persistence-A-$($w.n).json"
        }
      }
    }
  }
  if ($Case -eq 'BC') {
    . (Join-Path $PSScriptRoot 'i1-ui.ps1')
    . (Join-Path $PSScriptRoot 'i1-flows.ps1')
    $harness = 'scripts\graph-engineering'
    # ---------------- CASE B: z8.2 install, synthetic state, real upgrade to Candidate 3 ----------------
    Save-Evidence 'B-inventory-baseline.json' (Get-Inventory 'B-baseline')
    [void](Invoke-Install 'z82' 'B-install-z82')
    $r82 = Get-RealInstall
    Save-Evidence 'B-real-install-z82.json' $r82
    $dir = $r82.installDir
    Write-Log "z8.2 install dir: $dir"
    Save-Evidence 'B-payload-compare-z82.json' (Compare-Tree $dir (Join-Path $script:Work 'expected\z82c-unpacked-file-hashes.json'))
    $exe = Join-Path $dir 'ZCode Graph.exe'
    # Synthetic Graph state made by the z8.2 app itself: a saved Tool-only workflow with a completed run, and the reviewer
    # workflow (library template instantiated, run left at final human approval).
    $seedTool = Invoke-Harness 'B-seed-tool' $exe @("$harness\i1-seed-tool.mjs")
    $seedReview = Invoke-Harness 'B-seed-review' $exe @("$harness\reviewer-native.mjs", '--scenario=pass')
    $seedLib = Invoke-Harness 'B-seed-library' $exe @("$harness\i1-seed-library.mjs")
    [void](Stop-AllZCode 'B-seeded')
    $settingsEdit = Edit-SettingsForRetention
    Save-Evidence 'B-settings-probe.json' $settingsEdit
    Write-Log ("settings probes written: " + ($settingsEdit | ConvertTo-Json -Compress))
    $sentinels = New-Sentinels $dir
    $pre = [ordered]@{
      profile = Get-ProfileSnapshot
      sentinels = Get-SentinelState $sentinels
      installTree = @(Get-FileHashes $dir)
      identity = Get-IdentitySnapshot
    }
    Save-Evidence 'B-pre-upgrade.json' $pre
    # The upgrade: the real Candidate 3 installer over the installed z8.2.
    $upExit = Invoke-Install 'c3' 'B-upgrade-c3'
    Copy-Evidence (Join-Path $env:TEMP 'ZCode-uninstaller.log') 'B-old-uninstaller-log.txt'
    $r3 = Get-RealInstall
    Save-Evidence 'B-real-install-after-upgrade.json' $r3
    Save-Evidence 'B-payload-compare-after-upgrade.json' (Compare-Tree $r3.installDir (Join-Path $script:Work 'expected\c3-unpacked-file-hashes.json'))
    Save-Evidence 'B-asar-check-after-upgrade.json' (Invoke-AsarCheck $r3.installDir)
    Save-Evidence 'B-post-upgrade.json' ([ordered]@{ profile = Get-ProfileSnapshot; sentinels = Get-SentinelState $sentinels; identity = Get-IdentitySnapshot })
    $exe = Join-Path $r3.installDir 'ZCode Graph.exe'
    # z8.2 data read by Candidate 3 (no profile rewrite by the harness), then a NEW workflow, then restart.
    [void](Invoke-Inspect 'B-after-upgrade-tool' $exe (Join-Path $seedTool.result.home 'workspace') 1)
    Copy-Evidence (Join-Path $script:Work 'logs\inspect-B-after-upgrade-tool.json') 'B-persistence-tool-after-upgrade.json'
    [void](Invoke-Inspect 'B-after-upgrade-library' $exe (Join-Path $seedLib.result.home 'workspace') 0)
    Copy-Evidence (Join-Path $script:Work 'logs\inspect-B-after-upgrade-library.json') 'B-persistence-library-after-upgrade.json'
    [void](Invoke-Inspect 'B-after-upgrade-review' $exe (Join-Path $seedReview.result.home 'workspace') 1)
    Copy-Evidence (Join-Path $script:Work 'logs\inspect-B-after-upgrade-review.json') 'B-persistence-review-after-upgrade.json'
    $newTool = Invoke-Harness 'B-new-workflow' $exe @("$harness\i1-seed-tool.mjs") -Preserve
    Save-Evidence 'B-post-new-workflow.json' ([ordered]@{ profile = Get-ProfileSnapshot })
    [void](Invoke-Inspect 'B-restart-new' $exe (Join-Path $newTool.result.home 'workspace') 1)
    Copy-Evidence (Join-Path $script:Work 'logs\inspect-B-restart-new.json') 'B-persistence-new-after-restart.json'
    [void](Invoke-Inspect 'B-restart-old' $exe (Join-Path $seedReview.result.home 'workspace') 1)
    Copy-Evidence (Join-Path $script:Work 'logs\inspect-B-restart-old.json') 'B-persistence-review-after-restart.json'

    # ---------------- CASE C: uninstall (no --delete-app-data), retention, reinstall ----------------
    [void](Stop-AllZCode 'C-before-uninstall')
    $preC = [ordered]@{ profile = Get-ProfileSnapshot; sentinels = Get-SentinelState $sentinels; installTree = @(Get-FileHashes $r3.installDir); identity = Get-IdentitySnapshot }
    Save-Evidence 'C-pre-uninstall.json' $preC
    [void](Invoke-Uninstall 'C-uninstall')
    Save-Evidence 'C-post-uninstall.json' ([ordered]@{
        installDirExists = (Test-Path -LiteralPath $r3.installDir)
        installDirRemainingFiles = @(Get-FileHashes $r3.installDir)
        profile = Get-ProfileSnapshot
        sentinels = Get-SentinelState $sentinels
        identity = Get-IdentitySnapshot
        graphProcesses = @(Get-ZCodeProcesses)
      })
    # Reinstall once, then read the retained data with the reinstalled app.
    [void](Invoke-Install 'c3' 'C-reinstall-c3')
    $rr = Get-RealInstall
    Save-Evidence 'C-real-install-after-reinstall.json' $rr
    Save-Evidence 'C-payload-compare-after-reinstall.json' (Compare-Tree $rr.installDir (Join-Path $script:Work 'expected\c3-unpacked-file-hashes.json'))
    Save-Evidence 'C-post-reinstall.json' ([ordered]@{ profile = Get-ProfileSnapshot; sentinels = Get-SentinelState $sentinels; identity = Get-IdentitySnapshot })
    $exe = Join-Path $rr.installDir 'ZCode Graph.exe'
    [void](Invoke-Inspect 'C-after-reinstall-tool' $exe (Join-Path $seedTool.result.home 'workspace') 1)
    Copy-Evidence (Join-Path $script:Work 'logs\inspect-C-after-reinstall-tool.json') 'C-persistence-tool-after-reinstall.json'
    [void](Invoke-Inspect 'C-after-reinstall-review' $exe (Join-Path $seedReview.result.home 'workspace') 1)
    Copy-Evidence (Join-Path $script:Work 'logs\inspect-C-after-reinstall-review.json') 'C-persistence-review-after-reinstall.json'
    [void](Invoke-Inspect 'C-after-reinstall-library' $exe (Join-Path $seedLib.result.home 'workspace') 0)
    Copy-Evidence (Join-Path $script:Work 'logs\inspect-C-after-reinstall-library.json') 'C-persistence-library-after-reinstall.json'
    [void](Invoke-Inspect 'C-after-reinstall-new' $exe (Join-Path $newTool.result.home 'workspace') 1)
    Copy-Evidence (Join-Path $script:Work 'logs\inspect-C-after-reinstall-new.json') 'C-persistence-new-after-reinstall.json'

    # Ordinary ZCode coexistence: only with a trustworthy installer staged under C:\i1-input\ordinary (none was provided).
    $ordinary = @(Get-ChildItem (Join-Path $script:Work 'ordinary') -Filter '*.exe' -ErrorAction SilentlyContinue)
    Save-Evidence 'C-coexistence.json' ([ordered]@{ ordinaryInstallerStaged = ($ordinary.Count -gt 0); status = $(if ($ordinary.Count) { 'installer present; not exercised by this driver' } else { 'UNVERIFIED: no ordinary-ZCode installer staged' }); identity = Get-IdentitySnapshot })
  }
  Set-Content -LiteralPath (Join-Path $script:OutDir 'DONE') -Value 'ok'
} catch {
  Write-Log "FATAL: $($_.Exception.Message)"
  Set-Content -LiteralPath (Join-Path $script:OutDir 'FAILED') -Value (Protect-Text ($_ | Out-String))
}
# End the disposable guest so the host can start the next instance cleanly (it is discarded either way).
Write-Log 'shutting the guest down'
Start-Sleep -Seconds 3
shutdown.exe /s /t 2
