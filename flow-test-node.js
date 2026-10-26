/* ==========================================================================
   flow-bg.js - live behaviour test, no browser involved
   --------------------------------------------------------------------------
   Runs the REAL flow-bg.js in a Node sandbox with a small fake DOM, against
   real folders on disk, so the parts that matter can be measured exactly:

     which file wins, what the url/token become, what happens when a file is
     swapped / overwritten / deleted, and whether anything is re-applied when
     nothing changed (a moving token would make Chromium re-fetch forever).

   Run:  node flow-test-node.js
   Exit code 0 = everything passed.
   ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const HERE = __dirname;
const SRC  = path.join(HERE, 'flow-bg.js');
const SRC_TEXT = fs.readFileSync(SRC, 'utf8');

const TMP  = path.join(os.tmpdir(), 'fbg-node-test');
const HOME = path.join(TMP, 'home');
const USER = path.join(HOME, 'Documents', 'Flow Backgrounds');
const EXT  = path.join(TMP, 'ext', 'flow-v1.5.2');
const HREF = 'file:///' + (EXT + '/panel/index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; } else { fail++; }
  const d = (detail === undefined || detail === null) ? '' : '   [' + detail + ']';
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + d);
}
function head(t) { console.log('\n' + t); }

/* ---- tiny filesystem helpers --------------------------------------------- */
function dir(p) { fs.mkdirSync(p, { recursive: true }); return p; }
function wipe(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }
function img(p, bytes, when) {
  dir(path.dirname(p));
  fs.writeFileSync(p, Buffer.alloc(bytes === undefined ? 64 : bytes, 0x41));
  if (when) { fs.utimesSync(p, when, when); }
  return p;
}
const MINS = function (n) { return new Date(Date.now() - n * 60000); };
const SECS = function (n) { return new Date(Date.now() - n * 1000); };

/* ---- the sandbox: real flow-bg.js, fake DOM ------------------------------ */
function load(opts) {
  opts = opts || {};
  const style = {};                                   /* what the script sets */
  const cssFile = opts.cssFile || '';
  const cssDir  = opts.cssDir  || '';

  const docEl = {
    style: {
      setProperty: function (n, v) { style[n] = v; },
      getPropertyValue: function (n) { return style[n] || ''; },
      removeProperty: function (n) { delete style[n]; }
    },
    getAttribute: function () { return null; }
  };
  const document = {
    documentElement: docEl,
    createElement: function () {
      return { getContext: function () {
        return { drawImage: function () {}, getImageData: function () { return { data: [] }; } };
      } };
    },
    addEventListener: function () {}
  };
  const window = {
    location: { href: opts.href || HREF, search: opts.search || '' },
    getComputedStyle: function (el) {
      return { getPropertyValue: function (n) {
        if (n === '--flow-bg-file') { return cssFile; }
        if (n === '--flow-bg-dir')  { return cssDir; }
        const s = el && el.style && el.style.getPropertyValue ? el.style.getPropertyValue(n) : '';
        return s || style[n] || '';
      } };
    },
    addEventListener: function () {},
    console: { log: function () {}, warn: function () {}, error: function () {} }
  };
  const env = {};
  Object.keys(process.env).forEach(function (k) { env[k] = process.env[k]; });
  env.USERPROFILE = HOME;
  delete env.HOME;
  delete env.FLOW_BG_DIR;
  if (opts.flowBgDir) { env.FLOW_BG_DIR = opts.flowBgDir; }
  const sandboxProcess = { env: env, nextTick: process.nextTick.bind(process) };

  /* A stand-in for the 2D canvas context, so the curve-colour hook can be
     verified without a browser: the hook wraps stroke()/fill() on the
     prototype, so whatever a test instance draws with is what Flow would see. */
  function CanvasStub() { this.strokeStyle = '#stock'; this.fillStyle = '#stock'; }
  CanvasStub.prototype.stroke = function () { return 'stroked'; };
  CanvasStub.prototype.fill = function () { return 'filled'; };

  const ctx = {
    window: window, document: document,
    require: require, process: sandboxProcess,
    console: { log: function () {}, warn: function () {}, error: function () {} },
    setInterval: function () { return 0; },   /* no background timers: scan by hand */
    clearInterval: function () {}, setTimeout: function () { return 0; },
    clearTimeout: function () {},
    Image: function () {}, XMLHttpRequest: function () { this.open = function () {}; this.send = function () {}; },
    CanvasRenderingContext2D: CanvasStub
  };
  vm.createContext(ctx);
  vm.runInContext(SRC_TEXT, ctx, { filename: SRC });

  const api = ctx.window.__flowBg;
  return {
    api: api,
    canvas: CanvasStub,
    style: style,
    state: function () { return api.state; },
    scan: function () { return api.scan(); },
    active: function () { return style['--flow-bg-active']; },
    file: function () { return style['--flow-bg-file'] || ''; },
    log: api.log
  };
}

