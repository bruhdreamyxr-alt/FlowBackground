<#
.SYNOPSIS
  Runs every test suite and prints one summary.
.DESCRIPTION
    1. flow-test-node.js      the engine, in a Node sandbox          (71 checks)
    2. flow-test-panel.js     the panel, in a Node sandbox           (69 checks)
    3. flow-test-install.ps1  install / backup / uninstall            (48 checks)
    4. flow-test-visual.ps1   REAL headless Chrome + preview.png     (19 checks)

  Run it after any change, and before sending a new .zxp to anyone.
#>
param([switch]$Pause)

$ErrorActionPreference = 'Continue'
$Here = $PSScriptRoot

function Find-Node {
    $c = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    foreach ($p in @("$env:ProgramFiles\Adobe\Adobe Creative Cloud Experience\libs\node.exe",
                     "${env:ProgramFiles(x86)}\Adobe\Adobe Creative Cloud Experience\libs\node.exe",
                     "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
                     "$env:ProgramFiles\nodejs\node.exe")) {
        if (Test-Path $p) { return $p }
    }
    return $null
}
$node = Find-Node

$suites = @(
    @{ Name = 'engine (flow-bg.js)';      Kind = 'node'; Script = 'flow-test-node.js' },
    @{ Name = 'panel (panel.js)';         Kind = 'node'; Script = 'flow-test-panel.js' },
    @{ Name = 'install / uninstall';      Kind = 'ps';   Script = 'flow-test-install.ps1' },
    @{ Name = 'real browser + preview';   Kind = 'ps';   Script = 'flow-test-visual.ps1' }
)

Write-Host ''
Write-Host '  Flow Background - verifying everything' 'White'
Write-Host '  --------------------------------------' 'DarkGray'
Write-Host ('  ' + $Here) 'DarkGray'

$results = @()
foreach ($s in $suites) {
    $file = Join-Path $Here $s.Script
    if (-not (Test-Path $file)) { $results += [pscustomobject]@{ Name = $s.Name; Ok = $false; Note = 'missing' }; continue }
    Write-Host ''
    Write-Host ('>> ' + $s.Name) 'Cyan'
    if ($s.Kind -eq 'node') {
        if (-not $node) { $results += [pscustomobject]@{ Name = $s.Name; Ok = $false; Note = 'node not found' }; continue }
        $out = & $node $file 2>&1
        $code = $LASTEXITCODE
    } else {
        $o = Join-Path $env:TEMP ('fbg-' + $s.Script + '.log')
        $p = Start-Process powershell -PassThru -Wait -NoNewWindow -RedirectStandardOutput $o -RedirectStandardError (Join-Path $env:TEMP 'fbg.err.log') -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$file`"")
        $code = $p.ExitCode
        $out = Get-Content $o -ErrorAction SilentlyContinue
    }
    $fails = @($out | Where-Object { $_ -match '\bFAIL\b' })
    $out | Where-Object { $_ -match 'checks,' -or $_ -match '\bFAIL\b' } | ForEach-Object { Write-Host ('   ' + $_) -ForegroundColor DarkGray }
    $results += [pscustomobject]@{ Name = $s.Name; Ok = ($code -eq 0); Note = if ($code -eq 0) { 'all passed' } else { ($fails.Count.ToString() + ' failing') } }
}

Write-Host ''
Write-Host '  ============================================' 'DarkGray'
foreach ($r in $results) {
    Write-Host ('  {0}  {1,-26} {2}' -f $(if ($r.Ok) { 'PASS' } else { 'FAIL' }), $r.Name, $r.Note) -ForegroundColor $(if ($r.Ok) { 'Green' } else { 'Red' })
}
$bad = @($results | Where-Object { -not $_.Ok }).Count
Write-Host '  ============================================' 'DarkGray'
Write-Host ''
if ($bad) { Write-Host ('  ' + $bad + ' suite(s) need attention') -ForegroundColor Yellow }
else { Write-Host '  Everything passes. preview.png shows your current look.' -ForegroundColor Green }
Write-Host ''
if ($Pause) { Read-Host 'Press Enter to close' }