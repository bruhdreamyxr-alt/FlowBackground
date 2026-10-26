<#
.SYNOPSIS
  Visual / browser test: runs the REAL flow-bg.css + flow-bg.js in real Chrome.
.DESCRIPTION
  Everything else verifies logic in Node. This one verifies the part that only a
  real browser can answer:

    * the stylesheet actually loads and the variables resolve
    * the loader really paints the picture (the url carries the cache-busting
      token and the image decodes - a broken path or a %20 mistake shows up here)
    * the glass / veil CSS really lands on the surfaces it is supposed to
    * #container really is transparent, so the UI is not buried behind the picture
    * theme.json is picked up and the Flow variables are really overridden
    * the canvas hook really recolours a stroke() call
    * the scrollbars really are gone

  It also writes preview.png - an actual rendering of your current look, so you
  can look at it without opening After Effects.

  Run:  powershell -ExecutionPolicy Bypass -File .\flow-test-visual.ps1
#>
[CmdletBinding()]
param([switch]$KeepOpen)

$ErrorActionPreference = 'Stop'
$Here   = $PSScriptRoot
$flow   = 'C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\flow-v1.5.2'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
$T   = Join-Path $env:TEMP 'fbg-visual'
$ext = Join-Path $T 'flow-v1.5.2'
$usr = Join-Path $T 'Flow Backgrounds'

$script:results = @()
function Chk($name, $ok, $detail) {
  if ($ok) { $script:results += [pscustomobject]@{ Check = $name; OK = [bool]$ok; Detail = "$detail" } }
  else { $script:results += [pscustomobject]@{ Check = $name; OK = $false; Detail = "$detail" } }
}

if (-not (Test-Path $chrome)) {
  Write-Host '  Chrome was not found - skipping the browser test.' -ForegroundColor Yellow
  Write-Host '  (Install Chrome, or run this on a machine that has it.)' -ForegroundColor DarkGray
  exit 0
}

Remove-Item $T -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$ext\panel\css", "$ext\panel\js", $usr -Force | Out-Null

# ---- the real files under test -------------------------------------------
Copy-Item (Join-Path $Here 'flow-bg.css') "$ext\panel\css\" -Force
Copy-Item (Join-Path $Here 'flow-bg.js')  "$ext\panel\js\"  -Force
if (Test-Path "$flow\panel\css\_variables.css") {
  Copy-Item "$flow\panel\css\_variables.css" "$ext\panel\css\vars.css" -Force
} else {
  ':root{--color-blue:#4a8ae4;--color-light-gray:#cccccc;--color-yellow:#fdbf28;' +
  '--color-graph-gray:#444444;--color-graph-gray-with-alpha:#44444477;--color-panel-gray:#303030;}' |
    Out-File -Encoding ascii "$ext\panel\css\vars.css"
}

