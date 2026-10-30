<#
.SYNOPSIS
  Adds an animated / custom background to the Flow easing panel (AE).
.DESCRIPTION
  Copies flow-bg.css + flow-bg.js into your Flow installation and hooks them
  into panel\index.html. Flow's own css/js files are never modified, and the
  original index.html is backed up next to itself, so Uninstall-FlowGifBg.ps1
  can put everything back exactly as it was.

  Run it as-is - it finds Flow by itself in every CEP extensions folder:
      powershell -ExecutionPolicy Bypass -File .\Install-FlowGifBg.ps1

  Parameters
      -Path <folder>     install into one specific extension folder
      -Folder <folder>   where YOUR pictures live (default:
                         Documents\Flow Backgrounds - no admin needed to use it)
      -DryRun            show what would happen, change nothing
      -NoArtwork         do not put a sample bg.gif in your picture folder
      -NoDebugMode       do not touch the CEP PlayerDebugMode registry values
      -SkipElevation     do not self-relaunch with admin rights
      -Pause             wait for Enter at the end (what Install.cmd uses)
.NOTES
  Needs no administration for user-scope installs; program-scope installs ask
  once for elevation. PlayerDebugMode is required because Flow ships signed, and
  CEP only accepts a modified extension while debug mode is on.
#>
[CmdletBinding()]
param(
    [string]$Path,
    [string]$Folder,
    [switch]$DryRun,
    [switch]$NoArtwork,
    [switch]$NoDebugMode,
    [switch]$SkipElevation,
    [switch]$Pause,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$Here      = Split-Path -Parent $MyInvocation.MyCommand.Path
$StartMark = '<!-- flow-gif-bg:start -->'
$EndMark   = '<!-- flow-gif-bg:end -->'
$Backup    = 'index.html.flowbg-backup'

function Say($msg, $color = 'Gray')  { Write-Host $msg -ForegroundColor $color }
function Step($what, $action) {
    if ($DryRun) { Say "  [dry-run] $what" 'DarkYellow'; return }
    & $action
    Say "  $what" 'Gray'
}

#  A hand-added <link>/<script> pair for flow-bg (from an earlier manual attempt)
#  would otherwise survive as a duplicate, so fold it into our marked block.
$script:LooseCleaned = $false
function Remove-LooseLines([string]$text) {
    $pats = @(
        '(?m)^[ \t]*<!--[^\r\n<>]*(?:gif background|animated GIF|flow bg|flow-bg)[^\r\n<>]*-->[ \t]*\r?\n',
        '(?m)^[ \t]*<link[^>]*flow-bg\.css[^>]*/?>[ \t]*\r?\n',
        '(?m)^[ \t]*<script[^>]*flow-bg\.js[^>]*>[ \t]*</script>[ \t]*\r?\n'
    )
    foreach ($p in $pats) {
        $n = [regex]::Replace($text, $p, '')
        if ($n -ne $text) { $script:LooseCleaned = $true }
        $text = $n
    }
    return $text
}
function Merge-OutsideBlock([string]$text) {
    $pat = '(?s)' + [regex]::Escape($StartMark) + '.*?' + [regex]::Escape($EndMark)
    $m = [regex]::Match($text, $pat)
    if (-not $m.Success) { return Remove-LooseLines $text }
    $head = $text.Substring(0, $m.Index)
    $tail = $text.Substring($m.Index + $m.Length)
    return (Remove-LooseLines $head) + $m.Value + (Remove-LooseLines $tail)
}


# ---------------------------------------------------------------- find Flow ---
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
            $css = Join-Path $dir.FullName 'panel\css'
            if (-not (Test-Path $idx) -or -not (Test-Path $css)) { continue }
            $isFlow = $dir.Name -match 'flow'
            if (-not $isFlow) {
                $mf = Join-Path $dir.FullName 'CSXS\manifest.xml'
                if (Test-Path $mf) {
                    try { $isFlow = (Get-Content $mf -Raw) -match 'rendertom\.flow|>Flow<' } catch { }
                }
            }
            if ($isFlow) { $found += $dir.FullName }
        }
    }
    return $found
}

Say ''
Say '  Flow custom background installer' 'White'
Say '  --------------------------------' 'DarkGray'
Say ''

if ($Path) {
    $targets = @((Resolve-Path $Path).Path)
} else {
    Say 'Looking for Flow in the CEP extension folders...' 'DarkCyan'
    $targets = @(Find-Flow)
}

if (-not $targets -or $targets.Count -eq 0) {
    Say 'Flow was not found. Install Flow first, or point at it explicitly:' 'Red'
    Say '  .\Install-FlowGifBg.ps1 -Path "C:\...\CEP\extensions\flow-v1.5.2"' 'Yellow'
    exit 1
}

foreach ($t in $targets) { Say "  found  $t" 'Green' }

# --------------------------------------------------------------- elevation ---
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$needsAdmin = @($targets | Where-Object {
    $_ -like "$env:ProgramFiles*" -or $_ -like "${env:ProgramFiles(x86)}*" }).Count -gt 0

