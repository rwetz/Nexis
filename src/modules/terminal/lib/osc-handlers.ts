// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { IBuffer, IDecoration, IMarker, Terminal } from "@xterm/xterm";

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
  /**
   * True once shell integration has proven itself: any OSC 133 prompt
   * marker, or an OSC 7 accepted outside a running command. While false,
   * cwd tracking falls back to asking the OS for the shell's real cwd
   * (pty_cwd) instead of silently mis-tracking. Deliberately NOT set by
   * rejected in-command OSC 7 — untrusted output must not be able to
   * switch the fallback off.
   */
  markersSeen: boolean;
};

export function createShellIntegrationState(): ShellIntegrationState {
  return { inCommand: false, markersSeen: false };
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
    if (cwd) {
      if (state) state.markersSeen = true;
      onCwd(cwd);
    }
    return true;
  });
  return () => d.dispose();
}

export type PromptTracker = {
  getMarker: () => IMarker | null;
  dispose: () => void;
};

/**
 * Every live prompt marker (OSC 133 A) for a terminal, in buffer order, so
 * prompt-block navigation can jump between commands. Keyed by Terminal rather
 * than threaded through the session so the renderer pool's key handler — which
 * only ever has the `Terminal` — can reach it without new plumbing. A WeakMap
 * means a reaped slot's entry goes away with the terminal.
 *
 * Markers are disposed by xterm when their line scrolls out of the buffer, so
 * the array is pruned lazily on read rather than eagerly.
 */
const promptMarkers = new WeakMap<Terminal, IMarker[]>();

/**
 * Pick the prompt line to scroll to. `lines` need not be sorted or unique.
 * `dir` is -1 for the previous (older) prompt above the viewport top, 1 for
 * the next (newer) one below it. Returns null when there is nothing further
 * in that direction — the caller leaves the viewport alone rather than
 * clamping, so repeated presses at either end are a no-op, not a jitter.
 */
export function adjacentPromptLine(
  lines: number[],
  viewportY: number,
  dir: -1 | 1,
): number | null {
  let best: number | null = null;
  for (const line of lines) {
    if (dir === -1) {
      if (line < viewportY && (best === null || line > best)) best = line;
    } else if (line > viewportY && (best === null || line < best)) best = line;
  }
  return best;
}

/**
 * Scroll the terminal to the previous / next command prompt. Returns true if
 * the viewport moved, so the caller can decide whether to swallow the key.
 */
export function scrollToAdjacentPrompt(term: Terminal, dir: -1 | 1): boolean {
  const markers = promptMarkers.get(term);
  if (!markers || markers.length === 0) return false;
  // Prune here (rather than on every OSC 133 A) so the cost lands on the rare
  // navigation keypress instead of on every prompt the shell draws.
  const live = markers.filter((m) => !m.isDisposed);
  if (live.length !== markers.length) promptMarkers.set(term, live);
  const viewportY = term.buffer?.active?.viewportY ?? 0;
  const target = adjacentPromptLine(
    live.map((m) => m.line),
    viewportY,
    dir,
  );
  if (target === null) return false;
  term.scrollToLine(target);
  return true;
}

/**
 * Everything captured about a failed command for the AI "Explain" flow.
 * Captured at OSC 133 D time (buffer content is final for that command),
 * delivered when the user clicks the inline chip.
 */
export type CommandFailure = {
  /** The command line as typed. zsh and bash place the OSC 133 B marker at
   * the start of the prompt (they prepend it to PS1), so on those shells
   * this includes the rendered prompt prefix — harmless for the model. */
  command: string;
  /** Command output, tail-biased and capped (errors live at the end). */
  output: string;
  exitCode: number;
  /** cwd the command ran in. Read at D time, which is before the shell's
   * post-command OSC 7 fires — so a failed `cd`-ish command can't skew it. */
  cwd: string | null;
};

export type FailureExplainOptions = {
  /** Live preference check — read at each command exit, no rebind needed. */
  isEnabled: () => boolean;
  /** cwd the command ran in; called at OSC 133 D time. */
  getCwd: () => string | null;
  /** Invoked when the user clicks the inline "✦ Explain" chip. */
  onExplain: (failure: CommandFailure) => void;
};

