// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { signalOnboardingStep } from "@/lib/onboarding";
import type { IBuffer, IMarker, Terminal } from "@xterm/xterm";

/**
 * Cross-handler state shared between the OSC 7 cwd handler and the OSC 133
 * prompt-marker handler. Tracks whether we are currently inside a running
 * command (between OSC 133 B and the next OSC 133 D / A), so the cwd handler
 * can ignore OSC 7 updates emitted by *command output* (e.g. a remote SSH
 * server, a `cat` of an attacker-controlled file). Only OSC 7 issued by the
 * local shell — which fires between commands — should be honored.
 */
export type ShellIntegrationState = {
  /**
   * "Output from here is untrusted." Set at OSC 133 B — the prompt has been
   * drawn and anything appearing afterwards may be command output rather
   * than the shell speaking — and cleared at A and D.
   *
   * This is a *provenance* flag, not a liveness one, and the difference
   * matters: at an idle prompt B is the last marker emitted, so this is
   * TRUE while the shell sits there doing nothing. Use {@link executing} to
   * ask whether a command is actually running. Conflating the two is what
   * made the close-confirmation dialog fire on every terminal tab.
   */
  inCommand: boolean;
  /**
   * "A command is actually running." Set at OSC 133 C (pre-execution),
   * cleared at D (exit) and at A (a fresh prompt, in case a D was lost).
   *
   * Every shell Nexis installs integration for emits C — bash via PS0, zsh
   * and fish via preexec, and PowerShell via a PSReadLine Enter handler
   * added for exactly this. A shell with no integration never sets it, so
   * the liveness checks that read it degrade to "not running", which is the
   * safe direction: a spurious confirmation on every close trains the user
   * to dismiss it, and then it protects nothing.
   */
  executing: boolean;
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
  return { inCommand: false, executing: false, markersSeen: false };
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
 * The command-ledger hook.
 *
 * `isEnabled` is checked **here**, in the OSC 133 handler, and never
 * downstream. That placement is §4 of `docs/vault/decisions/command-ledger.md`
 * and it is deliberate: a private terminal must never enter the ledger, and a
 * filter applied at write time is a filter someone later moves. The gate lives
 * where the event is born.
 */
export type LedgerOptions = {
  /** False for a private terminal, or when recording is switched off. */
  isEnabled: () => boolean;
  /** cwd the command ran in; read at OSC 133 D time. */
  getCwd: () => string | null;
  /** One finished command. Redaction happens inside the recorder. */
  record: (entry: {
    cwd: string;
    argv: string;
    exitCode: number;
    startedAt: number;
    endedAt: number;
    output: string;
  }) => void;
};

export function registerPromptTracker(
  term: Terminal,
  state?: ShellIntegrationState,
  ledger?: LedgerOptions,
): PromptTracker {
  let marker: IMarker | null = null;
  // Command capture state for the ledger, one command at a time. `cmdMarker` pins
  // the line where input begins (B), `outMarker` the first output line (C).
  // PowerShell's profile emits no C — the capture degrades, see
  // captureCommand. `sawExec` distinguishes a real execution from a
  // bare Enter on an empty prompt (precmd re-emits D with the stale $?).
  let cmdMarker: IMarker | null = null;
  let cmdStartX = 0;
  let outMarker: IMarker | null = null;
  let sawExec = false;
  let cmdStartedAt = 0;
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
      if (state) {
        state.inCommand = false;
        // Also clears `executing`: a new prompt means the previous command
        // is over whether or not its D survived the trip.
        state.executing = false;
      }
      // A fresh marker per prompt. The previous one is not disposed: prompt
      // navigation needs every marker down the scrollback, and xterm disposes
      // each one itself once its line scrolls out of the buffer.
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
      // Wall-clock start, for the ledger's duration. Taken at B (the prompt
      // accepting input) rather than at C, because C is optional — PowerShell's
      // profile emits none, and a duration that silently disappears on one
      // shell is worse than one that includes a moment of typing.
      cmdStartedAt = Date.now();
    } else if (data.startsWith("C")) {
      // OSC 133 C — command pre-execution marker; still inside command.
      if (state) {
        state.inCommand = true;
        state.executing = true;
      }
      outMarker?.dispose();
      outMarker = term.registerMarker(0);
      sawExec = true;
    } else if (data.startsWith("D")) {
      // OSC 133 D;<exitcode> — command ends.
      if (state) {
        state.inCommand = false;
        state.executing = false;
      }
      if (marker && !marker.isDisposed) {
        const code = parseExitCode(data);
        // A finished command with a real exit status is the signal that the
        // "run a command" onboarding step has actually happened. This is a
        // bare dispatchEvent -- the listener owns the preference write, so
        // nothing here touches the settings store (src/lib/onboarding.ts).
        signalOnboardingStep("terminal.run");

        // The command ledger. Gated here at the source, never downstream:
        // a private terminal must not enter it, and a filter applied at write
        // time is a filter someone later moves (decision record §4).
        if (ledger?.isEnabled()) {
          const captured = captureCommand(
            term,
            cmdMarker,
            cmdStartX,
            outMarker,
          );
          if (captured && (sawExec || captured.output.length > 0)) {
            ledger.record({
              cwd: ledger.getCwd() ?? "",
              argv: captured.command,
              exitCode: code,
              startedAt: cmdStartedAt || Date.now(),
              endedAt: Date.now(),
              output: captured.output,
            });
          }
        }
      }
      disposeCommandMarkers();
    }
    return true;
  });
  // Erase in Display (CSI J). `cls` / `clear` blank the screen (mode 2) and
  // the scrollback (mode 3), but the lines themselves survive, and so do the
  // markers on them. Drop the prompt markers in the erased region so prompt
  // navigation doesn't jump to blank rows. Returns false so xterm still
  // performs the erase; runs before it, so marker lines are still the
  // pre-erase positions.
  const ed =
    typeof term.parser.registerCsiHandler === "function"
      ? term.parser.registerCsiHandler({ final: "J" }, (params) => {
          const mode = typeof params[0] === "number" ? params[0] : 0;
          const buf = term.buffer.active;
          // The alternate screen (vim, less) has no markers of ours.
          if ((mode !== 2 && mode !== 3) || buf.type === "alternate") return false;
          const top = buf.baseY;
          const erased = (line: number) => (mode === 2 ? line >= top : line < top);
          const prompts = promptMarkers.get(term);
          if (prompts) {
            const kept: IMarker[] = [];
            for (const m of prompts) {
              if (!m.isDisposed && !erased(m.line)) kept.push(m);
              else m.dispose();
            }
            promptMarkers.set(term, kept);
          }
          if (marker && (marker.isDisposed || erased(marker.line))) {
            marker.dispose();
            marker = null;
          }
          return false;
        })
      : null;
  return {
    getMarker: () => (marker && !marker.isDisposed ? marker : null),
    dispose: () => {
      d.dispose();
      ed?.dispose();
      // Only drop our navigation index — the markers themselves belong to the
      // terminal, and xterm disposes them when they scroll out.
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

// Caps for the ledger's command capture. Errors live at the end of output,
// so truncation keeps the tail.
const MAX_COMMAND_CHARS = 2_000;
const MAX_OUTPUT_LINES = 200;
const MAX_OUTPUT_CHARS = 16_000;
const TRUNCATION_NOTE = "[… earlier output truncated …]";

/**
 * Extract the finished command and its output from the buffer at OSC 133 D
 * time. All bytes printed before the D sequence are already in the buffer
 * (the parser is in-order), so the content between the B/C markers and the
 * cursor is exactly this command's transcript.
 *
 * Without a C marker (PowerShell's profile emits only A/B/D) the command is
 * taken as the B line plus its wrapped continuation rows, and everything
 * below is treated as output — multi-line PS commands land in `output`,
 * which the model copes with fine.
 */
function captureCommand(
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
