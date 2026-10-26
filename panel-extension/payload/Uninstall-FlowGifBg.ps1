<#
.SYNOPSIS
  Removes the custom background from the Flow easing panel.
.DESCRIPTION
  Reverses Install-FlowGifBg.ps1: takes the flow-gif-bg block out of
  panel\index.html (or restores the untouched backup if there is one) and deletes
  the flow-bg.css / flow-bg.js copies. Your picture files are left alone unless
  you ask with -RemoveArtwork.
.PARAMETER Path
  One specific extension folder, if auto-detection is not what you want.
.PARAMETER KeepFiles
  Only unhook index.html; leave flow-bg.css / flow-bg.js on disk.
.PARAMETER RemoveArtwork
  Also delete bg.* files that were dropped into the extension.
.PARAMETER DryRun
  Show what would happen, change nothing.
#>
[CmdletBinding()]
param(
    [string]$Path,
    [switch]$KeepFiles,
    [switch]$RemoveArtwork,
    [switch]$DryRun,
    [switch]$Pause,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$StartMark = '<!-- flow-gif-bg:start -->'
$EndMark   = '<!-- flow-gif-bg:end -->'
$Backup    = 'index.html.flowbg-backup'

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }
function Step($what, $action) {
    if ($DryRun) { Say "  [dry-run] $what" 'DarkYellow'; return }
    & $action
    Say "  $what" 'Gray'
}

#  Loose (hand-added, unmarked) flow-bg lines, so an old manual attempt does not
#  end up pointing at files this script just deleted.
function Clean-Loose([string]$text) {
    $pats = @(
        '(?m)^[ \t]*<!--[^\r\n<>]*(?:gif background|animated GIF|flow bg|flow-bg)[^\r\n<>]*-->[ \t]*\r?\n',
        '(?m)^[ \t]*<link[^>]*flow-bg\.css[^>]*/?>[ \t]*\r?\n',
        '(?m)^[ \t]*<script[^>]*flow-bg\.js[^>]*>[ \t]*</script>[ \t]*\r?\n'
    )
    foreach ($p in $pats) { $text = [regex]::Replace($text, $p, '') }
    return $text
}

function Find-Flow {
    $roots = @(
        "${env:ProgramFiles(x86)}\Common Files\Adobe\CEP\extensions",
        "$env:ProgramFiles\Common Files\Adobe\CEP\extensions",
        "$env:APPDATA\Adobe\CEP\extensions",
        "$env:LOCALAPPDATA\Adobe\CEP\extensions"
    )
    $found = @()
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        foreach ($dir in (Get-ChildItem $root -Directory -ErrorAction SilentlyContinue)) {
            $idx = Join-Path $dir.FullName 'panel\index.html'
            if (-not (Test-Path $idx)) { continue }
            $hit = $dir.Name -match 'flow'
            if (-not $hit) {
                $mf = Join-Path $dir.FullName 'CSXS\manifest.xml'
                if (Test-Path $mf) {
                    try { $hit = (Get-Content $mf -Raw) -match 'rendertom\.flow|>Flow<' } catch { }
                }
            }
            if ($hit -and ((Test-Path (Join-Path $dir.FullName 'panel\css\flow-bg.css')) -or
                          (Test-Path (Join-Path $dir.FullName 'panel\index.html.flowbg-backup')))) { $found += $dir.FullName }
        }
    }
    return $found
}

Say ''
Say '  Flow custom background uninstaller' 'White'
Say '  ----------------------------------' 'DarkGray'

