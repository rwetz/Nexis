// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { ensureMonoFontsLoaded } from "@/lib/fonts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { DormantRing } from "./dormantRing";
import {
  createShellIntegrationState,
  registerClipboardHandler,
  registerCwdHandler,
  registerPromptTracker,
  registerTitleHandler,
  type ShellIntegrationState,
} from "./osc-handlers";
import { openPty, ptyCwd, type PtySession } from "./pty-bridge";
import {
  acquireSlot,
  applyFontFamily,
  applyFontSize,
  applyFontWeight,
  applyLetterSpacing,
  applyTheme as applyPoolTheme,
  applyScrollback,
  applyCursorStyle,
  applyCursorBlink,
  applyWebglPreference,
  configureRendererPool,
  focusSlot,
  getSlotForLeaf,
  releaseSlot,
  setSlotFocused,
} from "./rendererPool";

type Callbacks = {
  onSearchReady?: (addon: SearchAddon) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onTitle?: (title: string) => void;
};

type Session = {
  pty: PtySession | null;
  ptyOpening: boolean;
  initialCwd: string | undefined;
  lastCwd: string | null;
  pendingExit: number | null;
  shellExited: boolean;
  callbacks: Callbacks;
  visibleNow: boolean;
  focusedNow: boolean;
  disposed: boolean;
  ready: Promise<void>;
  cols: number;
  rows: number;
  container: HTMLDivElement | null;
  snapshot: string | null;
  searchQuery: string | null;
  dormantRing: DormantRing;
  hasSlot: boolean;
  // True if the slot was in alt-screen mode (TUI like vim, htop, dofek)
  // at the most recent release. Read once on the next bind to trigger a
  // SIGWINCH-driven repaint instead of replaying dormant bytes.
  altScreenAtRelease: boolean;
  /**
   * Input written before the PTY IPC call completed. Drained in-order the
   * moment `s.pty` is assigned. Each entry already includes the line ending.
   */
  pendingWrites: string[];
  /**
   * OSC 133 in-command flag, session-level so it survives slot rebinds (a
   * command started before a tab was backgrounded is still running when the
   * tab comes back). Read by sessionHasRunningCommand for close-confirm.
   */
  shellState: ShellIntegrationState;
  /**
   * cwd-fallback timers: a one-shot check a few seconds after PTY open, then
   * a low-rate pty_cwd poll while shell integration stays silent. Both are
   * cleared on dispose/respawn; the poll self-cancels the moment a real
   * OSC 7/133 marker arrives.
   */
  integrationCheckTimer: ReturnType<typeof setTimeout> | null;
  cwdPollTimer: ReturnType<typeof setInterval> | null;
};

const sessions = new Map<number, Session>();

/** Per-leaf recording callback. Set via registerRecordingHandler; null when not recording. */
const recordingHandlers = new Map<number, (bytes: Uint8Array) => void>();

export function registerRecordingHandler(
  leafId: number,
  handler: ((bytes: Uint8Array) => void) | null,
): void {
  if (handler) recordingHandlers.set(leafId, handler);
  else recordingHandlers.delete(leafId);
}

/**
 * Global "some terminal produced output" listeners. Used by the LAN share
 * panel to push live updates the moment output arrives instead of polling.
 * The set is empty unless live sharing is active, so the per-chunk cost is a
 * single size check.
 */
const outputListeners = new Set<(leafId: number) => void>();

export function onTerminalOutput(listener: (leafId: number) => void): () => void {
  outputListeners.add(listener);
  return () => {
    outputListeners.delete(listener);
  };
}

export function getSessionDimensions(leafId: number): { cols: number; rows: number } {
  const s = sessions.get(leafId);
  return { cols: s?.cols ?? 80, rows: s?.rows ?? 24 };
}

/**
 * True while the leaf's shell is inside a running command (between OSC 133
 * B/C and the next D/A). Used by the close-tab confirmation. Requires shell
 * integration — without prompt markers this is always false, so closing
 * stays silent (fail-open by design; we can't tell busy from idle).
 */
export function sessionHasRunningCommand(leafId: number): boolean {
  const s = sessions.get(leafId);
  return !!s && !s.disposed && !s.shellExited && s.shellState.inCommand;
}

