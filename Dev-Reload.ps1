$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
& (Join-Path $here 'Install-Panel.ps1')
# restart After Effects so the updated panel is picked up
$procs = Get-Process -Name 'AfterFX' -ErrorAction SilentlyContinue
if ($procs) {
  Write-Host 'Closing After Effects...'
  $procs | Stop-Process -Force
  Start-Sleep -Seconds 4
}
# find AfterFX.exe
$ae = Get-ChildItem 'C:\Program Files\Adobe' -Recurse -Filter 'AfterFX.exe' -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending | Select-Object -First 1
if ($ae) {
  Write-Host 'Starting After Effects...'
  Start-Process $ae.FullName
} else {
  Write-Host 'AfterFX.exe not found - start After Effects manually.'
}
Write-Host 'Done. Reopen Window > Extensions > Flow Background.'