/* a fresh, empty world with all three candidate folders present */
function world() {
  wipe(TMP);
  dir(USER);
  dir(path.join(EXT, 'panel'));
  dir(path.join(EXT, 'bg'));
}

/* ---- scenario runner ------------------------------------------------------ */
function scenario(name, fn) {
  head(name);
  try { fn(); }
  catch (e) {
    fail++;
    console.log('  FAIL  scenario threw: ' + (e && e.stack ? String(e.stack).split('\n')[0] : e));
  }
}

scenario('1. finds a picture that ships with the extension', function () {
  world();
  img(path.join(EXT, 'bg.gif'), 128, MINS(10));
  const s = load();
  const st = s.state();
  check('mode is node-fs (Flow enables --enable-nodejs)', st.mode === 'node-fs', st.mode);
  check('picked bg.gif from the extension root', st.label === 'bg.gif', st.label);
  check('url is a file:// url to that file', /^file:\/\/\/.*\/bg\.gif$/.test(st.url), st.url);
  check('--flow-bg-active = 1', s.active() === '1', s.active());
  check('css var carries url + token', /url\('file:\/\/\/.*bg\.gif\?v=\d{10,}-\d+'\)/.test(s.file()), s.file());
  const before = st.token;
  s.scan();
  check('token is stable while the file is untouched', s.state().token === before, before + ' -> ' + s.state().token);
});

scenario('2. YOUR Documents folder always wins while it has a picture', function () {
  world();
  img(path.join(EXT, 'bg.gif'), 128, MINS(1));          /* newer, but shipped  */
  img(path.join(USER, 'my-clip.gif'), 256, MINS(30));   /* older, but yours    */
  const s = load();
  const st = s.state();
  check('your file wins even though the shipped one is newer', st.label === 'my-clip.gif', st.label);
  check('url points into "Flow Backgrounds" (space encoded)', /Flow%20Backgrounds\/my-clip\.gif$/.test(st.url), st.url);
  check('label carries no panel/ prefix', st.label.indexOf('/') === -1, st.label);
});

scenario('3. newest file inside your folder wins', function () {
  world();
  img(path.join(USER, 'bg.gif'), 100, MINS(20));
  img(path.join(USER, 'my-bg_dark.gif'), 100, SECS(5));
  const s = load();
  check('picked the most recent one', s.state().label === 'my-bg_dark.gif', s.state().label);
});

scenario('4. emptying your folder falls back to the shipped picture', function () {
  world();
  img(path.join(EXT, 'bg.gif'), 128, MINS(10));
  const mine = img(path.join(USER, 'bg.png'), 64, MINS(1));
  const s = load();
  check('starts on your file', s.state().label === 'bg.png', s.state().label);
  fs.rmSync(mine);
  s.scan();
  check('falls back to the shipped bg.gif', s.state().label === 'bg.gif', s.state().label);
  check('still active', s.active() === '1', s.active());
});

scenario('5. deleting every picture -> active 0, no crash', function () {
  world();
  img(path.join(EXT, 'bg.gif'), 128, MINS(10));
  const s = load();
  check('active to start with', s.active() === '1', s.active());
  fs.rmSync(path.join(EXT, 'bg.gif'));
  s.scan();
  check('--flow-bg-active becomes 0', s.active() === '0', s.active());
  check('url cleared', s.state().url === null, String(s.state().url));
  check('css fallback set to none (nothing was hard-coded)', s.file() === 'none', s.file() || '(unset)');
});

scenario('6. a hand-picked path in flow-bg.css is never clobbered', function () {
  world();
  const s = load({ cssFile: "url('file:///C:/pics/keep.gif')" });
  check('active 0 with no file anywhere', s.active() === '0', s.active());
  check('--flow-bg-file left alone', s.file() === '', s.file() || '(unset)');
  s.scan(); s.scan();
  check('still left alone after several scans', s.file() === '', s.file() || '(unset)');
});

