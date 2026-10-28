[CmdletBinding()]
param([switch]$WithModel)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# This probe is intentionally limited to an ephemeral GitHub-hosted Windows runner.
# It creates a non-exportable test signing key in the runner's CurrentUser store,
# trusts it only in that runner, and removes its signed copy, certificate, package,
# LocalState sentinel, and context receipts in finally. The original unsigned MSIX
# and unpacked inspection tree remain for the runner lifetime. It never handles a
# release certificate or a Store identity.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'MSIX installation probe is restricted to an ephemeral GitHub-hosted Windows runner'
}

$root = Split-Path $PSScriptRoot -Parent
$mode = if ($WithModel) { 'model' } else { 'generic' }
$out = Join-Path $root $(if ($WithModel) { 'tmp/msix-model-probe' } else { 'tmp/msix-probe' })
New-Item -ItemType Directory -Path $out -Force | Out-Null
$receiptPath = Join-Path $out 'receipt.json'

$report = [ordered]@{
  sourceRevision = $env:GITHUB_SHA
  packageBuiltAndInspected = $false
  nativeLayoutVerified = $false
  extractedNativeVersionCommandPassed = $false
  signedCopyCreated = $false
  signedCopySignatureVerified = $false
  installedPackageRegistered = $false
  identityContextNative = $false
  installedNativeVersionCommandPassed = $false
  localStateRoundtrip = $false
  electronGuiLaunched = $false
  installedPackageLaunchVerified = $false
  storeIdentityAssigned = $false
  storeCertificationPassed = $false
  storeRealSignatureVerified = $false
  realModelInferenceVerified = $false
  modelAccuracyVerified = $false
  globalNetworkVerified = $false
  modelMode = $WithModel.IsPresent
  purchaseVerified = $false
  iapVerified = $false
  updateVerified = $false
  publicDistributionReady = $false
  cleanupCompleted = $false
  limitations = @(
    'Ephemeral self-signed test certificate and signed copy are used only on this GitHub-hosted runner.',
    'Invoke-CommandInDesktopPackage verifies package identity and virtual resources only; it does not launch Electron.',
    'AUMID activation uses an ephemeral development identity on Windows Server; it is not a Windows 11 or real Store-acquisition test.',
    $(if ($WithModel) { 'Fixed bundled-model inference on synthetic data only; not a model-accuracy, Windows 11, Store-acquisition, global-offline, update, or IAP proof.' } else { 'No real Store identity, Store signature, certification, update, IAP, model download, or full-model inference is exercised.' })
  )
}

function Write-Receipt {
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding utf8
}

$installedPackage = $null
$testCertificate = $null
$trustedMachineCertificate = $null
$signedPackage = $null
$publicCertificate = $null
$stateFile = $null
$desktopContextFiles = @()
$desktopReceipts = @()
$desktopProgressFiles = @()
$desktopStageProgress = @()
$electronActivationReceiptPath = $null
$secondReceiptPath = $null
$electronNodeReceiptPath = $null
$electronActivationScreenshot = $null
$failure = $null

function Quote-WindowsCommandArgument {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Length -eq 0) { return '""' }
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\\"')
  $escaped = [regex]::Replace($escaped, '(\\*)$', '$1$1')
  return '"' + $escaped + '"'
}

function Invoke-BoundedActivationProbe {
  param([Parameter(Mandatory = $true)][string[]]$Arguments, [int]$TimeoutMs = 90000)
  $pwsh = (Get-Command pwsh -ErrorAction Stop).Source
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $pwsh
  $startInfo.Arguments = ($Arguments | ForEach-Object { Quote-WindowsCommandArgument $_ }) -join ' '
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true
  $activationHost = [System.Diagnostics.Process]::new()
  $activationHost.StartInfo = $startInfo
  $started = $false
  try {
    $started = $activationHost.Start()
    if (-not $started) { throw 'MSIX Electron activation host did not start' }
    $stdoutTask = $activationHost.StandardOutput.ReadToEndAsync()
    $stderrTask = $activationHost.StandardError.ReadToEndAsync()
    if (-not $activationHost.WaitForExit($TimeoutMs)) {
      $activationHost.Kill()
      $activationHost.WaitForExit()
      throw "MSIX Electron activation host timed out after $TimeoutMs ms"
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    return [pscustomobject]@{ exitCode = $activationHost.ExitCode; stdout = $stdout; stderr = $stderr }
  } finally {
    if ($started -and -not $activationHost.HasExited) {
      $activationHost.Kill()
      $activationHost.WaitForExit()
    }
    $activationHost.Dispose()
  }
}

function Read-DesktopProgress {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not [System.IO.File]::Exists($Path)) { return 'no progress marker was written' }
  try {
    return [System.IO.File]::ReadAllText($Path)
  } catch {
    return "progress marker could not be read: $($_.Exception.Message)"
  }
}

