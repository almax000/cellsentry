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

  $fileNameCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, '1001')
  $edits = @($dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $fileNameCondition) | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit })
  if ($edits.Count -ne 1) { Fail 'Expected exactly one File name Edit control with AutomationId 1001' }
  $edit = $edits[0]
  $receipt.fileNameControl = [ordered]@{ automationId = $edit.Current.AutomationId; controlType = $edit.Current.ControlType.ProgrammaticName }

  if ($Mode -notlike 'Cancel*') {
    $valuePattern = $null
    if (-not $edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern)) { Fail 'File name control does not support ValuePattern' }
    $valuePattern.SetValue($fullPath)
    if ($valuePattern.Current.Value -ne $fullPath) { Fail 'File name control did not retain the exact requested path' }
    $receipt.expectedValueSet = $true
  }
  $buttonId = if ($Mode -like 'Cancel*') { '2' } else { '1' }
  $buttonCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $buttonId)
  $buttons = @($dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition) | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button })
  if ($buttons.Count -ne 1) { Fail "Expected exactly one dialog button with AutomationId $buttonId" }
  $button = $buttons[0]; $receipt.button = [ordered]@{ automationId = $button.Current.AutomationId; controlType = $button.Current.ControlType.ProgrammaticName }
  $invokePattern = $null
  if (-not $button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invokePattern)) { Fail 'Dialog button does not support InvokePattern' }
  $handle = $receipt.dialog.nativeWindowHandle
  $invokePattern.Invoke(); $receipt.invoked = $true
  $closeDeadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $closeDeadline) {
    $stillOpen = @($root.FindAll([System.Windows.Automation.TreeScope]::Children, $ownedCondition) | Where-Object { $_.Current.NativeWindowHandle -eq $handle })
    if ($stillOpen.Count -eq 0) { $receipt.dialogClosed = $true; break }
    Start-Sleep -Milliseconds 150
  }
  if (-not $receipt.dialogClosed) { Fail 'Native file dialog did not close after InvokePattern' }
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