scenario('7. your folder takes ANY name; the extension folders stay strict', function () {
  world();
  img(path.join(EXT, 'random-pic.gif'), 500, SECS(1));       /* any-image name  */
  img(path.join(USER, 'holiday-photo.gif'), 700, SECS(2));   /* not a bg name   */
  const s = load();
  check('holiday-photo.gif is accepted in YOUR folder',
        s.state().label === 'holiday-photo.gif', s.state().label);
  fs.rmSync(path.join(USER, 'holiday-photo.gif'));
  s.scan();
  check('random-pic.gif in the extension tree is ignored (Flow art safety)',
        s.active() === '0', 'active=' + s.active() + ' label=' + s.state().label);
  img(path.join(EXT, 'bg.gif'), 128, MINS(20));
  s.scan();
  check('but a bg-named file there still works', s.state().label === 'bg.gif', s.state().label);
  img(path.join(USER, 'notes.txt'), 10, SECS(0));
  s.scan();
  check('a non-image in YOUR folder is still ignored', s.state().label === 'bg.gif', s.state().label);
});

scenario('8. name and case variants are all accepted', function () {
  world();
  img(path.join(EXT, 'bg', 'BG1.GIF'), 10, MINS(30));
  img(path.join(EXT, 'bg', 'background.webp'), 10, MINS(20));
  img(path.join(EXT, 'bg', 'my-bg_dark.apng'), 10, MINS(10));
  const s = load();
  check('newest of BG1.GIF / background.webp / my-bg_dark.apng',
        s.state().label === 'bg/my-bg_dark.apng', s.state().label);
  check('animation extension kept in the url', /\.apng\?v=/.test(s.file()), s.file());
});

scenario('9. a zero-byte file is ignored', function () {
  world();
  img(path.join(EXT, 'bg.gif'), 128, MINS(20));
  fs.writeFileSync(path.join(USER, 'bg.gif'), Buffer.alloc(0));   /* newer, empty */
  const s = load();
  check('skipped the empty file', s.state().label === 'bg.gif', s.state().label);
});

scenario('10. FLOW_BG_DIR pins a folder of your choosing', function () {
  world();
  const pinned = dir(path.join(TMP, 'shared-pics'));
  img(path.join(USER, 'bg.gif'), 100, SECS(1));
  img(path.join(pinned, 'team-bg.gif'), 100, MINS(60));   /* older, but pinned */
  const s = load({ flowBgDir: pinned });
  check('pinned folder beats Documents and the extension', s.state().label === 'team-bg.gif', s.state().label);
});

scenario('11. --flow-bg-dir in flow-bg.css works the same way', function () {
  world();
  const pinned = dir(path.join(TMP, 'css pinned'));
  img(path.join(USER, 'bg.gif'), 100, SECS(1));
  img(path.join(pinned, 'from-css.png'), 100, MINS(60));
  const url = 'file:///' + pinned.replace(/\\/g, '/');
  const s = load({ cssDir: "url('" + url + "')" });
  check('folder named in the stylesheet is used', s.state().label === 'from-css.png', s.state().label);
  check('space in the folder name survives the round trip',
        /css%20pinned\/from-css\.png$/.test(s.state().url), s.state().url);
  const t = load({ cssDir: pinned });                     /* bare path, no url() */
  check('a plain Windows path works too', t.state().label === 'from-css.png', t.state().label);
});

scenario('12. cache-busting: stable while idle, new on a real change', function () {
  world();
  const f = img(path.join(USER, 'bg.gif'), 200, MINS(5));
  const s = load();
  const t1 = s.state().token;
  s.scan(); s.scan();
  check('same token on repeat scans (no re-fetch storm)', s.state().token === t1, t1);
  fs.utimesSync(f, SECS(1), SECS(1));
  s.scan();
  check('new token after the file is rewritten', s.state().token !== t1, t1 + ' -> ' + s.state().token);
  const t2 = s.state().token;
  fs.writeFileSync(f, Buffer.alloc(999, 0x41));           /* same mtime, new size */
  fs.utimesSync(f, SECS(1), SECS(1));
  s.scan();
  check('size is part of the token, so a same-mtime swap is seen',
        s.state().token !== t2, t2 + ' -> ' + s.state().token);
});