configureRendererPool({
  resolveLeaf(leafId) {
    const s = sessions.get(leafId);
    if (!s) return null;
    return {
      writeToPty: (data) => {
        if (s.pty) {
          // PTY is ready — write immediately.
          s.pty.write(data).catch((e) =>
            console.warn("[nexis] pty write failed:", e),
          );
        } else if (!s.shellExited && !s.disposed) {
          // PTY IPC not yet complete — queue; drained when the PTY opens.
          // Prevents keystrokes typed before the first IPC round-trip from
          // being silently dropped (same queue used by the write() callback).
          s.pendingWrites.push(data);
        }
      },
      resizePty: (cols, rows) => {
        s.cols = cols;
        s.rows = rows;
        s.pty?.resize(cols, rows);
      },
      kickPty: (cols, rows) => {
        const pty = s.pty;
        if (!pty || cols <= 0 || rows <= 0) return;
        // Linux only emits SIGWINCH when the winsize ioctl actually
        // changes dims, so bump +1 row then restore. The TUI receives
        // (possibly two) SIGWINCHes and repaints from scratch.
        pty
          .resize(cols, rows + 1)
          .then(() => pty.resize(cols, rows))
          .catch((e) => console.warn("[nexis] kickPty failed:", e));
      },
    };
  },
  evictLeaf(leafId) {
    const s = sessions.get(leafId);
    if (!s) return;
    unbindLeafFromSlot(leafId, s);
  },
  isLeafFocused(leafId) {
    const s = sessions.get(leafId);
    return !!s && s.visibleNow && s.focusedNow;
  },
});

function ensureSession(leafId: number, initialCwd?: string): Session {
  const existing = sessions.get(leafId);
  if (existing) return existing;

  const session: Session = {
    pty: null,
    ptyOpening: false,
    initialCwd,
    lastCwd: null,
    pendingExit: null,
    shellExited: false,
    callbacks: {},
    visibleNow: false,
    focusedNow: false,
    disposed: false,
    ready: Promise.resolve(),
    cols: 0,
    rows: 0,
    container: null,
    snapshot: null,
    searchQuery: null,
    dormantRing: new DormantRing(),
    hasSlot: false,
    altScreenAtRelease: false,
    pendingWrites: [],
    shellState: createShellIntegrationState(),
    integrationCheckTimer: null,
    cwdPollTimer: null,
  };
  sessions.set(leafId, session);

  session.ready = (async () => {
    await ensureMonoFontsLoaded();
    await document.fonts.ready;
  })();

  return session;
}

function deliverPtyBytes(leafId: number, bytes: Uint8Array): void {
  const s = sessions.get(leafId);
  if (!s) return;
  // Feed recording handler before rendering so the cast captures every byte.
  const rec = recordingHandlers.get(leafId);
  if (rec) rec(bytes);
  const slot = getSlotForLeaf(leafId);
  if (slot) slot.term.write(bytes);
  else s.dormantRing.push(bytes);
  if (outputListeners.size > 0) {
    for (const listener of outputListeners) listener(leafId);
  }
}

async function openPtyForSession(
  leafId: number,
  s: Session,
  cwd: string | undefined,
): Promise<PtySession> {
  const startCols = s.cols > 0 ? s.cols : 80;
  const startRows = s.rows > 0 ? s.rows : 24;
  const prefs = usePreferencesStore.getState();
  const extraEnv = prefs.terminalEnvVars;
  return openPty(
    startCols,
    startRows,
    {
      onData: (bytes) => deliverPtyBytes(leafId, bytes),
      onExit: (code) => {
        s.shellExited = true;
        s.pty = null;
        const slot = getSlotForLeaf(leafId);
        if (slot) slot.term.options.disableStdin = true;
        if (s.callbacks.onExit) s.callbacks.onExit(code);
        else s.pendingExit = code;
      },
    },
    cwd,
    Object.keys(extraEnv).length > 0 ? extraEnv : undefined,
    prefs.defaultShellPath || undefined,
  );
}

// cwd fallback (shell-integration resilience): if no OSC 7/133 marker has
// arrived shortly after the shell started, its rc files likely don't source
// the Nexis integration — poll the shell process's real cwd at a low rate so
// new tabs, suggestions, and the git panel don't silently track a stale cwd.
// Linux-only in practice (pty_cwd resolves null elsewhere; the poll stops).
const INTEGRATION_CHECK_MS = 5000;
const CWD_POLL_MS = 3000;