/** SIGINT exit — a deliberate Ctrl+C is a cancel, not a failure to explain. */
const EXIT_SIGINT = 130;

export function registerPromptTracker(
  term: Terminal,
  state?: ShellIntegrationState,
  explain?: FailureExplainOptions,
): PromptTracker {
  let marker: IMarker | null = null;
  // Failed-command capture state, one command at a time. `cmdMarker` pins
  // the line where input begins (B), `outMarker` the first output line (C).
  // PowerShell's profile emits no C — the capture degrades, see
  // captureFailedCommand. `sawExec` distinguishes a real execution from a
  // bare Enter on an empty prompt (precmd re-emits D with the stale $?).
  let cmdMarker: IMarker | null = null;
  let cmdStartX = 0;
  let outMarker: IMarker | null = null;
  let sawExec = false;
  const decorations: IDecoration[] = [];
  const disposeCommandMarkers = () => {
    cmdMarker?.dispose();
    cmdMarker = null;
    outMarker?.dispose();
    outMarker = null;
    sawExec = false;
  };
  const d = term.parser.registerOscHandler(133, (data) => {
    if (state) state.markersSeen = true;
    // OSC 133 A — start of new prompt (between commands).
    if (data.startsWith("A")) {
      if (state) state.inCommand = false;
      // A fresh marker per prompt. We intentionally do NOT dispose the
      // previous one — its exit-status decoration (added at the matching D)
      // must persist down the scrollback. xterm disposes the marker for us
      // once it scrolls past the buffer, which tears down its decoration too.
      marker = term.registerMarker(0);
      if (marker) recordPromptMarker(term, marker);
      disposeCommandMarkers();
    } else if (data.startsWith("B")) {
      // OSC 133 B — command begins. From here on, treat all output as
      // untrusted until we see D (command exit) or the next A (new prompt).
      if (state) state.inCommand = true;
      cmdMarker?.dispose();
      cmdMarker = term.registerMarker(0);
      cmdStartX = term.buffer?.active?.cursorX ?? 0;
    } else if (data.startsWith("C")) {
      // OSC 133 C — command pre-execution marker; still inside command.
      if (state) state.inCommand = true;
      outMarker?.dispose();
      outMarker = term.registerMarker(0);
      sawExec = true;
    } else if (data.startsWith("D")) {
      // OSC 133 D;<exitcode> — command ends. Accent the command's prompt line
      // green/red in the gutter so success/failure is scannable at a glance.
      if (state) state.inCommand = false;
      if (marker && !marker.isDisposed) {
        const code = parseExitCode(data);
        // Read the command now, while the buffer still holds this block.
        addExitDecoration(
          term,
          marker,
          code,
          decorations,
          readCommandText(term, cmdMarker, cmdStartX, outMarker),
        );
        if (explain && code !== 0 && code !== EXIT_SIGINT && explain.isEnabled()) {
          const capture = captureFailedCommand(term, cmdMarker, cmdStartX, outMarker);
          // Require evidence a command actually ran: a C marker, or output.
          // Bare Enter after a failure re-emits D with the stale status and
          // must not grow a chip on the empty prompt line.
          if (capture && (sawExec || capture.output.length > 0)) {
            addExplainDecoration(
              term,
              marker,
              { ...capture, exitCode: code, cwd: explain.getCwd() },
              decorations,
              explain.onExplain,
            );
          }
        }
      }
      disposeCommandMarkers();
    }
    return true;
  });
  return {
    getMarker: () => (marker && !marker.isDisposed ? marker : null),
    dispose: () => {
      d.dispose();
      for (const dec of decorations.slice()) dec.dispose();
      decorations.length = 0;
      // Only drop our navigation index — the markers themselves belong to the
      // terminal (their exit decorations may still be on screen) and xterm
      // disposes them when they scroll out.
      promptMarkers.delete(term);
      marker?.dispose();
      marker = null;
      disposeCommandMarkers();
    },
  };
}

