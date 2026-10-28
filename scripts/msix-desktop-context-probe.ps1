[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ContextPath,
  [Parameter(Mandatory = $true)][ValidateSet('identity', 'native', 'state-write', 'state-read')][string]$Stage,
  [Parameter(Mandatory = $true)][string]$Receipt,
  [Parameter(Mandatory = $true)][string]$ProgressPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Progress {
  param([Parameter(Mandatory = $true)][string]$Checkpoint)
  $progress = [ordered]@{
    stage = $Stage
    invocationId = $probeContext.invocationId
    pid = $PID
    checkpoint = $Checkpoint
    requestedStateFile = $probeContext.stateFile
    localAppData = $env:LOCALAPPDATA
    timestampUtc = [DateTime]::UtcNow.ToString('o')
  }
  [System.IO.File]::WriteAllText($ProgressPath, ($progress | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
}

function Write-AtomicReceipt {
  param([Parameter(Mandatory = $true)]$Value)
  $directory = [System.IO.Path]::GetDirectoryName($Receipt)
  [void][System.IO.Directory]::CreateDirectory($directory)
  $temporary = [System.IO.Path]::Combine($directory, ".$([guid]::NewGuid().ToString('N')).tmp")
  try {
    [System.IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::Move($temporary, $Receipt)
  } finally {
    if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
  }
}

$probeContext = $null
try {
  $probeContext = Get-Content -LiteralPath $ContextPath -Raw | ConvertFrom-Json
  Write-Progress 'context-loaded'
  $result = [ordered]@{
    success = $true
    stage = $Stage
    invocationId = $probeContext.invocationId
  }

  switch ($Stage) {
    'identity' {
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CellSentryMsixIdentityProbe {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetCurrentPackageFullName")]
  public static extern int GetCurrentPackageFullNameLength(ref uint packageFullNameLength, IntPtr packageFullName);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetCurrentPackageFullName")]
  public static extern int GetCurrentPackageFullName(ref uint packageFullNameLength, StringBuilder packageFullName);
}
'@
      [uint32]$length = 0
      $firstResult = [CellSentryMsixIdentityProbe]::GetCurrentPackageFullNameLength([ref]$length, [IntPtr]::Zero)
      if ($firstResult -ne 122 -or $length -le 1) { throw "GetCurrentPackageFullName length query failed: $firstResult" }
      $fullName = [Text.StringBuilder]::new([int]$length)
      $secondResult = [CellSentryMsixIdentityProbe]::GetCurrentPackageFullName([ref]$length, $fullName)
      if ($secondResult -ne 0) { throw "GetCurrentPackageFullName failed: $secondResult" }
      if ($fullName.ToString() -ne $probeContext.expectedPackageFullName) { throw 'Package full name did not match registered package' }
      $result['packageFullName'] = $fullName.ToString()
      $result['firstResult'] = $firstResult
      $result['secondResult'] = $secondResult
    }
    'native' {
      $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
      $startInfo.FileName = $probeContext.nativeServer
      $startInfo.Arguments = '--version'
      $startInfo.UseShellExecute = $false
      $startInfo.RedirectStandardOutput = $true
      $startInfo.RedirectStandardError = $true
      $startInfo.CreateNoWindow = $true
      $process = [System.Diagnostics.Process]::new()
      $process.StartInfo = $startInfo
      $started = $false
      try {
        $started = $process.Start()
        if (-not $started) { throw 'Installed llama-server process did not start' }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(15000)) {
          $process.Kill()
          $process.WaitForExit()
          [void]$stdoutTask.GetAwaiter().GetResult()
          [void]$stderrTask.GetAwaiter().GetResult()
          throw 'Installed llama-server --version timed out after 15 seconds'
        }
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        $exitCode = $process.ExitCode
      } finally {
        if ($started -and -not $process.HasExited) {
          $process.Kill()
          $process.WaitForExit()
        }
        $process.Dispose()
      }
      if ($exitCode -ne 0) { throw "Installed llama-server exited with code $exitCode" }
      $result['executable'] = $probeContext.nativeServer
      $result['exitCode'] = $exitCode
      $result['stdout'] = $stdout
      $result['stderr'] = $stderr
    }
    'state-write' {
      [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($probeContext.stateFile))
      Write-Progress 'localstate-directory-ready'
      [System.IO.File]::WriteAllText($probeContext.stateFile, $probeContext.stateToken, [System.Text.UTF8Encoding]::new($false))
      Write-Progress 'localstate-write-complete'
      $result['value'] = [System.IO.File]::ReadAllText($probeContext.stateFile)
      Write-Progress 'localstate-readback-complete'
    }
    'state-read' {
      $result['value'] = [System.IO.File]::ReadAllText($probeContext.stateFile)
      Write-Progress 'localstate-readback-complete'
    }
  }

  Write-AtomicReceipt $result
  Write-Progress 'receipt-committed'
} catch {
  $failureReceipt = [ordered]@{
    success = $false
    stage = $Stage
    invocationId = $(if ($probeContext) { $probeContext.invocationId } else { $null })
    error = $_.Exception.Message
  }
  Write-AtomicReceipt $failureReceipt
  if ($probeContext) { Write-Progress 'receipt-committed' }
  exit 1
}
