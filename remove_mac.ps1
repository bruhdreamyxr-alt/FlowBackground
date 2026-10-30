$p = 'C:\Users\antho\Downloads\scripts\FlowBackground\panel-extension\js\panel.js'
$s = [IO.File]::ReadAllText($p)

# 1. Remove isMac variable line
$s = $s -replace "  var isMac = \(typeof process !== 'undefined' && process\.platform === 'darwin'\);\r?\n", ""

# 2. findFlow: remove Mac roots block
$s = $s -replace "    if \(isMac\) \{\r?\n      roots\.push\(join\(home\(\), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions'\)\);\r?\n      roots\.push\('/Library/Application Support/Adobe/CEP/extensions'\);\r?\n    \} else \{\r?\n", ""

# 3. openFolder: remove Mac branch
$s = $s -replace "      if \(isMac\) \{ cp\.exec\('open \"' \+ env\.userDir \+ '\"\); \}\r?\n      else \{ cp\.exec\('explorer\.exe \"' \+ env\.userDir \+ '\"\); \}\r?\n", "      cp.exec('explorer.exe \"' + env.userDir + '\"');\r\n"

# 4. ensureDebugMode: remove Mac branch (the whole if (isMac) block)
$pattern = "    if \(isMac\) \{\r?\n      for \(var n = 9; n <= 15; n\+\+\) \{\r?\n        try \{ cp\.execFileSync\('defaults', \['write', 'com\.adobe\.CSXS\.' \+ n, 'PlayerDebugMode', '-string', '1'\], \{ stdio: 'ignore' \}\); \}\r?\n        catch \(e\) \{ /\* best effort \*/ \}\r?\n      \}\r?\n      return;\r?\n    \}\r?\n"
$s = [regex]::Replace($s, $pattern, "")

# 5. runInstaller: remove Mac branch (from "if (isMac) {" to the closing of that branch before "var script  = join")
$start = $s.IndexOf("    if (isMac) {")
$end = $s.IndexOf("    var script  = join(env.payload, install ? 'Install-FlowGifBg.ps1'")
if ($start -ge 0 -and $end -gt $start) {
    $s = $s.Substring(0, $start) + $s.Substring($end)
}

# 6. Remove shQuote and asQuote functions
$s = $s -replace "  function shQuote\(s\) \{ return ""'"" \+ String\(s\)\.replace\(/'/g, ""'\\\\''""\) \+ ""'""; \}\r?\n", ""
$s = $s -replace '  function asQuote\(s\) \{ return ''"'' \+ String\(s\)\.replace\(/\\\\/g, ''\\\\\\\\''\)\.replace\(/"/g, ''\\\\"\''\) \+ ''"''; \}\r?\n', ""

# 7. clipboard: remove Mac branch
$s = $s -replace "        if \(isMac\) \{ cp\.execFileSync\('pbcopy', \[\], \{ input: text, encoding: 'utf8' \}\); copied = true; \}\r?\n        else \{ cp\.execFileSync\('clip\.exe', \[\], \{ input: text, encoding: 'utf8' \}\); copied = true; \}\r?\n", "        cp.execFileSync('clip.exe', [], { input: text, encoding: 'utf8' }); copied = true;\r\n"

# 8. Remove isMac from findFlow roots (already handled by removing the if block)
# Clean up any remaining isMac references
$s = $s -replace "if \(isMac\) \{ ", ""

[IO.File]::WriteAllText($p, $s)
Write-Host "done"