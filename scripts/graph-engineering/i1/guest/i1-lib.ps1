# Z8.4-I1 guest helpers (Windows PowerShell 5.1). Dot-sourced by i1-auto.ps1 INSIDE the disposable guest only.
# Nothing here is meant to run on the host: Assert-Guest refuses unless the guest isolation gate passes.

$script:Work = 'C:\i1'
$script:Export = 'C:\i1-export'

function Write-Log([string]$Message) {
  $line = '{0} {1}' -f (Get-Date).ToUniversalTime().ToString('HH:mm:ss'), $Message
  Write-Host $line
  if ($script:OutDir) { Add-Content -LiteralPath (Join-Path $script:OutDir 'progress.log') -Value $line }
}

# Guest isolation gate: re-use the reviewed i1-guest.ps1 check verbatim (it exits 90 outside a disposable guest).
function Assert-Guest([string]$Label) {
  $raw = & (Join-Path $script:Work 'i1-guest.ps1') -Step Preflight -Label $Label
  if ($LASTEXITCODE -ne 0) {
    $code = $LASTEXITCODE
    # Keep the gate's own record: it names the check that failed.
    Copy-Evidence (Join-Path $script:Work "evidence\isolation-$Label.json") "isolation-failed-$Label.json"
    throw "Guest isolation gate failed (exit $code); refusing to continue."
  }
  return ($raw -join "`n")
}

# Only path-sanitized, synthetic text leaves the guest.
function Protect-Text([string]$Text) {
  if ($null -eq $Text) { return '' }
  $t = $Text.Replace($env:USERPROFILE, '<guest-profile>').Replace($env:USERPROFILE.Replace('\', '/'), '<guest-profile>')
  $t = $t.Replace($env:COMPUTERNAME, '<guest-host>')
  return $t
}

function Save-Evidence([string]$Name, $Object) {
  $json = if ($Object -is [string]) { $Object } else { $Object | ConvertTo-Json -Depth 12 }
  Set-Content -LiteralPath (Join-Path $script:OutDir $Name) -Value (Protect-Text $json) -Encoding UTF8
}

function Copy-Evidence([string]$Source, [string]$Name) {
  if (Test-Path -LiteralPath $Source) { Set-Content -LiteralPath (Join-Path $script:OutDir $Name) -Value (Protect-Text (Get-Content -LiteralPath $Source -Raw)) -Encoding UTF8 }
  else { Write-Log "evidence source missing: $Name" }
}

# Debug screenshots of the guest desktop; these go to a separate folder and are never committed.
function Save-Screenshot([string]$Name) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $dir = Join-Path $script:Export 'debug'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $bmp.Save((Join-Path $dir "$Name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  } catch { Write-Log "screenshot failed: $($_.Exception.Message)" }
}

function Get-UninstallEntries {
  foreach ($hive in 'HKCU:', 'HKLM:') {
    $root = "$hive\Software\Microsoft\Windows\CurrentVersion\Uninstall"
    if (Test-Path $root) {
      Get-ChildItem $root | ForEach-Object {
        $p = Get-ItemProperty $_.PSPath
        if ($p.DisplayName -like 'ZCode*') {
          [pscustomobject]@{ hive = $hive; key = $_.PSChildName; displayName = $p.DisplayName; displayVersion = $p.DisplayVersion; uninstallString = $p.UninstallString; quietUninstallString = $p.QuietUninstallString; installLocation = $p.InstallLocation; publisher = $p.Publisher }
        }
      }
    }
  }
}

# Graph artifact paths exceed MAX_PATH, which Get-FileHash in Windows PowerShell 5.1 cannot open; use the \?\ prefix.
function Get-LongPathHash([string]$FullName) {
  try {
    $stream = [System.IO.File]::Open('\\?\' + $FullName, 'Open', 'Read', 'ReadWrite, Delete')
    try { return (-join ([System.Security.Cryptography.SHA256]::Create().ComputeHash($stream) | ForEach-Object { $_.ToString('x2') })) } finally { $stream.Dispose() }
  } catch { return 'unreadable' }
}

function Get-FileHashes([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $h = Get-LongPathHash $_.FullName
    [pscustomobject]@{ path = $_.FullName.Substring($Path.Length).TrimStart('\'); size = $_.Length; sha256 = $h }
  }
}

function Get-ZCodeProcesses {
  @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'ZCode*' -or $_.ProcessName -like 'zcode*' } | Select-Object ProcessName, Id, Path)
}

function Get-ShortcutInfo {
  $shell = New-Object -ComObject WScript.Shell
  $roots = @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs", [Environment]::GetFolderPath('Desktop'), "$env:ProgramData\Microsoft\Windows\Start Menu\Programs", [Environment]::GetFolderPath('CommonDesktopDirectory'))
  foreach ($r in $roots) {
    if (Test-Path $r) {
      Get-ChildItem -Path $r -Filter '*ZCode*.lnk' -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        $s = $shell.CreateShortcut($_.FullName)
        [pscustomobject]@{ path = $_.FullName; target = $s.TargetPath; arguments = $s.Arguments; workingDirectory = $s.WorkingDirectory }
      }
    }
  }
}

# Registered AUMIDs live on the shortcuts; read them with the Shell property system.
function Get-ShortcutAumid([string]$Lnk) {
  try {
    Add-Type -ErrorAction Stop -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class I1Aumid {
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore { int GetCount(out uint c); int GetAt(uint i, out PK k); int GetValue(ref PK k, out PV v); int SetValue(ref PK k, ref PV v); int Commit(); }
  [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct PK { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Explicit)] public struct PV { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr pad; }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHGetPropertyStoreFromParsingName(string path, IntPtr bc, int flags, ref Guid iid, out IPropertyStore ps);
  public static string Read(string path) {
    Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"); IPropertyStore ps;
    SHGetPropertyStoreFromParsingName(path, IntPtr.Zero, 0, ref iid, out ps);
    PK k = new PK { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 }; PV v; ps.GetValue(ref k, out v);
    return v.vt == 31 ? Marshal.PtrToStringUni(v.p) : null;
  }
}
'@
  } catch { }
  try { return [I1Aumid]::Read($Lnk) } catch { return $null }
}

function Get-Inventory([string]$Label) {
  $install = Join-Path $env:LOCALAPPDATA 'Programs\ZCode Graph'
  $graphRoot = Join-Path $env:USERPROFILE '.zcode-graph-engineering'
  [ordered]@{
    label = $Label
    capturedUtc = (Get-Date).ToUniversalTime().ToString('o')
    uninstallEntries = @(Get-UninstallEntries)
    installDirExists = (Test-Path -LiteralPath $install)
    installDirFileCount = @(Get-FileHashes $install).Count
    graphProfileExists = (Test-Path -LiteralPath $graphRoot)
    graphProfileFileCount = @(Get-FileHashes $graphRoot).Count
    graphAppDataExists = (Test-Path -LiteralPath (Join-Path $env:APPDATA 'ZCode Graph'))
    ordinaryZCodeAppDataExists = (Test-Path -LiteralPath (Join-Path $env:APPDATA 'ZCode'))
    shortcuts = @(Get-ShortcutInfo | ForEach-Object { [pscustomobject]@{ path = $_.path; target = $_.target; aumid = (Get-ShortcutAumid $_.path) } })
    processes = @(Get-ZCodeProcesses)
  }
}