/**
 * Cap on retained prompt markers. Well above any plausible visible scrollback
 * (xterm's default is 1000 lines and a prompt costs at least one), so it only
 * bounds the pathological case of a huge `scrollback` setting.
 */
const MAX_PROMPT_MARKERS = 2_000;

function recordPromptMarker(term: Terminal, marker: IMarker): void {
  const markers = promptMarkers.get(term);
  if (!markers) {
    promptMarkers.set(term, [marker]);
    return;
  }
  markers.push(marker);
  if (markers.length > MAX_PROMPT_MARKERS)
    markers.splice(0, markers.length - MAX_PROMPT_MARKERS);
}

/** Exit code from an OSC 133 `D` payload ("D", "D;0", "D;1;…"). Missing → 0. */
function parseExitCode(data: string): number {
  const code = Number(data.split(";")[1]);
  return Number.isFinite(code) ? code : 0;
}

/** Add a thin green/red gutter bar on a command's prompt line, by exit code. */
/**
 * The exit-status bar in the gutter, which doubles as the per-command block
 * affordance: hovering names the command and its exit status, clicking copies
 * the command.
 *
 * `command` is captured at D time and closed over — the buffer rows it came
 * from may have scrolled away or been overwritten by the time anyone clicks,
 * so reading lazily would hand back the wrong text (or nothing) exactly when
 * the scrollback is long enough for this to be useful.
 */
function addExitDecoration(
  term: Terminal,
  marker: IMarker,
  code: number,
  decorations: IDecoration[],
  command = "",
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
  const label = command
    ? `${command}\n${ok ? "Exit 0" : `Exit ${code}`} — click to copy command`
    : ok
      ? "Exit 0"
      : `Exit ${code}`;
  dec.onRender((el) => {
    // Widen the *hit* area without widening the bar: a 2px target is not
    // clickable in practice, so the element spans the gutter and paints the
    // bar with an inset border instead of a background.
    el.style.width = command ? "6px" : "2px";
    // Leave height alone: xterm sizes the element to one cell row. A "100%"
    // override resolves against the decoration container (the whole screen),
    // which painted the bar down the entire terminal instead of one line.
    el.style.borderRadius = "1px";
    const color = ok ? "var(--terminal-ansi-green)" : "var(--terminal-ansi-red)";
    if (command) {
      el.style.background = "transparent";
      el.style.borderLeft = `2px solid ${color}`;
      el.style.cursor = "pointer";
      el.style.pointerEvents = "auto";
      el.title = label;
      // Assigned as properties, not addEventListener: xterm re-invokes
      // onRender on every paint, and listeners would stack (same rule the
      // Explain chip follows).
      el.onmouseenter = () => {
        el.style.background = `color-mix(in srgb, ${color} 22%, transparent)`;
      };
      el.onmouseleave = () => {
        el.style.background = "transparent";
      };
      el.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard?.writeText(command).catch((err) => {
          console.warn("[nexis] block copy failed:", err);
        });
      };
    } else {
      el.style.width = "2px";
      el.style.background = color;
      el.style.pointerEvents = "none";
    }
    el.style.opacity = "0.85";
  });
}

// Caps for the failed-command capture. Errors live at the end of output, so
// truncation keeps the tail. The capture is held in a closure per failed
// command until its marker scrolls out, so the cap is also a memory bound.
const MAX_COMMAND_CHARS = 2_000;
const MAX_OUTPUT_LINES = 200;
const MAX_OUTPUT_CHARS = 16_000;
const TRUNCATION_NOTE = "[… earlier output truncated …]";

/**
 * Extract the failed command and its output from the buffer at OSC 133 D
 * time. All bytes printed before the D sequence are already in the buffer
 * (the parser is in-order), so the content between the B/C markers and the
 * cursor is exactly this command's transcript.
 *
 * Without a C marker (PowerShell's profile emits only A/B/D) the command is
 * taken as the B line plus its wrapped continuation rows, and everything
 * below is treated as output — multi-line PS commands land in `output`,
 * which the model copes with fine.
 */
