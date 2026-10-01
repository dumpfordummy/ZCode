# UX-M2 Windows acceptance: drive the REAL Windows common file dialog that Electron opened
# (dialog.showOpenDialog without the ZCODE_GRAPH_DIALOG_CONTROL seam). It only touches a dialog window
# that belongs to the process tree of the given process id, like an assistive tool would.
#   -Action select -Path <file>  puts the path into "File name" and presses Open
#   -Action cancel               presses Cancel
# Prints one JSON line: { ok, action, title, className, fileNameBefore, acceptedPath, error }.
param(
  [Parameter(Mandatory)][int]$ProcessId,
  [Parameter(Mandatory)][ValidateSet("select", "cancel")][string]$Action,
  [string]$Path = "",
  [int]$TimeoutSeconds = 30
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$result = [ordered]@{ ok = $false; action = $Action; title = $null; className = $null; error = $null }
try {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $classCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ClassNameProperty, "#32770")

  # Playwright reports the launcher process; the Electron main process is its descendant. Only a dialog
  # inside that process tree is accepted, never one opened by another application (including the user's own ZCode).
  function Get-Tree([int]$rootPid) {
    $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
    $set = New-Object 'System.Collections.Generic.HashSet[int]'
    [void]$set.Add($rootPid)
    do {
      $added = $false
      foreach ($p in $all) {
        if ($set.Contains([int]$p.ParentProcessId) -and $set.Add([int]$p.ProcessId)) { $added = $true }
      }
    } while ($added)
    $set
  }
  Add-Type -Namespace ZM2 -Name Enum -MemberDefinition @"
public delegate bool EnumCb(System.IntPtr h, System.IntPtr l);
[System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool EnumWindows(EnumCb cb, System.IntPtr l);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)] static extern int GetClassName(System.IntPtr h, System.Text.StringBuilder s, int n);
[System.Runtime.InteropServices.DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool IsWindowVisible(System.IntPtr h);
public static System.Collections.Generic.List<string> Dialogs() {
  var result = new System.Collections.Generic.List<string>();
  EnumWindows((h, l) => {
    var c = new System.Text.StringBuilder(64); GetClassName(h, c, 64);
    if (c.ToString() == "#32770" && IsWindowVisible(h)) { uint pid; GetWindowThreadProcessId(h, out pid); result.Add(h.ToInt64() + "|" + pid); }
    return true;
  }, System.IntPtr.Zero);
  return result;
}
"@
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $dialog = $null
  while (-not $dialog -and (Get-Date) -lt $deadline) {
    $tree = Get-Tree $ProcessId
    # The Open dialog is a child of the UI Automation root, but a Save As dialog owned by the app window is
    # not listed there; Win32 enumeration finds both, then UI Automation wraps the window handle.
    $candidates = New-Object System.Collections.Generic.List[object]
    foreach ($item in $root.FindAll([System.Windows.Automation.TreeScope]::Children, $classCondition)) { $candidates.Add($item) }
    foreach ($entry in [ZM2.Enum]::Dialogs()) {
      $handle, $owner = $entry.Split("|")
      if (-not $tree.Contains([int]$owner)) { continue }
      try { $candidates.Add([System.Windows.Automation.AutomationElement]::FromHandle([System.IntPtr][int64]$handle)) } catch { }
    }
    foreach ($candidate in $candidates) {
      if (-not $tree.Contains([int]$candidate.Current.ProcessId)) { continue }
      # An Open dialog (File name edit id 1148) or a Save As dialog (id 1001) has the File name edit box; a message box does not.
      $nameBox = $null
      foreach ($nameId in "1148", "1001") {
        if (-not $nameBox) {
          $nameBox = $candidate.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
            (New-Object System.Windows.Automation.AndCondition(
              (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $nameId)),
              (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, "Edit")))))
        }
      }
      if ($nameBox) { $dialog = $candidate; break }
    }
    if (-not $dialog) { Start-Sleep -Milliseconds 200 }
  }
  if (-not $dialog) {
    $seen = @($root.FindAll([System.Windows.Automation.TreeScope]::Children, $classCondition) | Where-Object { $tree.Contains([int]$_.Current.ProcessId) } | ForEach-Object { "'" + $_.Current.Name + "'" }) -join ", "
    throw "No Windows Open or Save dialog (#32770) in the process tree of $ProcessId appeared within $TimeoutSeconds s. Dialogs seen: [$seen]"
  }
  $result.title = $dialog.Current.Name
  $result.className = $dialog.Current.ClassName

  # The common dialog is made of classic Win32 controls, which UI Automation exposes as panes without
  # Value/Invoke patterns; the window handle of each control is used with the standard messages instead.
  Add-Type -Namespace ZM2 -Name Win -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern System.IntPtr SendMessage(System.IntPtr hWnd, uint msg, System.IntPtr wParam, string lParam);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern System.IntPtr SendMessage(System.IntPtr hWnd, uint msg, System.IntPtr wParam, System.IntPtr lParam);
[System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint = "SendMessageW", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern System.IntPtr GetText(System.IntPtr hWnd, uint msg, System.IntPtr wParam, System.Text.StringBuilder lParam);
"@
  function Find-Control($scope, [string]$id, [string]$class) {
    $byId = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::AutomationIdProperty, $id)
    $byClass = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ClassNameProperty, $class)
    $scope.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
      (New-Object System.Windows.Automation.AndCondition($byId, $byClass)))
  }
  # Fixed control ids of the common file dialog: 1148 = File name edit box, 1 = Open, 2 = Cancel.
  $WM_SETTEXT = 0x000C
  $WM_GETTEXT = 0x000D
  $BM_CLICK = 0x00F5
  if ($Action -eq "cancel") {
    $button = Find-Control $dialog "2" "Button"
    if (-not $button) { throw "Cancel button (id 2) not found in '$($dialog.Current.Name)'." }
    [void][ZM2.Win]::SendMessage([System.IntPtr]$button.Current.NativeWindowHandle, $BM_CLICK, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
    $result.ok = $true
  } else {
    $edit = Find-Control $dialog "1148" "Edit"
    if (-not $edit) { $edit = Find-Control $dialog "1001" "Edit" }
    if (-not $edit) { throw "File name edit (id 1148 or 1001) not found in '$($dialog.Current.Name)'." }
    $handle = [System.IntPtr]$edit.Current.NativeWindowHandle
    # GetWindowText does not read another process's edit box; WM_GETTEXT does.
    $before = New-Object System.Text.StringBuilder 2048
    [void][ZM2.Win]::GetText($handle, $WM_GETTEXT, [System.IntPtr]2048, $before)
    $result.fileNameBefore = $before.ToString()
    [void][ZM2.Win]::SendMessage($handle, $WM_SETTEXT, [System.IntPtr]::Zero, $Path)
    $after = New-Object System.Text.StringBuilder 2048
    [void][ZM2.Win]::GetText($handle, $WM_GETTEXT, [System.IntPtr]2048, $after)
    if ($after.ToString() -ne $Path) { throw "The File name box did not take the path (it reads '$($after.ToString())')." }
    $result.acceptedPath = $Path
    $open = Find-Control $dialog "1" "Button"
    if (-not $open) { throw "Open button (id 1) not found in '$($dialog.Current.Name)'." }
    [void][ZM2.Win]::SendMessage([System.IntPtr]$open.Current.NativeWindowHandle, $BM_CLICK, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
    $result.ok = $true
  }
} catch {
  $result.error = $_.Exception.Message
}
$result | ConvertTo-Json -Compress
if (-not $result.ok) { exit 1 }
