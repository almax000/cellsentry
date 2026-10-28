[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][uint32]$ActivatedProcessId,
  [Parameter(Mandatory = $true)][ValidateSet('Open', 'Save', 'CancelOpen', 'CancelSave')][string]$Mode,
  [Parameter(Mandatory = $true)][string]$FilePath,
  [Parameter(Mandatory = $true)][string]$ReceiptPath,
  [ValidateRange(1, 60)][int]$TimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$receipt = [ordered]@{
  success = $false; mode = $Mode; activatedProcessId = $ActivatedProcessId
  dialogFound = $false; expectedValueSet = $false; invoked = $false; dialogClosed = $false
}
function Write-Receipt { $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReceiptPath -Encoding utf8 }
function Fail([string]$message) { throw $message }
$dialog = $null

try {
  if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { Fail 'Native dialog automation is restricted to an ephemeral GitHub-hosted Windows runner' }
  if ([Threading.Thread]::CurrentThread.ApartmentState -ne [Threading.ApartmentState]::STA) { Fail 'Native dialog automation must be invoked by Windows PowerShell with -STA' }
  if (-not (Get-Process -Id $ActivatedProcessId -ErrorAction SilentlyContinue)) { Fail 'Authenticated activated process is not live' }
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

  Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
namespace CellSentryFileDialog {
  public static class Controls {
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr handle, StringBuilder text, int size);
    [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr handle);
    [DllImport("user32.dll")] static extern bool IsChild(IntPtr parent, IntPtr child);
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential)] struct GuiThreadInfo {
      public uint cbSize, flags;
      public IntPtr active, focus, capture, menuOwner, moveSize, caret;
      public Rect caretRect;
    }
    [DllImport("user32.dll", SetLastError=true)] static extern bool GetGUIThreadInfo(uint threadId, ref GuiThreadInfo info);
    [DllImport("user32.dll", EntryPoint="PostMessageW", SetLastError=true)] static extern bool PostValue(IntPtr handle, uint message, UIntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", EntryPoint="SendMessageTimeoutW", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr ReadText(IntPtr handle, uint message, UIntPtr size, StringBuilder text, uint flags, uint timeout, out UIntPtr result);
    [DllImport("user32.dll", EntryPoint="SendMessageTimeoutW", SetLastError=true)]
    static extern IntPtr SendValue(IntPtr handle, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
    static string ClassName(IntPtr handle) {
      var text = new StringBuilder(256);
      if (GetClassName(handle, text, text.Capacity) <= 0) throw new InvalidOperationException("Window class is unavailable");
      return text.ToString();
    }
    static void Check(IntPtr dialog, IntPtr control, uint processId, string className, int controlId) {
      uint owner; uint controlOwner;
      if (dialog == IntPtr.Zero || control == IntPtr.Zero || dialog == new IntPtr(0xffff) || control == new IntPtr(0xffff)) throw new InvalidOperationException("Invalid individual window handle");
      GetWindowThreadProcessId(dialog, out owner); GetWindowThreadProcessId(control, out controlOwner);
      if (owner != processId || controlOwner != processId || ClassName(dialog) != "#32770" || !IsChild(dialog, control) || ClassName(control) != className || GetDlgCtrlID(control) != controlId) throw new InvalidOperationException("Native window identity, ancestry, class or control ID mismatch");
    }
    public static int DescribeControlId(IntPtr dialog, IntPtr control, uint processId) {
      uint owner; uint controlOwner;
      GetWindowThreadProcessId(dialog, out owner); GetWindowThreadProcessId(control, out controlOwner);
      if (owner != processId || controlOwner != processId || !IsChild(dialog, control) || ClassName(dialog) != "#32770") throw new InvalidOperationException("Refusing metadata for an unrelated window");
      return GetDlgCtrlID(control);
    }
    static void FocusControl(IntPtr dialog, IntPtr control, uint processId) {
      uint owner; uint threadId = GetWindowThreadProcessId(dialog, out owner);
      if (owner != processId || !PostValue(dialog, 0x0028, new UIntPtr((ulong)control.ToInt64()), new IntPtr(1))) throw new InvalidOperationException("Could not focus the authenticated dialog control");
      DateTime deadline = DateTime.UtcNow.AddSeconds(2);
      while (DateTime.UtcNow < deadline) {
        var info = new GuiThreadInfo(); info.cbSize = (uint)Marshal.SizeOf(typeof(GuiThreadInfo));
        if (GetGUIThreadInfo(threadId, ref info) && info.focus == control) return;
        System.Threading.Thread.Sleep(10);
      }
      throw new InvalidOperationException("Dialog control did not receive real keyboard focus");
    }
    public static void SetFileName(IntPtr dialog, IntPtr edit, uint processId, string path, int controlId) {
      if (controlId != 1148 && controlId != 1001) throw new InvalidOperationException("Unsupported filename control ID");
      Check(dialog, edit, processId, "Edit", controlId);
      UIntPtr result;
      FocusControl(dialog, edit, processId);
      if (SendValue(edit, 0x00b1, UIntPtr.Zero, new IntPtr(-1), 2, 2000, out result) == IntPtr.Zero) throw new InvalidOperationException("Bounded select-all failed");
      foreach (char character in path) {
        if (SendValue(edit, 0x0102, new UIntPtr((uint)character), new IntPtr(1), 2, 2000, out result) == IntPtr.Zero) throw new InvalidOperationException("Bounded native character input failed");
      }
      var text = new StringBuilder(32768);
      if (ReadText(edit, 0x000d, new UIntPtr((uint)text.Capacity), text, 2, 2000, out result) == IntPtr.Zero || text.ToString() != path) throw new InvalidOperationException("Native filename readback did not match the requested path");
    }
    public static void Click(IntPtr dialog, IntPtr button, uint processId, int controlId) {
      if (controlId != 1 && controlId != 2) throw new InvalidOperationException("Only dialog accept/cancel buttons are allowed");
      Check(dialog, button, processId, "Button", controlId);
      UIntPtr result;
      FocusControl(dialog, button, processId);
      if (SendValue(button, 0x00f5, UIntPtr.Zero, IntPtr.Zero, 2, 2000, out result) == IntPtr.Zero) throw new InvalidOperationException("Bounded BM_CLICK failed");
    }
  }
}
'@

  $repo = Split-Path $PSScriptRoot -Parent
  $fullPath = [IO.Path]::GetFullPath($FilePath)
  $repoPrefix = $repo.TrimEnd('\') + '\'
  $tmpPrefix = (Join-Path $repo 'tmp').TrimEnd('\') + '\'
  $fixturePrefix = (Join-Path $repo 'app/e2e/fixtures').TrimEnd('\') + '\'
  $savePrefix = (Join-Path $repo 'tmp/msix-ui-probe').TrimEnd('\') + '\'
  if (-not [IO.Path]::IsPathRooted($FilePath)) { Fail 'FilePath must be absolute' }
  if ($Mode -in @('Open', 'CancelOpen')) {
    if (-not ($fullPath.StartsWith($tmpPrefix, [StringComparison]::OrdinalIgnoreCase) -or $fullPath.StartsWith($fixturePrefix, [StringComparison]::OrdinalIgnoreCase))) { Fail 'Open input must be under repository tmp or app/e2e/fixtures' }
    $fixtureInfo = Get-Item -LiteralPath $fullPath -ErrorAction Stop
    if ($fixtureInfo.PSIsContainer -or ($fixtureInfo.Attributes -band [IO.FileAttributes]::ReparsePoint)) { Fail 'Open input must be a regular file' }
  } else {
    if (-not $fullPath.StartsWith($savePrefix, [StringComparison]::OrdinalIgnoreCase)) { Fail 'Save output must be under repository tmp/msix-ui-probe' }
    if (-not (Test-Path -LiteralPath (Split-Path $fullPath -Parent) -PathType Container)) { Fail 'Save output parent directory is missing' }
    if (Test-Path -LiteralPath $fullPath) { Fail 'Save output already exists; refusing to overwrite' }
  }

  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $classCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ClassNameProperty, '#32770')
  $pidCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$ActivatedProcessId)
  $ownedCondition = [System.Windows.Automation.AndCondition]::new($classCondition, $pidCondition)
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $dialog = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    $candidates = @($root.FindAll([System.Windows.Automation.TreeScope]::Children, $ownedCondition))
    # Do not fall back to title matching or inspect controls of another process.
    if ($candidates.Count -eq 1 -and $candidates[0].Current.ProcessId -eq [int]$ActivatedProcessId) { $dialog = $candidates[0]; break }
    Start-Sleep -Milliseconds 150
  }
  if (-not $dialog) { Fail 'Expected exactly one #32770 top-level dialog owned by the authenticated activated process' }
  $receipt.dialogFound = $true
  $receipt.dialog = [ordered]@{ processId = $dialog.Current.ProcessId; nativeWindowHandle = $dialog.Current.NativeWindowHandle; className = $dialog.Current.ClassName }

  # Open and Save expose different, actually observed native layouts.
  $fileNameId = if ($Mode -in @('Open', 'CancelOpen')) { 1148 } else { 1001 }
  $fileNameScope = $dialog
  if ($fileNameId -eq 1001) {
    $hostCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'FileNameControlHost')
    $hosts = @($dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $hostCondition) | Where-Object { $_.Current.ClassName -eq 'AppControlHost' -and $_.Current.ProcessId -eq [int]$ActivatedProcessId })
    if ($hosts.Count -ne 1) { Fail 'Expected exactly one same-process FileNameControlHost for Save' }
    $fileNameScope = $hosts[0]
    $receipt.fileNameScope = 'FileNameControlHost'
  } else { $receipt.fileNameScope = 'legacy-open-filename-combobox' }
  $fileNameCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, [string]$fileNameId)
  $edits = @($fileNameScope.FindAll([System.Windows.Automation.TreeScope]::Descendants, $fileNameCondition) | Where-Object { $_.Current.ClassName -eq 'Edit' })
  if ($edits.Count -ne 1) { Fail "Expected exactly one scoped File name Edit control with AutomationId $fileNameId" }
  $edit = $edits[0]
  $receipt.fileNameControl = [ordered]@{ automationId = $edit.Current.AutomationId; controlType = $edit.Current.ControlType.ProgrammaticName }

  $receipt.fileNameControl.nativeWindowHandle = $edit.Current.NativeWindowHandle
  $receipt.fileNameControl.nativeControlId = [CellSentryFileDialog.Controls]::DescribeControlId([IntPtr]$receipt.dialog.nativeWindowHandle, [IntPtr]$edit.Current.NativeWindowHandle, $ActivatedProcessId)

  if ($receipt.fileNameControl.nativeControlId -ne $fileNameId) { Fail 'Filename UIA/native control ID mismatch' }
  if ($Mode -notlike 'Cancel*') {
    [CellSentryFileDialog.Controls]::SetFileName([IntPtr]$receipt.dialog.nativeWindowHandle, [IntPtr]$edit.Current.NativeWindowHandle, $ActivatedProcessId, $fullPath, $fileNameId)
    $receipt.expectedValueSet = $true
  }
  $buttonId = if ($Mode -like 'Cancel*') { '2' } else { '1' }
  $buttonCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $buttonId)
  $buttons = @($dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition) | Where-Object { $_.Current.ClassName -eq 'Button' })
  if ($buttons.Count -ne 1) { Fail "Expected exactly one dialog button with AutomationId $buttonId" }
  $button = $buttons[0]; $receipt.button = [ordered]@{ automationId = $button.Current.AutomationId; controlType = $button.Current.ControlType.ProgrammaticName }
  $receipt.button.nativeWindowHandle = $button.Current.NativeWindowHandle
  $receipt.button.nativeControlId = [CellSentryFileDialog.Controls]::DescribeControlId([IntPtr]$receipt.dialog.nativeWindowHandle, [IntPtr]$button.Current.NativeWindowHandle, $ActivatedProcessId)
  $handle = $receipt.dialog.nativeWindowHandle
  [CellSentryFileDialog.Controls]::Click([IntPtr]$handle, [IntPtr]$button.Current.NativeWindowHandle, $ActivatedProcessId, [int]$buttonId)
  $receipt.transport = 'validated-individual-HWND-focus-and-character-input'
  $receipt.invoked = $true
  $closeDeadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $closeDeadline) {
    $stillOpen = @($root.FindAll([System.Windows.Automation.TreeScope]::Children, $ownedCondition) | Where-Object { $_.Current.NativeWindowHandle -eq $handle })
    if ($stillOpen.Count -eq 0) { $receipt.dialogClosed = $true; break }
    Start-Sleep -Milliseconds 150
  }
  if (-not $receipt.dialogClosed) { Fail 'Native file dialog did not close after bounded native button click' }
  $receipt.success = $true
} catch {
  $receipt.error = $_.Exception.Message
  if ($null -ne $dialog) {
    try {
      $receipt.controls = @($dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) |
        Select-Object -First 100 | ForEach-Object { [ordered]@{ automationId = $_.Current.AutomationId; className = $_.Current.ClassName; controlType = $_.Current.ControlType.ProgrammaticName; name = $_.Current.Name } })
    } catch { $receipt.controlCaptureError = $_.Exception.Message }
  }
} finally {
  try { Write-Receipt } catch { }
}
if (-not $receipt.success) { exit 1 }
