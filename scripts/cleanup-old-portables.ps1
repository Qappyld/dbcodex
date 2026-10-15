$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$primary = Join-Path $workspace 'release\DBCodex-win32-x64'
$legacy = Join-Path $workspace 'build\consolidation\2026-10-15\anciennes-copies'
$backup = Join-Path $workspace 'build\consolidation\2026-10-15-latest'
function Assert-Contained([string]$path, [string]$parent) {
  $full = [IO.Path]::GetFullPath($path)
  if (-not $full.StartsWith($parent + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe target: $full" }
  if ((Get-Item -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked target: $full" }
  return $full
}
function Preserve-File([string]$source, [string]$target) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
  if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash) { throw "Backup mismatch: $source" }
}
if (Get-Process DBCodex -ErrorAction SilentlyContinue) { throw 'Close DBCodex before cleanup.' }
if (-not (Test-Path -LiteralPath (Join-Path $primary 'DBCodex.exe'))) { throw 'Primary installation missing.' }
$before = Get-Content -LiteralPath (Join-Path $backup 'data-before.json') -Raw | ConvertFrom-Json
foreach ($entry in $before) {
  if ((Get-FileHash -LiteralPath (Join-Path $primary $entry.Path)).Hash -ne $entry.Hash) { throw "Primary data changed: $($entry.Path)" }
}
$runtime = @{}
Get-ChildItem -LiteralPath $primary -File -Recurse | ForEach-Object {
  $rel = $_.FullName.Substring($primary.Length + 1)
  if ($rel -notlike 'data\*') { $runtime[$rel] = $true }
}
$removedCopies = 0
if (Test-Path -LiteralPath $legacy) {
  $target = Assert-Contained $legacy $workspace
  $items = @(Get-ChildItem -LiteralPath $target -Recurse -Force)
  if ($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Linked file in legacy installation.' }
  foreach ($folder in Get-ChildItem -LiteralPath $target -Directory) {
    foreach ($file in Get-ChildItem -LiteralPath $folder.FullName -Recurse -File -Force) {
      $rel = $file.FullName.Substring($folder.FullName.Length + 1)
      $runtimeRel = $rel -replace '^\.dbcodex-update-previous-[^\\]+\\', ''
      # Preserve user files, unknown files and application source snapshots; discard known Electron runtime files.
      if (-not $runtime.ContainsKey($runtimeRel) -or $runtimeRel -eq 'resources\app.asar' -or $rel -match '\.(dbcd|dbml)(-|$)' -or $runtimeRel -like 'data\*') {
        Preserve-File $file.FullName (Join-Path $backup ('preserved-legacy\' + $folder.Name + '\' + $rel))
      }
    }
    $removedCopies++
  }
  # Target resolved and confined above, after verified backups of all non-runtime files.
  Remove-Item -LiteralPath $target -Recurse -Force
}
$removedTestExecutables = 0
$testRoot = Join-Path $workspace 'build\update-helper-tests'
if (Test-Path -LiteralPath $testRoot) {
  foreach ($file in Get-ChildItem -LiteralPath $testRoot -Filter DBCodex.exe -Recurse -File) {
    $target = Assert-Contained $file.FullName $testRoot
    if ($file.Length -gt 1000000) { throw "Unexpected real application in helper tests: $target" }
    Remove-Item -LiteralPath $target -Force
    $removedTestExecutables++
  }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$oldArchives = @(Get-ChildItem -LiteralPath (Join-Path $workspace 'build'),(Join-Path $workspace 'release') -Filter '*DBCodex*win*x64.zip' -Recurse -File | Where-Object Name -ne 'DBCodex-0.1.4-win-x64.zip')
foreach ($archive in $oldArchives) {
  $target = Assert-Contained $archive.FullName $workspace
  $zip = [IO.Compression.ZipFile]::OpenRead($target)
  try {
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName -match '(^|[/\\])data[/\\]|\.(dbcd|dbml)$') { throw "Archive contains data; preserve before cleanup: $target" }
    }
  } finally { $zip.Dispose() }
  Remove-Item -LiteralPath $target -Force
}
$preservedRoot = Join-Path $backup 'preserved-legacy'
if (Test-Path -LiteralPath $preservedRoot) {
  foreach ($file in Get-ChildItem -LiteralPath $preservedRoot -Filter DBCodex.exe -Recurse -File) {
    $target = Assert-Contained $file.FullName $preservedRoot
    if (-not (Test-Path -LiteralPath (Join-Path $file.DirectoryName 'resources\app.asar'))) { throw 'Application source snapshot missing.' }
    Remove-Item -LiteralPath $target -Force
  }
}
$remaining = @(Get-ChildItem -LiteralPath (Join-Path $workspace 'build'),(Join-Path $workspace 'release') -Filter DBCodex.exe -Recurse -File)
if ($remaining.Count -ne 1 -or $remaining[0].FullName -ne (Join-Path $primary 'DBCodex.exe')) { throw 'Unexpected remaining application copy.' }
$report = [ordered]@{ version = '0.1.4'; executable = $remaining[0].FullName; dataVerified = @($before).Count; removedCopies = $removedCopies; removedTestExecutables = $removedTestExecutables; removedArchives = $oldArchives.Count }
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'cleanup-report.json')
$report | ConvertTo-Json
