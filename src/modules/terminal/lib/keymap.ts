// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

export type TerminalKeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "metaKey" | "key" | "code"
> & { shiftKey?: boolean };

export function terminalWordNavigationSequence(event: TerminalKeyEvent): string | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === "ArrowLeft" || event.code === "ArrowLeft") return "\x1bb";
  if (event.key === "ArrowRight" || event.code === "ArrowRight") return "\x1bf";
  return null;
}

/**
 * Prompt-block navigation: jump the viewport to the previous / next command
 * prompt in the scrollback. `-1` = previous (older), `1` = next (newer).
 *
 * Ctrl+Shift+Up/Down everywhere except macOS, where it is Cmd+Shift+Up/Down
 * (matching iTerm2's "previous/next mark"). Shift is required so the plain
 * Ctrl+Arrow word-navigation some shells bind still reaches the PTY, and the
 * modifier check is exact so no other chord is swallowed.
 */
export function terminalPromptJumpDirection(
  event: TerminalKeyEvent,
  isMac: boolean,
): -1 | 1 | null {
  if (!event.shiftKey || event.altKey) return null;
  if (isMac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey)
    return null;
  if (event.key === "ArrowUp" || event.code === "ArrowUp") return -1;
  if (event.key === "ArrowDown" || event.code === "ArrowDown") return 1;
  return null;
}
