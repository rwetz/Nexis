// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Pure configuration and geometry for the quick terminal.
 *
 * Deliberately free of `@tauri-apps/api/window` imports: the preferences store
 * needs the defaults and bounds, and it is imported by essentially every
 * module — pulling the webview-window API in through it would put window
 * plumbing on the cold-start path of every window, including Settings.
 */

import { IS_MAC } from "@/lib/platform";

export const QUICK_TERMINAL_LABEL = "quick-terminal";

/** Clamp for the height fraction. A sliver or a full-screen cover are both useless. */
export const QUICK_TERMINAL_MIN_HEIGHT = 0.2;
export const QUICK_TERMINAL_MAX_HEIGHT = 0.9;
export const QUICK_TERMINAL_DEFAULT_HEIGHT = 0.4;

/**
 * Default hotkey. `Backquote` rather than the "`" character because Tauri
 * accelerators name physical keys, and the character form does not resolve on
 * non-US layouts. Cmd on macOS / Ctrl elsewhere, plus Shift so the very common
 * plain "Ctrl+`" that editors and terminals bind for their own panels is left
 * alone.
 */
export const DEFAULT_QUICK_TERMINAL_HOTKEY = IS_MAC
  ? "Command+Shift+Backquote"
  : "Control+Shift+Backquote";

/** Height presets offered in Settings, as fractions of the monitor height. */
export const QUICK_TERMINAL_HEIGHTS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9];

/**
 * Render an accelerator the way the platform writes it, for display only —
 * "Control+Shift+Backquote" is the wire format, not something to show a user.
 */
export function formatAccelerator(accelerator: string): string {
  const glyphs: Record<string, string> = IS_MAC
    ? {
        Command: "⌘",
        Cmd: "⌘",
        CommandOrControl: "⌘",
        CmdOrCtrl: "⌘",
        Control: "⌃",
        Ctrl: "⌃",
        Alt: "⌥",
        Option: "⌥",
        Shift: "⇧",
        Super: "⌘",
        Meta: "⌘",
      }
    : {
        CommandOrControl: "Ctrl",
        CmdOrCtrl: "Ctrl",
        Control: "Ctrl",
        Command: "Win",
        Cmd: "Win",
        Super: "Win",
        Meta: "Win",
        Option: "Alt",
      };
  const keyNames: Record<string, string> = {
    Backquote: "`",
    Backslash: "\\",
    BracketLeft: "[",
    BracketRight: "]",
    Minus: "-",
    Equal: "=",
    Space: "Space",
  };
  const parts = accelerator
    .split("+")
    .filter(Boolean)
    .map((p) => glyphs[p] ?? keyNames[p] ?? p);
  // macOS writes chords with no separator; everywhere else uses "+".
  return IS_MAC ? parts.join("") : parts.join("+");
}

export type MonitorRect = {
  position: { x: number; y: number };
  size: { width: number; height: number };
  scaleFactor: number;
};

export type QuickTerminalGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Clamp an arbitrary (possibly persisted-garbage) height fraction into range. */
export function clampQuickTerminalHeight(fraction: number): number {
  if (!Number.isFinite(fraction)) return QUICK_TERMINAL_DEFAULT_HEIGHT;
  return Math.min(
    QUICK_TERMINAL_MAX_HEIGHT,
    Math.max(QUICK_TERMINAL_MIN_HEIGHT, fraction),
  );
}

/**
 * Where the drop-down should sit: flush to the top edge of the given monitor,
 * full width, `heightFraction` of its height.
 *
 * Returned in logical pixels, because that is what `LogicalPosition` /
 * `LogicalSize` take — the monitor reports physical pixels, so everything is
 * divided by the scale factor. Getting this wrong is invisible on a 1x display
 * and puts the window off-screen on a HiDPI one, which is why it is a pure
 * function with tests rather than inline arithmetic at the call site.
 */
export function quickTerminalGeometry(
  monitor: MonitorRect,
  heightFraction: number,
): QuickTerminalGeometry {
  const scale = monitor.scaleFactor > 0 ? monitor.scaleFactor : 1;
  const fraction = clampQuickTerminalHeight(heightFraction);
  return {
    x: monitor.position.x / scale,
    y: monitor.position.y / scale,
    width: monitor.size.width / scale,
    height: (monitor.size.height / scale) * fraction,
  };
}

/**
 * Reject an accelerator before handing it to the OS. An unparseable string
 * makes `register()` throw, and a bare key with no modifier would swallow that
 * key system-wide — both are worth catching in the settings UI rather than
 * leaving the user with a dead or hostile hotkey.
 */
export function isPlausibleAccelerator(accelerator: string): boolean {
  const parts = accelerator.split("+").filter(Boolean);
  if (parts.length < 2) return false;
  const modifiers = new Set([
    "Command",
    "Cmd",
    "Control",
    "Ctrl",
    "CommandOrControl",
    "CmdOrCtrl",
    "Alt",
    "Option",
    "Shift",
    "Super",
    "Meta",
  ]);
  const key = parts[parts.length - 1];
  if (!key || modifiers.has(key)) return false;
  return parts.slice(0, -1).every((p) => modifiers.has(p));
}
