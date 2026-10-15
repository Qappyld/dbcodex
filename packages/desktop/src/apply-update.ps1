param([Parameter(Mandatory=$true)][string]$JobPath, [switch]$Recover)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$job = Get-Content -LiteralPath $JobPath -Raw | ConvertFrom-Json
$root = [IO.Path]::GetFullPath($job.root)
$exe = Join-Path $root 'DBCodex.exe'
$lock = Join-Path $root '.dbcodex-update.lock'
$backup = Join-Path $root '.dbcodex-update-backup'
$journalPath = Join-Path $backup 'journal.json'
$stage = Join-Path (Split-Path -Parent $JobPath) 'extracted'
$changes = [Collections.Generic.List[object]]::new()
$mutating = $false
$rollbackFailed = $false
$allowed = '^(DBCodex\.exe|chrome_(100|200)_percent\.pak|d3dcompiler_47\.dll|dxcompiler\.dll|dxil\.dll|ffmpeg\.dll|icudtl\.dat|LICENSE|LICENSES\.chromium\.html|LIRE-MOI\.md|UPDATES\.md|resources\.pak|snapshot_blob\.bin|v8_context_snapshot\.bin|version|vk_swiftshader_icd\.json|vk_swiftshader\.dll|vulkan-1\.dll|resources/app\.asar|locales/[a-zA-Z0-9_-]+\.pak)$'
function Assert-NoLink([string]$path) {
  $current = $path
  while ($current) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Symbolic links are not supported during updates.' }
    }
    $parent = Split-Path -Parent $current
    if ($parent -eq $current) { break }
    $current = $parent
  }
}
function Save-Json($path, $value) {
  $json = ConvertTo-Json -InputObject $value -Depth 20
  [IO.File]::WriteAllText($path, $json, [Text.UTF8Encoding]::new($false))
}
function File-Hash([string]$path) {
  $stream = [IO.File]::OpenRead($path)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
}
function Restore-Previous {
  foreach ($change in $changes) {
    if ($change.path -cnotmatch $allowed) { throw 'Unsafe recovery path.' }
    $target = Join-Path $root $change.path
    Assert-NoLink $target
    if ($change.existed) {
      $saved = Join-Path $backup $change.path
      if (-not (Test-Path -LiteralPath $target) -or (File-Hash $target) -ne (File-Hash $saved)) { Copy-Item -LiteralPath $saved -Destination $target -Force }
    }
    elseif (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
  }
}
try {
  Assert-NoLink $root
  Assert-NoLink $backup
  if (-not (Test-Path -LiteralPath $lock)) { throw 'Update lock missing.' }
  if (-not $Recover) {
    $parentProcess = Get-Process -Id $job.parentPid -ErrorAction SilentlyContinue
    if ($parentProcess -and -not $parentProcess.WaitForExit(60000)) { throw 'DBCodex did not close in time.' }
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  do {
    $running = @(Get-Process -Name DBCodex -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })
    if ($running.Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  if ($running.Count -gt 0) { throw 'Close all DBCodex instances before updating.' }
  if ($Recover) {
    $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
    if ($journal.root -ne $root -or $journal.job -ne $JobPath) { throw 'Recovery journal mismatch.' }
    foreach ($change in $journal.changes) { $changes.Add($change) }
    Restore-Previous
    Save-Json (Join-Path $root '.dbcodex-update-result.json') @{ message = 'La version precedente a ete restauree.' }
    Remove-Item -LiteralPath $lock -Force
    Start-Process -FilePath $exe -WorkingDirectory $root -WindowStyle Hidden
    exit 0
  }
  if (Test-Path -LiteralPath $backup) { throw 'A previous backup exists. Recover or archive it before updating.' }
  if ((File-Hash $job.archive) -ne $job.manifest.sha256) { throw 'Archive integrity check failed.' }
  New-Item -ItemType Directory -Path $stage | Out-Null
  $expected = @{}
  foreach ($file in $job.manifest.files) {
    if ($file.path -cnotmatch $allowed -or $expected.ContainsKey($file.path)) { throw 'Unsafe file inventory.' }
    $expected[$file.path] = $file.sha256
  }
  if (-not $expected.ContainsKey('DBCodex.exe') -or -not $expected.ContainsKey('resources/app.asar')) { throw 'Missing application files.' }
  $zip = [IO.Compression.ZipFile]::OpenRead($job.archive)
  $seen = @{}
  try {
    $expandedBytes = [long]0
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName.Replace('\', '/')
      if ($name.EndsWith('/')) {
        if ($name -cnotin @('locales/', 'resources/')) { throw 'Unsafe directory in archive.' }
        continue
      }
      if (-not $expected.ContainsKey($name) -or $seen.ContainsKey($name)) { throw 'Unexpected file in archive.' }
      $expandedBytes += $entry.Length
      if ($expandedBytes -gt 2GB) { throw 'Archive expansion limit exceeded.' }
      $destination = [IO.Path]::GetFullPath((Join-Path $stage $name))
      if (-not $destination.StartsWith($stage + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe extraction path.' }
      [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $false)
      if ((File-Hash $destination) -ne $expected[$name]) { throw 'Extracted file integrity check failed.' }
      $seen[$name] = $true
    }
    if ($seen.Count -ne $expected.Count) { throw 'Incomplete archive.' }
  } finally { $zip.Dispose() }
  # Back up every affected file before changing any application file.
  New-Item -ItemType Directory -Path $backup | Out-Null
  foreach ($file in $job.manifest.files) {
    $target = Join-Path $root $file.path
    Assert-NoLink $target
    $existed = Test-Path -LiteralPath $target
    if ($existed) {
      $saved = Join-Path $backup $file.path
      [IO.Directory]::CreateDirectory((Split-Path -Parent $saved)) | Out-Null
      Copy-Item -LiteralPath $target -Destination $saved
    }
    $changes.Add(@{ path = $file.path; existed = $existed })
  }
  Save-Json $journalPath @{ root = $root; job = $JobPath; changes = @($changes.ToArray()) }
  $mutating = $true
  foreach ($file in $job.manifest.files) {
    $target = Join-Path $root $file.path
    Assert-NoLink $target
    [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
    Copy-Item -LiteralPath (Join-Path $stage $file.path) -Destination $target -Force
  }
  Save-Json (Join-Path $root '.dbcodex-update-result.json') @{ message = "DBCodex $($job.manifest.version) a ete installe." }
  Remove-Item -LiteralPath $lock -Force
  # Keep the previous version, but move the journal with it so a future update is possible.
  $savedBackup = Join-Path $root ('.dbcodex-update-previous-' + [Guid]::NewGuid().ToString('N'))
  if (-not ([IO.Path]::GetFullPath($savedBackup).StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase))) { throw 'Unsafe backup path.' }
  Move-Item -LiteralPath $backup -Destination $savedBackup
  $backup = $savedBackup
  Start-Process -FilePath $exe -WorkingDirectory $root -WindowStyle Hidden
} catch {
  $failure = $_.Exception.Message
  if ($mutating) {
    try { Restore-Previous } catch { $rollbackFailed = $true }
  }
  Save-Json (Join-Path $root '.dbcodex-update-result.json') @{ message = if ($rollbackFailed) { 'Mise a jour interrompue. Recuperation manuelle necessaire : consultez UPDATES.md.' } else { 'Mise a jour annulee. La version precedente est conservee.' }; detail = $failure }
  if (-not $rollbackFailed -and (Test-Path -LiteralPath $lock)) { Remove-Item -LiteralPath $lock -Force }
  if (-not $rollbackFailed -and (Test-Path -LiteralPath $backup)) {
    $failedBackup = Join-Path $root ('.dbcodex-update-previous-' + [Guid]::NewGuid().ToString('N'))
    if (-not ([IO.Path]::GetFullPath($failedBackup).StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase))) { throw 'Unsafe backup path.' }
    Move-Item -LiteralPath $backup -Destination $failedBackup
  }
  if (-not $rollbackFailed -and (Test-Path -LiteralPath $exe)) { Start-Process -FilePath $exe -WorkingDirectory $root -WindowStyle Hidden }
  exit 1
}
