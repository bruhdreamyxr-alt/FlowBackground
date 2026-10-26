/* ==========================================================================
   panel.js - logic test, no After Effects involved
   --------------------------------------------------------------------------
   Runs the REAL panel-extension/js/panel.js against a stubbed DOM and a stubbed
   CEP bridge (getSystemPath / getFolderPath), with a fake Flow install and a
   fake Documents folder, and checks the things that actually matter:

     * it resolves YOUR picture folder from the CEP bridge, not from a guess
     * it writes/reads theme.json so the colours survive a panel restart
     * "Choose picture" really copies the file in and makes it the newest one
     * "Clear" parks the pictures instead of deleting them
     * the install/remove buttons build a correct elevated command (this is the
       part most likely to break silently, so it is checked byte for byte)

   Run:  node flow-test-panel.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const HERE = __dirname;
const PANEL_JS  = path.join(HERE, 'panel-extension', 'js', 'panel.js');
const PANEL_HTML = path.join(HERE, 'panel-extension', 'index.html');
const HTML = fs.readFileSync(PANEL_HTML, 'utf8');
const CODE = fs.readFileSync(PANEL_JS, 'utf8');
const BUNDLE = (function () {
  const m = /ExtensionBundleId="([^"]+)"/.exec(fs.readFileSync(path.join(HERE, 'panel-extension', 'CSXS', 'manifest.xml'), 'utf8'));
  return m ? m[1] : 'com.antho.flowbg.panel';
})();

const TMP   = path.join(os.tmpdir(), 'fbg-panel-test');
const PF86  = path.join(TMP, 'PF86');
const APPD  = path.join(TMP, 'AppData', 'Roaming');
const DOCS  = path.join(TMP, 'Documents');
const USER  = path.join(DOCS, 'Flow Backgrounds');
const EXT   = path.join(TMP, 'extension', BUNDLE);
const FLOW  = path.join(PF86, 'Common Files', 'Adobe', 'CEP', 'extensions', 'flow-v1.5.2');
const FLOW_INDEX = path.join(FLOW, 'panel', 'index.html');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; } else { fail++; }
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name +
              (detail === undefined || detail === null ? '' : '   [' + detail + ']'));
}
function head(t) { console.log('\n' + t); }
function dir(p) { fs.mkdirSync(p, { recursive: true }); return p; }
function wipe(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }
function img(p, bytes) {
  dir(path.dirname(p));
  fs.writeFileSync(p, Buffer.alloc(bytes || 64, 0x47));
  return p;
}

/* ---- the fake world ------------------------------------------------------- */
function world() {
  wipe(TMP);
  dir(path.join(FLOW, 'panel'));                       /* a fake Flow install */
  dir(USER);
  /* a stock Flow page: no flow-gif-bg marker in it */
  fs.writeFileSync(FLOW_INDEX, '<!DOCTYPE html>\n<html>\n <head>\n  <title>Flow</title>\n' +
    '  <link href="css/style.css" rel="stylesheet" />\n </head>\n <body></body>\n</html>\n');
  /* the extension folder, with the payload the panel shells out to */
  dir(path.join(EXT, 'payload'));
  for (const f of ['flow-bg.js', 'flow-bg.css', 'Install-FlowGifBg.ps1', 'Uninstall-FlowGifBg.ps1']) {
    const from = path.join(HERE, f);
    if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(EXT, 'payload', f)); }
    else { fs.writeFileSync(path.join(EXT, 'payload', f), '// stand-in\n'); }
  }
  return { userDir: USER, flowIndex: FLOW_INDEX, ext: EXT, docs: DOCS };
}

/* ---- stub DOM ------------------------------------------------------------- */
function makeDom() {
  const els = {};
  const ids = [];
  const rx = /id="([^"]+)"/g;
  let m;
  while ((m = rx.exec(HTML)) !== null) { ids.push(m[1]); }
  ids.forEach((id) => { els[id] = makeEl(id); });
  return els;
}
function makeEl(id) {
  const handlers = {};
  const el = {
    id: id,
    value: '', textContent: '', className: '', innerHTML: '',
    disabled: false, style: {}, files: [], children: [],
    addEventListener: function (t, f) { (handlers[t] = handlers[t] || []).push(f.bind(el)); },
    appendChild: function (c) { el.children.push(c); return c; },
    click: function () { fire(id, 'click', {}); }
  };
  el.fire = function (t, ev) {
    (handlers[t] || []).forEach((f) => f(ev || { target: { value: '' } }));
  };
  return el;
}

