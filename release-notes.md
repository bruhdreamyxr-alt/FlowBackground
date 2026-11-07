# Flow Background v1.0.95

## What's new

The update check reports results in an in-panel modal instead of JavaScript
alerts. Up-to-date status, errors, and download progress are shown in the panel.

## Current features

- Animated and still backgrounds, updated live from your pictures folder.
- Controls for picture fit, veil, glass, and Flow panel colours.
- Custom looks that you can save, apply, rename, and delete. There are no
  built-in starter looks; **Default look** restores the default settings.
- One-time engine installation into Flow, plus removal and diagnostics.
- Manual update checks and a quiet check when the panel starts.

## Signing certificate change

This version uses a new signing certificate because the previous private
certificate was exposed in the public Git history. ZXP Installer may not allow
this version to replace the older-signed extension in place. If installation
fails, uninstall the old Flow Background extension, then install this version.

For installation, usage, and testing instructions, see [README.md](./README.md).