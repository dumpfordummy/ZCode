# Z8.4-I1 guest flows (Windows PowerShell 5.1, INSIDE the disposable guest only). Dot-sourced after i1-lib.ps1/i1-ui.ps1.

$script:Node = 'C:\i1\tools\node\node.exe'

# Run the reviewed i1-guest.ps1 Install step (hash-verified guest copy of the installer, real assisted wizard) while the
# wizard driver clicks through it. The installer log is the installer's own /LOG= file.
function Invoke-Install([string]$Which, [string]$Label) {
  Write-Log "[$Label] installing $Which"
  $p = Start-Process -FilePath powershell.exe -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $script:Work 'i1-guest.ps1'), '-Step', 'Install', '-Which', $Which, '-Label', $Label)
  $wizard = Invoke-Wizard $Label { $p.Refresh(); $p.HasExited } 900
  if (-not $p.HasExited) { Write-Log "[$Label] installer did not finish in time"; Save-Screenshot "$Label-timeout" }
  $exitFile = Join-Path $script:Work "evidence\install-exit-$Label.json"
  $exit = if (Test-Path $exitFile) { Get-Content $exitFile -Raw | ConvertFrom-Json } else { $null }
  $log = Join-Path $script:Work "logs\install-$Label.log"
  Copy-Evidence $log "installer-log-$Label.txt"
  Save-Evidence "install-$Label.json" ([ordered]@{ which = $Which; exit = $exit; wizardCompleted = $wizard.completed; choices = $wizard.choices; pages = $wizard.pages })
  Write-Log ("[$Label] install exit: " + $(if ($exit) { $exit.exitCode } else { 'unknown' }))
  return $exit
}

# The real install directory and uninstall registration, read from the registry (never assumed).
function Get-RealInstall {
  $entries = @(Get-UninstallEntries | Where-Object { $_.displayName -like 'ZCode Graph*' })
  $dir = $null
  if ($entries.Count -eq 1) {
    $dir = $entries[0].installLocation
    if (-not $dir -and $entries[0].uninstallString) { $dir = Split-Path (($entries[0].uninstallString -replace '^"([^"]+)".*$', '$1')) -Parent }
  }
  [pscustomobject]@{ entries = $entries; installDir = $dir; defaultDir = (Join-Path $env:LOCALAPPDATA 'Programs\ZCode Graph') }
}

# Compare an installed tree with the build's own unpacked-file-hashes record.
function Compare-Tree([string]$Dir, [string]$ExpectedFile) {
  $expected = (Get-Content $ExpectedFile -Raw | ConvertFrom-Json).files
  $exp = @{}
  foreach ($n in $expected.PSObject.Properties) { $exp[$n.Name.Replace('/', '\')] = $n.Value.sha256 }
  $actual = @{}
  foreach ($f in (Get-FileHashes $Dir)) { $actual[$f.path] = $f.sha256 }
  $missing = @($exp.Keys | Where-Object { -not $actual.ContainsKey($_) })
  $extra = @($actual.Keys | Where-Object { -not $exp.ContainsKey($_) })
  $mismatch = @($exp.Keys | Where-Object { $actual.ContainsKey($_) -and $actual[$_] -ne $exp[$_] })
  $key = 'ZCode Graph.exe', 'resources\app.asar', 'resources\glm\zcode.cjs', 'resources\graph-build-identity.json'
  [ordered]@{
    expectedCount = $exp.Count; installedCount = $actual.Count
    missing = $missing; extra = $extra; mismatch = $mismatch
    keyFiles = @($key | ForEach-Object { [ordered]@{ file = $_; installed = $actual[$_]; expected = $exp[$_]; equal = ($actual[$_] -eq $exp[$_]) } })
  }
}

function Invoke-AsarCheck([string]$Dir) {
  $raw = & $script:Node (Join-Path $script:Work 'i1-asar-check.mjs') $Dir
  return ($raw -join "`n" | ConvertFrom-Json)
}

# Launch the installed app through the real Start Menu shortcut (the way a user would) and observe it.
function Start-FromShortcut([string]$Label) {
  $lnk = @(Get-ShortcutInfo | Where-Object { $_.path -like '*Programs*' -and $_.path -notlike '*Desktop*' }) | Select-Object -First 1
  if (-not $lnk) { $lnk = @(Get-ShortcutInfo) | Select-Object -First 1 }
  if (-not $lnk) { return [ordered]@{ launched = $false; reason = 'no shortcut found' } }
  Write-Log "[$Label] launching via shortcut"
  Start-Process -FilePath $lnk.path
  $deadline = (Get-Date).AddSeconds(90)
  $main = $null
  while ((Get-Date) -lt $deadline -and -not $main) {
    Start-Sleep -Seconds 2
    $main = Get-Process -Name 'ZCode Graph' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  }
  Start-Sleep -Seconds 5
  Save-Screenshot "$Label-launched"
  $procs = @(Get-CimInstance Win32_Process -Filter "Name like 'ZCode%'" | Select-Object ProcessId, Name, ExecutablePath, CommandLine)
  $info = [ordered]@{
    launched = [bool]$main
    shortcut = $lnk.path; shortcutTarget = $lnk.target
    mainWindowTitle = if ($main) { $main.MainWindowTitle } else { $null }
    processCount = $procs.Count
    executablePaths = @($procs | ForEach-Object { $_.ExecutablePath } | Sort-Object -Unique)
    referencesStagingOrCheckout = [bool]($procs | Where-Object { $_.CommandLine -match 'i1-input|\\i1\\|harness|checkout' })
  }
  return $info
}

function Stop-ZCodeGracefully([string]$Label) {
  foreach ($p in @(Get-Process -Name 'ZCode Graph' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })) { [void]$p.CloseMainWindow() }
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline -and (Get-ZCodeProcesses).Count -gt 0) { Start-Sleep -Seconds 1 }
  $left = @(Get-ZCodeProcesses)
  if ($left.Count) { Write-Log "[$Label] $($left.Count) ZCode process(es) outlived a graceful close"; $left | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } }
  return $left.Count
}

