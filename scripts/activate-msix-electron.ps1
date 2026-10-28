[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PackageFullName,
  [Parameter(Mandatory = $true)][string]$PackageFamilyName,
  [Parameter(Mandatory = $true)][string]$ApplicationId,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$ProbeScript,
  [Parameter(Mandatory = $true)][string]$ReceiptPath,
  [Parameter(Mandatory = $true)][string]$NodeReceiptPath,
  [Parameter(Mandatory = $true)][string]$ScreenshotPath,
  [switch]$ModelMode,
  [string]$ModelFixturePath,
  [ValidateSet('first', 'reuse')][string]$ModelPhase
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'MSIX Electron activation probe is restricted to an ephemeral GitHub-hosted Windows runner'
}

$receipt = [ordered]@{
  success = $false
  aumidActivationSucceeded = $false
  mainWindowObserved = $false
  processPackageFullNameMatched = $false
  nodeInspectorConnected = $false
  activationPidMatchedMainPid = $false
  processWindowsStoreTrue = $false
  electronPackagedTrue = $false
  rendererHomeVisible = $false
  realUpdaterChannelStore = $false
  normalExitObserved = $false
}

function Write-ActivationReceipt {
  $receipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReceiptPath -Encoding utf8
}

function Quote-ProcessArgument {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Length -eq 0) { return '""' }
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\\"')
  $escaped = [regex]::Replace($escaped, '(\\*)$', '$1$1')
  return '"' + $escaped + '"'
}

function Get-LoopbackPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