# a real animated gif: prefer the one that ships with Flow
$gif = "$flow\bg.gif"
if (-not (Test-Path $gif)) { $gif = (Get-ChildItem $env:USERPROFILE -Filter '*.gif' -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
if ($gif -and (Test-Path $gif)) { Copy-Item $gif "$ext\bg.gif" -Force; $gifUsed = Split-Path $gif -Leaf }
else {
  # 1x1 gif89a, so the test still proves the plumbing even without artwork
  [byte[]]$b = 0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,0x00,0x00,0x00,0xFF,0xFF,0xFF,0x21,0xF9,0x04,0x01,0x00,0x00,0x00,0x00,0x2C,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,0x01,0x00,0x3B
  [IO.File]::WriteAllBytes("$ext\bg.gif", $b); $gifUsed = 'generated 1x1'
}

# a theme with values that are impossible to mistake for the defaults
$theme = [ordered]@{
  dim = 0.35; tint = '24, 12, 40'; glass = 0.6
  text = '#ffeecc'; accent = '#00ff88'; graph = '#ff00aa'
  curve = '#ff00ff'; points = '#00ffff'; size = 'cover'
}
$theme | ConvertTo-Json | Out-File -Encoding ascii (Join-Path $usr 'theme.json')

# point the stylesheet at that folder, exactly as the installer does
$cssText = [IO.File]::ReadAllText("$ext\panel\css\flow-bg.css")
$url = ([Uri]$usr).AbsoluteUri
$cssText = [regex]::Replace($cssText, '(?m)^[ \t]*--flow-bg-dir:[^;]*;',
                            ('--flow-bg-dir: url(''' + $url + ''');').Replace('$', '$$'))
[IO.File]::WriteAllText("$ext\panel\css\flow-bg.css", $cssText)

# ---- a minimal stand-in for Flow's own layout ------------------------------
@'
html, body { margin: 0; height: 100%; background: #303030; color: var(--color-light-gray);
             font: 12px "Segoe UI", sans-serif; }
#container { display: flex; height: 100%; }
#graphPanel { flex: 1 1 auto; display: flex; flex-direction: column; }
#graphPanel-top { flex: 1 1 auto; position: relative; display: flex; overflow: hidden; }
#canvas-wrapper { position: relative; width: 100%; height: 100%;
  background-image: linear-gradient(to right, var(--color-graph-gray) 1px, transparent 1px),
                    linear-gradient(to bottom, var(--color-graph-gray) 1px, transparent 1px);
  background-size: 20% 20%; }
#canvas { position: absolute; }
#controls { flex: 0 0 auto; padding: 6px; }
#libraryPanel { flex: 0 0 90px; display: flex; flex-direction: column; }
#libraryIO { flex: 0 0 auto; }
#library { flex: 1 1 auto; overflow-y: scroll; height: 70px; min-height: 70px; }
.box { height: 40px; margin: 4px; background: rgba(255,255,255,.05); }
'@ | Out-File -Encoding ascii "$ext\panel\css\layout.css"

# ---- the page: real stylesheets + real loader, then measure everything -------
$page = @'
<!DOCTYPE html><html><head><meta charset="utf-8"><title>probe</title>
<link rel="stylesheet" href="css/vars.css">
<link rel="stylesheet" href="css/layout.css">
<link rel="stylesheet" href="css/flow-bg.css">
</head><body>
  <div id="container">
    <div id="graphPanel">
      <div id="graphPanel-top"><div id="canvas-wrapper"><canvas id="canvas" width="300" height="200"></canvas></div></div>
      <div id="controls">Read &nbsp; Edit &nbsp; <span id="btn" style="color:var(--color-blue)">APPLY</span></div>
    </div>
    <div id="libraryPanel">
      <div id="libraryIO">Library</div>
      <div id="library"><div class="box">preset one</div><div class="box">preset two</div><div class="box">preset three</div><div class="box">preset four</div><div class="box">preset five</div><div class="box">preset six</div><div class="box">preset seven</div><div class="box">preset eight</div><div class="box">preset nine</div><div class="box">preset ten</div><div class="box">preset eleven</div><div class="box">preset twelve</div></div>
    </div>
  </div>
<script src="js/flow-bg.js"></script>
<script>
setTimeout(function () {
  var R = {}, cs = getComputedStyle(document.documentElement);
  function px(el) { var e = document.getElementById(el); return e ? getComputedStyle(e) : null; }
  R.engine  = !!window.__flowBg;
  R.mode    = window.__flowBg ? window.__flowBg.state.mode : null;
  R.label   = window.__flowBg ? window.__flowBg.state.label : null;
  R.active  = (cs.getPropertyValue('--flow-bg-active') || '').trim();
  R.bgImage = cs.backgroundImage;
  var m = /url\(["']?([^"')]+)["']?\)/.exec(cs.backgroundImage || '');
  R.bgUrl   = m ? m[1] : null;
  R.dim     = (cs.getPropertyValue('--flow-bg-dim') || '').trim();
  R.tint    = (cs.getPropertyValue('--flow-bg-tint') || '').trim();
  R.accent  = (cs.getPropertyValue('--color-blue') || '').trim();
  R.points  = (cs.getPropertyValue('--color-yellow') || '').trim();
  R.graph   = (cs.getPropertyValue('--color-graph-gray') || '').trim();
  R.size    = (cs.getPropertyValue('--flow-bg-size') || '').trim();
  var gt = px('graphPanel-top'), cw = px('canvas-wrapper'), co = px('container'), li = px('library');
  R.graphTopBg = gt ? gt.backgroundColor : null;
  R.canvasBg  = cw ? cw.backgroundColor : null;
  R.containerBg = co ? co.backgroundColor : null;
  R.libraryBg = li ? li.backgroundColor : null;
  R.scrolled = (function () { var l = document.getElementById('library'); l.scrollTop = 40;
                               var ok = l.scrollTop > 0;
                               R.libClient = l.clientHeight; R.libScroll = l.scrollHeight;
                               R.libOverflow = getComputedStyle(l).overflowY;
                               R.libScrollW = getComputedStyle(l).scrollbarWidth;
                               return ok; })();
  R.strokeHook = (function () { var c = document.createElement('canvas').getContext('2d');
                                c.stroke(); return c.strokeStyle; })();
  function finish() {
    var d = document.createElement('div');
    d.id = 'RESULT';
    d.textContent = JSON.stringify(R);
    document.body.appendChild(d);
  }
  if (R.bgUrl) {
    var i = new Image();
    i.onload  = function () { R.imgW = i.naturalWidth; R.imgH = i.naturalHeight; finish(); };
    i.onerror = function () { R.imgErr = 1; finish(); };
    i.src = R.bgUrl;
    setTimeout(function () { if (!document.getElementById('RESULT')) { R.imgErr = 2; finish(); } }, 4000);
  } else { finish(); }
}, 2200);
</script></body></html>
'@
[IO.File]::WriteAllText("$ext\panel\index.html", $page)

function Run-Chrome([string[]]$extra, [string]$outFile) {
  $o = Join-Path $T 'out.txt'; $e = Join-Path $T 'err.txt'
  $argv = @('--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars=false',
            '--allow-file-access-from-files', ('--user-data-dir=' + (Join-Path $T 'prof')),
            '--virtual-time-budget=9000') + $extra + @('file:///' + (($ext + '\panel\index.html') -replace '\\', '/'))
  $p = Start-Process $chrome -PassThru -Wait -NoNewWindow -RedirectStandardOutput $o -RedirectStandardError $e -ArgumentList $argv
  if (Test-Path $o) { [IO.File]::WriteAllText($outFile, [IO.File]::ReadAllText($o)) }
  return (Test-Path $outFile)
}

Write-Host ''
Write-Host '  real-browser test (headless Chrome)' 'White'
Write-Host '  ------------------------------------' 'DarkGray'
Write-Host ('  picture under test: ' + $gifUsed) 'DarkGray'

$domFile = Join-Path $T 'dom.html'
if (-not (Run-Chrome @('--dump-dom') $domFile)) {
  Write-Host '  Chrome produced no DOM - cannot continue' -ForegroundColor Red
  exit 2
}
$dom = [IO.File]::ReadAllText($domFile)
$m = [regex]::Match($dom, '(?s)<div id="RESULT">(.*?)</div>')
if (-not $m.Success) {
  Write-Host '  the page never reported back (script error?)' -ForegroundColor Red
  Write-Host ($dom.Substring(0, [Math]::Min(400, $dom.Length))) -ForegroundColor DarkGray
  exit 2
}
$R = ($m.Groups[1].Value -replace '&quot;', '"' -replace '&amp;', '&') | ConvertFrom-Json

Chk 'loader ran in a real browser'        $R.engine                              $R.mode
Chk 'it found the picture on disk'        ($R.label -eq 'bg.gif')                 $R.label
Chk 'background marked active'            ($R.active -eq '1')                     $R.active
Chk 'background-image really carries it'  ($R.bgUrl -match 'bg\.gif\?v=')        $R.bgUrl
Chk 'and the picture really decodes'      ($R.imgW -gt 0)                        ("$($R.imgW) x $($R.imgH)")
Chk 'veil strength applied'               ($R.dim -eq '0.35')                     $R.dim
Chk 'veil colour applied'                ($R.tint -eq '24, 12, 40')             $R.tint
Chk 'Flow accent variable overridden'     ($R.accent -eq '#00ff88')               $R.accent
Chk 'control-point colour applied'        ($R.points -eq '#00ffff')               $R.points
Chk 'graph dot colour applied'           ($R.graph -eq '#ff00aa')                $R.graph
Chk 'fit mode applied'                    ($R.size -eq 'cover')                   $R.size
Chk 'container is transparent (UI alive)' ($R.containerBg -match 'rgba\(0, 0, 0, 0\)') $R.containerBg
Chk 'graph header really veiled'          ($R.graphTopBg -match 'rgba\(24, 12, 40')  $R.graphTopBg
Chk 'graph area veiled only once'         ($R.canvasBg -match 'rgba\(0, 0, 0, 0\)')  $R.canvasBg
Chk 'preset list really veiled'           ($R.libraryBg  -match 'rgba\(24, 12, 40')  $R.libraryBg
Chk 'canvas hook recolours a stroke()'    ($R.strokeHook -eq '#ff00ff')           $R.strokeHook
Chk 'scrollbars really are hidden'          ($R.libScrollW -eq 'none')               $R.libScrollW
Chk 'but the list still scrolls'            ($R.scrolled -eq $true)                 ("client=$($R.libClient) content=$($R.libScroll)")

# ---- and a picture of the result: YOUR look, not the test theme -------------
$realTheme = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Flow Backgrounds\theme.json'
if (Test-Path $realTheme) {
  Copy-Item $realTheme (Join-Path $usr 'theme.json') -Force
  $previewNote = 'your own theme.json'
} else {
  Remove-Item (Join-Path $usr 'theme.json') -Force -ErrorAction SilentlyContinue
  $previewNote = 'the built-in default look (no theme.json found on this PC)'
}
$png = Join-Path $Here 'preview.png'
Run-Chrome @("--screenshot=$png", '--window-size=520,620') (Join-Path $T 'shot.txt') | Out-Null
Chk 'preview.png rendered' (Test-Path $png) $(if (Test-Path $png) { [math]::Round((Get-Item $png).Length / 1KB, 1) } else { 'missing' })
Write-Host ('  preview shows: ' + $previewNote) -ForegroundColor DarkCyan

Write-Host ''
$script:results | ForEach-Object { Write-Host ('  {0}  {1,-42} {2}' -f $(if ($_.OK) { 'PASS' } else { 'FAIL' }), $_.Check, $_.Detail) -ForegroundColor $(if ($_.OK) { 'DarkGray' } else { 'Yellow' }) }
$bad = @($script:results | Where-Object { -not $_.OK }).Count
Write-Host ''
Write-Host ('  ' + $script:results.Count + ' checks, ' + $bad + ' failed') -ForegroundColor $(if ($bad) { 'Yellow' } else { 'Green' })
if (-not $bad) { Write-Host '  the background, the veil, the glass and the canvas hook all work in a real browser' -ForegroundColor Green }
Write-Host ('  preview: ' + $png) -ForegroundColor DarkCyan
if (-not $KeepOpen) { Remove-Item $T -Recurse -Force -ErrorAction SilentlyContinue }
exit $(if ($bad) { 1 } else { 0 })