if ($needsAdmin -and -not $isAdmin -and -not $SkipElevation -and -not $DryRun) {
    Say '' 'Gray'
    Say 'Flow lives in Program Files, so this needs one elevation prompt.' 'DarkCyan'
    #  -WindowStyle has to sit BEFORE -File, otherwise PowerShell hands it to the
    #  script as an argument instead of using it, and the console stays visible.
    $relaunch = @('-NoProfile', '-ExecutionPolicy', 'Bypass')
    if ($Quiet) { $relaunch += @('-WindowStyle', 'Hidden') }
    $relaunch += @('-File', "`"$PSCommandPath`"", '-SkipElevation')
    if ($Path)          { $relaunch += @('-Path', "`"$Path`"") }
    if ($Folder)        { $relaunch += @('-Folder', "`"$Folder`"") }
    if ($NoArtwork)     { $relaunch += '-NoArtwork' }
    if ($NoDebugMode)   { $relaunch += '-NoDebugMode' }
    if ($Quiet)         { $relaunch += '-Quiet' }
    elseif ($Pause)     { $relaunch += '-Pause' }
    try {
        Start-Process -FilePath 'powershell.exe' -ArgumentList $relaunch -Verb RunAs -Wait
        exit $LASTEXITCODE
    } catch {
        Say 'Elevation was declined. Re-run from an Administrator PowerShell.' 'Red'
        exit 1
    }
}

# ------------------------------------------------------------------- install ---
$link      = '<link href="css/flow-bg.css" rel="stylesheet" />'
$scriptTag = '<script type="text/javascript" src="js/flow-bg.js"></script>'
$block     = $StartMark + "`r`n    " + $link + "`r`n    " + $scriptTag + "`r`n    " + $EndMark

$installed = @()

#  YOUR folder - a normal Documents folder, so no administrator rights are ever
#  needed to change the background. It is also stamped into flow-bg.css below,
#  so the loader still finds it when Documents is redirected (OneDrive etc.).
if ($Folder) {
    $userDir = $Folder
} else {
    $docs = [Environment]::GetFolderPath('MyDocuments')
    if (-not $docs) { $docs = Join-Path $env:USERPROFILE 'Documents' }
    $userDir = Join-Path $docs 'Flow Backgrounds'
}
$userUrl = ([Uri]$userDir).AbsoluteUri

foreach ($target in $targets) {
    Say '' 'Gray'
    Say ("Installing into " + (Split-Path $target -Leaf)) 'White'

    $idxFile  = Join-Path $target 'panel\index.html'
    $cssDir   = Join-Path $target 'panel\css'
    $jsDir    = Join-Path $target 'panel\js'

    foreach ($d in @($cssDir, $jsDir)) {
        if (-not (Test-Path $d)) { Step "create $d" { New-Item -ItemType Directory -Path $d | Out-Null } }
    }

    # 1. the two files
    Step ('copy flow-bg.css  -> ' + $cssDir) { Copy-Item (Join-Path $Here 'flow-bg.css') $cssDir -Force }
    Step ('copy flow-bg.js   -> ' + $jsDir)  { Copy-Item (Join-Path $Here 'flow-bg.js')  $jsDir  -Force }

    # 2. tell the stylesheet where YOUR folder is, so the loader never has to
    #    guess (matters when Documents sits on OneDrive or another drive)
    $cssFile = Join-Path $cssDir 'flow-bg.css'
    $stamp   = "--flow-bg-dir: url('" + $userUrl + "');"
    Step ('point --flow-bg-dir at ' + $userDir) {
        $t = [IO.File]::ReadAllText($cssFile)
        $t = [regex]::Replace($t, '(?m)^[ \t]*--flow-bg-dir:[^;]*;', $stamp.Replace('$', '$$'))
        [IO.File]::WriteAllText($cssFile, $t)
    }

    # 3. hook the two files into index.html (idempotent, marker-delimited)
    $bak = Join-Path (Split-Path $idxFile) $Backup
    $raw = [IO.File]::ReadAllText($idxFile)

    Step ('back up index.html -> ' + $Backup) {
        if (-not (Test-Path $bak)) { Copy-Item $idxFile $bak -Force }
    }

    $script:LooseCleaned = $false
    $blockEsc = $block.Replace('$', '$$')
    $new = Merge-OutsideBlock $raw
    if ($script:LooseCleaned) {
        Say '  merged an existing hand-added flow-bg link/script into the managed block' 'DarkCyan'
    }

    if ($new -match [regex]::Escape($StartMark)) {                       # refresh
        $pat = '(?s)' + [regex]::Escape($StartMark) + '.*?' + [regex]::Escape($EndMark)
        $new = [regex]::Replace($new, $pat, $blockEsc)
        Step 'refresh the flow-gif-bg block in index.html' { [IO.File]::WriteAllText($idxFile, $new) }
    } elseif ($new -match '</head>') {                                   # first time
        $rx = New-Object System.Text.RegularExpressions.Regex '</head>'
        $new = $rx.Replace($new, $blockEsc + "`r`n</head>", 1)
        Step 'add the flow-gif-bg block to <head> in index.html' { [IO.File]::WriteAllText($idxFile, $new) }
    } else {
        Say '  ! could not find </head> in index.html - leaving it untouched.' 'Red'
        Say '    Add these two lines inside <head> by hand:' 'Yellow'
        Say "      $link" 'Yellow'
        Say "      $scriptTag" 'Yellow'
        continue
    }
    $installed += $target
}

# -------------------------------------------------- YOUR picture folder ------
Say ''
Say 'Your picture folder' 'White'
if (Test-Path $userDir) {
    Say ('  already there: ' + $userDir) 'DarkGray'
} else {
    Step ('create ' + $userDir) { New-Item -ItemType Directory -Path $userDir -Force | Out-Null }
}

$readmePath = Join-Path $userDir 'README.txt'
$readme = @'
FLOW - put your background picture in THIS folder
=================================================

Drop any picture in here and Flow's panel switches to it straight away.
No need to close After Effects, and no administrator rights - this is your
own Documents folder, so it is always writable.

  .gif  / .webp / .apng  -> animates
  .png  / .jpg / .jpeg / .bmp  -> a still picture

ANY file name works:  bg.gif, sunset.gif, my cool loop.webp ...
If several pictures are in here, the NEWEST one is used, so just drop in
the next one you want and it wins automatically.

To go back to Flow's normal dark panel, move every picture out of this
folder. The panel falls back to the dark theme on its own.

Double-click Change-Background.cmd (next to the installer) to pick a
picture with a normal file dialog instead of dragging one in here.
'@
Step ('write ' + $readmePath) { [IO.File]::WriteAllText($readmePath, $readme) }

$sample = Join-Path $Here 'bg.gif'
if (-not $NoArtwork -and (Test-Path $sample)) {
    $dest = Join-Path $userDir 'bg.gif'
    if (Test-Path $dest) {
        Say '  a picture of yours is already in there - left untouched' 'DarkGray'
    } else {
        Step ('copy the sample bg.gif -> ' + $dest) { Copy-Item $sample $dest -Force }
    }
}

# -------------------------------------------------- CEP debug-mode switch ----
if (-not $NoDebugMode) {
    Say '' 'Gray'
    Say 'CEP signature check (needed once per machine)' 'White'
    Say '  Flow ships signed. A modified extension only loads while CEP debug' 'DarkGray'
    Say '  mode is on, so HKCU\Software\Adobe\CSXS.<n>\PlayerDebugMode = 1 is set.' 'DarkGray'
    for ($n = 6; $n -le 13; $n++) {
        $key = "HKCU:\Software\Adobe\CSXS.$n"
        $cur = $null
        if (Test-Path $key) { $cur = (Get-ItemProperty $key -ErrorAction SilentlyContinue).PlayerDebugMode }
        if ($cur -eq '1') { Say "  CSXS.$n  already on" 'DarkGray'; continue }
        Step "CSXS.$n  PlayerDebugMode -> 1" {
            if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
            New-ItemProperty -Path $key -Name PlayerDebugMode -PropertyType String -Value '1' -Force | Out-Null
        }
    }
}

# ------------------------------------------------------------------ summary ---
Say '' 'Gray'
Say 'Done.' 'Green'
foreach ($t in $installed) { Say ('  installed into ' + $t) 'DarkGreen' }
Say '' 'Gray'
Say 'HOW TO CHANGE THE BACKGROUND - the same for you and for anyone you send this to' 'White'
Say ('  1. drop any picture (.gif .webp .png .jpg) into  ' + $userDir) 'Yellow'
Say '  2. that is all - the panel swaps within a second or two, After Effects' 'Yellow'
Say '     stays open, and step 1 needs no administrator rights.' 'Yellow'
Say '' 'Gray'
Say '  Newest file wins, so just drop the next one in. Empty the folder and the' 'DarkGray'
Say '  panel returns to the shipped bg.gif / plain dark theme by itself.' 'DarkGray'
Say '  Prefer a file picker?  Double-click Change-Background.cmd' 'DarkGray'
Say '' 'Gray'
Say 'ONE-TIME FINISH' 'White'
Say '  If the panel is already open, close and re-open it once (Window > Extensions)' 'DarkCyan'
Say '  so it loads the new index.html. Restart After Effects only if it refuses.' 'DarkCyan'
Say '  Nothing after this needs a restart or admin rights.' 'DarkCyan'
Say '' 'Gray'
Say 'Remove it again with:  .\Uninstall-FlowGifBg.ps1' 'DarkGray'
if ($DryRun) { Say '' 'Gray'; Say '(dry run - nothing was changed)' 'DarkYellow' }
if ($Pause -and -not $Quiet) { Say ''; Read-Host 'Press Enter to close' }