function captureFailedCommand(
  term: Terminal,
  cmdMarker: IMarker | null,
  cmdStartX: number,
  outMarker: IMarker | null,
): { command: string; output: string } | null {
  const bounds = commandBounds(term, cmdMarker, outMarker);
  if (!bounds) return null;
  const buf = term.buffer.active;
  const { cmdLine, cmdEnd, outStart, lastLine } = bounds;

  const command = readLines(buf, cmdLine, Math.min(cmdEnd, lastLine), cmdStartX)
    .slice(0, MAX_COMMAND_CHARS)
    .trim();

  let output = "";
  if (outStart <= lastLine) {
    let from = outStart;
    let truncated = false;
    if (lastLine - from + 1 > MAX_OUTPUT_LINES) {
      from = lastLine - MAX_OUTPUT_LINES + 1;
      truncated = true;
    }
    output = readLines(buf, from, lastLine, 0);
    if (output.length > MAX_OUTPUT_CHARS) {
      output = output.slice(output.length - MAX_OUTPUT_CHARS);
      truncated = true;
    }
    output = output.replace(/\s+$/, "");
    if (truncated) output = `${TRUNCATION_NOTE}\n${output}`;
  }
  return { command, output };
}

/**
 * Line boundaries of the command that just finished, resolved at OSC 133 D
 * time (the buffer is final for that command — the parser is in-order, so
 * everything it printed is already there).
 *
 * Shared by the failed-command capture and the block gutter's copy action so
 * the two can never disagree about where a command ends and its output
 * begins — they used to be the same code, and a divergence here would show
 * up as the copied command silently including a line of output.
 */
function commandBounds(
  term: Terminal,
  cmdMarker: IMarker | null,
  outMarker: IMarker | null,
): { cmdLine: number; cmdEnd: number; outStart: number; lastLine: number } | null {
  const buf = term.buffer?.active;
  if (!buf || !cmdMarker || cmdMarker.isDisposed) return null;
  // The cursor sits where D was emitted — on a fresh line below the last
  // output line when output ended in a newline (the common case).
  const cursorLine = buf.baseY + buf.cursorY;
  const lastLine = buf.cursorX > 0 ? cursorLine : cursorLine - 1;

  const cmdLine = cmdMarker.line;
  let cmdEnd: number;
  let outStart: number;
  if (outMarker && !outMarker.isDisposed) {
    cmdEnd = Math.max(cmdLine, outMarker.line - 1);
    outStart = outMarker.line;
  } else {
    cmdEnd = cmdLine;
    while (cmdEnd < lastLine && buf.getLine(cmdEnd + 1)?.isWrapped) cmdEnd++;
    outStart = cmdEnd + 1;
  }
  return { cmdLine, cmdEnd, outStart, lastLine };
}

/**
 * Just the command text of the block that finished, for the gutter's
 * click-to-copy action.
 *
 * Only the command is retained per block, never its output: a block index
 * spans the whole scrollback (up to `MAX_PROMPT_MARKERS`), and holding each
 * command's output would put tens of megabytes behind a feature that exists
 * to copy a one-line command. Output stays reachable through selection.
 */
function readCommandText(
  term: Terminal,
  cmdMarker: IMarker | null,
  cmdStartX: number,
  outMarker: IMarker | null,
): string {
  const bounds = commandBounds(term, cmdMarker, outMarker);
  if (!bounds) return "";
  return readLines(
    term.buffer.active,
    bounds.cmdLine,
    Math.min(bounds.cmdEnd, bounds.lastLine),
    cmdStartX,
  )
    .slice(0, MAX_COMMAND_CHARS)
    .trim();
}

/** Read buffer rows [from..to], joining wrapped rows without a newline.
 * `firstCol` skips the prompt prefix on the first row (cursor x at B). */
function readLines(buf: IBuffer, from: number, to: number, firstCol: number): string {
  let text = "";
  for (let y = from; y <= to; y++) {
    const line = buf.getLine(y);
    if (!line) continue;
    const row = line.translateToString(true, y === from ? firstCol : 0);
    if (y === from) text = row;
    else text += (line.isWrapped ? "" : "\n") + row;
  }
  return text;
}

