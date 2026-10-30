/* ==========================================================================
   Flow Background & Theme  -  panel logic
   --------------------------------------------------------------------------
   Everything the panel does happens in YOUR Documents folder:
     Documents\Flow Backgrounds\   pictures + theme.json
   The Flow panel has a small watcher in it (flow-bg.js) that reads that folder
   every second or so, so changes show up live with no restart and no admin.

   The only privileged thing here is copying that watcher into Flow itself,
   which lives in Program Files - that is the one "Install into Flow" button,
   and it is only ever needed once.
   ========================================================================== */
(function () {
  try { var __ep = document.getElementById('engine'); if (__ep) { __ep.textContent = 'loading…'; } } catch (e) {}

  window.onerror = function (msg) { try { var n = document.getElementById('setup-note'); if (n) { n.textContent = 'Error: ' + msg; n.className = 'note bad'; } } catch (e) {} return false; };

  'use strict';
  try {

  var EXTS = ['.gif', '.webp', '.apng', '.png', '.jpg', '.jpeg', '.bmp'];

  var fs = null, path = null, os = null, cp = null;
  try { fs = require('fs'); path = require('path'); os = require('os'); cp = require('child_process'); }
  catch (e) { /* no Node: the panel still shows status, just no file work */ }

  /* ---- CEP native fs fallback (when Node is unavailable) ---- */
  if (!fs && typeof window !== 'undefined' && window.cep && window.cep.fs) {
    var cepFs = window.cep.fs;
    var isWin = (typeof navigator !== 'undefined' && /win/i.test(navigator.platform || '')) ||
                (typeof process !== 'undefined' && process.platform === 'win32');
    var sep = isWin ? '\\' : '/';
    fs = {
      readdirSync: function (dir) { var r = cepFs.readdir(dir); if (r.err) { throw new Error('readdir failed'); } return r.data || []; },
      statSync: function (p) { var r = cepFs.stat(p); if (r.err) { throw new Error('stat failed'); } var d = r.data; return { isFile: function () { return d.isFile(); }, isDirectory: function () { return d.isDirectory(); }, size: d.size || 0, mtimeMs: (d.mtime instanceof Date) ? d.mtime.getTime() : (d.mtime || 0), mtime: (d.mtime instanceof Date) ? d.mtime : new Date(d.mtime || 0) }; },
      readFileSync: function (p, enc) { var r = cepFs.readFile(p); if (r.err) { throw new Error('readFile failed'); } return r.data || ''; },
      writeFileSync: function (p, data) { var r = cepFs.writeFile(p, data, 'utf-8'); if (r.err) { throw new Error('writeFile failed'); } },
      mkdirSync: function (p, opts) { try { cepFs.makedir(p); } catch (e) {} },
      copyFileSync: function (src, dst) { var r = cepFs.readFile(src); if (r.err) { throw new Error('readFile failed'); } var w = cepFs.writeFile(dst, r.data, 'utf-8'); if (w.err) { throw new Error('writeFile failed'); } },
      renameSync: function (src, dst) { var r = cepFs.readFile(src); if (r.err) { throw new Error('readFile failed'); } var w = cepFs.writeFile(dst, r.data, 'utf-8'); if (w.err) { throw new Error('writeFile failed'); } try { cepFs.deleteFile(src); } catch (e) {} },
      utimesSync: function (p, atime, mtime) { },
      accessSync: function (p) { var r = cepFs.stat(p); if (r.err) { throw new Error('stat failed'); } },
      existsSync: function (p) { try { var r = cepFs.stat(p); return !r.err; } catch (e) { return false; } },
      unlinkSync: function (p) { try { cepFs.deleteFile(p); } catch (e) {} }
    };
    if (!path) {
      path = { sep: sep, join: function () { var parts = Array.prototype.slice.call(arguments); return parts.join(sep).replace(new RegExp(sep + '+', 'g'), sep); }, extname: function (p) { var i = String(p).lastIndexOf('.'); return i < 0 ? '' : String(p).slice(i); }, basename: function (p) { var parts = String(p).split(/[\\/]/); return parts[parts.length - 1]; } };
    }
    if (!os) { os = { homedir: function () { return ''; } }; }
  }
  var isMac = (typeof process !== 'undefined' && process.platform === 'darwin');
  var isWin = (typeof process !== 'undefined' && process.platform === 'win32');

  function $(id) { return document.getElementById(id); }
  function join() {
    var parts = Array.prototype.slice.call(arguments);
    if (path) { return path.join.apply(path, parts); }
    return parts.join('\\');
  }
  function extname(p) {
    if (path) { return path.extname(p); }
    var i = String(p).lastIndexOf('.'); return i < 0 ? '' : String(p).slice(i);
  }
  function basename(p) {
    if (path) { return path.basename(p); }
    return String(p).split(/[\\/]/).pop();
  }
  function home() { return (os && os.homedir()) || process.env.USERPROFILE || 'C:\\Users'; }
  function exists(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }
  function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch (e) {} }
  function note(msg, bad) {
    var el = $('setup-note');
    el.textContent = msg;
    el.className = 'note' + (msg ? (bad ? ' bad' : ' ok') : '');
  }

  /* ---- CEP hands us the extension folder and the real Documents folder ----- */
  function cepValue(tag) {
    try {
      var xml = window.__adobe_cep__.getSystemPath();
      var m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(xml);
      return (m && m[1]) ? m[1] : '';
    } catch (e) { return ''; }
  }

  var env = { extDir: '', payload: '', userDir: '', flowDir: '', flowIndex: '' };

  function findFlow() {
    if (!fs) { return ''; }
    var roots = [];
    if (isMac) {
      roots.push(join(home(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions'));
      roots.push('/Library/Application Support/Adobe/CEP/extensions');
    } else {
      var pf   = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
      var pf64 = process.env.ProgramFiles || 'C:\\Program Files';
      roots = [
        join(pf,   'Common Files', 'Adobe', 'CEP', 'extensions'),
        join(pf64, 'Common Files', 'Adobe', 'CEP', 'extensions'),
        join(process.env.APPDATA      || join(home(), 'AppData', 'Roaming'), 'Adobe', 'CEP', 'extensions'),
        join(process.env.LOCALAPPDATA || join(home(), 'AppData', 'Local'),    'Adobe', 'CEP', 'extensions')
      ];
    }
    for (var r = 0; r < roots.length; r++) {
      var names;
      try { names = fs.readdirSync(roots[r]); } catch (e) { continue; }
      for (var i = 0; i < names.length; i++) {
        if (!/flow/i.test(names[i])) { continue; }
        var d = join(roots[r], names[i]);
        if (exists(join(d, 'panel', 'index.html'))) { return d; }
      }
    }
    return '';
  }

  function setupEnv() {
    var ext = cepValue('ExtensionPath');
    if (!ext && typeof __dirname !== 'undefined') { ext = __dirname; }
    env.extDir = ext || '.';

    var docs = '';
    try { docs = window.__adobe_cep__.getFolderPath('documents'); } catch (e) {}
    if (!docs) { docs = join(home(), 'Documents'); }
    env.userDir = join(docs, 'Flow Backgrounds');
    env.payload = join(env.extDir, 'payload');
    env.flowDir = findFlow();
    env.flowIndex = env.flowDir ? join(env.flowDir, 'panel', 'index.html') : '';
  }

  /* ---- what is in the picture folder right now ---------------------------- */
  function pictures() {
    var out = [], names;
    if (!fs) { return out; }
    try { names = fs.readdirSync(env.userDir); } catch (e) { return out; }
    for (var i = 0; i < names.length; i++) {
      var full = join(env.userDir, names[i]);
      if (EXTS.indexOf(extname(names[i]).toLowerCase()) === -1) { continue; }
      var st;
      try { st = fs.statSync(full); } catch (e2) { continue; }
      if (!st.isFile() || !st.size) { continue; }
      out.push({ name: names[i], path: full, mtime: st.mtimeMs, size: st.size });
    }
    out.sort(function (a, b) { return b.mtime - a.mtime; });     /* newest first */
    return out;
  }

  function engineInstalled() {
    if (!env.flowIndex || !fs) { return false; }
    try { return fs.readFileSync(env.flowIndex, 'utf8').indexOf('flow-gif-bg:start') !== -1; }
    catch (e) { return false; }
  }

  /* ---- put a picture in; newest wins --------------------------------------- */
  function usePicture(srcPath) {
    if (!fs) { note('This panel needs Node to copy files. Drop your picture into the Flow Backgrounds folder instead.', true); return; }
    var e = extname(srcPath).toLowerCase();
    if (EXTS.indexOf(e) === -1) { note('Flow cannot show ' + (e || 'that file type') + '.', true); return; }
    ensureDir(env.userDir);
    var dest = join(env.userDir, 'bg' + e);
    try {
      if (String(srcPath).toLowerCase() !== String(dest).toLowerCase()) { fs.copyFileSync(srcPath, dest); }
      var now = new Date();
      fs.utimesSync(dest, now, now);          /* so it wins against anything older */
    } catch (err) {
      note('Could not write to ' + env.userDir, true);
      return;
    }
    refresh();
    note('Using ' + basename(dest) + '. The Flow panel swaps over within a second or two.');
  }

  function usePickedFile(file) {
    var e = extname(file.name).toLowerCase();
    if (EXTS.indexOf(e) === -1) { note('Flow cannot show ' + (e || 'that file type') + '.', true); return; }
    ensureDir(env.userDir);
    var dest = join(env.userDir, 'bg' + e);
    var r = new FileReader();
    r.onload = function () {
      try {
        fs.writeFileSync(dest, Buffer.from(new Uint8Array(r.result)));
        var now = new Date();
        fs.utimesSync(dest, now, now);
        refresh();
        note('Copied ' + file.name + ' into the folder for you.');
      } catch (err) { note('Could not write to ' + env.userDir, true); }
    };
    r.onerror = function () { note('Could not read that file.', true); };
    r.readAsArrayBuffer(file);
  }

  function clearPictures() {
    var pics = pictures();
    if (!pics.length) { note('The picture folder is already empty.'); return; }
    var parked = join(env.userDir, '_parked');
    ensureDir(parked);
    var n = 0;
    for (var i = 0; i < pics.length; i++) {
      try { fs.renameSync(pics[i].path, join(parked, pics[i].name)); n++; } catch (e) {}
    }
    refresh();
    note(n + ' picture(s) moved to _parked - Flow is back to its plain dark panel.');
  }

function openFolder() {
    ensureDir(env.userDir);
    try {
      if (isMac) { cp.exec('open "' + env.userDir + '"'); }
      else { cp.exec('explorer.exe "' + env.userDir + '"'); }
    }
    catch (e) { note('Could not open the folder.', true); }
  }

  /* ---- theme.json: the colours and how the picture sits behind the UI ------- */
  var DEFAULTS = {
    dim: 0.22, tint: '8, 8, 12', glass: 0.5,
    text: '#cccccc', accent: '#4a8ae4', graph: '#444444',
    curve: '#4a8ae4', points: '#fdbf28', size: '100% 100%'
  };
  var PRESETS = [
    { name: 'Flow default', theme: { dim: 0.22, tint: '8, 8, 12',   glass: 0.50, text: '#cccccc', accent: '#4a8ae4', graph: '#444444', curve: '#4a8ae4', points: '#fdbf28', size: '100% 100%' } },
    { name: 'Cinematic',    theme: { dim: 0.45, tint: '6, 6, 12',   glass: 0.62, text: '#e6e6ee', accent: '#4a8ae4', graph: '#5a5a68', curve: '#6fd0ff', points: '#ffd24a', size: 'cover' } },
    { name: 'Neon',         theme: { dim: 0.30, tint: '10, 4, 20',  glass: 0.55, text: '#f4f4ff', accent: '#ff2e88', graph: '#7a4fd0', curve: '#ff2e88', points: '#7affff', size: 'cover' } },
    { name: 'Bright',       theme: { dim: 0.05, tint: '0, 0, 0',    glass: 0.32, text: '#ffffff', accent: '#ffd24a', graph: '#2a2a30', curve: '#ffd24a', points: '#ff5900', size: 'contain' } },
    { name: 'Glass',        theme: { dim: 0.18, tint: '14, 18, 28', glass: 0.78, text: '#dfe6f2', accent: '#6fd0ff', graph: '#6a7a90', curve: '#6fd0ff', points: '#ffffff', size: 'cover' } }
  ];

  /*  One Glass slider, three surfaces. The graph header (strong) and the preset
      list (list) each had their own knob, so moving "Glass" used to change the
      middle of the UI and nothing else - now all of them follow the slider, with
      the graph header kept a touch denser so the curve stays readable.        */
  function setGlass(v) {
    theme.glass = v;
    theme.glassStrong = Math.min(1, Math.round((v + 0.15) * 100) / 100);
    theme.glassList = v;
  }

  var theme = null, saveTimer = null;

  function themePath() { return join(env.userDir, 'theme.json'); }
  function backupPath() { return themePath() + '.backup'; }
  /*  Read the live file, and fall back to the backup if it is unreadable - a
      half-written or hand-mangled theme.json must never lose your look.       */
  function readTheme() {
    var tries = [themePath(), backupPath()];
    for (var i = 0; i < tries.length; i++) {
      try {
        var o = JSON.parse(fs.readFileSync(tries[i], 'utf8'));
        if (o && typeof o === 'object') { return o; }
      } catch (e) { /* try the next one */ }
    }
    return null;
  }
  /*  Written via a temp file + rename, so a crash mid-save can never leave a
      truncated theme behind, and a backup is kept alongside it.               */
  function writeThemeNow() {
    try {
      ensureDir(env.userDir);
      var tmp = themePath() + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(theme, null, 2));
      fs.renameSync(tmp, themePath());
    } catch (e) { /* the loader just keeps the last good theme */ }
    try { fs.copyFileSync(themePath(), backupPath()); } catch (e2) { }
  }
  function loadTheme() {
    var t = readTheme() || {};
    theme = {};
    for (var k in DEFAULTS) { theme[k] = (typeof t[k] === 'undefined') ? DEFAULTS[k] : t[k]; }
  }
  function hexToTint(h) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(h));
    if (!m) { return null; }
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ');
  }
  function tintToHex(s) {
    var m = /^\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*$/.exec(String(s));
    if (!m) { return null; }
    function h(x) { var v = Math.min(255, parseInt(x, 10)).toString(16); return v.length < 2 ? '0' + v : v; }
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  }
  function normHex(v) {
    var s = String(v || '');
    if (/^#[0-9a-f]{6}$/i.test(s)) { return s; }
    if (/^#[0-9a-f]{3}$/i.test(s)) { return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]; }
    return '#cccccc';
  }
  function syncUI() {
    var tintHex = tintToHex(theme.tint) || '#08080c';
    $('opt-size').value   = theme.size;
    $('opt-dim').value    = theme.dim;
    $('opt-tint').value   = tintHex;
    $('opt-glass').value  = theme.glass;
    $('opt-text').value   = normHex(theme.text);
    $('opt-accent').value = normHex(theme.accent);
    $('opt-graph').value  = normHex(theme.graph);
    $('opt-curve').value  = normHex(theme.curve);
    $('opt-points').value = normHex(theme.points);
    $('out-dim').textContent    = Number(theme.dim).toFixed(2);
    $('out-tint').textContent   = tintHex.toUpperCase();
    $('out-glass').textContent  = Number(theme.glass).toFixed(2);
    $('out-text').textContent   = normHex(theme.text).toUpperCase();
    $('out-accent').textContent = normHex(theme.accent).toUpperCase();
    $('out-graph').textContent  = normHex(theme.graph).toUpperCase();
    $('out-curve').textContent  = normHex(theme.curve).toUpperCase();
    $('out-points').textContent = normHex(theme.points).toUpperCase();
  }

  function buildPresets() {
    var wrap = $('presets');
    for (var i = 0; i < PRESETS.length; i++) {
      (function (p) {
        var b = document.createElement('button');
        var dot = document.createElement('i');
        dot.style.background = p.theme.accent;
        b.appendChild(dot);
        b.appendChild(document.createTextNode(p.name));
        b.addEventListener('click', function () {
          for (var k in DEFAULTS) { theme[k] = p.theme[k]; }
          setGlass(p.theme.glass);
          saveTheme(true);
          syncUI();
          lookNote('Look set to "' + p.name + '" - saved.');
        });
        wrap.appendChild(b);
      })(PRESETS[i]);
    }
  }

  function applyDefaults() {
    for (var k in DEFAULTS) { theme[k] = DEFAULTS[k]; }
    setGlass(DEFAULTS.glass);
    saveTheme(true);
    syncUI();
  }

  /* ---- picking a picture --------------------------------------------------- */
  function pickPicture() {
    var start = exists(env.userDir) ? env.userDir : '';
    try {
      if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
        var res = window.cep.fs.showOpenDialogEx(
          false, false, 'Choose a background for the Flow panel', start,
          '*.gif;*.webp;*.apng;*.png;*.jpg;*.jpeg;*.bmp');
        if (res && res.err === 0 && res.data && res.data.length) { usePicture(res.data[0]); return; }
        if (res && res.err === 1) { return; }                       /* user cancelled */
      }
    } catch (e) { /* fall through to the plain <input type=file> */ }
    $('file-input').click();
  }

  /* ---- the one privileged step ---------------------------------------------
     Raising UAC from inside After Effects does not work: the panel lives in
     AE's CEF process, which sits in a job object, and an elevated child can
     never reach the secure desktop from there - Start-Process -Verb RunAs just
     dies silently.

     So instead we hand a small .cmd to the Windows shell with explorer.exe.
     Explorer is already running as you, so the .cmd - and the installer it
     starts - are launched outside AE's job object and the UAC prompt appears
     normally. We write that .cmd ourselves so the exact picture folder can be
     passed in and no quoting is left to chance.                              */
  function shellOpen(target) {
    if (!cp) { return false; }
    try { cp.exec('explorer.exe "' + target + '"'); return true; }
    catch (e) { /* fall through to the direct attempt below */ }
    try { cp.exec('cmd.exe /c start "" "' + target + '"'); return true; }
    catch (e2) { return false; }
  }

  function launcherDir() {
    var d = join(os.tmpdir(), 'FlowBackground');
    ensureDir(d);
    return d;
  }
  function writeLauncher(name, script, args) {
    var argLine = '-File "' + script + '"';
    for (var i = 0; i < args.length; i++) { argLine += ' ' + args[i]; }
    /*  A .vbs, not a .cmd: wscript has no console window of its own, and window
        style 0 below means even the PowerShell it starts stays invisible. The
        only thing that ever appears on screen is the Windows "allow this app?"
        prompt - no console popping up in the user's face.                     */
    var ps = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden ' + argLine + ' -Quiet';
    var vbs = ['Option Explicit',
               'Dim sh',
               'Set sh = CreateObject("WScript.Shell")',
               'sh.Run "' + ps.replace(/"/g, '""') + '", 0, False',
               ''].join('\r\n');
    var file = join(launcherDir(), name.replace(/\.cmd$/i, '') + '.vbs');
    fs.writeFileSync(file, vbs);
    return file;
  }

  function shQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
  function asQuote(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

  function runInstaller(kind, done) {
    var install = kind === 'install';
    if (isMac) {
      var script = join(env.payload, install ? 'Install-FlowGifBg.pl' : 'Uninstall-FlowGifBg.pl');
      if (!exists(script)) { note('This extension is incomplete - the Mac installer is missing.', true); done(false); return; }
      if (!cp || !fs) { note('This panel needs Node to start the installer.', true); done(false); return; }
      var cmd = 'perl ' + shQuote(script) + (install ? ' --path ' + shQuote(env.flowDir) + ' --folder ' + shQuote(env.userDir) + ' --no-debug-mode --no-artwork' : ' --path ' + shQuote(env.flowDir));
      var osa = 'do shell script ' + asQuote(cmd) + ' with administrator privileges';
      note('macOS will ask for your password to install into Flow - that is the one admin step.');
      try { cp.execFile('osascript', ['-e', osa], function (e) { if (e) { note('Installer did not finish: ' + e.message, true); } }); }
      catch (e) { note('Could not start the installer: ' + e.message, true); done(false); return; }
      var waited = 0;
      function poll() {
        if (engineInstalled() === install || waited > 150) {
          if (engineInstalled() === install) { done(true); return; }
          note('The installer did not finish, or was cancelled. You can run it by hand in Terminal:\n' +
               cmd, true);
          done(false);
          return;
        }
        waited++;
        setTimeout(poll, 1000);
      }
      setTimeout(poll, 1000);
      return;
    }

    var script  = join(env.payload, install ? 'Install-FlowGifBg.ps1' : 'Uninstall-FlowGifBg.ps1');
    if (!exists(script)) { note('This extension is incomplete - the script is missing.', true); done(false); return; }
    if (!cp || !fs) { note('This panel needs Node to start the installer.', true); done(false); return; }

    var args = install ? ['-Folder', '"' + env.userDir + '"'] : [];
    var cmd  = writeLauncher(install ? '_Install into Flow.cmd' : '_Remove from Flow.cmd', script, args);

    if (!shellOpen(cmd)) {
      note('Could not start the installer. Run it by hand: ' + cmd, true);
      done(false);
      return;
    }
    note('A "Do you want to allow this app to make changes?" prompt should appear now - click Yes on it.');
    var waited = 0;
    function poll() {
      if (engineInstalled() === install || waited > 150) {
        if (engineInstalled() === install) { done(true); return; }
        note('No permission prompt, or it was dismissed. You can always run this by hand:\n' +
             cmd + '\n(double-click it, then click Yes on the Windows prompt)', true);
        done(false);
        return;
      }
      waited++;
      setTimeout(poll, 1000);
    }
    setTimeout(poll, 1000);
  }

  function setBusy(busy, msg) {
    if (msg) { note(msg); }
    $('btn-install').disabled = busy || engineInstalled();
    $('btn-uninstall').disabled = busy || !engineInstalled();
  }

  function installEngine() {
    if (!env.flowDir) { note('Could not find Flow in the CEP extension folders.', true); return; }
    setBusy(true);
    runInstaller('install', function (ok) {
      setBusy(false);
      refresh();
      if (ok) { note('Installed into Flow. Close and re-open the Flow panel once (Window > Extensions) and it is live.'); }
    });
  }

  function uninstallEngine() {
    setBusy(true);
    runInstaller('uninstall', function (ok) {
      setBusy(false);
      refresh();
      if (ok) { note('Removed from Flow. Close and re-open the Flow panel to see the stock look.'); }
    });
  }

  /* ---- CEP only loads a modified extension while debug mode is on. That is a
         per-user registry value, so it needs no admin rights - just set it.  */
  function ensureDebugMode() {
    if (!cp) { return; }
    if (isMac) {
      for (var n = 6; n <= 15; n++) {
        try { cp.execFileSync('defaults', ['write', 'com.adobe.CSXS.' + n, 'PlayerDebugMode', '-string', '1'], { stdio: 'ignore' }); }
        catch (e) { /* best effort */ }
      }
      return;
    }
    for (var n = 6; n <= 15; n++) {
      try {
        cp.execFileSync('reg.exe',
          ['add', 'HKCU\\Software\\Adobe\\CSXS.' + n, '/v', 'PlayerDebugMode', '/t', 'REG_SZ', '/d', '1', '/f'],
          { stdio: 'ignore' });
      } catch (e) { /* best effort */ }
    }
  }

  function lookNote(msg) {
    var el = $('look-note');
    if (!el) { return; }
    el.textContent = msg;
    el.className = 'note' + (msg ? ' ok' : '');
  }
  /* ---- "is this even going to work?" ---------------------------------------
     Three things quietly waste an afternoon: the engine is not in Flow, the
     engine in Flow is older than this panel (so an update did nothing), or Flow
     itself moved on and the selectors we hook no longer exist.            */
  function panelVersion() {
    try {
      var txt = null;
      if (fs) {
        txt = fs.readFileSync(join(env.extDir, 'CSXS', 'manifest.xml'), 'utf8');
      } else if (typeof window !== 'undefined' && window.cep && window.cep.fs) {
        var r = window.cep.fs.readFile(join(env.extDir, 'CSXS', 'manifest.xml'));
        if (!r.err) { txt = r.data; }
      }
      if (!txt) { return '?'; }
      var m = /ExtensionBundleVersion="([^"]+)"/.exec(txt);
      return m ? m[1] : '?';
    } catch (e) { return '?'; }
  }

  function flowRelease() {
    var m = /flow-v?([\d.]+)/i.exec(env.flowDir || '');
    return m ? m[1] : '?';
  }
  /*  The engine inside Flow is a COPY taken when you last pressed Install, so a
      newer payload here means Flow is running the previous build.            */
  function engineStale() {
    var src = join(env.payload, 'flow-bg.js');
    var dst = env.flowDir ? join(env.flowDir, 'panel', 'js', 'flow-bg.js') : '';
    if (!fs || !exists(src)) { return false; }
    if (!dst) { return false; }
    if (!exists(dst)) { return true; }
    try { return fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs; }
    catch (e) { return false; }
  }

  function diagnostics() {
    var L = [], t = readTheme();
    function add(k, v) { L.push(k + ': ' + v); }
    add('panel version', panelVersion());
    add('panel folder', env.extDir);
    add('Flow folder', env.flowDir || '(not found)');
    add('Flow release', flowRelease());
    add('engine in Flow', engineInstalled() ? 'installed' : 'NOT INSTALLED');
    add('  flow-bg.js', exists(env.flowDir ? join(env.flowDir, 'panel', 'js', 'flow-bg.js') : '') ? 'present' : 'missing');
    add('  flow-bg.css', exists(env.flowDir ? join(env.flowDir, 'panel', 'css', 'flow-bg.css') : '') ? 'present' : 'missing');
    add('engine up to date', engineStale() ? 'NO - press Install into Flow' : 'yes');
    add('picture folder', env.userDir);
    add('pictures', pictures().map(function (p) { return p.name; }).join(', ') || '(none)');
    add('current theme', t ? JSON.stringify(t) : '(none - built-in look)');
    add('preset for 1.5.x', flowRelease().indexOf('1.5') === 0 ? 'yes' : 'NO - Flow may have changed');
    return L.join('\r\n');
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function refresh() {
    var pics = pictures();
    var cur = $('current');
    if (pics.length) {
      cur.className = 'current has';
      cur.innerHTML = '<b>' + esc(pics[0].name) + '</b>' +
        (pics.length > 1 ? ' &nbsp;(+' + (pics.length - 1) + ' more, newest wins)' : '');
    } else {
      cur.className = 'current';
      cur.textContent = 'no picture yet - Flow is using its plain dark panel';
    }
    var installed = engineInstalled();
    var pill = $('engine');
    if (!env.flowDir)   { pill.textContent = 'Flow not found';        pill.className = 'pill bad'; }
    else if (installed) { pill.textContent = 'engine: installed';     pill.className = 'pill ok'; }
    else                { pill.textContent = 'engine: not installed'; pill.className = 'pill warn'; }
    $('btn-install').disabled = installed;
    $('btn-uninstall').disabled = !installed;
    var banner = $('banner');
    if (banner) {
      var why = '';
      if (!env.flowDir) {
        why = 'Flow was not found in the CEP extension folders.';
      } else if (!installed) {
        why = '<b>The engine is not inside Flow yet.</b> Nothing on this panel can change the Flow ' +
              'panel until you press <b>Install into Flow</b> below (one permission prompt, once).';
      } else if (engineStale()) {
        why = 'This panel is newer than the engine inside Flow - press <b>Install into Flow</b> to update it.';
      } else if (flowRelease().indexOf('1.5') !== 0) {
        why = 'Flow ' + flowRelease() + ' detected. It may have changed internally, so if the background ' +
              'stops working, reinstall it and mention it to whoever gave you this.';
      }
      banner.innerHTML = why;
      banner.hidden = !why;
    }
    $('watched').textContent = 'watched: ' + env.userDir;
  }

  function wire() {
    $('btn-pick').addEventListener('click', pickPicture);
    $('btn-clear').addEventListener('click', clearPictures);
    $('btn-open').addEventListener('click', openFolder);
    $('btn-install').addEventListener('click', installEngine);
    $('btn-uninstall').addEventListener('click', uninstallEngine);
    $('btn-diag').addEventListener('click', function () {
      var text = diagnostics();
      var file = join(env.userDir, 'flow-background-diagnostics.txt');
      try { ensureDir(env.userDir); fs.writeFileSync(file, text); } catch (e) { }
      var copied = false;
      try {
        if (isMac) { cp.execFileSync('pbcopy', [], { input: text, encoding: 'utf8' }); copied = true; }
        else { cp.execFileSync('clip.exe', [], { input: text, encoding: 'utf8' }); copied = true; }
      } catch (e2) { }
      lookNote(copied ? 'Diagnostics copied to the clipboard, and saved as ' + basename(file) + '.'
                      : 'Diagnostics saved as ' + basename(file) + '.');
    });
    $('btn-update').addEventListener('click', checkUpdates);
    $('btn-reset-theme').addEventListener('click', function () {
      applyDefaults();
      lookNote('Back to the built-in look - saved.');
    });
        $('btn-restart-ae').addEventListener('click', restartAE);
$('btn-export-look').addEventListener('click', function () {
      if (!fs) { note('Node is required to export.', true); return; }
      ensureDir(env.userDir);
      var file = join(env.userDir, 'flow-look.json');
      try { fs.writeFileSync(file, JSON.stringify(theme, null, 2)); note('Look exported to ' + basename(file) + '.'); }
      catch (e) { note('Could not export the look.', true); }
    });
    $('btn-import-look').addEventListener('click', function () { $('look-input').click(); });
    $('look-input').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0]; ev.target.value = '';
      if (!f) { return; }
      var r = new FileReader();
      r.onload = function () {
        try {
          var o = JSON.parse(r.result);
          for (var k in o) { if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) || k === 'glassStrong' || k === 'glassList' || k === 'position' || k === 'grid') { theme[k] = o[k]; } }
          syncUI(); saveTheme(true); lookNote('Look imported.');
        } catch (e) { lookNote('That file is not a valid look.', true); }
      };
      r.readAsText(f);
    });
    $('file-input').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (f) { usePickedFile(f); }
      ev.target.value = '';
    });

    $('opt-size').addEventListener('change', function () {
      theme.size = this.value;
  /* ---- drag & drop + keyboard shortcuts (small UX wins) ------------------ */
  (function addDnD() {
    if (typeof document === 'undefined') { return; }
    document.addEventListener('dragover', function (e) { if (e && e.dataTransfer) { e.preventDefault(); } });
    document.addEventListener('drop', function (e) {
      if (!e || !e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) { return; }
      e.preventDefault();
      usePickedFile(e.dataTransfer.files[0]);
    });
    document.addEventListener('keydown', function (e) {
      if (!e || !(e.ctrlKey || e.metaKey)) { return; }
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); openFolder(); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); clearPictures(); }
    });
  })();

      saveTheme();
    });
    $('opt-dim').addEventListener('input', function () {
      theme.dim = parseFloat(this.value);
      $('out-dim').textContent = theme.dim.toFixed(2);
      saveTheme();
    });
    $('opt-glass').addEventListener('input', function () {
      setGlass(parseFloat(this.value));
      $('out-glass').textContent = theme.glass.toFixed(2);
      saveTheme();
    });
    $('opt-graph').addEventListener('input', function () {
      theme.graph = this.value;
      theme.grid = this.value + '77';        /* same colour, softer grid lines */
      $('out-graph').textContent = this.value.toUpperCase();
      saveTheme();
    });
    $('opt-curve').addEventListener('input', function () {
      theme.curve = this.value;              /* the bezier line, via the canvas hook */
      $('out-curve').textContent = this.value.toUpperCase();
      saveTheme();
    });
    $('opt-points').addEventListener('input', function () {
      theme.points = this.value;             /* the draggable dots on the curve */
      $('out-points').textContent = this.value.toUpperCase();
      saveTheme();
    });
    $('opt-tint').addEventListener('input', function () {
      var t = hexToTint(this.value);
      if (!t) { return; }
      theme.tint = t;
      $('out-tint').textContent = this.value.toUpperCase();
      saveTheme();
    });
    $('opt-text').addEventListener('input', function () {
      theme.text = this.value;
      $('out-text').textContent = this.value.toUpperCase();
      saveTheme();
    });
    $('opt-accent').addEventListener('input', function () {
      theme.accent = this.value;
      $('out-accent').textContent = this.value.toUpperCase();
      saveTheme();
    });
  }

  function compareVersions(a, b) {
    var pa = String(a || '').split('.');
    var pb = String(b || '').split('.');
    var n = Math.max(pa.length, pb.length);
    for (var i = 0; i < n; i++) {
      var x = parseInt(pa[i] || '0', 10) || 0;
      var y = parseInt(pb[i] || '0', 10) || 0;
      if (x !== y) { return x - y; }
    }
    return 0;
  }
  function checkUpdates(silent) {
    if (isMac) {
      var releaseUrl = 'https://github.com/bruhdreamyxr-alt/FlowBackground/releases/latest';
      if (typeof window !== 'undefined' && window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) {
        window.cep.util.openURLInDefaultBrowser(releaseUrl);
      } else if (cp) {
        cp.exec('open "' + releaseUrl + '"');
      } else {
        note('Update available: ' + releaseUrl, true);
      }
      if (!silent) { note('Opened the download page. Download the .zxp and double-click it.'); }
      return;
    }
    if (!cp || !fs) { note('Node is required to check for updates.', true); return; }
    var https = null;
    try { https = require('https'); } catch (e) { https = null; }
    if (!https) { note('Network module unavailable.', true); return; }
    note('Checking for updates...');
    var opts = { hostname: 'api.github.com', path: '/repos/bruhdreamyxr-alt/FlowBackground/releases/latest', headers: { 'User-Agent': 'FlowBackground' } };
    var req = https.get(opts, function (res) {
      var data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        try {
          var j = JSON.parse(data);
          var tag = String(j.tag_name || '').replace(/^v/i, '');
          var cur = panelVersion();
          if (!tag || compareVersions(tag, cur) <= 0) { if (!silent) { note('You are up to date (' + cur + ').'); } return; }
          var asset = null;
          var assets = j.assets || [];
          for (var i = 0; i < assets.length; i++) { if (/\.zxp$/i.test(assets[i].name)) { asset = assets[i]; break; } }
          if (!asset) { note('Newer version ' + tag + ' found, but no ZXP asset attached.', true); return; }
          note('Downloading ' + tag + '...');
          var file = join(launcherDir(), 'Flow-Background-update.zxp');
          var out = fs.createWriteStream(file);
          function downloadUpdate(url, redirects) {
            if (typeof redirects === 'undefined') { redirects = 5; }
            https.get(url, function (res2) {
              if (res2.statusCode >= 300 && res2.statusCode < 400 && res2.headers.location && redirects > 0) {
                res2.resume();
                downloadUpdate(res2.headers.location, redirects - 1);
                return;
              }
              if (res2.statusCode !== 200) { note('Download failed: HTTP ' + res2.statusCode, true); try { fs.unlinkSync(file); } catch (e) {} return; }
              res2.pipe(out);
              out.on('finish', function () { out.close(); note('Update ' + tag + ' downloaded. Opening installer...'); shellOpen(file); });
            }).on('error', function (e) { note('Download failed: ' + e.message, true); });
          }
          downloadUpdate(asset.browser_download_url);
        } catch (e) { note('Update check failed: ' + e.message, true); }
      });
    }).on('error', function (e) { note('Network error: ' + e.message, true); });
      req.setTimeout(10000, function () { req.destroy(); note('Update check timed out.', true); });
  }

  function restartAE() {
    if (!confirm('Restart After Effects now? Save your work first.')) { return; }
    try {
      if (cp && fs) {
        if (isMac) {
          var sh = '#!/bin/sh\nsleep 3\nfor d in /Applications/Adobe\ After\ Effects*; do\n  if [ -x "$d/Contents/MacOS/After Effects" ]; then open "$d"; break; fi\ndone\n';
          var f = join(launcherDir(), 'restart-ae.sh');
          fs.writeFileSync(f, sh);
          try { fs.chmodSync(f, 493); } catch (e) {}
          cp.exec('sh "' + f + '" >/dev/null 2>&1 &');
        } else {
          var cmd = '@echo off\r\ntimeout /t 3 /nobreak >nul\r\nfor /d %%D in ("C:\\Program Files\\Adobe\\Adobe After Effects*") do (\r\n  if exist "%%D\\Support Files\\AfterFX.exe" start "" "%%D\\Support Files\\AfterFX.exe"\r\n)\r\n';
          var f = join(launcherDir(), 'restart-ae.cmd');
          fs.writeFileSync(f, cmd);
          cp.exec('cmd.exe /c start /min "" "' + f + '"');
        }
      }
    } catch (e) {}
    try { window.__adobe_cep__.evalScript('app.quit()'); } catch (e2) {}
  }
  function init() {
    try {
      setupEnv();
      ensureDir(env.userDir);
      ensureDebugMode();
      loadTheme();
      buildPresets();
      syncUI();
      wire();
      refresh();
      setInterval(refresh, 1500);
      setTimeout(function () { checkUpdates(true); }, 4000);
      try {
        var welcomed = false;
        try { welcomed = (localStorage.getItem('flowbg.welcomed') === '1'); } catch (e) {}
        if (!welcomed) {
          try { localStorage.setItem('flowbg.welcomed', '1'); } catch (e2) {}
          note('Welcome to Flow Background! Pick a picture and make Flow yours.');
        }
      } catch (e3) {}
    } catch (e) {
      try { window.onerror(e && e.message ? e.message : String(e)); } catch (e2) {}
    }
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  setTimeout(init, 50);

  window.addEventListener('beforeunload', function () { try { saveTheme(true); } catch (e) {} });
  } catch (e) {
    try { document.body.style.background = 'red'; } catch (e2) {}
    try { alert('PANEL ERROR: ' + (e && e.message ? e.message : e)); } catch (e3) {}
  }
})();