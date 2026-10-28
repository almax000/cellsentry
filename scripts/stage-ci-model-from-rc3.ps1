[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$StageDir,
  [string]$ReceiptPath = (Join-Path $env:RUNNER_TEMP 'cellsentry-rc3-model-stage-receipt.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repository = 'almax000/cellsentry'
$ReleaseTag = 'v1.1.0-beta.2-rc.20261023.3'
$DmgUrl = "https://github.com/$Repository/releases/download/$ReleaseTag/CellSentry-1.1.0-beta.2-rc.20261023.3-arm64-offline.dmg"
$ExpectedDmgBytes = [Int64]1690069908
$ExpectedDmgSha256 = 'e90be3eb150c6c197081d7522762a33f9bc73642fc0ab168b89d5d22f4b0a6ce'
$RequiredFreeBytes = [Int64]16GB
$ExpectedModelFiles = @(
  'LICENSE',
  'NOTICE.txt',
  'manifest.json',
  'SHA256SUMS',
  'cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf'
)
$StageCreated = $false
$WorkDir = $null

$Report = [ordered]@{
  schemaVersion = 1
  source = 'historical_rc3_dmg'
  repository = $Repository
  releaseTag = $ReleaseTag
  dmgBytes = $ExpectedDmgBytes
  dmgSha256 = $ExpectedDmgSha256
  requiredFreeBytes = $RequiredFreeBytes
  stage = 'initializing'
  listStatus = 'not-run'
  extractionStatus = 'not-run'
  packageVerified = $false
  fullModelDownloaded = $false
  inferenceVerified = $false
  publicDistributionVerified = $false
  errorKind = $null
}

function Set-ErrorKind([string]$Kind) {
  $Report.errorKind = $Kind
  throw [System.InvalidOperationException]::new($Kind)
}

function Write-Receipt {
  $parent = Split-Path -Parent $ReceiptPath
  if ($parent) { [System.IO.Directory]::CreateDirectory($parent) | Out-Null }
  [System.IO.File]::WriteAllText($ReceiptPath, ($Report | ConvertTo-Json -Depth 5) + "`n", [System.Text.UTF8Encoding]::new($false))
}

function Assert-HostedWindowsRunner {
  if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    Set-ErrorKind 'environment-not-eligible'
  }
}

function Assert-FreeSpace([string]$Path) {
  $root = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($Path))
  $name = $root.TrimEnd('\').TrimEnd(':')
  $drive = Get-PSDrive -Name $name
  if ($drive.Free -lt $RequiredFreeBytes) { Set-ErrorKind 'insufficient-disk-space' }
}

function Get-SevenZipPath {
  $command = Get-Command '7z.exe' -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $fallback = Join-Path ${env:ProgramFiles} '7-Zip\7z.exe'
  if (Test-Path -LiteralPath $fallback -PathType Leaf) { return $fallback }
  Set-ErrorKind '7zip-not-available'
}

function Invoke-SevenZipList([string]$SevenZip, [string]$Archive, [string]$Name) {
  $stdout = Join-Path $WorkDir "$Name-list.txt"
  $stderr = Join-Path $WorkDir "$Name-list.stderr.txt"
  $process = Start-Process -FilePath $SevenZip -ArgumentList @('l', '-slt', ('"' + $Archive + '"')) -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  if ($process.ExitCode -ne 0) { Set-ErrorKind '7zip-list-failed' }
  if ((Get-Item -LiteralPath $stdout).Length -gt 4MB) { Set-ErrorKind '7zip-list-output-too-large' }
  return [System.IO.File]::ReadAllText($stdout)
}

function Invoke-SevenZipExtract([string]$SevenZip, [string]$Archive, [string]$Destination, [string[]]$Paths, [string]$Name) {
  if ($Paths.Count -eq 0) { Set-ErrorKind 'empty-extraction-selection' }
  [System.IO.Directory]::CreateDirectory($Destination) | Out-Null
  $stdout = Join-Path $WorkDir "$Name-extract.txt"
  $stderr = Join-Path $WorkDir "$Name-extract.stderr.txt"
  $arguments = @('x', '-y', ('"-o' + $Destination + '"'), ('"' + $Archive + '"')) + @($Paths | ForEach-Object { '"' + $_ + '"' })
  $process = Start-Process -FilePath $SevenZip -ArgumentList $arguments -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  if ($process.ExitCode -ne 0) { Set-ErrorKind '7zip-extract-failed' }
}

function Get-ModelEntries([string]$Listing) {
  $entries = @()
  foreach ($line in ($Listing -split "`r?`n")) {
    if ($line -notmatch '^Path = (.+)$') { continue }
    $path = $Matches[1]
    $normalized = $path -replace '\\', '/'
    if ($normalized -match '(?i)(?:^|/)offline-model/(.+)$') {
      $name = $Matches[1]
      if ($name -notin $ExpectedModelFiles) { Set-ErrorKind 'unexpected-model-path' }
      $entries += [pscustomobject]@{ ArchivePath = $path; Name = $name }
    }
  }
  if ($entries.Count -eq 0) { return @() }
  if ($entries.Count -ne $ExpectedModelFiles.Count) { Set-ErrorKind 'ambiguous-model-paths' }
  foreach ($name in $ExpectedModelFiles) {
    if (@($entries | Where-Object Name -eq $name).Count -ne 1) { Set-ErrorKind 'ambiguous-model-paths' }
  }
  return $entries
}

function Get-SingleHfsPartition([string]$Listing) {
  $partitions = @()
  foreach ($line in ($Listing -split "`r?`n")) {
    if ($line -match '^Path = ([^/\\]+\.(?:hfs|hfsx))$') { $partitions += $Matches[1] }
  }
  if ($partitions.Count -ne 1) { Set-ErrorKind 'unsupported-dmg-layout' }
  return $partitions[0]
}

function Get-ExtractedModelFiles([string]$Directory) {
  $files = @(Get-ChildItem -LiteralPath $Directory -Recurse -File)
  if ($files.Count -ne $ExpectedModelFiles.Count) { Set-ErrorKind 'unexpected-extracted-files' }
  foreach ($name in $ExpectedModelFiles) {
    if (@($files | Where-Object Name -eq $name).Count -ne 1) { Set-ErrorKind 'unexpected-extracted-files' }
  }
  return $files
}

try {
  Assert-HostedWindowsRunner
  if (-not $env:RUNNER_TEMP) { Set-ErrorKind 'runner-temp-unavailable' }
  $StageDir = [System.IO.Path]::GetFullPath($StageDir)
  if (Test-Path -LiteralPath $StageDir) { Set-ErrorKind 'stage-already-exists' }
  Assert-FreeSpace $env:RUNNER_TEMP
  Assert-FreeSpace (Split-Path -Parent $StageDir)
  [System.IO.Directory]::CreateDirectory($StageDir) | Out-Null
  $StageCreated = $true
  $WorkDir = Join-Path $env:RUNNER_TEMP ('cellsentry-rc3-model-' + [guid]::NewGuid().ToString('N'))
  [System.IO.Directory]::CreateDirectory($WorkDir) | Out-Null
  $dmg = Join-Path $WorkDir 'rc3-offline.dmg'

  $Report.stage = 'download'
  Invoke-WebRequest -Uri $DmgUrl -OutFile $dmg -MaximumRedirection 5
  $dmgInfo = Get-Item -LiteralPath $dmg
  $dmgHash = (Get-FileHash -LiteralPath $dmg -Algorithm SHA256).Hash.ToLowerInvariant()
  $Report.downloadedDmgBytes = $dmgInfo.Length
  $Report.downloadedDmgSha256 = $dmgHash
  if ($dmgInfo.Length -ne $ExpectedDmgBytes -or $dmgHash -ne $ExpectedDmgSha256) { Set-ErrorKind 'dmg-verification-failed' }

  $sevenZip = Get-SevenZipPath
  $Report.stage = 'list-dmg'
  $listing = Invoke-SevenZipList $sevenZip $dmg 'dmg'
  $modelEntries = @(Get-ModelEntries $listing)
  $partitions = @()
  if ($modelEntries.Count -eq 0) {
    $partitionPath = Get-SingleHfsPartition $listing
    $partitionOut = Join-Path $WorkDir 'partition'
    Invoke-SevenZipExtract $sevenZip $dmg $partitionOut @($partitionPath) 'partition'
    $partitions = @(Get-ChildItem -LiteralPath $partitionOut -Recurse -File | Where-Object { $_.Name -eq $partitionPath })
    if ($partitions.Count -ne 1) { Set-ErrorKind 'partition-extraction-failed' }
    $Report.stage = 'list-hfs'
    $listing = Invoke-SevenZipList $sevenZip $partitions[0].FullName 'hfs'
    $modelEntries = @(Get-ModelEntries $listing)
    if ($modelEntries.Count -eq 0) { Set-ErrorKind 'unsupported-dmg-layout' }
  }
  $Report.listStatus = 'verified'

  $Report.stage = 'extract-model'
  $contentOut = Join-Path $WorkDir 'model-files'
  $archivePaths = @($modelEntries | ForEach-Object ArchivePath)
  $sourceArchive = if ($partitions) { $partitions[0].FullName } else { $dmg }
  Invoke-SevenZipExtract $sevenZip $sourceArchive $contentOut $archivePaths 'model'
  $extracted = Get-ExtractedModelFiles $contentOut
  foreach ($file in $extracted) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $StageDir $file.Name) -ErrorAction Stop }
  $Report.extractionStatus = 'verified'

  $root = Split-Path -Parent $PSScriptRoot
  $Report.stage = 'canonical-verification'
  & node (Join-Path $root 'scripts\verify-formula-cancellation-v2-package.mjs') --dir $StageDir *> $null
  if ($LASTEXITCODE -ne 0) { Set-ErrorKind 'canonical-package-verification-failed' }
  $model = Get-Item -LiteralPath (Join-Path $StageDir 'cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf')
  $Report.modelBytes = $model.Length
  $Report.modelSha256 = (Get-FileHash -LiteralPath $model.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $Report.packageVerified = $true
  $Report.fullModelDownloaded = $true
} catch {
  $Report.errorType = $_.Exception.GetType().FullName
  $Report.failureLine = $_.InvocationInfo.ScriptLineNumber
  if (-not $Report.errorKind) { $Report.errorKind = 'unexpected-error' }
} finally {
  if ($WorkDir -and (Test-Path -LiteralPath $WorkDir)) { Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue }
  if ($Report.errorKind -and $StageCreated -and (Test-Path -LiteralPath $StageDir)) { Remove-Item -LiteralPath $StageDir -Recurse -Force -ErrorAction SilentlyContinue }
  Write-Receipt
}

$Report | ConvertTo-Json -Depth 5
if ($Report.errorKind) { exit 1 }
