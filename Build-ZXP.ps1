<#
.SYNOPSIS
  Builds Flow-Background.zxp from the panel-extension folder.
.DESCRIPTION
  1. stages the extension into build\<bundle id>\  (payload files are copied in
     from the top of this package, so there is only ever one copy of each)
  2. makes a self-signed certificate if there is not one yet
  3. signs the staging folder with ZXPSignCmd into dist\Flow-Background.zxp
  4. verifies the result

  The certificate is self-signed on purpose: this is for you and your friends,
  not for the Adobe Exchange. Adobe's ZXP Installer installs a self-signed ZXP
  after one "certificate is not trusted" prompt. Keep build\codex.p12 next to
  this script - rebuild with the same certificate so extensions update cleanly.

  Run:  powershell -ExecutionPolicy Bypass -File .\Build-ZXP.ps1
#>
[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$Timestamp,
    [string]$CertPassword = 'flowbg'
)

$ErrorActionPreference = 'Stop'
$Here   = $PSScriptRoot
$src    = Join-Path $Here 'panel-extension'
$build  = Join-Path $Here 'build'
$dist   = Join-Path $Here 'dist'
$signer = Join-Path $Here 'tools\ZXPSignCmd.exe'
$cert   = Join-Path $build 'codex.p12'
$outZxp = Join-Path $dist 'Flow-Background.zxp'

function Say($m, $c = 'Gray') { Write-Host $m -ForegroundColor $c }

if (-not (Test-Path $src))    { Say "No panel-extension folder at $src" 'Red'; exit 1 }
if (-not (Test-Path $signer)) { Say 'ZXPSignCmd.exe is missing - see tools\' 'Red'; exit 1 }

# ---- read the bundle id out of the manifest (no hard-coded copy) -------------
[xml]$mf = Get-Content (Join-Path $src 'CSXS\manifest.xml') -Raw
$bundle  = $mf.ExtensionManifest.ExtensionBundleId
$version = $mf.ExtensionManifest.ExtensionBundleVersion
Say "  bundle id : $bundle" 'DarkGray'
Say "  version   : $version" 'DarkGray'

# ---- version bookkeeping ------------------------------------------------------
#  ZXP Installer uses the bundle version as the upgrade key: sending the SAME
#  version twice does not replace an already-installed copy, so a rebuild has to
#  bump it or nobody would ever actually receive the update.
$verFile = Join-Path $build 'last-version.txt'
$cur = [version]$version
if ((Test-Path $verFile) -and ((Get-Content $verFile -Raw).Trim() -eq $cur.ToString())) {
    $cur = New-Object Version($cur.Major, $cur.Minor, ($cur.Build + 1))
    $mPath = Join-Path $src 'CSXS\manifest.xml'
    $text  = [IO.File]::ReadAllText($mPath)
    $text  = [regex]::Replace($text, 'ExtensionBundleVersion="[^"]+"',
                              ('ExtensionBundleVersion="' + $cur + '"'))
    [IO.File]::WriteAllText($mPath, $text)
    Say ('  bumped the version to ' + $cur + ' (same number as the last build, so ZXP installers would have skipped it)') 'Yellow'
}
New-Item -ItemType Directory -Path $build -Force | Out-Null
Set-Content -Path $verFile -Value $cur.ToString()
$version = $cur.ToString()

# ---- payload lives in the source folder, so panel-extension\ is itself
#      installable by simply copying it into the CEP extensions folder -------
$payloadSrc = @('flow-bg.js', 'flow-bg.css', 'Install-FlowGifBg.ps1', 'Uninstall-FlowGifBg.ps1', 'Install-FlowGifBg.py', 'Uninstall-FlowGifBg.py', 'Install-FlowGifBg.pl', 'Uninstall-FlowGifBg.pl')
foreach ($f in $payloadSrc) {
    if (-not (Test-Path (Join-Path $Here $f))) { Say "  ! payload file missing: $f" 'Red'; exit 1 }
}
$srcPayload = Join-Path $src 'payload'
New-Item -ItemType Directory -Path $srcPayload -Force | Out-Null
foreach ($f in $payloadSrc) {
    Copy-Item (Join-Path $Here $f) $srcPayload -Force
    Say ('  payload  ' + $f) 'DarkGray'
}

# ---- stage -------------------------------------------------------------------
$stage = Join-Path $build $bundle
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

foreach ($item in @('CSXS', 'css', 'js', 'payload')) {
    Copy-Item (Join-Path $src $item) $stage -Recurse -Force
}
Copy-Item (Join-Path $src 'index.html') $stage -Force
Say ('  staged   ' + $stage) 'DarkGray'
# a plain-text manual inside the extension, for anyone poking around the files
if (Test-Path (Join-Path $Here 'README.md')) {
    Copy-Item (Join-Path $Here 'README.md') (Join-Path $stage 'README.txt') -Force
}
Say ('  staged   ' + $stage) 'DarkGray'

# ---- certificate --------------------------------------------------------------
if (-not (Test-Path $cert)) {
    Say ''
    Say '  creating a self-signed certificate (first build only)' 'DarkCyan'
    & $signer -selfSignedCert US WA 'Flow Background' 'Flow Background' `
        $CertPassword $cert | Out-Null
    if (-not (Test-Path $cert)) { Say '  could not create the certificate' 'Red'; exit 1 }
} else {
    Say '  reusing the existing certificate' 'DarkGray'
}

# ---- sign ---------------------------------------------------------------------
New-Item -ItemType Directory -Path $dist -Force | Out-Null
if ((Test-Path $outZxp) -and -not $Force) {
    Say '  (already built - pass -Force to rebuild)' 'DarkGray'
} else {
    Say ''
    Say '  signing' 'Cyan'
    #  ZXPSignCmd updates the signature inside an existing .zxp instead of
    #  rewriting it, which would silently ship the PREVIOUS build's files.
    #  Delete first, always.
    if (Test-Path $outZxp) { Remove-Item $outZxp -Force }
    $args = @('-sign', $stage, $outZxp, $cert, $CertPassword)
    if ($Timestamp) { $args += @('-tsa', 'https://timestamp.digicert.com/tsa') }
    $o = & $signer @args 2>&1
    $o | ForEach-Object { Write-Host ('    ' + $_) -ForegroundColor DarkGray }
    if (-not (Test-Path $outZxp)) { Say '  signing failed' 'Red'; exit 1 }
}

# ---- verify -------------------------------------------------------------------
Say ''
Say '  verifying' 'Cyan'
$v = & $signer -verify $outZxp 2>&1
$v | ForEach-Object { Write-Host ('    ' + $_) -ForegroundColor DarkGray }
$verified = ($v -join "`n") -match 'verified successfully|signature is valid|Signature.*valid'

Say ''
Say '  ----------------------------------------------------------'
Say ('  ZXP: ' + $outZxp) 'Green'
Say ('  size: ' + [math]::Round((Get-Item $outZxp).Length / 1KB, 1) + ' KB') 'DarkGray'
if ($verified) { Say '  signature: valid' 'Green' } else { Say '  signature: could not confirm - run with -verify yourself' 'Yellow' }
Say ''
Say '  To install:  double-click the .zxp (Adobe ZXP Installer prompts once'
Say '  about the self-signed certificate), then open Window > Extensions > Flow Background.' 'Gray'
Say '  One "Install into Flow" click inside the panel finishes the job.' 'Gray'
exit 0