if (-not ('CellSentryMsixActivation.Interop' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace CellSentryMsixActivation {
  [Flags]
  public enum ActivateOptions : uint { None = 0, NoErrorUI = 2 }

  [ComImport, Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IApplicationActivationManager {
    [PreserveSig]
    int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
      [MarshalAs(UnmanagedType.LPWStr)] string arguments, ActivateOptions options, out uint processId);
    [PreserveSig]
    int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, IntPtr itemArray,
      [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint processId);
    [PreserveSig]
    int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, IntPtr uri, out uint processId);
  }

  [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
  internal class ApplicationActivationManager { }

  public static class Interop {
    private static IApplicationActivationManager activationManager;

    public static uint Activate(string aumid, string arguments) {
      // Keep this COM server reference alive until the PowerShell probe exits.
      activationManager = (IApplicationActivationManager)new ApplicationActivationManager();
      uint processId;
      int hr = activationManager.ActivateApplication(aumid, arguments, ActivateOptions.NoErrorUI, out processId);
      if (hr != 0) throw new InvalidOperationException("ActivateApplication failed: HRESULT 0x" + ((uint)hr).ToString("X8"));
      return processId;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, uint processId);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern int GetPackageFullName(IntPtr process, ref uint packageFullNameLength, System.Text.StringBuilder packageFullName);

    public static string PackageFullName(uint processId) {
      const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
      const int ERROR_INSUFFICIENT_BUFFER = 122;
      IntPtr process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
      if (process == IntPtr.Zero) Marshal.ThrowExceptionForHR(Marshal.GetHRForLastWin32Error());
      try {
        uint length = 0;
        int first = GetPackageFullName(process, ref length, null);
        if (first != ERROR_INSUFFICIENT_BUFFER || length <= 1) throw new InvalidOperationException("GetPackageFullName length query failed: " + first);
        var value = new System.Text.StringBuilder((int)length);
        int second = GetPackageFullName(process, ref length, value);
        if (second != 0) throw new InvalidOperationException("GetPackageFullName failed: " + second);
        return value.ToString();
      } finally { CloseHandle(process); }
    }
  }
}
'@
}

function Invoke-BoundedNodeProbe {
  param([Parameter(Mandatory = $true)][string[]]$Arguments, [int]$TimeoutMs = 55000)
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $NodePath
  # Windows PowerShell 5.1 runs on .NET Framework, where ArgumentList is absent.
  $startInfo.Arguments = ($Arguments | ForEach-Object { Quote-ProcessArgument $_ }) -join ' '
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true
  $nodeProcess = [System.Diagnostics.Process]::new()
  $nodeProcess.StartInfo = $startInfo
  try {
    if (-not $nodeProcess.Start()) { throw 'MSIX Electron Node probe did not start' }
    $stdoutTask = $nodeProcess.StandardOutput.ReadToEndAsync()
    $stderrTask = $nodeProcess.StandardError.ReadToEndAsync()
    if (-not $nodeProcess.WaitForExit($TimeoutMs)) {
      $nodeProcess.Kill()
      $nodeProcess.WaitForExit()
      throw "MSIX Electron Node probe timed out after $TimeoutMs ms"
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($nodeProcess.ExitCode -ne 0) { throw "MSIX Electron Node probe failed with exit $($nodeProcess.ExitCode): $stderr $stdout" }
  } finally {
    if (-not $nodeProcess.HasExited) { $nodeProcess.Kill(); $nodeProcess.WaitForExit() }
    $nodeProcess.Dispose()
  }
}

try {
  $nodePort = Get-LoopbackPort
  $cdpPort = Get-LoopbackPort
  if ($nodePort -eq $cdpPort) { throw 'Loopback port allocation collided' }
  $aumid = "$PackageFamilyName!$ApplicationId"
  $activationArguments = "--inspect=127.0.0.1:$nodePort --remote-debugging-address=127.0.0.1 --remote-debugging-port=$cdpPort"
  $receipt.aumid = $aumid
  $receipt.activationArguments = $activationArguments
  $activatedProcessId = [CellSentryMsixActivation.Interop]::Activate($aumid, $activationArguments)
  if ($activatedProcessId -le 0) { throw 'AUMID activation returned no process ID' }
  $receipt.activatedProcessId = $activatedProcessId
  $receipt.aumidActivationSucceeded = $true
  Write-ActivationReceipt

  $windowDeadline = (Get-Date).AddSeconds(20)
  do {
    $targetProcess = Get-Process -Id $activatedProcessId -ErrorAction SilentlyContinue
    if ($targetProcess -and $targetProcess.MainWindowHandle -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 150
  } while ((Get-Date) -lt $windowDeadline)
  if (-not $targetProcess) { throw 'Activated MSIX Electron process exited before the window check' }
  $receipt.mainWindowObserved = $targetProcess.MainWindowHandle -ne [IntPtr]::Zero
  if (-not $receipt.mainWindowObserved) { throw 'Activated MSIX Electron process did not expose a main window within 20000ms' }
  Write-ActivationReceipt

  $receipt.processPackageFullName = [CellSentryMsixActivation.Interop]::PackageFullName($activatedProcessId)
  $receipt.processPackageFullNameMatched = $receipt.processPackageFullName -eq $PackageFullName
  if (-not $receipt.processPackageFullNameMatched) { throw 'Activated process package full name did not match the registered MSIX package' }
  Write-ActivationReceipt

  $nodeArguments = @($ProbeScript, $nodePort, $cdpPort, $activatedProcessId, $NodeReceiptPath, $ScreenshotPath)
  if ($ModelMode) {
    if (-not $ModelFixturePath -or -not $ModelPhase) { throw 'Model mode requires a fixture path and phase' }
    $nodeArguments += @($ModelFixturePath, $ModelPhase)
  }
  $nodeTimeoutMs = if ($ModelMode) { 450000 } else { 55000 }
  Invoke-BoundedNodeProbe -Arguments $nodeArguments -TimeoutMs $nodeTimeoutMs
  $nodeReceipt = Get-Content -LiteralPath $NodeReceiptPath -Raw | ConvertFrom-Json
  foreach ($name in @('nodeInspectorConnected', 'activationPidMatchedMainPid', 'processWindowsStoreTrue', 'electronPackagedTrue', 'rendererHomeVisible', 'realUpdaterChannelStore')) {
    $receipt[$name] = ($nodeReceipt.$name -is [bool]) -and ($nodeReceipt.$name -eq $true)
  }
  $receipt.mainIdentity = $nodeReceipt.mainIdentity
  $receipt.screenshot = $nodeReceipt.screenshot
  if ($ModelMode) { $receipt.modelProbe = $nodeReceipt }
  $requiredNodeSignals = @('nodeInspectorConnected', 'activationPidMatchedMainPid', 'processWindowsStoreTrue', 'electronPackagedTrue', 'rendererHomeVisible', 'realUpdaterChannelStore')
  if (($nodeReceipt.success -isnot [bool]) -or -not $nodeReceipt.success -or @($requiredNodeSignals | Where-Object { -not $receipt[$_] }).Count -gt 0) {
    throw "MSIX Electron Node probe reported failure: $($nodeReceipt.error)"
  }
  Write-ActivationReceipt

  $exitDeadline = (Get-Date).AddSeconds(15)
  while ((Get-Process -Id $activatedProcessId -ErrorAction SilentlyContinue) -and (Get-Date) -lt $exitDeadline) { Start-Sleep -Milliseconds 150 }
  $receipt.normalExitObserved = -not [bool](Get-Process -Id $activatedProcessId -ErrorAction SilentlyContinue)
  if (-not $receipt.normalExitObserved) { throw 'Electron did not exit after app.quit within 15000ms' }
  $receipt.success = $true
} catch {
  $receipt.error = $_.Exception.Message
  if (Test-Path -LiteralPath $NodeReceiptPath -PathType Leaf) {
    try {
      $receipt.nodeProbe = Get-Content -LiteralPath $NodeReceiptPath -Raw | ConvertFrom-Json
    } catch {
      $receipt.nodeProbeReadError = $_.Exception.Message
    }
  }
} finally {
  Write-ActivationReceipt
}

if (-not $receipt.success) { exit 1 }