scenario('13. shipped sub-folders are searched too', function () {
  world();
  img(path.join(EXT, 'bg.gif'), 100, MINS(60));
  img(path.join(EXT, 'panel', 'img', 'bg.png'), 100, MINS(30));
  img(path.join(EXT, 'panel', 'backgrounds', 'background.jpg'), 100, MINS(10));
  const s = load();
  check('newest across sub-folders wins (not just the first folder tried)',
        s.state().label === 'panel/backgrounds/background.jpg', s.state().label);
});

scenario('14. hot swap: a new drop is adopted on the next scan', function () {
  world();
  img(path.join(EXT, 'bg.gif'), 128, MINS(30));
  const s = load();
  const t0 = s.state().token;
  img(path.join(USER, 'fresh-clip.gif'), 4096, SECS(0));
  s.scan();
  check('new file adopted without a reload', s.state().label === 'fresh-clip.gif', s.state().label);
  check('new token issued', s.state().token !== t0, t0 + ' -> ' + s.state().token);
  check('active stays 1', s.active() === '1', s.active());
});

scenario('15. nothing anywhere -> plain dark panel, still no errors', function () {
  world();
  const s = load();
  check('mode is node-fs', s.state().mode === 'node-fs', s.state().mode);
  check('active 0', s.active() === '0', s.active());
  check('no url', s.state().url === null, String(s.state().url));
  s.scan();
  check('a re-scan is harmless', s.active() === '0', s.active());
  check('the log recorded something', s.log.length > 0, s.log.length + ' lines');
});

scenario('16. missing folders never throw', function () {
  wipe(TMP);                                   /* no folders on disk at all */
  const s = load();
  check('loads with nothing on disk', s.state().mode === 'node-fs' && s.active() === '0', s.active());
});

scenario('17. theme.json drives the look, and can be taken away again', function () {
  world();
  img(path.join(USER, 'bg.gif'), 200, MINS(5));
  const tf = path.join(USER, 'theme.json');
  fs.writeFileSync(tf, JSON.stringify({
    dim: 0.4, tint: '10, 12, 20', glass: 0.6, text: '#e8e8ee', accent: '#00ff88', size: 'cover'
  }));
  const s = load();
  check('veil strength applied', s.style['--flow-bg-dim'] === '0.4', s.style['--flow-bg-dim']);
  check('veil colour applied', s.style['--flow-bg-tint'] === '10, 12, 20', s.style['--flow-bg-tint']);
  check('glass opacity applied', s.style['--flow-glass'] === '0.6', s.style['--flow-glass']);
  check('label colour applied', s.style['--flow-force-text'] === '#e8e8ee', s.style['--flow-force-text']);
  check("Flow's accent applied", s.style['--color-blue'] === '#00ff88', s.style['--color-blue']);
  check('fit mode applied', s.style['--flow-bg-size'] === 'cover', s.style['--flow-bg-size']);

  // Flow's ThemeManager rewrites its own colours at launch / brightness change
  s.style['--color-blue'] = '#000000';
  s.style['--flow-bg-dim'] = '0';
  s.scan();
  check('re-asserted after Flow overwrites them',
        s.style['--color-blue'] === '#00ff88' && s.style['--flow-bg-dim'] === '0.4',
        s.style['--color-blue'] + ' / ' + s.style['--flow-bg-dim']);

  // a hand-mangled or half-written file must be inert, not dangerous
  fs.writeFileSync(tf, JSON.stringify({
    dim: 'banana', text: 'red; }', size: '99; background: url(http://x)', accent: '<script>'
  }));
  s.scan();
  check('junk values dropped, nothing injected',
        s.style['--flow-bg-dim'] === undefined && s.style['--flow-bg-size'] === undefined &&
        s.style['--color-blue'] === undefined && s.style['--flow-force-text'] === undefined,
        JSON.stringify([s.style['--flow-bg-dim'], s.style['--flow-bg-size'], s.style['--color-blue']]));
  check('picture still works with a broken theme', s.state().label === 'bg.gif', s.state().label);

  fs.writeFileSync(tf, '{ this is not json');
  s.scan();
  check('unparsable JSON did not throw', s.active() === '1', s.active());

  fs.writeFileSync(tf, JSON.stringify({ dim: 0.5 }));
  s.scan();
  check('a new theme replaces the old one exactly',
        s.style['--flow-bg-dim'] === '0.5' && s.style['--color-blue'] === undefined,
        s.style['--flow-bg-dim'] + ' / ' + s.style['--color-blue']);
  fs.rmSync(tf);
  s.scan();
  check('deleting theme.json restores the built-in look',
        s.style['--flow-bg-dim'] === undefined, String(s.style['--flow-bg-dim']));
  check('and the picture is untouched', s.state().label === 'bg.gif' && s.active() === '1', s.state().label);
});