function clearCwdFallback(s: Session): void {
  if (s.integrationCheckTimer) {
    clearTimeout(s.integrationCheckTimer);
    s.integrationCheckTimer = null;
  }
  if (s.cwdPollTimer) {
    clearInterval(s.cwdPollTimer);
    s.cwdPollTimer = null;
  }
}

function scheduleCwdFallback(leafId: number, s: Session): void {
  clearCwdFallback(s);
  s.integrationCheckTimer = setTimeout(() => {
    s.integrationCheckTimer = null;
    if (s.disposed || s.shellExited || !s.pty) return;
    if (s.shellState.markersSeen) return; // integration works — nothing to do
    logMissingIntegration(leafId);
    const ptyId = s.pty.id;
    s.cwdPollTimer = setInterval(() => {
      // Integration can arrive late (e.g. user manually sources the profile).
      if (s.disposed || s.shellExited || s.shellState.markersSeen) {
        clearCwdFallback(s);
        return;
      }
      ptyCwd(ptyId)
        .then((cwd) => {
          if (!cwd || s.disposed || s.shellState.markersSeen) return;
          if (s.lastCwd === cwd) return;
          s.lastCwd = cwd;
          s.callbacks.onCwd?.(cwd);
        })
        .catch(() => clearCwdFallback(s));
    }, CWD_POLL_MS);
  }, INTEGRATION_CHECK_MS);
}

let loggedMissingIntegration = false;
function logMissingIntegration(leafId: number): void {
  if (loggedMissingIntegration) return;
  loggedMissingIntegration = true;
  console.info(
    `[nexis] leaf ${leafId}: no shell-integration markers after ${INTEGRATION_CHECK_MS}ms — ` +
      "falling back to OS-level cwd tracking (prompt exit gutter and cwd-spoofing " +
      "protection unavailable without integration)",
  );
}

function bindLeafToSlot(leafId: number, s: Session): void {
  if (!s.container) return;
  const altScreen = s.altScreenAtRelease;
  s.altScreenAtRelease = false;
  acquireSlot({
    leafId,
    container: s.container,
    snapshot: s.snapshot,
    altScreen,
    drainRing: (write) => s.dormantRing.drain(write),
    shellExited: s.shellExited,
    searchQuery: s.searchQuery,
    cols: s.cols,
    rows: s.rows,
    registerOsc: (term) => {
      // Shared in-command flag — see osc-handlers.ts. The prompt tracker
      // flips it on OSC 133 B/C/D/A; the cwd handler reads it to ignore OSC
      // 7 emitted by untrusted command output (remote SSH, `cat` of an
      // attacker file, etc.). Session-level, not per-bind, so the flag is
      // still correct after a background/foreground slot cycle.
      const shellState = s.shellState;
      const prompt = registerPromptTracker(term, shellState);
      const cwd = registerCwdHandler(
        term,
        (next) => {
          if (s.lastCwd === next) return;
          s.lastCwd = next;
          s.callbacks.onCwd?.(next);
        },
        shellState,
      );
      const title = registerTitleHandler(term, (t) => {
        s.callbacks.onTitle?.(t);
      });
      // Write-only OSC 52 (copy from tmux/vim/ssh to the system clipboard),
      // gated live by the preference; reads stay blocked inside the handler.
      const clipboard = registerClipboardHandler(
        term,
        () => usePreferencesStore.getState().terminalOsc52Clipboard,
      );
      return [prompt.dispose, cwd, title, clipboard];
    },
    onSearchReady: (addon) => s.callbacks.onSearchReady?.(addon),
  });
  s.snapshot = null;
  s.hasSlot = true;
  if (s.lastCwd !== null) s.callbacks.onCwd?.(s.lastCwd);
  if (s.pendingExit !== null) {
    const code = s.pendingExit;
    s.pendingExit = null;
    s.callbacks.onExit?.(code);
  }
}

