# Flow Background & Theme

A small After Effects extension that gives the **Flow** easing panel (v1.5.2) a
background of your choosing — an animated `.gif` is fine — plus a **colour
changer** for the panel and the veil over the picture.

Everything updates **live**: pick a new picture or move a slider and the Flow
panel changes within a second or two. After Effects stays open, and you never
need administrator rights again after the one-time setup.

---

## Install — send your friend one file

Send them **`dist\Flow-Background.zxp`** and tell them:

1. **Double-click `Flow-Background.zxp`.** Adobe's ZXP Installer opens. It is
   signed with a self-signed certificate, so it asks you to accept it — click
   **Yes**. (That warning is normal for anything not sold through the Adobe
   Exchange.)
2. **Restart After Effects.**
3. Open **Window ▸ Extensions ▸ Flow Background**.
4. Press **Install into Flow**, then click **Yes** on the Windows permission
   prompt. *This is the only admin step, ever* — Flow itself lives in
   `Program Files`, so the background engine has to be copied into it.
5. Press **Choose picture…** and pick a `.gif`.

From step 5 onwards nothing needs admin rights. If the Flow panel was already
open, close and re-open it once so it picks up the new engine.

### …or no ZXP installer at all

Double-click **`Install-Panel.cmd`** instead: it installs the panel into your own
user CEP folder and needs **no administrator rights at all** (it also turns on
CEP debug mode for your account, which the panel does for itself anyway).

---

## Using the panel

**Picture**

| Button | What it does |
| --- | --- |
| **Choose picture…** | Native file dialog; copied into your folder as `bg.<ext>` and becomes the background |
| **Clear** | Moves pictures into `_parked` — Flow goes back to its dark panel, nothing deleted |
| **Open folder** | Opens the folder so you can drag/drop instead |

`.gif` / `.webp` / `.apng` animate. `.png` / `.jpg` / `.jpeg` / `.bmp` are stills.
Any file name works. If several are in the folder, **the newest wins**.

**Look** — veil strength, veil colour, glass opacity, label colour, Flow's accent
colour, and how the picture is fitted. **Presets** gives five starting points
(Flow default, Cinematic, Neon, Bright, Glass); *Default look* reverts it all.

Colours are re-applied automatically: Flow rewrites its own `--color-*` values at
startup and whenever you change the AE interface brightness, and the engine
re-asserts your choices about a second later.

---

## Where your files live

```
%USERPROFILE%\Documents\Flow Backgrounds\
    bg.gif / bg.webp / …   your pictures (newest wins)
    theme.json             the colours, written by the panel
    _parked\               pictures you cleared
```

That folder is yours, so it always works without admin rights. The engine inside
Flow (`panel\js\flow-bg.js` + `panel\css\flow-bg.css`) only reads it. Delete
`theme.json` to get the built-in look back; empty the folder for Flow's dark
panel.

**Setup**

| Button | What it does |
| --- | --- |
| **Install into Flow** | The one-time step. Copies the engine into Flow (needs one permission prompt) |
| **Remove from Flow** | Takes it back out; Flow is stock again |
| **Copy diagnostics** | Puts a short report on your clipboard (and saves it beside your pictures) saying exactly which Flow was found, whether the engine is installed, whether it is out of date, what theme is active, and so on — the first thing to paste when something is not working |

An amber banner sits at the top of the panel whenever something needs your
attention: the engine is not in Flow yet, the panel is newer than the engine
inside Flow (press Install into Flow again after an update), or the Flow release
found is not 1.5.x and may have changed internally.

---

## Giving it to a friend

Send the `.zxp` (one file, ~35 KB). To give them your background as well, send
your `.gif`, or drop it next to `Install.cmd` / `Build-ZXP.ps1` as `bg.gif` and
it becomes their starter picture automatically.

They need After Effects (2022+) and Flow installed, plus one admin click.
Nothing else.

---

## Undo

| Want | Do this |
| --- | --- |
| Plain dark panel, keep everything | **Clear** in the panel |
| Built-in colours back | **Default look** in the panel |
| Remove the engine from Flow | **Remove from Flow** in the panel |
| Remove the panel itself | Uninstall it via ZXP Installer, or delete `%APPDATA%\Adobe\CEP\extensions\com.antho.flowbg.panel` |

No picture is ever deleted by any of these. Flow's original
`panel\index.html` is also kept as `index.html.flowbg-backup` during install, so
even a hand-edited Flow can be restored exactly as it was.

---

## Why it can't break your Flow

* The engine never throws: every file access is guarded, and if detection fails
  the stylesheet falls back to Flow's own dark colour.
* The stylesheet loads **last** and only sets `background-color` /
  `background-image` longhands on named surfaces, so Flow's grid pattern on
  `#graphPanel-top` and `#canvas-wrapper` survives.
* No `filter: blur` / `opacity` on containers — that would turn `#container`
  into a containing block and misplace tooltips and drag handles.
* Tooltips, Swal dialogs, the Apply button and bezier handles are left alone.
* Theme values are validated before use, so a typo in `theme.json` is dropped
  rather than applied.
* Removing the two marked lines from `index.html` returns Flow to stock.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Panel not in the menu | Restart After Effects after installing |
| Background does not appear | Press **Install into Flow**, then close and re-open the Flow panel once |
| Picking a picture does nothing | Check the extension (.gif/.webp/.apng/.png/.jpg/.jpeg/.bmp) and that it is not 0 bytes |
| Background never changes | The newest file in the folder wins — re-save it, or use **Choose picture…** |
| Looks squashed | Try the **Fill, crop the overflow** fit |
| Labels hard to read | Raise **Veil** |

---

## Updating

**You** (installed with `Install-Panel.cmd`): just run it again. Nothing else.

**Someone who installed the `.zxp`**: send them the new `.zxp` and have them
double-click it. ZXP Installer replaces what is there — it keys off the bundle
version, so `Build-ZXP.ps1` bumps the version automatically on every rebuild
(shipping the same number twice would be silently skipped).

Either way, press **Install into Flow** once afterwards: that re-copies the
engine into Flow and is safe to repeat.

---

## Building and testing (for you, not for friends)

Double-click **`Verify-Everything.cmd`** — it runs every suite and gives you one
summary, plus a `preview.png` rendering of your current look that you can open
without starting After Effects.

| Suite | What it proves | Checks |
| --- | --- | --- |
| `flow-test-node.js` | the engine: which file wins, cache-busting, swaps, theme validation, the canvas hook | 71 |
| `flow-test-panel.js` | the panel: folder resolution, saving, the hidden launcher, diagnostics | 69 |
| `flow-test-install.ps1` | install / backup / idempotency / uninstall on stock *and* hand-edited Flow | 48 |
| `flow-test-visual.ps1` | **real headless Chrome**: the CSS really loads, the picture really decodes and paints, the veils really land, `#container` really stays transparent, scrollbars really are gone | 19 |

```
powershell -ExecutionPolicy Bypass -File .\Verify-Everything.ps1
powershell -ExecutionPolicy Bypass -File .\Build-ZXP.ps1            # -> dist\Flow-Background.zxp
```

The browser suite is the one that earns its keep — it caught two bugs the logic
tests could not: glass surfaces that were still using a hard-coded grey (so
"veil colour" only half worked), and two veils stacking on top of each other in
the graph area, burying the picture at ~77% opacity.

Keep `build\codex.p12` next to the scripts: rebuilding with the same certificate
is what lets the ZXP update cleanly on a machine that already has it.