param([Parameter(Mandatory=$true)][string]$JobPath, [switch]$Recover)
$ErrorActionPreference = 'Stop'
$script:updateStage = 'initialisation'
$script:updateAttempt = [Guid]::NewGuid().ToString()
$script:updateLogs = @((Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($JobPath))) 'update-helper.jsonl'))
function Write-UpdateLog([string]$event, $fields = @{}) {
  try {
    $record = @{ at = [DateTime]::UtcNow.ToString('o'); event = $event; stage = $script:updateStage; attemptId = $script:updateAttempt; pid = $PID }
    foreach ($key in $fields.Keys) {
      $value = $fields[$key]
      if ($value -is [string]) {
        $value = [Regex]::Replace($value, '(?i)Bearer\s+[^\s"'',;]+', 'Bearer [redacted]')
        $value = [Regex]::Replace($value, '(?i)((?:token|password|secret|authorization|api[_-]?key)\s*[=:]\s*)[^\s,;]+', '$1[redacted]')
        if ($value.Length -gt 2000) { $value = $value.Substring(0, 2000) }
      }
      $record[$key] = $value
    }
    $line = (ConvertTo-Json -InputObject $record -Compress -Depth 4) + [Environment]::NewLine
    foreach ($destination in $script:updateLogs) {
      try {
        if ((Test-Path -LiteralPath $destination) -and (Get-Item -LiteralPath $destination).Length -gt 262144) { continue }
        [IO.File]::AppendAllText($destination, $line, [Text.UTF8Encoding]::new($false))
      } catch { # A secondary temporary log remains available if the portable folder is unwritable.
      }
    }
  } catch { # Logging never decides whether an update may run.
  }
}
function Set-UpdateStage([string]$name) { $script:updateStage = $name; Write-UpdateLog 'update.step' }
Write-UpdateLog 'update.helper.started'
try {
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class DbcodexUpdatePaths {
  [StructLayout(LayoutKind.Sequential)] public struct AttributeTag { public uint Attributes; public uint Tag; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int infoClass, out AttributeTag info, uint size);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder path, uint length, uint flags);
  public static bool IsCloudTag(uint tag) {
    // Only the documented CLOUD through CLOUD_F family; never name-surrogate tags.
    return (tag & 0x20000000u) == 0 && (tag & 0xFFFF0FFFu) == 0x9000001Au;
  }
  public static uint ReadTag(string path) {
    // Metadata access only. Open the reparse point itself instead of following its final component.
    using (var handle = CreateFileW(path, 0, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero)) {
      if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
      AttributeTag info;
      if (!GetFileInformationByHandleEx(handle, 9, out info, 8)) throw new Win32Exception(Marshal.GetLastWin32Error());
      var final = new StringBuilder(32768);
      uint length = GetFinalPathNameByHandleW(handle, final, (uint)final.Capacity, 0);
      if (length == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      if (length >= final.Capacity) throw new IOException("Resolved update path is too long.");
      string resolved = final.ToString();
      if (resolved.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) resolved = @"\\" + resolved.Substring(8);
      else if (resolved.StartsWith(@"\\?\", StringComparison.OrdinalIgnoreCase)) resolved = resolved.Substring(4);
      if (!String.Equals(Path.GetFullPath(path).TrimEnd('\\'), Path.GetFullPath(resolved).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
        throw new IOException("Update path resolves to a different location.");
      return info.Tag;
    }
  }
}
'@
$job = Get-Content -LiteralPath $JobPath -Raw | ConvertFrom-Json
if ($job.attemptId -match '^[a-fA-F0-9-]{36}$') { $script:updateAttempt = $job.attemptId }
if ($job.logPath -and (Split-Path -Leaf $job.logPath) -eq ('update-' + $script:updateAttempt + '.jsonl') -and (Test-Path -LiteralPath (Split-Path -Parent $job.logPath))) {
  $script:updateLogs += [IO.Path]::GetFullPath($job.logPath)
}
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
$singleFile = $job.manifest.schema -eq 2
if ($singleFile) {
  if (-not $job.executable -or $job.executable -cnotmatch '^[^<>:"/\\|?*\x00-\x1f]+\.exe$') { throw 'Unsafe executable name.' }
  $exe = Join-Path $root $job.executable
  $allowed = '^' + [Regex]::Escape($job.executable) + '$'
  $files = @(@{ path = $job.executable; sha256 = $job.manifest.sha256 })
} else { $files = $job.manifest.files }
Write-UpdateLog 'update.job.loaded' @{ root = $root; executable = $exe; targetVersion = $job.manifest.version; schema = $job.manifest.schema }
} catch {
  Write-UpdateLog 'update.bootstrap.failed' @{ detail = $_.Exception.Message; line = $_.InvocationInfo.ScriptLineNumber }
  exit 1
}
function Assert-NoLink([string]$path) {
  $current = $path
  while ($current) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        $tag = [DbcodexUpdatePaths]::ReadTag($current)
        $tagText = '0x{0:X8}' -f $tag
        if (-not [DbcodexUpdatePaths]::IsCloudTag($tag)) {
          Write-UpdateLog 'update.link.refused' @{ path = $current; attributes = $item.Attributes.ToString(); reparseTag = $tagText }
          throw 'Symbolic links, junctions and unknown reparse points are not supported during updates.'
        }
        Write-UpdateLog 'update.cloud-path.accepted' @{ path = $current; reparseTag = $tagText }
      }
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
  Set-UpdateStage 'verification-dossiers'
  Assert-NoLink $root
  Assert-NoLink $backup
  if (-not (Test-Path -LiteralPath $lock)) { throw 'Update lock missing.' }
  if (-not $Recover) {
    Set-UpdateStage 'attente-fermeture'
    $parentProcess = Get-Process -Id $job.parentPid -ErrorAction SilentlyContinue
    if ($parentProcess -and -not $parentProcess.WaitForExit(60000)) { throw 'DBCodex did not close in time.' }
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  do {
    $running = @(Get-Process | Where-Object { $_.Path -and ($_.Path -eq $exe -or ($singleFile -and $_.Path -eq $job.runtimeRoot)) })
    if ($running.Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  if ($running.Count -gt 0) {
    foreach ($blocked in $running) { Write-UpdateLog 'update.process.blocking' @{ processId = $blocked.Id; name = $blocked.ProcessName; path = $blocked.Path } }
    throw 'Close all DBCodex instances before updating.'
  }
  if ($Recover) {
    Set-UpdateStage 'restauration'
    $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
    if ($journal.root -ne $root -or $journal.job -ne $JobPath) { throw 'Recovery journal mismatch.' }
    foreach ($change in $journal.changes) { $changes.Add($change) }
    Restore-Previous
    Write-UpdateLog 'update.recovery.completed'
    Save-Json (Join-Path $root '.dbcodex-update-result.json') @{ message = 'La version precedente a ete restauree.' }
    Remove-Item -LiteralPath $lock -Force
    Start-Process -FilePath $exe -WorkingDirectory $root -WindowStyle Hidden
    exit 0
  }
  Set-UpdateStage 'verification-telechargement'
  if (Test-Path -LiteralPath $backup) { throw 'A previous backup exists. Recover or archive it before updating.' }
  if ((File-Hash $job.archive) -ne $job.manifest.sha256) { throw 'Archive integrity check failed.' }
  if ($singleFile -and (Get-Item -LiteralPath $job.archive).Length -ne $job.manifest.size) { throw 'Executable size mismatch.' }
  Set-UpdateStage 'preparation-fichiers'
  New-Item -ItemType Directory -Path $stage | Out-Null
  $expected = @{}
  foreach ($file in $files) {
    if ($file.path -cnotmatch $allowed -or $expected.ContainsKey($file.path)) { throw 'Unsafe file inventory.' }
    $expected[$file.path] = $file.sha256
  }
  if ($singleFile) {
    Copy-Item -LiteralPath $job.archive -Destination (Join-Path $stage $job.executable)
    if ((File-Hash (Join-Path $stage $job.executable)) -ne $job.manifest.sha256) { throw 'Staged executable integrity check failed.' }
  } else {
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
  }
  # Back up every affected file before changing any application file.
  Set-UpdateStage 'sauvegarde'
  New-Item -ItemType Directory -Path $backup | Out-Null
  foreach ($file in $files) {
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
  Set-UpdateStage 'remplacement'
  foreach ($file in $files) {
    $target = Join-Path $root $file.path
    Assert-NoLink $target
    [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
    Copy-Item -LiteralPath (Join-Path $stage $file.path) -Destination $target -Force
  }
  Set-UpdateStage 'finalisation'
  Save-Json (Join-Path $root '.dbcodex-update-result.json') @{ message = "DBCodex $($job.manifest.version) a ete installe."; attemptId = $script:updateAttempt; version = $job.manifest.version }
  Remove-Item -LiteralPath $lock -Force
  # Keep the previous version, but move the journal with it so a future update is possible.
  $savedBackup = Join-Path $root ('.dbcodex-update-previous-' + [Guid]::NewGuid().ToString('N'))
  if (-not ([IO.Path]::GetFullPath($savedBackup).StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase))) { throw 'Unsafe backup path.' }
  Move-Item -LiteralPath $backup -Destination $savedBackup
  $backup = $savedBackup
  Set-UpdateStage 'relancement'
  Start-Process -FilePath $exe -WorkingDirectory $root -WindowStyle Hidden
  Write-UpdateLog 'update.completed'
} catch {
  $failure = $_.Exception.Message
  $failedStage = $script:updateStage
  Write-UpdateLog 'update.failed' @{ detail = $failure; line = $_.InvocationInfo.ScriptLineNumber; errorId = $_.FullyQualifiedErrorId; mutating = $mutating }
  if ($mutating) {
    Set-UpdateStage 'annulation-restauration'
    try { Restore-Previous; Write-UpdateLog 'update.rollback.completed' } catch { $rollbackFailed = $true; Write-UpdateLog 'update.rollback.failed' @{ detail = $_.Exception.Message } }
  }
  Save-Json (Join-Path $root '.dbcodex-update-result.json') @{ message = if ($rollbackFailed) { 'Mise a jour interrompue. Recuperation manuelle necessaire : consultez UPDATES.md.' } else { 'Mise a jour annulee. La version precedente est conservee.' }; detail = $failure; stage = $failedStage; attemptId = $script:updateAttempt; version = $job.manifest.version }
  if (-not $rollbackFailed -and (Test-Path -LiteralPath $lock)) { Remove-Item -LiteralPath $lock -Force }
  if (-not $rollbackFailed -and (Test-Path -LiteralPath $backup)) {
    $failedBackup = Join-Path $root ('.dbcodex-update-previous-' + [Guid]::NewGuid().ToString('N'))
    if (-not ([IO.Path]::GetFullPath($failedBackup).StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase))) { throw 'Unsafe backup path.' }
    Move-Item -LiteralPath $backup -Destination $failedBackup
  }
  if (-not $rollbackFailed -and (Test-Path -LiteralPath $exe)) { Start-Process -FilePath $exe -WorkingDirectory $root -WindowStyle Hidden }
  Write-UpdateLog 'update.cancelled' @{ rollbackFailed = $rollbackFailed }
  exit 1
}