function unbindLeafFromSlot(leafId: number, s: Session): void {
  if (!s.hasSlot) return;
  const out = releaseSlot(leafId);
  if (out) {
    s.snapshot = out.snapshot;
    if (out.cols > 0) s.cols = out.cols;
    if (out.rows > 0) s.rows = out.rows;
    s.altScreenAtRelease = out.altScreen;
  }
  s.hasSlot = false;
}

function attachSession(
  leafId: number,
  container: HTMLDivElement,
  callbacks: Callbacks,
): void {
  const s = sessions.get(leafId);
  if (!s || s.disposed) return;
  s.callbacks = callbacks;
  s.container = container;

  if (s.visibleNow) bindLeafToSlot(leafId, s);

  if (!s.pty && !s.ptyOpening && !s.shellExited) {
    s.ptyOpening = true;
    openPtyForSession(leafId, s, s.initialCwd)
      .then((pty) => {
        s.ptyOpening = false;
        if (s.disposed) {
          pty.close();
          return;
        }
        s.pty = pty;
        if (s.cols > 0 && s.rows > 0) pty.resize(s.cols, s.rows);
        scheduleCwdFallback(leafId, s);
        // Drain writes that arrived before the PTY IPC call completed.
        if (s.pendingWrites.length > 0) {
          const queued = s.pendingWrites.splice(0);
          for (const data of queued) {
            pty.write(data).catch((e) =>
              console.warn("[nexis] pendingWrite flush failed:", e),
            );
          }
        }
      })
      .catch((e) => {
        s.ptyOpening = false;
        console.error("[nexis] openPty failed:", e);
      });
  }
}

function detachSession(leafId: number): void {
  const s = sessions.get(leafId);
  if (!s) return;
  unbindLeafFromSlot(leafId, s);
  s.callbacks = {};
  s.container = null;
}

export async function respawnSession(
  leafId: number,
  cwd?: string,
): Promise<void> {
  const s = sessions.get(leafId);
  if (!s || s.disposed) return;
  s.pty?.close();
  s.pty = null;
  s.snapshot = null;
  s.dormantRing = new DormantRing();
  s.shellExited = false;
  s.pendingExit = null;
  s.altScreenAtRelease = false;
  s.pendingWrites = [];
  s.shellState.inCommand = false;
  s.shellState.markersSeen = false;
  clearCwdFallback(s);

  const slot = getSlotForLeaf(leafId);
  if (slot) {
    slot.term.options.disableStdin = false;
    slot.term.clear();
    slot.term.reset();
  }

  s.ptyOpening = true;
  let pty: PtySession;
  try {
    pty = await openPtyForSession(leafId, s, cwd ?? s.initialCwd);
  } catch (e) {
    s.ptyOpening = false;
    console.error("[nexis] respawn openPty failed:", e);
    return;
  }
  s.ptyOpening = false;
  if (s.disposed) {
    pty.close();
    return;
  }
  s.pty = pty;
  if (s.cols > 0 && s.rows > 0) pty.resize(s.cols, s.rows);
  scheduleCwdFallback(leafId, s);
}

export function disposeSession(leafId: number): void {
  const s = sessions.get(leafId);
  if (!s) return;
  s.disposed = true;
  clearCwdFallback(s);
  unbindLeafFromSlot(leafId, s);
  s.snapshot = null;
  s.pty?.close();
  s.pty = null;
  sessions.delete(leafId);
}

type Options = {
  leafId: number;
  container: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  focused?: boolean;
  initialCwd?: string;
  onSearchReady?: (addon: SearchAddon) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onTitle?: (title: string) => void;
};

