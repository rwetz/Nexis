---
type: subsystem
description: Borderless window chrome — decorations config, drag region, min/max/close controls, edge resize, rounded corners, per-platform quirks
---

# Window chrome

Nexis draws its own window chrome on Windows and Linux: the OS provides an
undecorated transparent window, and the app paints rounded corners, the
header (drag region + controls), and — on Linux — its own resize edges.
macOS keeps native decorations (overlay title bar, traffic lights).

## Key files

- `src-tauri/tauri.linux.conf.json` / `tauri.windows.conf.json` — `decorations: false, transparent: true, shadow: false` for the main window (base `tauri.conf.json` has the macOS overlay config)
- `src-tauri/src/lib.rs:tune_linux_webkit` — sets `GTK_CSD=1` so KWin doesn't draw a second server-side title bar; the `setup` hook re-asserts `set_decorations(false)` after webview init (webkit2gtk can reset the hint)
- `src/main.tsx` — sets `data-chrome="borderless"` on `<html>` when custom controls are in use; keyed CSS lives in `src/styles/globals.css` (12px `border-radius` on `#root`)
- `src/lib/platform.ts:USE_CUSTOM_WINDOW_CONTROLS` — the "are we drawing our own chrome" switch
- `src/modules/header/Header.tsx` — `data-tauri-drag-region` for window move
- `src/components/WindowControls.tsx` — custom min/max/close buttons
- `src/components/WindowResizeEdges.tsx` — Linux-only invisible edge/corner strips that call `startResizeDragging()`; see gotcha below
- `src/modules/window/openNewWindow.ts` — secondary windows must repeat the platform chrome options; they don't inherit the config-file overrides

## Invariants / gotchas

- **An undecorated GTK window has no resize borders.** The grab zone around a normal Linux window belongs to the CSD shadow; `decorations: false` removes it, so edge resize + resize cursors must come from `WindowResizeEdges` in the webview. Windows needs no equivalent — tao gives undecorated windows native `WM_NCHITTEST` resize borders. Don't remove the component or scope it wider than Linux.
- `WindowResizeEdges` must mount **outside `.zoom-content`** (app zoom would scale the hit strips off the window edges) and keeps `pointer-events-auto` so Radix modals (`pointer-events: none` on `<body>`) don't disable resizing.
- The double-title-bar / KWin story and why `GTK_CSD=1` + the `set_decorations` re-assert exist: see the 1.20.5 "borderless window chrome" entry in CHANGELOG.md.

## Debugging entry points

- Double title bar on KDE → is `GTK_CSD=1` still set before webview fork? Check `[nexis] main window is_decorated = …` in stderr.
- Square corners / opaque window → platform conf JSON missing or `data-chrome` not set (`USE_CUSTOM_WINDOW_CONTROLS` false when `platform()` throws).
- Can't resize on Linux → `WindowResizeEdges` unmounted (thinks it's maximized?) or strips buried under a higher `z-index`.

## Related

[[editor]] (zoom interplay) · [[frontend-modules]]