# Run one of the existing native acceptance scripts against the INSTALLED exe on the guest's real profile
# (Z1_INSTALLED_PROFILE=1; isolation.mjs refuses that mode outside this guest). The loopback fixture lives in the node
# process; the app is pointed at it through the harness's explicit endpoint overrides, as in the earlier packaged runs.
function Invoke-Harness([string]$Label, [string]$Exe, [string[]]$ScriptAndArgs, [int]$TimeoutSec = 480, [switch]$Preserve) {
  Write-Log "[$Label] harness: $($ScriptAndArgs -join ' ')"
  $out = Join-Path $script:Work "logs\$Label.out"
  $err = Join-Path $script:Work "logs\$Label.err"
  $env:Z1_PACKAGED_EXE = $Exe
  $env:Z1_INSTALLED_PROFILE = '1'
  # -Preserve: do not rewrite the profile's settings/provider files (read-only use of an existing profile).
  if ($Preserve) { $env:Z1_PRESERVE_PROFILE = '1' }
  # node for the Tool recipes, git for the Graph runtime (a fresh Sandbox has neither); both are read-only staged tools.
  $env:Path = (Split-Path $script:Node -Parent) + ';C:\i1-input\tools\git\cmd;' + $env:Path
  try {
    $p = Start-Process -FilePath $script:Node -ArgumentList $ScriptAndArgs -WorkingDirectory (Join-Path $script:Work 'harness') -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
    if (-not $p.WaitForExit($TimeoutSec * 1000)) {
      Write-Log "[$Label] harness timed out"
      Save-Screenshot "$Label-timeout"
      Write-Log "[$Label] dialog text at timeout: $(Get-DialogText)"
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
  } finally {
    Remove-Item Env:Z1_PACKAGED_EXE, Env:Z1_INSTALLED_PROFILE, Env:Z1_PRESERVE_PROFILE -ErrorAction SilentlyContinue
  }
  $exit = if ($p.HasExited) { $p.ExitCode } else { -1 }
  [void](Stop-AllZCode $Label)
  Copy-Evidence $out "harness-$Label.json"
  if ((Get-Item $err -ErrorAction SilentlyContinue).Length -gt 0) { Copy-Evidence $err "harness-$Label.stderr.txt" }
  $parsed = $null
  try { $parsed = (Get-Content $out -Raw) | ConvertFrom-Json } catch { }
  Write-Log "[$Label] harness exit=$exit status=$(if ($parsed) { $parsed.status } else { 'unparsed' })"
  return [pscustomobject]@{ exitCode = $exit; result = $parsed }
}

# Re-open the installed app on the existing profile and report what Graph shows/stores for one workspace.
function Invoke-Inspect([string]$Label, [string]$Exe, [string]$Workspace, [int]$ExpectRuns) {
  $outFile = Join-Path $script:Work "logs\inspect-$Label.json"
  $r = Invoke-Harness "inspect-$Label" $Exe @('scripts\graph-engineering\i1-inspect.mjs', "--workspace=$Workspace", "--expect-runs=$ExpectRuns", "--out=$outFile") 300
  return $r
}

# Text of every dialog-class top-level window (diagnostics for a stuck OS dialog).
function Get-DialogText {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $out = @()
  foreach ($w in $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($w.Current.ClassName -eq '#32770') {
      $texts = @($w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { $_.Current.Name } | Where-Object { $_ })
      $out += ("[{0}] {1}" -f $w.Current.Name, ($texts -join ' | '))
    }
  }
  return ($out -join ' ;; ')
}

# The app may outlive a window close (it hides to the tray by default) and holds a single-instance lock; end it
# between harness runs so the next launch is a real first instance. Reported, never silent.
function Stop-AllZCode([string]$Label) {
  $left = @(Get-ZCodeProcesses)
  if ($left.Count) { Write-Log "[$Label] ending $($left.Count) leftover ZCode process(es)"; $left | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 3 }
  return $left.Count
}

# ---- Case B/C state capture -------------------------------------------------------------------------------------------

# Graph's own profile data (the part the lifecycle must retain): hashes of everything under home\.zcode\v2 (Graph records,
# workflow library, settings, provider config), plus counts for the rest of the private profile (Electron caches, CLI db).
function Get-ProfileSnapshot {
  $root = Join-Path $env:USERPROFILE '.zcode-graph-engineering'
  $v2 = Join-Path $root 'home\.zcode\v2'
  $all = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue)
  $settings = try { Get-Content (Join-Path $v2 'setting.json') -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $null }
  $library = try { Get-Content (Join-Path $v2 'graph-engineering\workflow-library.json') -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $null }
  [ordered]@{
    settingsKeys = $(if ($settings) { @($settings.PSObject.Properties.Name | Sort-Object) } else { $null })
    settingsMarker = $(if ($settings) { $settings.i1SyntheticMarker } else { $null })
    settingsSubset = (Get-SettingsSubset)
    settingsQuarantined = @(Get-ChildItem -LiteralPath $v2 -Filter 'setting.json.corrupt-*' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
    libraryEntries = $(if ($library) { @($library.entries | ForEach-Object { [ordered]@{ id = $_.id; name = $_.name; versions = @($_.versions).Count } }) } else { $null })
    rootExists = (Test-Path -LiteralPath $root)
    v2Files = @(Get-FileHashes $v2)
    allFileCount = $all.Count
    allBytes = ($all | Measure-Object -Property Length -Sum).Sum
    appDataZCodeGraph = @(Get-FileHashes (Join-Path $env:APPDATA 'ZCode Graph')).Count
  }
}

# Unrelated sentinels: one inside the install directory (not in any manifest), one beside it outside the install
# directory, one inside the Graph profile root. Content is fixed and synthetic.
function New-Sentinels([string]$InstallDir) {
  $s = [ordered]@{
    inInstallDir = Join-Path $InstallDir 'i1-unrelated-sentinel.txt'
    outsideInstallDir = Join-Path (Split-Path $InstallDir -Parent) 'i1-outside-sentinel.txt'
    inProfileRoot = Join-Path $env:USERPROFILE '.zcode-graph-engineering\i1-profile-sentinel.txt'
  }
  foreach ($p in $s.Values) { New-Item -ItemType Directory -Force -Path (Split-Path $p -Parent) | Out-Null; Set-Content -LiteralPath $p -Value 'Z8.4-I1 synthetic unrelated sentinel' -Encoding ASCII }
  return $s
}

function Get-SentinelState($Sentinels) {
  $r = [ordered]@{}
  foreach ($k in $Sentinels.Keys) {
    $p = $Sentinels[$k]
    $r[$k] = [ordered]@{ exists = (Test-Path -LiteralPath $p); sha256 = $(if (Test-Path -LiteralPath $p) { (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLowerInvariant() } else { $null }) }
  }
  return $r
}

# Settings/profile retention probes, written the way the app writes its own file (UTF-8 WITHOUT a BOM: Windows
# PowerShell's Set-Content -Encoding UTF8 adds one, and the app then treats the file as corrupt and quarantines it).
#  - one unknown synthetic key (the app is expected to normalize it away: reported as observed, not as a defect);
#  - one KNOWN boolean setting flipped to the opposite of its current value (a real retention probe).
function Edit-SettingsForRetention {
  $path = Join-Path $env:USERPROFILE '.zcode-graph-engineering\home\.zcode\v2\setting.json'
  if (-not (Test-Path $path)) { return $null }
  $o = Get-Content $path -Raw | ConvertFrom-Json
  $o | Add-Member -NotePropertyName i1SyntheticMarker -NotePropertyValue 'keep-me' -Force
  $key = 'keepAwakeWhileRunning'
  $before = $o.$key
  if ($before -is [bool]) { $o.$key = (-not $before) }
  $json = $o | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
  return [ordered]@{ marker = 'i1SyntheticMarker=keep-me'; flippedKey = $key; before = $before; after = $o.$key }
}

# Non-sensitive, known settings that are compared across the lifecycle.
function Get-SettingsSubset {
  $path = Join-Path $env:USERPROFILE '.zcode-graph-engineering\home\.zcode\v2\setting.json'
  $o = try { Get-Content $path -Raw -ErrorAction Stop | ConvertFrom-Json } catch { return $null }
  $r = [ordered]@{}
  foreach ($k in 'keepAwakeWhileRunning', 'localePreference', 'closeToTrayOnWindows', 'taskAutoArchiveEnabled', 'memoryEnabled', 'messageStreamShowReasoning', 'i1SyntheticMarker') { $r[$k] = $o.$k }
  return $r
}

# Real registered uninstaller through its own UI (never with --delete-app-data). The NSIS uninstaller copies itself to
# %TEMP% and exits, so "done" means: the guest script ended, no wizard window, no Un_*.exe copy running.
function Invoke-Uninstall([string]$Label) {
  Write-Log "[$Label] uninstalling through the registered uninstaller"
  $p = Start-Process -FilePath powershell.exe -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $script:Work 'i1-guest.ps1'), '-Step', 'Uninstall', '-Label', $Label)
  $quietSince = $null
  $wizard = Invoke-Wizard $Label {
    $p.Refresh()
    $busy = (-not $p.HasExited) -or [bool](Find-WizardWindow) -or [bool](Get-Process -Name 'Un_*' -ErrorAction SilentlyContinue)
    if ($busy) { $script:quietSince = $null; return $false }
    if (-not $script:quietSince) { $script:quietSince = Get-Date }
    return (((Get-Date) - $script:quietSince).TotalSeconds -gt 6)
  } 600
  $exitFile = Join-Path $script:Work "evidence\uninstall-exit-$Label.json"
  $exit = if (Test-Path $exitFile) { Get-Content $exitFile -Raw | ConvertFrom-Json } else { $null }
  $ulog = Join-Path $env:TEMP 'ZCode-uninstaller.log'
  Write-Log ("[$Label] ZCode-uninstaller.log lastWriteUtc=" + $(if (Test-Path $ulog) { (Get-Item $ulog).LastWriteTimeUtc.ToString('o') } else { 'absent' }))
  Copy-Evidence $ulog "uninstaller-log-$Label.txt"
  Save-Evidence "uninstall-$Label.json" ([ordered]@{ exit = $exit; wizardCompleted = $wizard.completed; choices = $wizard.choices; pages = $wizard.pages })
  Write-Log ("[$Label] uninstall exit: " + $(if ($exit) { $exit.exitCode } else { 'unknown' }))
  return $exit
}

function Get-IdentitySnapshot {
  [ordered]@{
    uninstallEntries = @(Get-UninstallEntries)
    shortcuts = @(Get-ShortcutInfo | ForEach-Object { [pscustomobject]@{ path = $_.path; target = $_.target; aumid = (Get-ShortcutAumid $_.path) } })
    processes = @(Get-ZCodeProcesses)
    ordinaryZCodeAppDataExists = (Test-Path -LiteralPath (Join-Path $env:APPDATA 'ZCode'))
    ordinaryZCodeInstallDirExists = (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'Programs\ZCode'))
  }
}
