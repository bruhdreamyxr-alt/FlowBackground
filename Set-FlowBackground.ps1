<#
.SYNOPSIS
  Pick a new background for the Flow panel with a normal file dialog.
.DESCRIPTION
  Copies the picture you choose into your Flow background folder under a name
  the loader always finds, and gives it today's time stamp so it wins over
  whatever is in there - no admin rights, no restart, no dragging files about.

    powershell -ExecutionPolicy Bypass -File .\Set-FlowBackground.ps1

  Parameters
      -Folder <path>   use a different folder instead of Documents\Flow Backgrounds
      -Clear           move every picture out of the folder (back to Flow's dark look)
      -Pause           wait for Enter at the end (what Change-Background.cmd uses)
.NOTES
  Nothing here needs elevation - that is the point of keeping the pictures in
  your own Documents folder instead of inside the Flow installation.
#>
[CmdletBinding()]
param(
    [string]$Folder,
    [switch]$Clear,
    [switch]$Pause
)

$ErrorActionPreference = 'Stop'
$EXTS = @('.gif', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.apng')

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }
function Stop-Here($code) { if ($Pause) { Write-Host ''; Read-Host 'Press Enter to close' }; exit $code }

# where the pictures live - same default the installer uses
if ($Folder) {
    $userDir = $Folder
} else {
    $docs = [Environment]::GetFolderPath('MyDocuments')
    if (-not $docs) { $docs = Join-Path $env:USERPROFILE 'Documents' }
    $userDir = Join-Path $docs 'Flow Backgrounds'
}

Say ''
Say '  Flow background - pick a picture' 'White'
Say '  --------------------------------' 'DarkGray'
Say ''

if (-not (Test-Path $userDir)) {
    New-Item -ItemType Directory -Path $userDir -Force | Out-Null
    Say ('  created ' + $userDir) 'DarkGray'
}

# is the loader actually installed anywhere? (nice to tell them before they wonder)
$loaderInstalled = $false
foreach ($root in @("${env:ProgramFiles(x86)}\Common Files\Adobe\CEP\extensions",
                    "$env:ProgramFiles\Common Files\Adobe\CEP\extensions",
                    "$env:APPDATA\Adobe\CEP\extensions")) {
    if (-not (Test-Path $root)) { continue }
    foreach ($d in (Get-ChildItem $root -Directory -ErrorAction SilentlyContinue)) {
        $idx = Join-Path $d.FullName 'panel\index.html'
        if (-not (Test-Path $idx)) { continue }
        if (([IO.File]::ReadAllText($idx)) -match 'flow-gif-bg:start') { $loaderInstalled = $true }
    }
}
if (-not $loaderInstalled) {
    Say '  ! the Flow background loader does not look installed yet.' 'Yellow'
    Say '    Run Install-FlowGifBg.ps1 once (right-click, Run as administrator),' 'Yellow'
    Say '    then the panel will follow whatever this folder contains.' 'Yellow'
    Say ''
}

if ($Clear) {
    $parked = Join-Path $userDir '_parked'
    $pics = @(Get-ChildItem $userDir -File -ErrorAction SilentlyContinue |
              Where-Object { $EXTS -contains $_.Extension.ToLower() })
    if (-not $pics.Count) { Say '  nothing to move - the folder is already empty.' 'DarkGray'; Stop-Here 0 }
    if (-not (Test-Path $parked)) { New-Item -ItemType Directory -Path $parked -Force | Out-Null }
    foreach ($p in $pics) {
        Move-Item $p.FullName (Join-Path $parked $p.Name) -Force
        Say ('  parked  ' + $p.Name) 'DarkGray'
    }
    Say ''
    Say '  Flow is back to its plain dark panel.' 'Green'
    Say ('  (your pictures are safe in ' + $parked + ')') 'DarkGray'
    Stop-Here 0
}

# ---- pick a picture -----------------------------------------------------------
$chosen = $null
try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Title  = 'Choose a background for the Flow panel'
    $dlg.Filter = 'Pictures (*.gif;*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.apng)|*.gif;*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.apng|Animated (*.gif;*.webp;*.apng)|*.gif;*.webp;*.apng|All files (*.*)|*.*'
    $dlg.Multiselect = $false
    $dlg.InitialDirectory = [Environment]::GetFolderPath('MyPictures')
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        Say '  cancelled - nothing changed.' 'DarkGray'
        Stop-Here 0
    }
    $chosen = $dlg.FileName
} catch {
    Say '  ! could not open a file dialog here.' 'Yellow'
    Say ('    Just copy your picture into:  ' + $userDir) 'Yellow'
    Stop-Here 1
}

$ext = [IO.Path]::GetExtension($chosen).ToLower()
if ($EXTS -notcontains $ext) {
    Say ('  ! ' + $ext + ' is not a picture type the panel can show.') 'Red'
    Say ('    Use one of: ' + ($EXTS -join ' ')) 'Yellow'
    Stop-Here 1
}

#  Keep a fixed name (bg + its own extension) so the file is found even if Node
#  is unavailable and the loader can only probe known names, and push the time
#  stamp forward so this one wins against whatever else is in the folder.
$dest = Join-Path $userDir ('bg' + $ext)
Copy-Item -LiteralPath $chosen -Destination $dest -Force
(Get-Item -LiteralPath $dest).LastWriteTime = Get-Date

Say ('  using   ' + $chosen) 'Green'
Say ('  copied to ' + $dest) 'DarkGray'
Say ''
Say '  The panel switches over within a second or two - no restart needed.' 'White'
if ($loaderInstalled) { Say '  (if it does not, close and re-open the panel once)' 'DarkGray' }
Stop-Here 0