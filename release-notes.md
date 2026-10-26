# Flow Background v1.0.31

Welcome to the first public release of Flow Background & Theme! 🎉

## What it does
A small After Effects CEP extension that gives the Flow easing panel a background of your choosing (animated GIF/WebP/APNG supported) plus a colour changer for the panel and the veil over the picture. Everything updates live while AE stays open.

## Highlights
- Animated/still backgrounds from your own folder (newest file wins)
- Theme controls: veil strength/colour, glass opacity, label/accent colours, fit mode
- Five presets (Flow default, Cinematic, Neon, Bright, Glass)
- One-time "Install into Flow" copies a tiny engine into Flow (admin prompt once)
- macOS support (Perl-based installer, no Xcode/Python needed)
- Auto-match AE interface brightness
- Export/Import look, drag-and-drop, keyboard shortcuts
- Right-click context menu + Restart After Effects button
- Auto-updater that checks GitHub releases

## Installation
1. Double-click `Flow-Background.zxp` (accept the self-signed certificate prompt).
2. Restart After Effects.
3. Open Window > Extensions > Flow Background.
4. Click "Install into Flow" once (one admin prompt).
5. Choose a picture.

## Changes in this release
- Fixed panel.js syntax error (stray "okay" prefix) that prevented the JS from running.
- Fixed "Install into Flow" button being disabled when the engine was out of date.
- Added auto-updater (Check for updates button + silent check on launch).
- Added first-run welcome message.
- macOS installer switched from Python to Perl (no Xcode dependency).
- Added restart helper and dev-reload workflow.
- Extended CEP debug-mode range for newer AE versions.
- Various robustness fixes.

Congratulations on the first release! 🚀