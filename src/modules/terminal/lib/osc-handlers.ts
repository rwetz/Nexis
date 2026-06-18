// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { IDecoration, IMarker, Terminal } from "@xterm/xterm";

/**
 * Cross-handler state shared between the OSC 7 cwd handler and the OSC 133
 * prompt-marker handler. Tracks whether we are currently inside a running
 * command (between OSC 133 B and the next OSC 133 D / A), so the cwd handler
 * can ignore OSC 7 updates emitted by *command output* (e.g. a remote SSH
 * server, a `cat` of an attacker-controlled file). Only OSC 7 issued by the
 * local shell — which fires between commands — should be honored.
 */
export type ShellIntegrationState = {
  inCommand: boolean;
};

export function createShellIntegrationState(): ShellIntegrationState {
  return { inCommand: false };
}

export function registerCwdHandler(
  term: Terminal,
  onCwd: (cwd: string) => void,
  state?: ShellIntegrationState,
): () => void {
  const d = term.parser.registerOscHandler(7, (data) => {
    // Reject OSC 7 emitted while a command is running: command stdout/stderr
    // is untrusted (it can come from a remote shell, an SSH session, a `cat`
    // of attacker-controlled bytes). The local shell only emits OSC 7
    // between commands via its precmd/PROMPT_COMMAND hook.
    if (state?.inCommand) return true;
    const cwd = parseOsc7(data);
    if (cwd) onCwd(cwd);
    return true;
  });
  return () => d.dispose();
}

export type PromptTracker = {
  getMarker: () => IMarker | null;
  dispose: () => void;
};

export function registerPromptTracker(
  term: Terminal,
  state?: ShellIntegrationState,
): PromptTracker {
  let marker: IMarker | null = null;
  const decorations: IDecoration[] = [];
  const d = term.parser.registerOscHandler(133, (data) => {
    // OSC 133 A — start of new prompt (between commands).
    if (data.startsWith("A")) {
      if (state) state.inCommand = false;
      // A fresh marker per prompt. We intentionally do NOT dispose the
      // previous one — its exit-status decoration (added at the matching D)
      // must persist down the scrollback. xterm disposes the marker for us
      // once it scrolls past the buffer, which tears down its decoration too.
      marker = term.registerMarker(0);
    } else if (data.startsWith("B")) {
      // OSC 133 B — command begins. From here on, treat all output as
      // untrusted until we see D (command exit) or the next A (new prompt).
      if (state) state.inCommand = true;
    } else if (data.startsWith("C")) {
      // OSC 133 C — command pre-execution marker; still inside command.
      if (state) state.inCommand = true;
    } else if (data.startsWith("D")) {
      // OSC 133 D;<exitcode> — command ends. Accent the command's prompt line
      // green/red in the gutter so success/failure is scannable at a glance.
      if (state) state.inCommand = false;
      if (marker && !marker.isDisposed) {
        addExitDecoration(term, marker, parseExitCode(data), decorations);
      }
    }
    return true;
  });
  return {
    getMarker: () => (marker && !marker.isDisposed ? marker : null),
    dispose: () => {
      d.dispose();
      for (const dec of decorations.slice()) dec.dispose();
      decorations.length = 0;
      marker?.dispose();
      marker = null;
    },
  };
}

/** Exit code from an OSC 133 `D` payload ("D", "D;0", "D;1;…"). Missing → 0. */
function parseExitCode(data: string): number {
  const code = Number(data.split(";")[1]);
  return Number.isFinite(code) ? code : 0;
}

/** Add a thin green/red gutter bar on a command's prompt line, by exit code. */
function addExitDecoration(
  term: Terminal,
  marker: IMarker,
  code: number,
  decorations: IDecoration[],
): void {
  // Decorations aren't guaranteed (older xterm builds / headless test mocks).
  if (typeof term.registerDecoration !== "function") return;
  const dec = term.registerDecoration({ marker, x: 0, width: 1 });
  if (!dec) return;
  decorations.push(dec);
  dec.onDispose(() => {
    const i = decorations.indexOf(dec);
    if (i >= 0) decorations.splice(i, 1);
  });
  const ok = code === 0;
  dec.onRender((el) => {
    el.style.width = "2px";
    el.style.height = "100%";
    el.style.borderRadius = "1px";
    el.style.background = ok
      ? "var(--terminal-ansi-green)"
      : "var(--terminal-ansi-red)";
    el.style.opacity = "0.85";
    el.style.pointerEvents = "none";
  });
}

/**
 * Register handlers for OSC 0 (set window title + icon name) and OSC 2
 * (set window title only). Shells and programs like vim, htop, and ssh emit
 * these to display a meaningful label in the terminal tab/window title bar.
 *
 * Unlike OSC 7 (cwd), title sequences are intentionally emitted by running
 * commands — for example, vim sets the title to the current filename. We do
 * NOT gate on `inCommand` here.
 *
 * Returns a single disposer that tears down both handlers.
 */
export function registerTitleHandler(
  term: Terminal,
  onTitle: (title: string) => void,
): () => void {
  const d0 = term.parser.registerOscHandler(0, (data) => {
    onTitle(data);
    return true;
  });
  const d2 = term.parser.registerOscHandler(2, (data) => {
    onTitle(data);
    return true;
  });
  return () => {
    d0.dispose();
    d2.dispose();
  };
}

function parseOsc7(data: string): string | null {
  const m = data.match(/^file:\/\/[^/]*(\/.*)$/);
  if (!m) return null;
  let path = m[1];
  try {
    path = decodeURIComponent(path);
  } catch {}
  // /C:/Users/foo -> C:/Users/foo so it's a valid Windows path.
  if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
  return path;
}
