<#
.SYNOPSIS
  Installs the Flow Background panel WITHOUT admin rights, for people who would
  rather not deal with the ZXP installer.
.DESCRIPTION
  Copies panel-extension\ into your own CEP folder
      %APPDATA%\Adobe\CEP\extensions\com.antho.flowbg.panel
  and turns on CEP debug mode for your user account (HKCU - also no admin).

  The panel is unsigned, so CEP only loads it while PlayerDebugMode is on; that
  is exactly what this script sets, and the panel sets it again for itself on
  every launch.

  Run:  powershell -ExecutionPolicy Bypass -File .\Install-Panel.ps1
#>
[CmdletBinding()]
param([switch]$Pause)

$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'panel-extension'
function Say($m, $c = 'Gray') { Write-Host $m -ForegroundColor $c }

Say ''
Say '  Flow Background panel - install (no admin needed)' 'White'
Say '  -----------------------------------------------' 'DarkGray'
Say ''

if (-not (Test-Path (Join-Path $src 'CSXS\manifest.xml'))) {
    Say '  panel-extension\ is missing or incomplete.' 'Red'
    Say '  Run Build-ZXP.ps1 once first (it copies the background engine in).' 'Yellow'
    if ($Pause) { Read-Host 'Press Enter to close' }
    exit 1
}

[xml]$mf = Get-Content (Join-Path $src 'CSXS\manifest.xml') -Raw
$bundle  = $mf.ExtensionManifest.ExtensionBundleId
$dest    = Join-Path $env:APPDATA ('Adobe\CEP\extensions\' + $bundle)

Say ('  from  ' + $src) 'DarkGray'
Say ('  to    ' + $dest) 'DarkGray'

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
Copy-Item $src $dest -Recurse -Force
Say '  copied the panel' 'Green'

# --- CEP debug mode (per user, no elevation) --------------------------------
for ($n = 6; $n -le 15; $n++) {
    $key = "HKCU:\Software\Adobe\CSXS.$n"
    try {
        if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
        New-ItemProperty -Path $key -Name PlayerDebugMode -PropertyType String -Value '1' -Force | Out-Null
    } catch { }
}
Say '  CEP debug mode on for your user account' 'Green'

Say ''
Say 'Done. Restart After Effects, then open' 'Green'
Say '   Window > Extensions > Flow Background' 'White'
Say ''
Say 'In that panel press "Install into Flow" once - that is the one step that' 'Gray'
Say 'asks for admin rights, because Flow itself lives in Program Files. Every' 'Gray'
Say 'picture and colour change after that needs no admin rights at all.' 'Gray'
if ($Pause) { Say ''; Read-Host 'Press Enter to close' }
exit 0