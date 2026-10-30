<#
.SYNOPSIS
  End-to-end test of Install/Uninstall-FlowGifBg.ps1.
.DESCRIPTION
  Builds throw-away copies of a Flow installation (one pristine, one that a user
  had hand-edited) plus a throw-away copy of this package, then installs,
  re-installs and uninstalls against them, checking:

    * the dry run really changes nothing
    * Flow's own files are never touched
    * index.html keeps exactly one link + one script, inside <head>
    * the original page is backed up byte-for-byte and restored/removed correctly
    * a hand-added <link>/<script> from an older manual attempt is folded away
    * the picture folder is created, gets its README and the sample picture,
      and your own pictures are never overwritten
    * --flow-bg-dir is stamped into the installed stylesheet, exactly once
    * re-running the installer is a no-op, uninstalling twice is a no-op

  Run:  powershell -ExecutionPolicy Bypass -File .\flow-test-install.ps1
        (needs no admin rights - everything happens in %TEMP%)
#>
$ErrorActionPreference = 'Stop'

$pkg  = $PSScriptRoot
$ext  = 'C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\flow-v1.5.2'
$test = Join-Path $env:TEMP 'flowtest-install'

if (-not (Test-Path $ext)) {
    Write-Host "Flow was not found at $ext - edit the `$ext line at the top of this test." -ForegroundColor Red
    exit 2
}

Remove-Item $test -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $test -Force | Out-Null

#  a copy of the package, but WITH a sample picture, so the "put a starter
#  bg.gif in your folder, but never overwrite one that is already there" rule
#  can actually be tested
$pkgT = Join-Path $test 'pkg'
New-Item -ItemType Directory -Path $pkgT -Force | Out-Null
foreach ($f in @('flow-bg.css', 'flow-bg.js', 'Install-FlowGifBg.ps1', 'Uninstall-FlowGifBg.ps1')) {
    Copy-Item (Join-Path $pkg $f) $pkgT -Force
}
$sampleBytes = [Text.Encoding]::ASCII.GetBytes('GIF89a-SAMPLE-PICTURE-FROM-THE-PACKAGE')
[IO.File]::WriteAllBytes((Join-Path $pkgT 'bg.gif'), $sampleBytes)

$userDir = Join-Path $test 'userpics'
$userUrl = ([Uri]$userDir).AbsoluteUri

#  the two lines a user might have added by hand before this package existed
$loosePats = @(
    '(?m)^[ \t]*<!--[^\r\n<>]*(?:gif background|animated GIF|flow bg|flow-bg)[^\r\n<>]*-->[ \t]*\r?\n',
    '(?m)^[ \t]*<link[^>]*flow-bg\.css[^>]*/?>[ \t]*\r?\n',
    '(?m)^[ \t]*<script[^>]*flow-bg\.js[^>]*>[ \t]*</script>[ \t]*\r?\n'
)
function CleanLoose([string]$t) { foreach ($p in $loosePats) { $t = [regex]::Replace($t, $p, '') }; return $t }

function Run($script, [string[]]$extra) {
    $clean = @($extra | ForEach-Object { $_.Trim('"') })
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $pkgT $script)) + $clean
    (Start-Process pwsh -PassThru -Wait -NoNewWindow -RedirectStandardOutput (Join-Path $test 'out.txt') -ArgumentList $a).ExitCode
}
function NewFake([string]$name, [bool]$handModified) {
    $f = Join-Path $test $name
    New-Item -ItemType Directory -Path "$f\CSXS", "$f\panel\css", "$f\panel\js" -Force | Out-Null
    Copy-Item "$ext\CSXS\manifest.xml" "$f\CSXS\" -Force
    Copy-Item "$ext\panel\css\style.css", "$ext\panel\css\_variables.css", "$ext\panel\css\preset.css" "$f\panel\css\" -Force
    Set-Content "$f\panel\js\panel.js" -Value '// stand-in' -Encoding UTF8
    $html = [IO.File]::ReadAllText("$ext\panel\index.html")
    if (-not $handModified) { $html = CleanLoose $html }        # what a virgin Flow looks like
    [IO.File]::WriteAllText("$f\panel\index.html", $html)
    [IO.File]::WriteAllText("$f\pristine.txt", $html)
    return $f
}

$script:results = @()
function Chk($name, $ok) { $script:results += [pscustomobject]@{ Check = $name; OK = [bool]$ok } }
function StampOf([string]$css) { $m = [regex]::Match($css, '(?m)^[ \t]*--flow-bg-dir:[^;]*;'); if ($m.Success) { return $m.Value.Trim() } ; return '' }

