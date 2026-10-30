/* ==========================================================================
   FLOW - animated background loader        (user customization, not Flow code)
   --------------------------------------------------------------------------
   What this does
     1. Finds your background image by ITSELF - name and file type do not matter
        (bg.gif, bg.png, background.jpg, myclip.gif ... all work).
     2. Picks the most recently written match, so "drop a new file in" = "swap
        the background".
     3. Watches the folder and re-applies while After Effects stays open.
     4. Appends ?v=<mtime+size> so the panel can never show a cached frame of
        the previous file.

   WHERE TO DROP A PICTURE  (the only thing you ever have to do)
     1. YOUR folder - no admin rights, no After Effects restart, any time:
          %USERPROFILE%\Documents\Flow Backgrounds\
        The newest file in there wins, and it beats anything shipped with Flow.
        (Want it somewhere else? Set --flow-bg-dir in flow-bg.css, or set a
         FLOW_BG_DIR environment variable, and that folder is used instead.)
     2. Folders that travel with the extension - used only while YOUR folder is
        empty (handy when shipping a picture along with the panel):
          <extension root>\            <- simplest, next to the CSXS folder
          <extension root>\panel\
          <extension root>\panel\img\  or  panel\files\  or  panel\backgrounds\
          <extension root>\bg\  or  backgrounds\  or  images\  or  img\  or  assets\

   Accepted files (the extension is case-insensitive)
     YOUR folder:        ANY name at all - drop whatever you downloaded, no
                         renaming needed.  .gif .png .jpg .jpeg .webp .bmp .apng
     extension folders:  bg, bgs, bg1, my-bg, background, flow-bg, panel-bg
                         + that same extension list, so Flow's own artwork and
                         its icon files are never mistaken for a background
   .gif / .webp / .apng animate inside the panel; .png / .jpg / .bmp hold still.
   (If Node is unavailable the loader can only probe known names, so in that
    fallback everything still works but your file should be called bg.*)

   THEME (written by the "Flow Background" panel - do not hand-edit)
      Drop a theme.json next to your pictures and the loader will use it:
         { "dim": 0.3, "tint": "10, 12, 20", "glass": 0.55,
           "text": "#e8e8ee", "label": "#cccccc", "accent": "#4a8ae4",
           "size": "cover", "position": "center" }
      Every value is validated before use, so a typo is dropped instead of
      breaking the panel. Delete the file to go back to the built-in look.

   Flow's manifest already starts Chromium with --enable-nodejs and
   --allow-file-access-from-files, which the two detection strategies below use.
   If both fail Flow simply keeps its normal dark panel: this script never
   throws and never blocks the panel from loading.
   ========================================================================== */