export function useTerminalSession({
  leafId,
  container,
  visible,
  focused = true,
  initialCwd,
  onSearchReady,
  onExit,
  onCwd,
  onTitle,
}: Options) {
  const cbRef = useRef({ onSearchReady, onExit, onCwd, onTitle });
  cbRef.current = { onSearchReady, onExit, onCwd, onTitle };

  useEffect(() => {
    let cancelled = false;
    const s = ensureSession(leafId, initialCwd);
    s.ready.then(() => {
      if (cancelled || s.disposed) return;
      const node = container.current;
      if (!node) return;
      attachSession(leafId, node, {
        onSearchReady: (a) => cbRef.current.onSearchReady?.(a),
        onExit: (c) => cbRef.current.onExit?.(c),
        onCwd: (c) => cbRef.current.onCwd?.(c),
        onTitle: (t) => cbRef.current.onTitle?.(t),
      });
      if (s.visibleNow && s.focusedNow) focusSlot(leafId);
    });
    return () => {
      cancelled = true;
      detachSession(leafId);
    };
  }, [leafId, container, initialCwd]);

  const fontSize = usePreferencesStore((p) => p.terminalFontSize);
  const zoomLevel = usePreferencesStore((p) => p.zoomLevel);
  useEffect(() => {
    applyFontSize(Math.max(4, Math.round(fontSize * zoomLevel)));
  }, [fontSize, zoomLevel]);

  const fontFamily = usePreferencesStore((p) => p.terminalFontFamily);
  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  const fontWeight = usePreferencesStore((p) => p.terminalFontWeight);
  useEffect(() => {
    applyFontWeight(fontWeight);
  }, [fontWeight]);

  const letterSpacing = usePreferencesStore((p) => p.terminalLetterSpacing);
  useEffect(() => {
    applyLetterSpacing(letterSpacing);
  }, [letterSpacing]);

  const scrollback = usePreferencesStore((p) => p.terminalScrollback);
  useEffect(() => {
    applyScrollback(scrollback);
  }, [scrollback]);

  const webglPref = usePreferencesStore((p) => p.terminalWebglEnabled);
  useEffect(() => {
    applyWebglPreference(webglPref);
  }, [webglPref]);

  const cursorStyle = usePreferencesStore((p) => p.terminalCursorStyle);
  useEffect(() => {
    applyCursorStyle(cursorStyle);
  }, [cursorStyle]);

  const cursorBlink = usePreferencesStore((p) => p.terminalCursorBlink);
  useEffect(() => {
    applyCursorBlink(cursorBlink);
  }, [cursorBlink]);

  useEffect(() => {
    const s = sessions.get(leafId);
    if (!s) return;
    s.visibleNow = visible;
    s.focusedNow = focused;
    if (visible) {
      if (s.container && !s.hasSlot) bindLeafToSlot(leafId, s);
      setSlotFocused(leafId, focused);
      if (focused) focusSlot(leafId);
    } else if (s.hasSlot) {
      unbindLeafFromSlot(leafId, s);
    }
  }, [leafId, visible, focused]);

  const write = useCallback(
    (data: string) => {
      const s = sessions.get(leafId);
      if (!s || s.shellExited || s.disposed) return;
      if (s.pty) {
        s.pty.write(data).catch((e) =>
          console.warn("[nexis] pty write failed:", e),
        );
      } else {
        // PTY IPC not yet complete — queue; drained when the PTY opens.
        s.pendingWrites.push(data);
      }
    },
    [leafId],
  );

  const focus = useCallback(() => focusSlot(leafId), [leafId]);

  const getBuffer = useCallback(
    (maxLines = 200): string | null => {
      const s = sessions.get(leafId);
      if (!s) return null;
      const slot = getSlotForLeaf(leafId);
      if (slot) {
        const buf = slot.term.buffer.active;
        const total = buf.length;
        const lines: string[] = [];
        const start = Math.max(0, total - maxLines);
        for (let i = start; i < total; i++) {
          lines.push(buf.getLine(i)?.translateToString(true) ?? "");
        }
        while (lines.length && lines[lines.length - 1] === "") lines.pop();
        return lines.join("\n");
      }
      if (!s.snapshot) return "";
      const plain = stripAnsi(s.snapshot);
      const lines = plain.split(/\r?\n/);
      const tail = lines.slice(-maxLines);
      while (tail.length && tail[tail.length - 1] === "") tail.pop();
      return tail.join("\n");
    },
    [leafId],
  );

  const getSelection = useCallback((): string | null => {
    const slot = getSlotForLeaf(leafId);
    const sel = slot?.term.getSelection() ?? "";
    return sel.length > 0 ? sel : null;
  }, [leafId]);

  const applyTheme = useCallback(() => {
    applyPoolTheme();
  }, []);

  return useMemo(
    () => ({ write, focus, getBuffer, getSelection, applyTheme }),
    [write, focus, getBuffer, getSelection, applyTheme],
  );
}

const ANSI_RE =
  /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][AB012]|\x1b[78=>]|\x1bc|\x1b[NOP\]X^_]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}