/* ---- boot the real panel.js against that world ---------------------------- */
function boot(opts) {
  opts = opts || {};
  const els = makeDom();
  const captured = { exec: [], reg: [] };
  const timers = [];

  const fakeCp = {
    exec(cmd, cb) { captured.exec.push(cmd); if (cb) { cb(null, '', ''); } return {}; },
    execFileSync(file, args) { captured.reg.push([file].concat(args || [])); return ''; }
  };
  const fakeRequire = (m) => (m === 'child_process' ? fakeCp : require(m));

  const sandboxEnv = Object.assign({}, process.env, {
    'ProgramFiles(x86)': PF86, ProgramFiles: PF86,
    APPDATA: APPD, LOCALAPPDATA: path.join(TMP, 'AppData', 'Local'), USERPROFILE: TMP
  });
  delete sandboxEnv.HOME;

  const windowStub = {
    __adobe_cep__: {
      getSystemPath() {
        return '<ExtensionPath>' + EXT + '</ExtensionPath>' +
               '<SystemPath>win</SystemPath>' +
               '<DocumentsPath>' + DOCS + '</DocumentsPath>';
      },
      getFolderPath() { return DOCS; }
    },
    cep: { fs: { showOpenDialogEx() { return opts.dialog || { err: 1 }; } } },
    addEventListener() {}
  };
  const documentStub = {
    readyState: 'complete',
    getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
    createElement(t) { return makeEl('<' + t + '>') },
    createTextNode(t) { return { nodeType: 3, textContent: t }; },
    addEventListener() {}
  };
  const ctx = {
    window: windowStub, document: documentStub, require: fakeRequire,
    process: { env: sandboxEnv, platform: 'win32' },
    console: { log() {}, warn() {}, error() {} },
    setInterval() { return 0; }, clearInterval() {},
    setTimeout(fn, ms) { if (ms <= 2000) { timers.push(fn); } return 0; },   /* debounce + polling */
    clearTimeout() {},
    Buffer, JSON, FileReader: function () {}
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx, { filename: PANEL_JS });

  return {
    els: els, exec: captured.exec, reg: captured.reg,
    setDialog(r) { opts.dialog = r; },
    flush() { let n = 0; while (timers.length && n < 5) { timers.splice(0).forEach((f) => f()); n++; } }
  };
}

/* ========================================================================== */
head('1. finds your folder through the CEP bridge (and creates it)');
world();
fs.rmSync(USER, { recursive: true, force: true });
const p1 = boot();
check('picture folder created', fs.existsSync(USER), USER);
check('footer shows that folder', p1.els.watched.textContent === 'watched: ' + USER, p1.els.watched.textContent);
check('says no picture yet', /no picture yet/.test(p1.els.current.textContent), p1.els.current.textContent);
check('engine pill: not installed', p1.els.engine.textContent === 'engine: not installed', p1.els.engine.textContent);
check('install enabled, remove disabled', p1.els['btn-install'].disabled === false && p1.els['btn-uninstall'].disabled === true);
check('default veil loaded', Number(p1.els['opt-dim'].value) === 0.22 && p1.els['out-dim'].textContent === '0.22', p1.els['out-dim'].textContent);
check('veil colour shown as hex', p1.els['opt-tint'].value === '#08080c', p1.els['opt-tint'].value);
check('five presets built', p1.els.presets.children.length === 5, p1.els.presets.children.length);
check('CEP debug mode set without admin', p1.reg.length === 5 && p1.reg[0][0] === 'reg.exe' && /CSXS\.9/.test(p1.reg[0].join(' ')), p1.reg.length + ' reg calls');

head('2. picks up a theme and a picture that are already there');
world();
fs.writeFileSync(path.join(USER, 'theme.json'), JSON.stringify({
  dim: 0.5, tint: '10, 12, 20', glass: 0.7, text: '#ffffff', accent: '#ff0000', size: 'cover'
}));
img(path.join(USER, 'sunset.gif'));
const p2 = boot();
check('theme values loaded into the controls',
      Number(p2.els['opt-dim'].value) === 0.5 && p2.els['opt-accent'].value === '#ff0000' &&
      p2.els['opt-size'].value === 'cover', p2.els['opt-accent'].value + ' / ' + p2.els['opt-size'].value);
