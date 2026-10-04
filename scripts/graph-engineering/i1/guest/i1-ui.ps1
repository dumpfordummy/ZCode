# Z8.4-I1 NSIS wizard driver (Windows PowerShell 5.1, INSIDE the disposable guest only).
# Drives the REAL assisted installer / uninstaller windows through UI Automation and records every page it saw and every
# choice it made. It only touches windows whose title belongs to the ZCode Graph installer or uninstaller.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class I1Win { [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l); }
'@
$script:BM_CLICK = 0x00F5
$script:AE = [System.Windows.Automation.AutomationElement]
$script:TrueCond = [System.Windows.Automation.Condition]::TrueCondition

function Get-TopWindowList {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  @($root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { "{0}|{1}|pid={2}" -f $_.Current.ClassName, $_.Current.Name, $_.Current.ProcessId })
}

function Find-WizardWindow {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  foreach ($w in $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    $name = $w.Current.Name
    if ($name -match '^ZCode Graph.*(Setup|Uninstall)|^(Setup|Uninstall).*ZCode Graph') { return $w }
  }
  return $null
}

function Get-WizardSnapshot($Window) {
  $items = @()
  foreach ($e in $Window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $script:TrueCond)) {
    $c = $e.Current
    $toggle = $null
    try {
      $p = $null
      if ($e.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$p)) { $toggle = $p.Current.ToggleState.ToString() }
      elseif ($e.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) { $toggle = if ($p.Current.IsSelected) { 'On' } else { 'Off' } }
    } catch { }
    $items += [pscustomobject]@{ type = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''; name = $c.Name; id = $c.AutomationId; enabled = $c.IsEnabled; offscreen = $c.IsOffscreen; toggle = $toggle; hwnd = $c.NativeWindowHandle }
  }
  [pscustomobject]@{ title = $Window.Current.Name; items = $items }
}

function Send-Click([int]$Hwnd) { [void][I1Win]::PostMessage([IntPtr]$Hwnd, $script:BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) }

# Walk the wizard until $IsDone returns $true. Recorded: each distinct page snapshot, each choice, each forward click.
#  - per-user: picks the "only for me / just for me" radio when the install-mode page appears;
#  - run-after-finish: unchecks the "Run ZCode Graph" box so launching stays under the driver's control (recorded);
#  - never checks any other box and never selects an app-data deletion option.
function Invoke-Wizard([string]$Tag, [scriptblock]$IsDone, [int]$TimeoutSec = 900) {
  $pages = New-Object System.Collections.ArrayList
  $choices = New-Object System.Collections.ArrayList
  $lastSig = ''
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $clickedSig = ''
  $lastWindowLog = (Get-Date).AddSeconds(-25)
  $finishSeen = ''
  while ((Get-Date) -lt $deadline) {
    if (& $IsDone) { break }
    try { $win = Find-WizardWindow } catch { Write-Log "[$Tag] find-window error: $($_.Exception.Message)"; Start-Sleep -Seconds 2; continue }
    if (-not $win) {
      if (((Get-Date) - $lastWindowLog).TotalSeconds -gt 30) {
        $lastWindowLog = Get-Date
        Write-Log "[$Tag] no wizard window; top-level windows: $((Get-TopWindowList) -join ' ; ')"
      }
      Start-Sleep -Milliseconds 700; continue
    }
    try { $snap = Get-WizardSnapshot $win } catch { Write-Log "[$Tag] snapshot error: $($_.Exception.Message)"; Start-Sleep -Seconds 2; continue }
    $visible = @($snap.items | Where-Object { -not $_.offscreen })
    $sig = ($visible | Where-Object { $_.type -in 'Text', 'Button', 'RadioButton', 'CheckBox', 'Edit' } | ForEach-Object { "$($_.type):$($_.name):$($_.toggle):$($_.enabled)" }) -join '|'
    if ($sig -ne $lastSig) {
      $lastSig = $sig
      [void]$pages.Add([pscustomobject]@{ n = $pages.Count + 1; title = $snap.title; items = $visible })
      Save-Screenshot ("$Tag-page{0:00}" -f $pages.Count)
      Write-Log ("[$Tag] page {0}: {1}" -f $pages.Count, (($visible | Where-Object { $_.type -in 'Text', 'Button', 'RadioButton', 'CheckBox' } | ForEach-Object { "$($_.type)=$($_.name)$(if($_.toggle){'['+$_.toggle+']'})$(if(-not $_.enabled){'(disabled)'})" }) -join ' ; '))
    }
    # Choices first (only when the control is actually present on this page).
    $radio = $visible | Where-Object { $_.type -eq 'RadioButton' -and $_.name -match 'only for me|just for me|current user' -and $_.toggle -ne 'On' } | Select-Object -First 1
    if ($radio) { Send-Click $radio.hwnd; [void]$choices.Add("selected radio: $($radio.name)"); Start-Sleep -Milliseconds 600; continue }
    $run = $visible | Where-Object { $_.type -eq 'CheckBox' -and $_.name -match '^Run ' -and $_.toggle -eq 'On' } | Select-Object -First 1
    if ($run) { Send-Click $run.hwnd; [void]$choices.Add("unchecked: $($run.name)"); Start-Sleep -Milliseconds 600; continue }
    $forward = $visible | Where-Object { $_.type -eq 'Button' -and $_.id -eq '1' -and $_.enabled } | Select-Object -First 1
    # The finish page's "Run ..." box can appear a moment after the Finish button: look once more before closing the
    # wizard, otherwise the installer would launch the app behind the driver's back.
    if ($forward -and $forward.name -eq 'Finish' -and $finishSeen -ne $sig) { $finishSeen = $sig; Start-Sleep -Milliseconds 2000; continue }
    if ($forward -and $clickedSig -ne ($sig + '#' + $forward.name)) {
      $clickedSig = $sig + '#' + $forward.name
      [void]$choices.Add("clicked: $($forward.name)")
      Send-Click $forward.hwnd
      Start-Sleep -Milliseconds 1500
      $clickedSig = ''
      continue
    }
    Start-Sleep -Milliseconds 800
  }
  [pscustomobject]@{ completed = [bool](& $IsDone); pages = $pages; choices = $choices }
}