scenario('18. the look works with no picture at all, graph colours included', function () {
  world();                                   /* deliberately no picture anywhere */
  fs.writeFileSync(path.join(USER, 'theme.json'), JSON.stringify({
    dim: 0.35, tint: '20, 10, 30', glass: 0.6, text: '#ffeecc', accent: '#00ff88',
    graph: '#ff00aa', grid: '#ff00aa77', size: 'cover'
  }));
  const s = load();
  check('no picture, yet the veil is still applied',
        s.active() === '0' && s.style['--flow-bg-dim'] === '0.35', 'active=' + s.active() + ' dim=' + s.style['--flow-bg-dim']);
  check('veil colour applied without a picture', s.style['--flow-bg-tint'] === '20, 10, 30', s.style['--flow-bg-tint']);
  check('glass applied without a picture', s.style['--flow-glass'] === '0.6', s.style['--flow-glass']);
  check('label colour applied without a picture', s.style['--flow-force-text'] === '#ffeecc', s.style['--flow-force-text']);
  check('graph dots colour applied (--color-graph-gray)', s.style['--color-graph-gray'] === '#ff00aa', s.style['--color-graph-gray']);
  check('graph grid lines applied (alpha hex is allowed)',
        s.style['--color-graph-gray-with-alpha'] === '#ff00aa77', s.style['--color-graph-gray-with-alpha']);
  /* now drop a picture in: the colours must not be disturbed */
  img(path.join(USER, 'bg.gif'), 200, SECS(0));
  s.scan();
  check('picture arrives, colours untouched',
        s.state().label === 'bg.gif' && s.style['--flow-bg-dim'] === '0.35' &&
        s.style['--color-graph-gray'] === '#ff00aa', s.state().label);
  /* and a 3-digit hex is accepted too */
  fs.writeFileSync(path.join(USER, 'theme.json'), JSON.stringify({ graph: '#f0a', grid: '#f0a8' }));
  s.scan();
  check('short hex form accepted', s.style['--color-graph-gray'] === '#f0a' &&
        s.style['--color-graph-gray-with-alpha'] === '#f0a8', s.style['--color-graph-gray']);
});

scenario('19. the curve itself is recoloured through the canvas hook', function () {
  world();
  const tf = path.join(USER, 'theme.json');
  fs.writeFileSync(tf, JSON.stringify({ curve: '#ff00ff', points: '#00ff00' }));
  const s = load();

  const c1 = new s.canvas();
  c1.stroke();
  check('stroke() paints with the themed curve colour', c1.strokeStyle === '#ff00ff', c1.strokeStyle);
  c1.fill();
  check('fill() paints with the themed marker colour', c1.fillStyle === '#00ff00', c1.fillStyle);
  check('the draggable points on the curve follow --color-yellow',
        s.style['--color-yellow'] === '#00ff00', s.style['--color-yellow']);

  /* a junk colour must switch the hook off rather than paint something odd */
  fs.writeFileSync(tf, JSON.stringify({ curve: 'not-a-colour' }));
  s.scan();
  const c2 = new s.canvas();
  c2.strokeStyle = '#4a8ae4';
  c2.stroke();
  check('junk curve colour falls back to Flow\'s own', c2.strokeStyle === '#4a8ae4', c2.strokeStyle);

  /* and removing the theme puts everything back to stock */
  fs.rmSync(tf);
  s.scan();
  const c3 = new s.canvas();
  c3.strokeStyle = '#123456';
  c3.stroke();
  check('no theme = stock curve again', c3.strokeStyle === '#123456', c3.strokeStyle);
  check('and the points are stock again', s.style['--color-yellow'] === undefined,
        String(s.style['--color-yellow']));
});

/* ---- summary ------------------------------------------------------------- */
console.log('\n' + '='.repeat(58));
console.log('  flow-bg.js live behaviour: ' + (pass + fail) + ' checks, ' + fail + ' failed');
console.log(fail === 0 ? '  ALL GREEN - the loader behaves as documented'
                       : '  ' + fail + ' CHECK(S) FAILED');
console.log('='.repeat(58) + '\n');
wipe(TMP);
process.exit(fail === 0 ? 0 : 1);