check('tint round-tripped to hex', p2.els['opt-tint'].value === '#0a0c14', p2.els['opt-tint'].value);
check('current picture named in the UI', /sunset\.gif/.test(p2.els.current.innerHTML), p2.els.current.innerHTML);
check('current row flagged as "has" one', p2.els.current.className === 'current has', p2.els.current.className);

head('3. a colour change lands in theme.json');
world();
const p3 = boot();
p3.els['opt-accent'].value = '#ff8800';
p3.els['opt-accent'].fire('input', { target: p3.els['opt-accent'] });
p3.flush();
const t1 = JSON.parse(fs.readFileSync(path.join(USER, 'theme.json'), 'utf8'));
check('accent written', t1.accent === '#ff8800', t1.accent);
check('rest of the look kept', t1.dim === 0.22 && t1.size === '100% 100%', JSON.stringify(t1));
check('output label updated', p3.els['out-accent'].textContent === '#FF8800', p3.els['out-accent'].textContent);
p3.els['opt-tint'].value = '#102030';
p3.els['opt-tint'].fire('input', { target: p3.els['opt-tint'] });
p3.flush();
const t2 = JSON.parse(fs.readFileSync(path.join(USER, 'theme.json'), 'utf8'));
check('veil colour stored as "r, g, b"', t2.tint === '16, 32, 48', t2.tint);

/* one Glass slider must move every surface, not just the middle */
p3.els['opt-glass'].value = 0.8;
p3.els['opt-glass'].fire('input', { target: p3.els['opt-glass'] });
p3.flush();
const t3 = JSON.parse(fs.readFileSync(path.join(USER, 'theme.json'), 'utf8'));
check('glass slider moves all three surfaces',
      t3.glass === 0.8 && t3.glassStrong === 0.95 && t3.glassList === 0.8,
      'glass=' + t3.glass + ' strong=' + t3.glassStrong + ' list=' + t3.glassList);
p3.els['opt-graph'].value = '#00ccff';
p3.els['opt-graph'].fire('input', { target: p3.els['opt-graph'] });
p3.flush();
const t4 = JSON.parse(fs.readFileSync(path.join(USER, 'theme.json'), 'utf8'));
check('graph dots colour written', t4.graph === '#00ccff', t4.graph);
check('grid lines derived from it with alpha', t4.grid === '#00ccff77', t4.grid);

head('4. "Choose picture" copies the file in');
world();
const pick = img(path.join(TMP, 'Downloads', 'my cool clip.gif'));
const p4 = boot();
p4.setDialog({ err: 0, data: [pick] });
p4.els['btn-pick'].fire('click');
check('copied into the folder as bg.gif', fs.existsSync(path.join(USER, 'bg.gif')));
check('your original file untouched', fs.existsSync(pick));
check('UI shows it as the current picture', /bg\.gif/.test(p4.els.current.innerHTML), p4.els.current.innerHTML);
check('it is the newest thing in the folder',
      fs.statSync(path.join(USER, 'bg.gif')).mtimeMs >= fs.statSync(pick).mtimeMs);
const beforeCount = fs.readdirSync(USER).length;
p4.setDialog({ err: 1 });
p4.els['btn-pick'].fire('click');
check('cancelling the dialog changes nothing', fs.readdirSync(USER).length === beforeCount);

head('5. "Clear" parks the pictures instead of deleting them');
world();
img(path.join(USER, 'bg.gif'));
img(path.join(USER, 'bg.png'));
const p5 = boot();
p5.els['btn-clear'].fire('click');
check('no pictures left loose',
      fs.readdirSync(USER).filter((f) => /\.(gif|png)$/i.test(f)).length === 0, fs.readdirSync(USER).join(','));
check('both parked in _parked',
      fs.existsSync(path.join(USER, '_parked', 'bg.gif')) && fs.existsSync(path.join(USER, '_parked', 'bg.png')));
check('UI goes back to "no picture"', /no picture yet/.test(p5.els.current.textContent), p5.els.current.textContent);