$targets = if ($Path) { @((Resolve-Path $Path).Path) } else { @(Find-Flow) }
if (-not $targets -or $targets.Count -eq 0) {
    Say 'Nothing installed to remove (no Flow with flow-bg found).' 'Yellow'
    exit 0
}

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$needsAdmin = @($targets | Where-Object { $_ -like "$env:ProgramFiles*" -or $_ -like "${env:ProgramFiles(x86)}*" }).Count -gt 0
if ($needsAdmin -and -not $isAdmin -and -not $DryRun) {
    Say 'Flow lives in Program Files - one elevation prompt is needed.' 'DarkCyan'
    #  -WindowStyle must come BEFORE -File, or PowerShell passes it to the script.
    $relaunch = @('-NoProfile', '-ExecutionPolicy', 'Bypass')
    if ($Quiet) { $relaunch += @('-WindowStyle', 'Hidden') }
    $relaunch += @('-File', "`"$PSCommandPath`"")
    if ($Path)          { $relaunch += @('-Path', "`"$Path`"") }
    if ($KeepFiles)     { $relaunch += '-KeepFiles' }
    if ($RemoveArtwork) { $relaunch += '-RemoveArtwork' }
    if ($Quiet)         { $relaunch += '-Quiet' }
    elseif ($Pause)     { $relaunch += '-Pause' }
    try { Start-Process -FilePath 'powershell.exe' -ArgumentList $relaunch -Verb RunAs -Wait; exit $LASTEXITCODE }
    catch { Say 'Elevation declined.' 'Red'; exit 1 }
}

foreach ($target in $targets) {
    Say '' 'Gray'
    Say ("Cleaning " + (Split-Path $target -Leaf)) 'White'
    $idxFile = Join-Path $target 'panel\index.html'
    $bak     = Join-Path $target ("panel\" + $Backup)

    $raw = [IO.File]::ReadAllText($idxFile)
    $cur = $raw
    if ($raw -match [regex]::Escape($StartMark)) {
        $pat  = '(?s)[ \t]*' + [regex]::Escape($StartMark) + '.*?' + [regex]::Escape($EndMark) + '[ \t]*\r?\n'
        $cur = [regex]::Replace($raw, $pat, '')
        Step 'remove the flow-gif-bg block from index.html' { [IO.File]::WriteAllText($idxFile, $cur) }
    } elseif (Test-Path $bak) {
        Step ('restore index.html from ' + $Backup) { Copy-Item $bak $idxFile -Force }
        $cur = [IO.File]::ReadAllText($idxFile)
    } else {
        Say '  index.html is already clean.' 'DarkGray'
    }

    if (-not $KeepFiles) {
        $loose = Clean-Loose $cur
        if ($loose -ne $cur) {
            Step 'remove leftover hand-added flow-bg lines from index.html' { [IO.File]::WriteAllText($idxFile, $loose) }
            $cur = $loose
        }
    }

    if ((Test-Path $bak) -and -not $DryRun) {
        $nowClean = -not (([IO.File]::ReadAllText($idxFile)) -match [regex]::Escape($StartMark))
        if ($nowClean) { Step ("delete leftover " + $Backup) { Remove-Item $bak -Force } }
    }

    if (-not $KeepFiles) {
        foreach ($f in @('panel\css\flow-bg.css', 'panel\js\flow-bg.js')) {
            $p = Join-Path $target $f
            if (Test-Path $p) { Step ("delete " + $f) { Remove-Item $p -Force } }
        }
    }

    if ($RemoveArtwork) {
        foreach ($p in (Get-ChildItem $target -File -ErrorAction SilentlyContinue |
                        Where-Object { $_.Name -match '^(bg|bgs|background|my-bg|flow-bg|panel-bg)([-_. 0-9]*)?\.(gif|png|jpe?g|webp|bmp|apng)$' })) {
            Step ("delete picture " + $p.Name) { Remove-Item $p.FullName -Force }
        }
    }
}

Say '' 'Green'
Say 'Done. Flow is back to its stock panel - reopen it (Window > Extensions).' 'Green'
$docs = [Environment]::GetFolderPath('MyDocuments')
if (-not $docs) { $docs = Join-Path $env:USERPROFILE 'Documents' }
Say ('Your pictures in ' + (Join-Path $docs 'Flow Backgrounds') + ' were left alone.') 'DarkGray'
if ($DryRun) { Say '(dry run - nothing was changed)' 'DarkYellow' }
if ($Pause -and -not $Quiet) { Say ''; Read-Host 'Press Enter to close' }