/** Cells reserved at the right edge of the command line for the chip. The
 * element itself shrinks to max-content, so this is a placement hint. */
const EXPLAIN_CHIP_CELLS = 12;

/**
 * Add the clickable "✦ Explain" chip on a failed command's prompt line,
 * right-anchored. The decoration element itself is the chip — no child
 * nodes, no `document.*` — so the logic stays testable in a Node test
 * environment, and handlers are assigned as properties (not addEventListener)
 * so xterm re-invoking onRender on every paint can't stack listeners.
 */
function addExplainDecoration(
  term: Terminal,
  marker: IMarker,
  failure: CommandFailure,
  decorations: IDecoration[],
  onExplain: (failure: CommandFailure) => void,
): void {
  if (typeof term.registerDecoration !== "function") return;
  const dec = term.registerDecoration({
    marker,
    anchor: "right",
    x: 0,
    width: EXPLAIN_CHIP_CELLS,
    layer: "top",
  });
  if (!dec) return;
  decorations.push(dec);
  dec.onDispose(() => {
    const i = decorations.indexOf(dec);
    if (i >= 0) decorations.splice(i, 1);
  });
  dec.onRender((el) => {
    el.textContent = "✦ Explain";
    el.title = `Explain this failure with AI (exit code ${failure.exitCode})`;
    const s = el.style;
    // xterm re-applies its own width each paint; ours must win every render.
    s.width = "max-content";
    s.height = "auto";
    s.padding = "0 7px";
    s.fontSize = "10px";
    s.lineHeight = "16px";
    s.fontFamily = "var(--font-sans, ui-sans-serif, system-ui, sans-serif)";
    s.borderRadius = "8px";
    s.color = "var(--terminal-ansi-red)";
    s.background = "color-mix(in srgb, var(--terminal-ansi-red) 12%, transparent)";
    s.border = "1px solid color-mix(in srgb, var(--terminal-ansi-red) 35%, transparent)";
    s.cursor = "pointer";
    s.pointerEvents = "auto";
    s.userSelect = "none";
    s.opacity = "0.6";
    s.zIndex = "10";
    el.onmouseenter = () => {
      el.style.opacity = "1";
    };
    el.onmouseleave = () => {
      el.style.opacity = "0.6";
    };
    el.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onExplain(failure);
    };
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

/** Cap on the base64 payload of an OSC 52 write (~750 KB of text). Anything
 * larger is almost certainly not a human copy and gets dropped outright. */
const OSC52_MAX_B64_LEN = 1_000_000;

/**
 * OSC 52 — clipboard access from terminal programs (tmux, vim, anything over
 * ssh). **Write-only by design**: a read request (`Pd` = `?`) asks us to type
 * the system clipboard back into the PTY, which hands its contents to
 * whatever program — or remote host — printed the sequence. Reads are always
 * consumed silently, no reply, regardless of the setting; only writes are
 * honored, and only while `isEnabled()` (the user preference) is true.
 *
 * The selection parameter (`c`, `p`, `s`, …) is ignored — everything targets
 * the one system clipboard, matching most emulators.
 */
export function registerClipboardHandler(
  term: Terminal,
  isEnabled: () => boolean,
  writeClipboard: (text: string) => Promise<void> = (text) =>
    navigator.clipboard.writeText(text),
): () => void {
  const d = term.parser.registerOscHandler(52, (data) => {
    const sep = data.indexOf(";");
    if (sep === -1) return true; // malformed — consume, never pass through
    const payload = data.slice(sep + 1);
    if (payload === "?") return true; // read request — always blocked
    if (!isEnabled()) return true;
    if (payload.length > OSC52_MAX_B64_LEN) return true;
    const text = decodeOsc52(payload);
    if (text) {
      writeClipboard(text).catch((e) =>
        console.warn("[nexis] OSC 52 clipboard write failed:", e),
      );
    }
    return true;
  });
  return () => d.dispose();
}

function decodeOsc52(b64: string): string | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
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