head('6. the one admin step is wired up correctly');
world();
const p6 = boot();
p6.els['btn-install'].fire('click');
check('exactly one command launched', p6.exec.length === 1, p6.exec.length);
const cmd = p6.exec[0] || '';
check('handed to the Windows shell, not spawned inside AE', /^explorer\.exe "/.test(cmd), cmd);
check('the thing handed over is the launcher we wrote', /_Install into Flow\.vbs"$/.test(cmd), cmd);
const launcher = cmd.slice('explorer.exe "'.length, -1);
check('launcher file actually exists', fs.existsSync(launcher), launcher);
const body = fs.existsSync(launcher) ? fs.readFileSync(launcher, 'utf8') : '';
check('launcher is a .vbs (no console window of its own)', /WScript\.Shell/.test(body));
check('launcher starts PowerShell hidden', /WindowStyle Hidden/.test(body), body.replace(/\r\n/g, ' ').slice(0, 120));
check('launcher runs window-style 0, so nothing is shown', /",\s*0,\s*False\s*$/m.test(body),
      (body.split(/\r\n/).pop() || '').slice(0, 60));
check('launcher asks for the quiet (no pause) mode', /-Quiet/.test(body) && !/-Pause/.test(body));
check('launcher runs the bundled installer', /Install-FlowGifBg\.ps1/.test(body));
check('launcher passes this panel\'s picture folder', /-Folder ""[^"]*Flow Backgrounds""/.test(body),
      (/-Folder\s+""?[^"]*Flow Backgrounds/.exec(body) || ['(no -Folder)'])[0]);
check('no Start-Process RunAs inside AE', !/RunAs/.test(cmd), cmd.slice(0, 80));
check('it tells you to click Yes on the permission prompt',
      /click Yes/.test(p6.els['setup-note'].textContent), p6.els['setup-note'].textContent);
check('buttons locked while waiting', p6.els['btn-install'].disabled === true);

/* pretend the elevated installer did its job, then press the button again */
fs.appendFileSync(FLOW_INDEX, '\n<!-- flow-gif-bg:start -->\n<link href="css/flow-bg.css" rel="stylesheet" />\n<!-- flow-gif-bg:end -->\n');
fs.mkdirSync(path.join(FLOW, 'panel', 'js'), { recursive: true });
fs.copyFileSync(path.join(EXT, 'payload', 'flow-bg.js'), path.join(FLOW, 'panel', 'js', 'flow-bg.js'));
p6.els['btn-install'].fire('click');
p6.flush();                       /* run the panel's poll until it sees the marker */
check('pill flips to installed once the marker is there',
      p6.els.engine.textContent === 'engine: installed', p6.els.engine.textContent);
check('success message shown', /Installed into Flow/.test(p6.els['setup-note'].textContent), p6.els['setup-note'].textContent);
check('remove button now enabled', p6.els['btn-uninstall'].disabled === false);
p6.els['btn-uninstall'].fire('click');
const cmd2 = p6.exec[p6.exec.length - 1] || '';
check('remove hands over the uninstaller launcher', /_Remove from Flow\.vbs"$/.test(cmd2), cmd2);
const body2 = fs.readFileSync(cmd2.slice('explorer.exe "'.length, -1), 'utf8');
check('which really calls the bundled uninstaller', /Uninstall-FlowGifBg\.ps1/.test(body2));
check('only the setup buttons ever launch anything',
      p6.exec.filter((c) => /explorer\.exe/.test(c)).length === 3,
      p6.exec.length + ' commands launched in total');
check('banner disappears once the engine is in Flow', p6.els.banner.hidden === true);

head('7. curve + points, Default look, and crash-proof saving');
world();
const p7 = boot();
check('banner shown while the engine is missing from Flow', p7.els.banner.hidden === false);
p7.els['opt-curve'].value = '#ff00ff';
p7.els['opt-curve'].fire('input', { target: p7.els['opt-curve'] });
p7.els['opt-points'].value = '#00ff00';
p7.els['opt-points'].fire('input', { target: p7.els['opt-points'] });
p7.flush();
const t5 = JSON.parse(fs.readFileSync(path.join(USER, 'theme.json'), 'utf8'));
check('curve colour saved', t5.curve === '#ff00ff', t5.curve);
check('points colour saved', t5.points === '#00ff00', t5.points);
check('atomic save left no temp file behind', !fs.existsSync(path.join(USER, 'theme.json.tmp')),
      fs.readdirSync(USER).join(','));
check('a backup copy is kept', fs.existsSync(path.join(USER, 'theme.json.backup')));

/* a half-written theme must not lose the look */
fs.writeFileSync(path.join(USER, 'theme.json'), '{ truncated, not json');
const p7b = boot();
check('corrupt theme.json falls back to the backup', p7b.els['opt-curve'].value === '#ff00ff',
      p7b.els['opt-curve'].value);
p7b.els['btn-reset-theme'].fire('click');
check('Default look resets the controls', p7b.els['opt-curve'].value === '#4a8ae4', p7b.els['opt-curve'].value);
check('Default look reports back in the Look section',
      /built-in look/.test(p7b.els['look-note'].textContent), p7b.els['look-note'].textContent);
const t6 = JSON.parse(fs.readFileSync(path.join(USER, 'theme.json'), 'utf8'));
check('and is written straight to disk', t6.curve === '#4a8ae4' && t6.dim === 0.22,
      'curve=' + t6.curve + ' dim=' + t6.dim);
check('and survives closing and reopening the panel', boot().els['opt-curve'].value === '#4a8ae4');

head('8. diagnostics: what is actually going on');
world();
const p8 = boot();
check('banner warns while the engine is missing',
      /not inside Flow yet/.test(p8.els.banner.innerHTML), p8.els.banner.innerHTML.slice(0, 60));
p8.els['btn-diag'].fire('click');
const diagFile = path.join(USER, 'flow-background-diagnostics.txt');
check('diagnostics written to a file', fs.existsSync(diagFile));
const diag = fs.readFileSync(diagFile, 'utf8');
check('says the engine is NOT installed', /engine in Flow: NOT INSTALLED/.test(diag));
check('lists the Flow folder and release', /Flow release: 1\.5\.2/.test(diag));
check('flags that the engine is out of date', /engine up to date: NO/.test(diag));
check('lists the picture folder', /picture folder: .*Flow Backgrounds/.test(diag));
check('names the active theme', /current theme:/.test(diag));
check('and it went to the clipboard too', p8.reg.some((r) => r[0] === 'clip.exe'), p8.reg.length + ' reg/clip calls');
check('confirms in the Look section', /Diagnostics/.test(p8.els['look-note'].textContent), p8.els['look-note'].textContent);
/* after a successful install the warnings must go away */
fs.appendFileSync(FLOW_INDEX, '\n<!-- flow-gif-bg:start -->\n<link href="css/flow-bg.css" rel="stylesheet" />\n<!-- flow-gif-bg:end -->\n');
fs.mkdirSync(path.join(FLOW, 'panel', 'js'), { recursive: true });
const shipped = path.join(FLOW, 'panel', 'js', 'flow-bg.js');
fs.copyFileSync(path.join(EXT, 'payload', 'flow-bg.js'), shipped);
/*  Windows' CopyFile (which node's copyFileSync uses) PRESERVES the source
    timestamp, so compare against the payload's real mtime rather than "now". */
const payloadTime = fs.statSync(path.join(EXT, 'payload', 'flow-bg.js')).mtimeMs;
fs.utimesSync(shipped, new Date(payloadTime + 60000), new Date(payloadTime + 60000));  /* newer */
const p8b = boot();
check('all-clear: no banner once installed and up to date', p8b.els.banner.hidden === true,
      p8b.els.banner.innerHTML.slice(0, 70) || '(empty)');
/* and an out-of-date engine is detected, which is the "my update did nothing" trap */
fs.utimesSync(shipped, new Date(payloadTime - 60000), new Date(payloadTime - 60000));  /* older */
const p8c = boot();
check('out-of-date engine is called out', /newer than the engine/.test(p8c.els.banner.innerHTML),
      p8c.els.banner.innerHTML.slice(0, 70));

console.log('\n' + '='.repeat(58));
console.log('  panel.js live behaviour: ' + (pass + fail) + ' checks, ' + fail + ' failed');
console.log(fail === 0 ? '  ALL GREEN - the panel wires up correctly'
                       : '  ' + fail + ' CHECK(S) FAILED');
console.log('='.repeat(58) + '\n');
wipe(TMP);
process.exit(fail === 0 ? 0 : 1);