foreach ($sc in @(@{ n = 'HandModified'; hm = $true }, @{ n = 'StockFlow'; hm = $false })) {
    $fake    = NewFake $sc.n $sc.hm
    $pri     = [IO.File]::ReadAllText("$fake\pristine.txt")
    $idx     = "$fake\panel\index.html"
    $instCss = "$fake\panel\css\flow-bg.css"
    $readme  = Join-Path $userDir 'README.txt'
    $sample  = Join-Path $userDir 'bg.gif'

    Remove-Item $userDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Output ("################ SCENARIO: " + $sc.n + " ################")

    Run 'Install-FlowGifBg.ps1' @('-Path', $fake, '-Folder', $userDir, '-DryRun', '-NoDebugMode') | Out-Null
    Chk "[$($sc.n)] dry-run changed nothing" (([IO.File]::ReadAllText($idx)) -eq $pri -and
                                              -not (Test-Path $instCss) -and -not (Test-Path $userDir))

    Run 'Install-FlowGifBg.ps1' @('-Path', $fake, '-Folder', $userDir, '-NoDebugMode') | Out-Null
    $h = [IO.File]::ReadAllText($idx)
    Chk "[$($sc.n)] flow-bg.css copied"    (Test-Path $instCss)
    Chk "[$($sc.n)] flow-bg.js copied"     (Test-Path "$fake\panel\js\flow-bg.js")
    Chk "[$($sc.n)] backup byte-identical" ( (Test-Path "$fake\panel\index.html.flowbg-backup") -and ((Get-FileHash "$fake\panel\index.html.flowbg-backup").Hash -eq (Get-FileHash "$fake\pristine.txt").Hash) )
    Chk "[$($sc.n)] exactly 1 link"        (([regex]::Matches($h, 'css/flow-bg\.css')).Count -eq 1)
    Chk "[$($sc.n)] exactly 1 script"      (([regex]::Matches($h, 'js/flow-bg\.js')).Count -eq 1)
    Chk "[$($sc.n)] block inside <head>"   ($h.IndexOf('flow-gif-bg:start') -lt $h.IndexOf('</head>'))
    Chk "[$($sc.n)] stock css untouched"   ((Get-FileHash "$fake\panel\css\style.css").Hash -eq (Get-FileHash "$ext\panel\css\style.css").Hash)

    # ---- the picture folder half of the install ----
    Chk "[$($sc.n)] picture folder created"       (Test-Path $userDir)
    Chk "[$($sc.n)] README.txt written"           (Test-Path $readme)
    Chk "[$($sc.n)] stamp points at the folder"   ((StampOf ([IO.File]::ReadAllText($instCss))) -eq ("--flow-bg-dir: url('" + $userUrl + "');"))
    Chk "[$($sc.n)] stamp appears once"           (([regex]::Matches([IO.File]::ReadAllText($instCss), '--flow-bg-dir:')).Count -eq 1)
    Chk "[$($sc.n)] sample picture placed"        ((Test-Path $sample) -and ((Get-Item $sample).Length -eq $sampleBytes.Length))

    # ---- re-install: a no-op that must not clobber your own picture ----
    $css1 = [IO.File]::ReadAllText($instCss)
    [IO.File]::WriteAllBytes($sample, [Text.Encoding]::ASCII.GetBytes('MY-OWN-BACKGROUND-LEAVE-IT-ALONE'))
    Run 'Install-FlowGifBg.ps1' @('-Path', $fake, '-Folder', $userDir, '-NoDebugMode') | Out-Null
    $h2 = [IO.File]::ReadAllText($idx)
    Chk "[$($sc.n)] re-install idempotent"      ($h2 -eq $h)
    Chk "[$($sc.n)] still exactly 1 link"       (([regex]::Matches($h2, 'css/flow-bg\.css')).Count -eq 1)
    Chk "[$($sc.n)] stamp not duplicated"       (([regex]::Matches([IO.File]::ReadAllText($instCss), '--flow-bg-dir:')).Count -eq 1 -and
                                                 [IO.File]::ReadAllText($instCss) -eq $css1)
    Chk "[$($sc.n)] backup still pristine" ( (Test-Path "$fake\panel\index.html.flowbg-backup") -and ((Get-FileHash "$fake\panel\index.html.flowbg-backup").Hash -eq (Get-FileHash "$fake\pristine.txt").Hash) )
    Chk "[$($sc.n)] your own picture untouched" ([IO.File]::ReadAllText($sample) -eq 'MY-OWN-BACKGROUND-LEAVE-IT-ALONE')

    # ---- uninstall ----
    Run 'Uninstall-FlowGifBg.ps1' @('-Path', $fake) | Out-Null
    $h3 = [IO.File]::ReadAllText($idx)
    Chk "[$($sc.n)] no flow-bg refs left"  (-not ($h3 -match 'flow-bg'))
    if ($sc.hm) {
        Chk "[$($sc.n)] html == stock Flow" (([regex]::Replace($h3, '\s', '')) -eq (([regex]::Replace((CleanLoose $pri), '\s', ''))))
    } else {
        Chk "[$($sc.n)] html byte-identical" ($h3 -eq $pri)
    }
    Chk "[$($sc.n)] files deleted"         (-not (Test-Path $instCss) -and -not (Test-Path "$fake\panel\js\flow-bg.js"))
    Chk "[$($sc.n)] no leftover backup"    (-not (Test-Path "$fake\panel\index.html.flowbg-backup"))
    Chk "[$($sc.n)] pictures left alone"   ([IO.File]::ReadAllText($sample) -eq 'MY-OWN-BACKGROUND-LEAVE-IT-ALONE')

    Run 'Uninstall-FlowGifBg.ps1' @('-Path', $fake) | Out-Null
    Chk "[$($sc.n)] 2nd uninstall is no-op" (([IO.File]::ReadAllText($idx)) -eq $h3)
    Write-Output ''
}

Write-Output '================ SUMMARY ================'
$script:results | ForEach-Object { '  {0}  {1}' -f $(if ($_.OK) { 'PASS' } else { 'FAIL' }), $_.Check }
$bad = @($script:results | Where-Object { -not $_.OK }).Count
Write-Output ''
Write-Output ("  " + $script:results.Count + " checks, " + $bad + " failed")
if ($bad -eq 0) { Remove-Item $test -Recurse -Force -ErrorAction SilentlyContinue }
exit $(if ($bad -eq 0) { 0 } else { 1 })