function Get-PackageFullNameForProcess {
  param([Parameter(Mandatory = $true)][uint32]$ProcessId)
  if (-not ('CellSentryMsixCleanup.PackageIdentity' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
namespace CellSentryMsixCleanup {
  public static class PackageIdentity {
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetPackageFullName(IntPtr process, ref uint length, StringBuilder value);
    public static string ForProcess(uint processId) {
      IntPtr process = OpenProcess(0x1000, false, processId);
      if (process == IntPtr.Zero) throw new InvalidOperationException("OpenProcess failed");
      try {
        uint length = 0; int first = GetPackageFullName(process, ref length, null);
        if (first != 122 || length <= 1) throw new InvalidOperationException("GetPackageFullName length query failed: " + first);
        var value = new StringBuilder((int)length); int second = GetPackageFullName(process, ref length, value);
        if (second != 0) throw new InvalidOperationException("GetPackageFullName failed: " + second);
        return value.ToString();
      } finally { CloseHandle(process); }
    }
  }
}

'@
  }
  return [CellSentryMsixCleanup.PackageIdentity]::ForProcess($ProcessId)
}

function Invoke-DesktopProbeStage {
  param(
    [Parameter(Mandatory = $true)][string]$Stage,
    [Parameter(Mandatory = $true)][hashtable]$Context,
    [Parameter(Mandatory = $true)][string]$PackageFamilyName,
    [Parameter(Mandatory = $true)][string]$AppId
  )

  $invocationId = [guid]::NewGuid().ToString('N')
  $Context['invocationId'] = $invocationId
  $contextPath = Join-Path $out "desktop-$Stage-$invocationId.context.json"
  $stageReceipt = Join-Path $out "desktop-$Stage-$invocationId.receipt.json"
  $progressPath = Join-Path $out "desktop-$Stage-$invocationId.progress.json"
  $script:desktopContextFiles += $contextPath
  $script:desktopReceipts += $stageReceipt
  $script:desktopProgressFiles += $progressPath
  $Context | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $contextPath -Encoding utf8

  $probeScript = Join-Path $PSScriptRoot 'msix-desktop-context-probe.ps1'
  if (-not (Test-Path -LiteralPath $probeScript -PathType Leaf)) { throw 'Desktop package context probe script is missing' }
  $arguments = @('-NoProfile', '-NonInteractive', '-File', $probeScript, '-ContextPath', $contextPath, '-Stage', $Stage, '-Receipt', $stageReceipt, '-ProgressPath', $progressPath) |
    ForEach-Object { Quote-WindowsCommandArgument ([string]$_) }
  Invoke-CommandInDesktopPackage -PackageFamilyName $PackageFamilyName -AppId $AppId -Command 'powershell.exe' -Args ($arguments -join ' ') -PreventBreakaway

  # This bounds receipt waiting after the debugging cmdlet returns. It is not a
  # wall-clock bound on the cmdlet itself; the workflow timeout remains in force.
  $deadline = (Get-Date).AddSeconds(45)
  while (-not (Test-Path -LiteralPath $stageReceipt) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
  }
  if (-not (Test-Path -LiteralPath $stageReceipt -PathType Leaf)) {
    $lastProgress = Read-DesktopProgress $progressPath
    $progressEvidence = [ordered]@{
      stage = $Stage
      invocationId = $invocationId
      timedOut = $true
      lastProgress = $lastProgress
    }
    $script:desktopStageProgress += $progressEvidence
    $script:report['desktopStageProgress'] = $script:desktopStageProgress
    throw "Desktop package receipt wait timed out after command returned: $Stage/$invocationId; last progress: $lastProgress"
  }
  $stageResult = Get-Content -LiteralPath $stageReceipt -Raw | ConvertFrom-Json
  if ($stageResult.stage -ne $Stage -or $stageResult.invocationId -ne $invocationId) {
    throw "Desktop package probe receipt did not match its invocation: $Stage/$invocationId"
  }
  if (-not $stageResult.success) {
    $script:desktopStageProgress += [ordered]@{
      stage = $Stage
      invocationId = $invocationId
      timedOut = $false
      receiptSuccess = $false
      lastProgress = (Read-DesktopProgress $progressPath)
    }
    $script:report['desktopStageProgress'] = $script:desktopStageProgress
    throw "Desktop package probe failed for ${Stage}: $($stageResult.error)"
  }
  $progressDeadline = (Get-Date).AddSeconds(5)
  $lastProgress = Read-DesktopProgress $progressPath
  while ($lastProgress -notmatch '"checkpoint"\s*:\s*"receipt-committed"' -and (Get-Date) -lt $progressDeadline) {
    Start-Sleep -Milliseconds 100
    $lastProgress = Read-DesktopProgress $progressPath
  }
  if ($lastProgress -notmatch '"checkpoint"\s*:\s*"receipt-committed"') {
    throw "Desktop package probe wrote a receipt without its receipt-committed progress marker: $Stage/$invocationId; last progress: $lastProgress"
  }
  $script:desktopStageProgress += [ordered]@{
    stage = $Stage
    invocationId = $invocationId
    timedOut = $false
    lastProgress = $lastProgress
  }
  $script:report['desktopStageProgress'] = $script:desktopStageProgress
  return $stageResult
}

try {
  foreach ($command in @('Add-AppxPackage', 'Get-AppxPackage', 'Remove-AppxPackage', 'Invoke-CommandInDesktopPackage', 'New-SelfSignedCertificate', 'Export-Certificate', 'Import-Certificate')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
      throw "Required Windows PowerShell command is unavailable: $command"
    }
  }

$packageOutput = if ($WithModel) { 'app/dist-msix-model-probe' } else { 'app/dist-msix-probe' }
$expectedIdentity = if ($WithModel) { 'CellSentry.MsixModelProbe' } else { 'CellSentry.MsixProbe' }
$expectedApplicationId = if ($WithModel) { 'CellSentryModelProbe' } else { 'CellSentryProbe' }
$packages = @(Get-ChildItem (Join-Path $root $packageOutput) -Filter '*.msix')
if ($packages.Count -ne 1) { throw 'Expected exactly one development MSIX package' }
$package = $packages[0]
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($package.FullName)
try {
  foreach ($entry in @('AppxBlockMap.xml', '[Content_Types].xml')) {
    if (-not $zip.GetEntry($entry)) { throw "Missing package metadata: $entry" }
  }
} finally { $zip.Dispose() }
$unpacked = Join-Path $out 'unpacked'
# MSIX stores URI-encoded ZIP entry names (for example CellSentry%20Beta.exe).
# The Windows package tool restores actual package paths; a generic ZIP extractor does not.
$sdkBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
$makeAppx = Get-ChildItem "$sdkBin/*/x64/makeappx.exe" |
  Sort-Object { [version]$_.Directory.Parent.Name } -Descending |
  Select-Object -First 1
if (-not $makeAppx) { throw 'Windows SDK MakeAppX is required to inspect the MSIX' }
& $makeAppx.FullName unpack /p $package.FullName /d $unpacked
if ($LASTEXITCODE -ne 0) { throw 'Windows SDK could not unpack the MSIX' }

[xml]$manifest = Get-Content (Join-Path $unpacked 'AppxManifest.xml') -Raw
$ns = [System.Xml.XmlNamespaceManager]::new($manifest.NameTable)
$ns.AddNamespace('p', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')
$ns.AddNamespace('r', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities')
$identity = $manifest.SelectSingleNode('/p:Package/p:Identity', $ns)
if ($identity.GetAttribute('Name') -ne $expectedIdentity) { throw 'Unexpected probe identity' }
if ($identity.GetAttribute('Publisher') -ne 'CN=CellSentryMSIXProbe') { throw 'Unexpected probe publisher' }
if ($identity.GetAttribute('ProcessorArchitecture') -ne 'x64') { throw 'Expected x64 package' }
$application = $manifest.SelectSingleNode('/p:Package/p:Applications/p:Application', $ns)
if ($application.GetAttribute('Id') -ne $expectedApplicationId) { throw 'Unexpected application identity' }
if ($application.GetAttribute('EntryPoint') -ne 'Windows.FullTrustApplication') { throw 'Missing full-trust application entry' }
if (-not $manifest.SelectSingleNode('/p:Package/p:Capabilities/r:Capability[@Name="runFullTrust"]', $ns)) {
  throw 'Missing full-trust capability'
}
if (-not (Test-Path (Join-Path $unpacked $application.GetAttribute('Executable')) -PathType Leaf)) {
  throw 'Missing application executable'
}
if (-not (Test-Path -LiteralPath (Join-Path $unpacked 'app/resources/app.asar') -PathType Leaf)) {
  throw 'Missing packaged application asar'
}

$nativeDir = Join-Path $unpacked 'app/resources/native/win32-x64'
$verifier = Join-Path $PSScriptRoot 'lib/packaged-native-runtime.cjs'
node -e 'require(process.argv[1]).verifyPackagedNativeRuntime(process.argv[2]).catch(e => { console.error(e.message); process.exitCode = 1 })' $verifier $nativeDir
if ($LASTEXITCODE -ne 0) { throw 'Packaged native runtime layout check failed' }
$runtime = Get-Content (Join-Path $nativeDir 'runtime.json') -Raw | ConvertFrom-Json
$server = Join-Path $nativeDir $runtime.executable
if (-not (Test-Path -LiteralPath $server -PathType Leaf)) { throw 'Missing packaged llama-server' }
$nativeVersion = @(& $server --version 2>&1 | ForEach-Object { "$_" })
if ($LASTEXITCODE -ne 0) { throw 'Packaged llama-server could not execute on the Windows runner' }

$report['package'] = $package.Name
$report['bytes'] = $package.Length
$report['sha256'] = (Get-FileHash $package.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$report['identityName'] = $identity.GetAttribute('Name')
$report['publisher'] = $identity.GetAttribute('Publisher')
$report['applicationId'] = $application.GetAttribute('Id')
$report['packageBuiltAndInspected'] = $true
$report['unpackMethod'] = 'Windows SDK MakeAppX'
$report['nativeLayoutVerified'] = $true
$report['extractedNativeVersionCommandPassed'] = $true
$report['extractedNativeVersion'] = $nativeVersion
$report['modelBundled'] = (Test-Path (Join-Path $unpacked 'app/resources/offline-model'))
if ($WithModel -and -not $report['modelBundled']) { throw 'Model-mode MSIX is missing its sealed offline-model payload' }
if (-not $WithModel -and $report['modelBundled']) { throw 'Generic MSIX probe unexpectedly bundled a model' }
if ($WithModel) {
  & node (Join-Path $root 'scripts/verify-formula-cancellation-v2-package.mjs') --dir (Join-Path $unpacked 'app/resources/offline-model')
  if ($LASTEXITCODE -ne 0) { throw 'Unpacked MSIX model payload did not match the pinned five-file package' }
}

# Sign only a temporary copy. The private key is explicitly non-exportable and
# SignTool selects it directly from CurrentUser\\My by thumbprint, so no PFX is made.
$signedPackage = Join-Path $out ('signed-' + $package.Name)
Copy-Item -LiteralPath $package.FullName -Destination $signedPackage -Force
$testCertificate = New-SelfSignedCertificate `
  -Type Custom `
  -Subject $identity.GetAttribute('Publisher') `
  -KeyUsage DigitalSignature `
  -KeyExportPolicy NonExportable `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -NotAfter (Get-Date).AddHours(1) `
  -FriendlyName 'CellSentry MSIX CI probe (ephemeral)' `
  -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
if (-not $testCertificate.HasPrivateKey) { throw 'Temporary MSIX test certificate has no private key' }

$publicCertificate = Join-Path $out 'ephemeral-test-public.cer'
Export-Certificate -Cert $testCertificate -FilePath $publicCertificate -Force | Out-Null
$trustedMachineCertificate = Import-Certificate -FilePath $publicCertificate -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople'
if ($trustedMachineCertificate.Thumbprint -ne $testCertificate.Thumbprint) {
  throw 'Temporary trusted certificate did not match signing certificate'
}

$signTool = Get-ChildItem "$sdkBin/*/x64/signtool.exe" |
  Sort-Object { [version]$_.Directory.Parent.Name } -Descending |
  Select-Object -First 1
if (-not $signTool) { throw 'Windows SDK SignTool is required to sign the temporary MSIX copy' }
& $signTool.FullName sign /fd SHA256 /sha1 $testCertificate.Thumbprint /v $signedPackage
if ($LASTEXITCODE -ne 0) { throw 'Windows SDK SignTool could not sign the temporary MSIX copy' }
& $signTool.FullName verify /pa /v $signedPackage
if ($LASTEXITCODE -ne 0) { throw 'Windows SDK SignTool could not verify the temporary MSIX signature' }
$report['signedCopyCreated'] = $true
$report['signedCopySignatureVerified'] = $true

# Add-AppxPackage must fail the job if trust, deployment, or registration does
# not work. Querying the registered package makes installation an observable gate.
if (@(Get-AppxPackage -Name $identity.GetAttribute('Name')).Count -ne 0) { throw 'Development probe identity was already installed before this isolated first activation' }
Add-AppxPackage -Path $signedPackage
$installedPackage = @(Get-AppxPackage -Name $identity.GetAttribute('Name') | Where-Object {
  $_.PackageFullName -like "$($identity.GetAttribute('Name'))_*" -and
  $_.Publisher -eq $identity.GetAttribute('Publisher') -and
  $_.Architecture -eq 'X64'
})
if ($installedPackage.Count -ne 1) { throw 'Expected exactly one registered temporary MSIX package' }
$installedPackage = $installedPackage[0]
if ($installedPackage.PackageFamilyName -notlike "$($identity.GetAttribute('Name'))_*") {
  throw 'Registered package family name did not match the manifest identity'
}
$report['installedPackageRegistered'] = $true
$report['installedPackageFullName'] = $installedPackage.PackageFullName
$report['installedPackageFamilyName'] = $installedPackage.PackageFamilyName
$report['installedInstallLocation'] = $installedPackage.InstallLocation

$installedServer = Join-Path (Join-Path $installedPackage.InstallLocation 'app/resources/native/win32-x64') $runtime.executable
if (-not (Test-Path -LiteralPath $installedServer -PathType Leaf)) {
  throw 'Installed package does not contain the expected llama-server executable'
}
$stateFile = Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA 'Packages') $installedPackage.PackageFamilyName) 'LocalState/cellsentry-msix-ci-state.txt'
$stateToken = "cellsentry-msix-probe-$([guid]::NewGuid().ToString('N'))"
$desktopContext = @{
  expectedPackageFullName = $installedPackage.PackageFullName
  nativeServer = $installedServer
  stateFile = $stateFile
  stateToken = $stateToken
}

# Invoke-CommandInDesktopPackage accepts an executable path plus one argument
# string, not a PowerShell ScriptBlock. Each package-context child therefore
# writes a unique atomic sentinel; missing, mismatched, or failed sentinels fail
# the parent instead of relying on the cmdlet's output.
$identityResult = Invoke-DesktopProbeStage -Stage 'identity' -Context $desktopContext -PackageFamilyName $installedPackage.PackageFamilyName -AppId $application.GetAttribute('Id')
$report['identityContextNative'] = $true
$report['identityContext'] = $identityResult

$nativeResult = Invoke-DesktopProbeStage -Stage 'native' -Context $desktopContext -PackageFamilyName $installedPackage.PackageFamilyName -AppId $application.GetAttribute('Id')
if ($nativeResult.exitCode -ne 0) { throw 'Installed llama-server probe returned a non-zero exit code' }
$report['installedNativeVersionCommandPassed'] = $true
$report['installedNativeVersion'] = $nativeResult

# Two identity-context invocations write then read one synthetic LocalState value.
# This is deliberately not a claim about Electron's own persistence behavior.
$writeResult = Invoke-DesktopProbeStage -Stage 'state-write' -Context $desktopContext -PackageFamilyName $installedPackage.PackageFamilyName -AppId $application.GetAttribute('Id')
if ($writeResult.value -ne $stateToken) { throw 'Package LocalState write did not round-trip inside package identity context' }
$readResult = Invoke-DesktopProbeStage -Stage 'state-read' -Context $desktopContext -PackageFamilyName $installedPackage.PackageFamilyName -AppId $application.GetAttribute('Id')
if ($readResult.value -ne $stateToken) { throw 'Package LocalState read did not persist across package identity invocations' }
$report['localStateRoundtrip'] = $true

# This is intentionally separate from Invoke-CommandInDesktopPackage: it starts
# the manifest application through its AUMID, then requires real Electron main
# and renderer evidence. Directly executing the package EXE is not accepted.
$electronActivationReceiptPath = Join-Path $out 'electron-activation-receipt.json'
$electronNodeReceiptPath = Join-Path $out 'electron-node-receipt.json'
$electronActivationScreenshot = Join-Path $out 'electron-home.png'
$activationScript = Join-Path $PSScriptRoot 'activate-msix-electron.ps1'
$nodeProbeScript = Join-Path $PSScriptRoot $(if ($WithModel) { 'probe-msix-electron-model.cjs' } else { 'probe-msix-electron.cjs' })
if (-not (Test-Path -LiteralPath $activationScript -PathType Leaf)) { throw 'MSIX Electron activation script is missing' }
if (-not (Test-Path -LiteralPath $nodeProbeScript -PathType Leaf)) { throw 'MSIX Electron Node probe script is missing' }
$activationArguments = @(
  '-NoProfile', '-NonInteractive', '-File', $activationScript,
  '-PackageFullName', $installedPackage.PackageFullName,
  '-PackageFamilyName', $installedPackage.PackageFamilyName,
  '-ApplicationId', $application.GetAttribute('Id'),
  '-NodePath', (Get-Command node -ErrorAction Stop).Source,
  '-ProbeScript', $nodeProbeScript,
  '-ReceiptPath', $electronActivationReceiptPath,
  '-NodeReceiptPath', $electronNodeReceiptPath,
  '-ScreenshotPath', $electronActivationScreenshot
)
if ($WithModel) {
  $fixture = Join-Path $root 'app/e2e/fixtures/golden-three-workflows.xlsx'
  if (-not (Test-Path -LiteralPath $fixture -PathType Leaf)) { throw 'Model-mode audit fixture is missing' }
  $activationArguments += @('-ModelMode', '-ModelFixturePath', $fixture, '-ModelPhase', 'first')
}
$firstActivationStartedAtMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$activationTimeoutMs = if ($WithModel) { 500000 } else { 90000 }
$activationHostResult = Invoke-BoundedActivationProbe -Arguments $activationArguments -TimeoutMs $activationTimeoutMs
if (-not (Test-Path -LiteralPath $electronActivationReceiptPath -PathType Leaf)) {
  throw "MSIX Electron activation did not write a receipt (exit $($activationHostResult.exitCode)): $($activationHostResult.stderr) $($activationHostResult.stdout)"
}
$electronActivation = Get-Content -LiteralPath $electronActivationReceiptPath -Raw | ConvertFrom-Json
$report['electronActivation'] = $electronActivation
if ($activationHostResult.exitCode -ne 0 -or ($electronActivation.success -isnot [bool]) -or -not $electronActivation.success) {
  throw "MSIX Electron AUMID activation failed: $($electronActivation.error)"
}
if ($WithModel) {
  $modelReceipt = $electronActivation.modelProbe
  if (($modelReceipt.modelLoaded -isnot [bool]) -or -not $modelReceipt.modelLoaded -or
      ($modelReceipt.nativeBackend -isnot [bool]) -or -not $modelReceipt.nativeBackend -or
      ($modelReceipt.auditAttempted -isnot [bool]) -or -not $modelReceipt.auditAttempted -or
      ($modelReceipt.auditReviewed -isnot [bool]) -or -not $modelReceipt.auditReviewed) {
    throw 'Model-mode activation did not prove a bundled model load and valid local audit review'
  }
  $report['realModelInferenceVerified'] = $true
  $report['modelFirstRun'] = $modelReceipt
  if (-not $modelReceipt.userData) { throw 'Model-mode first activation did not report its authenticated userData path' }
  $firstModelFingerprint = $modelReceipt.modelFingerprint
  if ($modelReceipt.modelFingerprintContext -ne 'activated-main-process-msix-identity') { throw 'Model fingerprint was not read in the activated MSIX identity context' }
  if ($firstModelFingerprint.bytes -ne 1561314592 -or $firstModelFingerprint.sha256 -ne '61d9c8ab8007dbbde0eb004089d1411fb6ec7167031f9d6fcc5b521fe8ebe49a') {
    throw 'Model-mode first activation persisted a model that did not match the pinned artifact'
  }
  if ($firstModelFingerprint.createdAtMs -lt $firstActivationStartedAtMs) { throw 'First activation reused a pre-existing model file instead of preparing the bundled model' }
  $report['modelCreatedAfterFirstActivation'] = $true
  $secondReceiptPath = Join-Path $out 'electron-model-reuse-activation-receipt.json'
  $secondNodeReceiptPath = Join-Path $out 'electron-model-reuse-node-receipt.json'
  $secondScreenshotPath = Join-Path $out 'electron-model-reuse-home.png'
  $secondArguments = @(
    '-NoProfile', '-NonInteractive', '-File', $activationScript,
    '-PackageFullName', $installedPackage.PackageFullName,
    '-PackageFamilyName', $installedPackage.PackageFamilyName,
    '-ApplicationId', $application.GetAttribute('Id'),
    '-NodePath', (Get-Command node -ErrorAction Stop).Source,
    '-ProbeScript', $nodeProbeScript,
    '-ReceiptPath', $secondReceiptPath,
    '-NodeReceiptPath', $secondNodeReceiptPath,
    '-ScreenshotPath', $secondScreenshotPath,
    '-ModelMode', '-ModelFixturePath', $fixture, '-ModelPhase', 'reuse'
  )
  $secondHost = Invoke-BoundedActivationProbe -Arguments $secondArguments -TimeoutMs $activationTimeoutMs
  if (-not (Test-Path -LiteralPath $secondReceiptPath -PathType Leaf)) { throw 'Model-mode reuse activation did not write a receipt' }
  $secondActivation = Get-Content -LiteralPath $secondReceiptPath -Raw | ConvertFrom-Json
  if ($secondHost.exitCode -ne 0 -or ($secondActivation.success -isnot [bool]) -or -not $secondActivation.success) { throw "Model-mode reuse activation failed: $($secondActivation.error)" }
  $secondModelReceipt = $secondActivation.modelProbe
  if (($secondModelReceipt.modelLoaded -isnot [bool]) -or -not $secondModelReceipt.modelLoaded -or ($secondModelReceipt.nativeBackend -isnot [bool]) -or -not $secondModelReceipt.nativeBackend -or $secondModelReceipt.userData -ne $modelReceipt.userData) { throw 'Model-mode reuse did not load the same persisted user profile' }
  $secondModelFingerprint = $secondModelReceipt.modelFingerprint
  if ($secondModelReceipt.modelFingerprintContext -ne 'activated-main-process-msix-identity') { throw 'Reuse fingerprint was not read in the activated MSIX identity context' }
  if ($secondModelFingerprint.bytes -ne $firstModelFingerprint.bytes -or $secondModelFingerprint.sha256 -ne $firstModelFingerprint.sha256 -or $secondModelFingerprint.lastWriteTimeMs -ne $firstModelFingerprint.lastWriteTimeMs) { throw 'Model-mode reuse replaced or changed the persisted model file' }
  $report['modelReuse'] = [ordered]@{ sameUserData = $true; first = $firstModelFingerprint; second = $secondModelFingerprint; unchanged = $true; activation = $secondModelReceipt }
}
$report['electronGuiLaunched'] = $true
$report['installedPackageLaunchVerified'] = $true
} catch {
  $failure = $_
  $report['failure'] = $_.Exception.Message
} finally {
  $cleanupErrors = @()
  foreach ($cleanupReceiptPath in @($electronActivationReceiptPath, $secondReceiptPath)) {
  if ($cleanupReceiptPath -and (Test-Path -LiteralPath $cleanupReceiptPath -PathType Leaf) -and $installedPackage) {
    try {
      $activationCleanup = Get-Content -LiteralPath $cleanupReceiptPath -Raw | ConvertFrom-Json
      if ($cleanupReceiptPath -eq $secondReceiptPath) { $report['modelReuseActivation'] = $activationCleanup } else { $report['electronActivation'] = $activationCleanup }
      if ($activationCleanup.activatedProcessId -and (Get-Process -Id $activationCleanup.activatedProcessId -ErrorAction SilentlyContinue)) {
        $runningPackageFullName = Get-PackageFullNameForProcess ([uint32]$activationCleanup.activatedProcessId)
        if ($runningPackageFullName -ne $installedPackage.PackageFullName) {
          throw 'Refusing to terminate an activation PID whose package identity does not match the temporary MSIX'
        }
        Stop-Process -Id $activationCleanup.activatedProcessId -Force -ErrorAction Stop
        $terminationDeadline = [DateTime]::UtcNow.AddSeconds(5)
        while ((Get-Process -Id $activationCleanup.activatedProcessId -ErrorAction SilentlyContinue) -and [DateTime]::UtcNow -lt $terminationDeadline) {
          Start-Sleep -Milliseconds 100
        }
        if (Get-Process -Id $activationCleanup.activatedProcessId -ErrorAction SilentlyContinue) {
          throw 'Activated Electron process did not exit after targeted cleanup'
        }
      }
    } catch { $cleanupErrors += "activated Electron process: $($_.Exception.Message)" }
  }
  }
  if ($stateFile -and (Test-Path -LiteralPath $stateFile)) {
    try { Remove-Item -LiteralPath $stateFile -Force } catch { $cleanupErrors += "state file: $($_.Exception.Message)" }
  }
  if ($installedPackage) {
    try { Remove-AppxPackage -Package $installedPackage.PackageFullName } catch { $cleanupErrors += "installed package: $($_.Exception.Message)" }
  }
  if ($trustedMachineCertificate) {
    try { Remove-Item -LiteralPath "Cert:\LocalMachine\TrustedPeople\$($trustedMachineCertificate.Thumbprint)" -Force } catch { $cleanupErrors += "trusted machine certificate: $($_.Exception.Message)" }
  }
  if ($testCertificate) {
    try { Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($testCertificate.Thumbprint)" -Force } catch { $cleanupErrors += "signing certificate: $($_.Exception.Message)" }
  }
  foreach ($temporaryFile in @($publicCertificate, $signedPackage, $electronNodeReceiptPath) + $desktopContextFiles + $desktopReceipts + $desktopProgressFiles) {
    if ($temporaryFile -and (Test-Path -LiteralPath $temporaryFile)) {
      try { Remove-Item -LiteralPath $temporaryFile -Force } catch { $cleanupErrors += "temporary file ${temporaryFile}: $($_.Exception.Message)" }
    }
  }
  if ($cleanupErrors.Count -gt 0) {
    $report['cleanupErrors'] = $cleanupErrors
    if (-not $failure) { $failure = [System.Exception]::new("MSIX probe cleanup failed: $($cleanupErrors -join '; ')") }
  } else {
    $report['cleanupCompleted'] = $true
  }
  Write-Receipt
}

# This contains only synthetic runner/probe metadata. Preserve partial evidence
# in the log as well as the receipt even when a stage fails.
$report | ConvertTo-Json -Depth 10
if ($failure) { throw $failure }