(function () {
  'use strict';
  if (window.__flowBg) { return; }                  // injected twice - stay quiet

  var NAME_RE = /^(bg|bgs?|background|flow-bg|panel-bg|my-bg)([-_. 0-9a-z]*)?\.(gif|png|jpe?g|webp|bmp|apng)$/i;
  var ANY_IMG_RE = /\.(gif|png|jpe?g|webp|bmp|apng)$/i;   /* your folder: any name */
  var SUBDIRS = ['', 'panel', 'panel/img', 'panel/files', 'panel/backgrounds',
                 'bg', 'backgrounds', 'images', 'img', 'assets', 'media'];
  var CANDIDATE_NAMES = ['bg.gif', 'bg.png', 'bg.jpg', 'bg.webp', 'background.gif',
                         'background.png', 'background.jpg', 'my-bg.gif', 'flow-bg.gif'];
  var POLL_MS = 1500;        // "did my file change?" safety net`n  var HIDDEN_POLL_MS = 5000;  // slower while the panel is hidden
  var REDISCOVER_MS = 20000; // "did I add a file under a different name?"
  var DEBUG = /[?&]flowbgdebug/.test(window.location.search);

  /* ---- locate the extension on disk, wherever it happens to be installed ---- */
  var href = window.location.href.replace(/[?#].*$/, '');
  var PANEL = href.replace(/[^/]*$/, '');                  // .../flow-v1.5.2/panel/
  var ROOT = PANEL.replace(/panel\/$/i, '');               // .../flow-v1.5.2/

  /* ---- optional Node (Flow sets --enable-nodejs, so this normally works) ---- */
  var fs = null, np = null;
  try {
    if (typeof require === 'function' && typeof process !== 'undefined') {
      fs = require('fs');
      np = require('path');
    }
  } catch (e) { fs = null; }
  /* ---- CEP native fs fallback (when Node is unavailable, e.g. AE 2026) ---- */
  if (!fs && typeof window !== 'undefined' && window.cep && window.cep.fs) {
    var cepFs = window.cep.fs;
    var isWin = (typeof navigator !== 'undefined' && /win/i.test(navigator.platform || '')) ||
                (typeof process !== 'undefined' && process.platform === 'win32');
    var sep = isWin ? '\\\\' : '/';
    fs = {
      readdirSync: function (dir) {
        var r = cepFs.readdir(dir);
        if (r.err) { throw new Error('readdir failed'); }
        return r.data || [];
      },
      statSync: function (p) {
        var r = cepFs.stat(p);
        if (r.err) { throw new Error('stat failed'); }
        var d = r.data;
        return {
          isFile: function () { return d.isFile(); },
          isDirectory: function () { return d.isDirectory(); },
          size: d.size || 0,
          mtimeMs: (d.mtime instanceof Date) ? d.mtime.getTime() : (d.mtime || 0)
        };
      },
      readFileSync: function (p, enc) {
        var r = cepFs.readFile(p);
        if (r.err) { throw new Error('readFile failed'); }
        return r.data || '';
      },
      existsSync: function (p) {
        try { var r = cepFs.stat(p); return !r.err; } catch (e) { return false; }
      },
      watch: function () { /* not available - polling covers it */ return { close: function(){} }; }
    };
    if (!np) {
      np = {
        sep: sep,
        join: function () {
          var parts = Array.prototype.slice.call(arguments);
          return parts.join(sep).replace(new RegExp(sep + '+', 'g'), sep);
        }
      };
    }
  }


  function toFsPath(urlDir) {                    /* file:///C:/x/y/ -> C:\x\y */
    var p = urlDir.replace(/^file:\/\/\/?/i, '');
    try { p = decodeURIComponent(p); } catch (e) { /* a literal % in a name */ }
    if (np) { p = p.replace(/\//g, np.sep); if (/^\\\w:/.test(p)) { p = p.substr(1); } }
    return p.replace(/[\\/]+$/, '');
  }
  function toUrl(p) {                            /* C:\x\y -> file:///C:/x/y */
    var u = String(p).replace(/\\/g, '/');
    if (/^[a-z]:/i.test(u)) { u = '/' + u; }                    /* C:\   -> /C: */
    if (/^\/\//.test(u) && !/^\/\/\//.test(u)) { u = '/' + u; } /* \\srv -> //srv */
    return 'file://' + encodeURI(u).replace(/#/g, '%23').replace(/\?/g, '%3F');
  }
  function isUrl(s) { return /^(file|https?):/i.test(s); }
  function envVar(n) {
    try { return (typeof process !== 'undefined' && process.env && process.env[n]) || ''; }
    catch (e) { return ''; }
  }
  function homeDir() {
    var h = envVar('USERPROFILE') || envVar('HOME');
    if (!h && fs) { try { h = require('os').homedir(); } catch (e) { h = ''; } }
    if (!h && typeof window !== 'undefined' && window.__adobe_cep__) {
      try { h = window.__adobe_cep__.getFolderPath('user'); } catch (e) { h = ''; }
      if (!h) { try { h = window.__adobe_cep__.getFolderPath('documents'); } catch (e2) { h = ''; } }
    }
    return h;
  }
  var FSROOT = fs ? toFsPath(ROOT) : null;

  /*  A folder pinned in flow-bg.css (--flow-bg-dir): url('file:///...') or a
      plain Windows path. The installer writes one there; you can too.        */
  var CssDir = '';
  try {
    var dv = (window.getComputedStyle(document.documentElement).getPropertyValue('--flow-bg-dir') || '').trim();
    if (dv && dv.indexOf('none') === -1) {
      var um = /url\(\s*(['"]?)(.*?)\1\s*\)/i.exec(dv);
      CssDir = (um ? um[2] : dv).replace(/[\\/]+$/, '');
    }
  } catch (e) { CssDir = ''; }

  /*  USER_DIRS  = real paths (node mode: exact mtimes, can list a folder)
      USER_BASES = url bases  (xhr mode: probe the names we know)
      While one of these holds a picture it BEATS the folders that travel with
      the extension, so whatever you last dropped is always what you see.    */
  var USER_DIRS = [], USER_BASES = [];
  if (CssDir) {
    if (fs) { USER_DIRS.push(toFsPath(isUrl(CssDir) ? CssDir : toUrl(CssDir))); }
    else { USER_BASES.push((isUrl(CssDir) ? CssDir : toUrl(CssDir)).replace(/\/$/, '') + '/'); }
  }
  if (fs) {
    var pin = envVar('FLOW_BG_DIR');
    if (pin) { USER_DIRS.push(pin.replace(/[\\/]+$/, '')); }
    var home = homeDir();
    if (home) {
      USER_DIRS.push(np.join(home, 'Documents', 'Flow Backgrounds'));
      USER_DIRS.push(np.join(home, 'Documents', 'FlowBackgrounds'));
      USER_DIRS.push(np.join(home, 'FlowBackgrounds'));
    }
  }

  var state = { url: null, token: null, label: null, scans: 0, mode: fs ? 'node-fs' : 'xhr', current: null };
  var log = [];

  /*  ---- optional theme.json, written by the "Flow Background" panel ----------
      Sits in the same folder as your pictures. It only ever sets known CSS
      variables with validated values, so a hand-edited or half-written file can
      never break the panel - bad values are dropped, not applied.

      Values are re-asserted on EVERY scan on purpose: Flow runs its own
      ThemeManager at launch and whenever the AE interface brightness changes,
      which rewrites --color-blue / --color-light-gray behind our back. Without
      the re-assert, a colour picked in the panel would lose to Flow a second
      later. Only genuinely different values are written, so this stays cheap. */
  var THEME_VARS = {
    dim:         '--flow-bg-dim',        /* veil over the picture, 0..1        */
    tint:        '--flow-bg-tint',       /* veil colour as "r, g, b"           */
    glass:       '--flow-glass',         /* panel surfaces, 0..1               */
    glassStrong: '--flow-glass-strong',
    glassList:   '--flow-glass-list',
    text:        '--flow-force-text',    /* our label colour                   */
    label:       '--color-light-gray',   /* Flow's own label colour            */
    accent:      '--color-blue',         /* Flow's accent: buttons, presets    */
    graph:       '--color-graph-gray',   /* the little dots in the graph       */
    grid:        '--color-graph-gray-with-alpha', /* the graph's grid lines   */
    points:      '--color-yellow',      /* the draggable dots ON the curve   */
    size:        '--flow-bg-size',
    position:    '--flow-bg-position'
  };
  var NUM_THEME = { dim: 1, glass: 1, glassStrong: 1, glassList: 1 };
  var theme = { file: null, fp: null, obj: null, set: 0, applied: {} };

  function hashStr(s) {
    var h = 5381, i;
    for (i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; }
    return h.toString(16);
  }
  function clamp01(v) {
    var n = parseFloat(v);
    if (isNaN(n)) { return null; }
    return String(Math.round((n < 0 ? 0 : (n > 1 ? 1 : n)) * 100) / 100);
  }
  function cleanTint(v) {
    var m = /^\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*$/.exec(String(v));
    if (!m) { return null; }
    var c = function (x) { return Math.min(255, parseInt(x, 10)); };
    return c(m[1]) + ', ' + c(m[2]) + ', ' + c(m[3]);
  }
  function cleanColor(v) {
    var s = String(v).trim();
    /* #rgb / #rgba / #rrggbb / #rrggbbaa - Flow's graph colours carry an alpha */
    if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) { return s; }
    if (/^rgba?\([0-9.,%\s]+\)$/i.test(s)) { return s; }
    if (/^hsla?\([0-9.,%\s]+\)$/i.test(s)) { return s; }
    if (/^[a-z]{3,20}$/i.test(s)) { return s; }             /* named colours only */
    return null;
  }
  function cleanSize(v) {
    var s = String(v).trim();
    if (/^(100% 100%|cover|contain)$/i.test(s)) { return s; }
    if (/^\d{1,4}(px|%)? \d{1,4}(px|%)?$/.test(s)) { return s; }
    return null;
  }
  function cleanPosition(v) {
    var s = String(v).trim();
    return /^(top|bottom|left|right|center)( +(top|bottom|left|right|center))*$/.test(s) ? s : null;
  }
  function cleanValue(key, v) {
    if (NUM_THEME[key]) { return clamp01(v); }
    if (key === 'tint') { return cleanTint(v); }
    if (key === 'size') { return cleanSize(v); }
    if (key === 'position') { return cleanPosition(v); }
    return cleanColor(v);
  }
  /*  ---- the bezier curve itself ----------------------------------------------
      The curve line and its handle lines are painted on a <canvas> by Flow's
      own JavaScript, from an obfuscated style object (bezierColor and friends),
      so no CSS variable can ever reach them. Hooking the 2D context is the only
      way in that does not touch Flow's code: in its draw routine a stroke() is
      the curve and the triangle of handle lines, a fill() is a filled marker.
      With no theme value the calls simply pass through, so the stock look stays
      exactly the stock look.                                                       */
  var canvasTheme = { curve: null, points: null, hooked: false };

  function hookCanvas() {
    if (canvasTheme.hooked) { return; }
    var proto = (typeof CanvasRenderingContext2D !== 'undefined') ? CanvasRenderingContext2D.prototype : null;
    if (!proto || typeof proto.stroke !== 'function' || typeof proto.fill !== 'function') { return; }
    var rawStroke = proto.stroke, rawFill = proto.fill;
    proto.stroke = function () {
      if (canvasTheme.curve) { try { this.strokeStyle = canvasTheme.curve; } catch (e) { } }
      return rawStroke.apply(this, arguments);
    };
    proto.fill = function () {
      if (canvasTheme.points) { try { this.fillStyle = canvasTheme.points; } catch (e) { } }
      return rawFill.apply(this, arguments);
    };
    canvasTheme.hooked = true;
  }

  function applyTheme(obj, why) {
    var s = document.documentElement.style, n = 0, k, v, cur;
    for (k in THEME_VARS) {
      if (!Object.prototype.hasOwnProperty.call(THEME_VARS, k)) { continue; }
      if (!obj || !Object.prototype.hasOwnProperty.call(obj, k)) { continue; }
      v = cleanValue(k, obj[k]);
      if (v === null) { continue; }
      try { cur = s.getPropertyValue(THEME_VARS[k]) || ''; } catch (e) { cur = ''; }
      if (cur !== v) { s.setProperty(THEME_VARS[k], v); n++; }        /* only real changes */
      theme.applied[k] = THEME_VARS[k];
    }
    theme.set = n;
    /* the curve line and any filled marker on the canvas: not CSS variables,
       so they go through the 2D-context hook instead                        */
    if (obj) {
      if (Object.prototype.hasOwnProperty.call(obj, 'curve')) { canvasTheme.curve = cleanColor(obj.curve); }
      if (Object.prototype.hasOwnProperty.call(obj, 'points')) { canvasTheme.points = cleanColor(obj.points); }
      hookCanvas();
    }
    if (n && why === 'changed') { say('theme: ' + n + ' value(s) from ' + theme.file); }
    return n;
  }
  function clearTheme(silent) {
    var s = document.documentElement.style, k, n = 0;
    for (k in theme.applied) {
      if (!Object.prototype.hasOwnProperty.call(theme.applied, k)) { continue; }
      try { s.removeProperty(theme.applied[k]); n++; } catch (e) { }
    }
    theme.applied = {};
    theme.set = 0;
    canvasTheme.curve = null;
    canvasTheme.points = null;
    if (n && !silent) { say('theme removed - back to the built-in look'); }
  }
  function themeFile() {
    if (!fs) { return null; }
    for (var i = 0; i < USER_DIRS.length; i++) {
      var p = np.join(USER_DIRS[i], 'theme.json');
      try { if (fs.statSync(p).isFile()) { return p; } } catch (e) { }
    }
    return null;
  }
  /*  Both paths end up here: Node reads the file, XHR fetches it. The text is
      hashed so an unchanged theme costs nothing, and a change re-applies from
      scratch so the file is always the whole truth (no leftovers).          */
  function useThemeText(txt, where) {
    var fp = txt.length + '-' + hashStr(txt);
    var changed = (fp !== theme.fp);
    theme.file = where;
    if (changed) {
      var obj = null;
      try { obj = JSON.parse(txt); }
      catch (e) { say('theme.json is not valid JSON - keeping the last good one'); }
      if (obj && typeof obj === 'object') {
        clearTheme(true);
        theme.obj = obj;
      }
      theme.fp = fp;
    }
    if (theme.obj) { applyTheme(theme.obj, changed ? 'changed' : 'keep'); }
  }
  function noThemeFile() {
    if (theme.applied && Object.keys(theme.applied).length) { clearTheme(); }
    theme.file = null; theme.fp = null; theme.obj = null;
  }
  function scanTheme() {
    if (!fs) { scanThemeXhr(); return; }
    var p = themeFile();
    if (!p) { noThemeFile(); return; }
    var txt;
    try { txt = fs.readFileSync(p, 'utf8'); } catch (e) { return; }
    useThemeText(txt, p);
  }
  /*  No Node (the fallback path): fetch it over file:// instead. Without this
      the colours would silently disappear whenever Node is unavailable.     */
  function scanThemeXhr() {
    if (!USER_BASES.length) { noThemeFile(); return; }
    var url = USER_BASES[0] + 'theme.json?v=' + Date.now();   /* never cached */
    var x = new XMLHttpRequest();
    var done = false;
    x.open('GET', url, true);
    x.timeout = 3000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || done) { return; }
      done = true;
      if (x.status > 0 && x.responseText) { useThemeText(x.responseText, url.replace(/\?.*$/, '')); }
      else { noThemeFile(); }
    };
    x.ontimeout = function () { if (!done) { done = true; } };
    try { x.send(); } catch (e) { if (!done) { done = true; noThemeFile(); } }
  }

  /*  If flow-bg.css already points at a file (someone hard-coded --flow-bg-file),
      a scan that finds nothing must leave that value alone rather than overwrite
      it with `none`. */
  var cssAuthored = false;
  try {
    var authored = window.getComputedStyle(document.documentElement).getPropertyValue('--flow-bg-file');
    cssAuthored = !!authored && authored.length > 0 && authored.indexOf('none') === -1;
  } catch (e) { cssAuthored = false; }

  function say() {
    var m = Array.prototype.slice.call(arguments).join(' ');
    log.push(m);
    if (log.length > 40) { log.shift(); }
    if (window.console && (DEBUG || state.scans < 2)) { console.log('[flow-bg] ' + m); }
  }

  /* ---- push the result into the stylesheet --------------------------------- */
  function apply(url, token, label) {
    var s = document.documentElement.style;
    if (url) {
      console.log('APPLY url=' + url + ' isMac=' + !/^file:\/\/[a-z]:/i.test(url || ''));
      /*  On macOS, file:// URLs with a query string (?v=...) can fail to load,
          so drop the cache-buster there - the mtime scan still re-applies on change. */
      /*  Drop the ?v= cache-buster on non-Windows file URLs: macOS does not support
          query strings on file:// URLs and fails to load the picture.           */
      var noDriveLetter = !/^file:\/\/\/[a-z]:/i.test(url || '');
      var fileUrl = noDriveLetter ? url : (url + '?v=' + token);
      s.setProperty('--flow-bg-file', "url('" + fileUrl + "')");
      s.setProperty('--flow-bg-active', '1');
    } else {
      s.setProperty('--flow-bg-active', '0');
      if (!cssAuthored) { s.setProperty('--flow-bg-file', 'none'); }
    }
    if (state.url !== url || state.token !== token) {
      say(url ? 'background = ' + label + '  [v=' + token + ']'
              : (cssAuthored ? 'no file in the watched folders - keeping the css path'
                             : 'no background file found - using plain dark panel'));
    }
    state.url = url; state.token = token; state.label = label;
  }


  /* ---- strategy 1: Node fs - exact mtime, can list folders ------------------ */
  function pickIn(dir, prefix, anyName) {        /* newest match in ONE folder */
    var names, best = null, i, re = anyName ? ANY_IMG_RE : NAME_RE;
    try { names = fs.readdirSync(dir); } catch (e) { return null; }     // folder absent
    for (i = 0; i < names.length; i++) {
      var nm = String(names[i]);
      var bn = nm.replace(/.*[\\\/]/, '');
      if (!re.test(bn)) { continue; }
      var full = (nm.indexOf('/') >= 0 || nm.indexOf('\\') >= 0) ? nm : np.join(dir, nm);
      var st = null;
      try { st = fs.statSync(full); } catch (e) { st = null; }
      var isFile = true, size = 1, mt = 0;
      if (st) {
        try { isFile = st.isFile(); } catch (e2) { isFile = true; }
        try { size = st.size || 1; } catch (e3) { size = 1; }
        try { mt = st.mtimeMs || 0; } catch (e4) { mt = 0; }
      }
      if (!isFile || !size) { continue; }
      if (!best || mt > best.mt) {                             // newest wins
        best = { mt: mt, size: size, url: toUrl(full),
                 label: (prefix || '') + bn };
      }
    }
    return best;
  }
  function scanNode() {
    var best = null, i, sd;
    /* your folder first: while it holds a picture it decides the look, so the
       thing you last dropped is always the thing on screen */
    for (i = 0; i < USER_DIRS.length && !best; i++) { best = pickIn(USER_DIRS[i], null, true); }
    /* nothing of your own yet - fall back to what ships with the extension,
       comparing every sub-folder so the newest file anywhere still wins */
    if (!best) {
      for (i = 0; i < SUBDIRS.length; i++) {
        sd = SUBDIRS[i];
        var c = pickIn(sd ? np.join(FSROOT, sd.replace(/\//g, np.sep)) : FSROOT,
                       sd ? sd + '/' : '', false);
        if (c && (!best || c.mt > best.mt)) { best = c; }
      }
    }
    if (best) {
      apply(best.url, Math.round(best.mt) + '-' + best.size, best.label);
      state.current = best;
    } else {
      apply(null, null, null);
      state.current = null;
    }
  }

  /* ---- strategy 2: XHR HEAD + pixel fingerprint (no Node required) --------- */
  function candidateUrls() {
    var bases = [], pri = [], i;
    for (i = 0; i < USER_BASES.length; i++) { bases.push(USER_BASES[i]); pri.push(0); }
    bases.push(PANEL); pri.push(1);
    bases.push(ROOT);  pri.push(1);
    for (i = 0; i < SUBDIRS.length; i++) {
      if (SUBDIRS[i]) { bases.push(ROOT + SUBDIRS[i] + '/'); pri.push(1); }
    }
    var list = [];
    for (var b = 0; b < bases.length; b++) {
      for (var n = 0; n < CANDIDATE_NAMES.length; n++) {
        var full = bases[b] + CANDIDATE_NAMES[n];
        list.push({ url: full, pri: pri[b],
                    label: pri[b] ? full.replace(ROOT, '').replace(PANEL, '') : CANDIDATE_NAMES[n] });
      }
    }
    return list;
  }
  function head(url, cb) {
    var done = false;
    var x = new XMLHttpRequest();
    x.open('HEAD', url, true);
    x.timeout = 3000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || done) { return; }
      done = true;
      cb(x.status > 0 ? { url: url, lm: x.getResponseHeader('Last-Modified') || '',
                          len: x.getResponseHeader('Content-Length') || '0' } : null);
    };
    x.ontimeout = function () { if (!done) { done = true; cb(null); } };
    try { x.send(); } catch (e) { if (!done) { done = true; cb(null); } }
  }
  /*  Even with no mtime we can still notice a swapped file: draw the first
      frame small and fingerprint its pixels. */
  function pixelFingerprint(url, token, cb) {
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = 8; c.height = 8;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0, 8, 8);
        var d = g.getImageData(0, 0, 8, 8).data, h = 0;
        for (var i = 0; i < d.length; i += 4) { h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 2147483647; }
        cb(String(h) + '-' + img.naturalWidth + 'x' + img.naturalHeight);
      } catch (e) { cb(null); }              // canvas taint / no 2d context
    };
    img.onerror = function () { cb(null); };
    img.src = url + '?v=' + token;
  }
  function scanXhr(round) {
    var urls = candidateUrls();
    var pending = urls.length, found = [];
    if (!pending) { apply(null, null, null); return; }
    function finish() {
      if (!found.length) { apply(null, null, null); state.current = null; return; }
      found.sort(function (a, b) {                     /* newest first, your folder wins ties */
        var d = (Date.parse(b.lm) || 0) - (Date.parse(a.lm) || 0);
        return d !== 0 ? d : (a.pri - b.pri);
      });
      var top = found[0];
      /*  Token must be STABLE while the file is unchanged - a token that moved on
          every poll would make Chromium re-fetch the picture twice a second.
          file:// sometimes reports no Last-Modified, hence the 0 fallback and the
          pixel fingerprint as the change signal of last resort.               */
      var token = 'x' + (Date.parse(top.lm) || 0) + '-' + (top.len || '0');
      pixelFingerprint(top.url, token, function (fp) {
        if (fp) { token = token + '-' + fp; }
        apply(top.url, token, top.label);
        state.current = { url: top.url, token: token };
      });
    }
    for (var i = 0; i < urls.length; i++) {
      (function (u) {
        head(u.url, function (r) {
          if (r) { r.pri = u.pri; r.label = u.label; found.push(r); }
          if (--pending === 0) { finish(); }
        });
      })(urls[i]);
    }
  }


  /* ---- the scan, and everything that triggers one -------------------------- */
  function scan() {
    state.scans++;
    try { if (fs) { scanNode(); } else { scanXhr(state.scans); } }
    catch (e) { say('scan failed: ' + e); }
    try { scanTheme(); }
    catch (e2) { /* a broken theme file must never stop the picture */ }
  }
  window.__flowBg = { scan: scan, state: state, log: log, apply: apply, root: ROOT,
                      theme: theme, applyTheme: applyTheme, userDirs: USER_DIRS };

  hookCanvas();                                   // before Flow draws anything
  scan();                                        // first paint already correct
  var __pollTimer = null;
  function scheduleScan(ms) {
    if (__pollTimer) { clearTimeout(__pollTimer); }
    __pollTimer = setTimeout(function () { __pollTimer = null; scan(); scheduleScan(document.hidden ? HIDDEN_POLL_MS : POLL_MS); }, ms);
  }
  scheduleScan(POLL_MS);                     // safety net for edits/saves
  if (!fs) { setInterval(scan, REDISCOVER_MS); }  // a new name needs re-discovery

  if (fs) {                                       // instant reaction to a swap
    var watchDirs = [], d;
    for (d = 0; d < USER_DIRS.length; d++) { watchDirs.push(USER_DIRS[d]); }
    for (d = 0; d < SUBDIRS.length; d++) {
      watchDirs.push(SUBDIRS[d] ? np.join(FSROOT, SUBDIRS[d].replace(/\//g, np.sep)) : FSROOT);
    }
    for (d = 0; d < watchDirs.length; d++) {
      (function (dir) {
        try {
          if (!fs.existsSync(dir)) { return; }
          var timer = null;
          fs.watch(dir, function () {
            if (timer) { clearTimeout(timer); }
            timer = setTimeout(function () { timer = null; scan(); }, 300);
          });
        } catch (e) { /* folder refuses to be watched - the poll covers it */ }
      })(watchDirs[d]);
    }
  }

  /*  A CEP panel that was hidden and comes back should re-check too. */
  window.addEventListener('focus', function () { scan(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { scan(); } });
  window.addEventListener('flowbg:rescan', function () { scan(); });

  say('loader ready - mode ' + state.mode + ', root ' + ROOT +
      ', your folder ' + (USER_DIRS[0] || USER_BASES[0] || '(none)'));
})();
