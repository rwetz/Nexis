// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { detectMonoFontFamily } from "@/lib/fonts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { buildTerminalTheme } from "@/styles/terminalTheme";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { terminalWordNavigationSequence } from "./keymap";

export const POOL_MAX_SIZE = 5;
const FIT_DEBOUNCE_MS = 8;
const PTY_RESIZE_DEBOUNCE_MS = 256;
const SNAPSHOT_SCROLLBACK_CAP = 5_000;

/**
 * Parked-slot reaping (design informed by upstream terax's 0.8.0 perf pass,
 * which fixed a 914 MB webview-RSS report caused by exactly this shape):
 * without reaping, every slot ever parked keeps its xterm buffers, DOM tree,
 * and live WebGL context (texture atlas included) for the rest of the
 * session. After a grace period a parked slot loses its WebGL context (DOM
 * renderer is fine for something invisible; more idle GL contexts also mean
 * more context-loss events on fragile drivers — the Linux/NVIDIA surface
 * 1.20.5 fought). Parked slots beyond a small warm set are disposed entirely.
 * Adoption re-attaches WebGL on the spot.
 */
export const SLOT_REAP_GRACE_MS = 30_000;
/** Grace-expired parked slots kept alive (xterm + DOM) for instant re-adopt. */
export const WARM_PARKED_SLOTS = 1;

export type SlotAdapter = {
  resolveLeaf(leafId: number): LeafBridge | null;
  evictLeaf(leafId: number): void;
  isLeafFocused(leafId: number): boolean;
};

export type LeafBridge = {
  writeToPty(data: string): void;
  resizePty(cols: number, rows: number): void;
  // Force a SIGWINCH on the underlying PTY at the given dims. Implemented
  // as a +1 row / restore bump because the Linux kernel suppresses winsize
  // ioctls that don't actually change the size. Used to make alt-screen
  // TUIs repaint from scratch after they were dormant.
  kickPty(cols: number, rows: number): void;
};

export type Slot = {
  readonly id: number;
  readonly term: Terminal;
  readonly fitAddon: FitAddon;
  readonly searchAddon: SearchAddon;
  readonly serializeAddon: SerializeAddon;
  readonly host: HTMLDivElement;
  webglAddon: WebglAddon | null;
  webglCanvases: HTMLCanvasElement[];
  /** Rapid WebGL context losses since the last stable period. Used to detect a
   * thrash loop (context lost immediately + repeatedly) and stop re-attaching. */
  webglLossCount: number;
  /** performance.now() of the most recent context loss, for the stability reset. */
  webglLastLossAt: number;
  /** Once true, this slot stays on the DOM renderer for good (WebGL proved
   * unstable here) — no more re-attach attempts. */
  webglGaveUp: boolean;
  currentLeafId: number | null;
  oscDisposers: (() => void)[];
  observer: ResizeObserver | null;
  fitTimer: ReturnType<typeof setTimeout> | null;
  ptyTimer: ReturnType<typeof setTimeout> | null;
  /** Grace timer started when the slot is parked; fires reapParkedSlot. */
  reapTimer: ReturnType<typeof setTimeout> | null;
  unhideRaf: number | null;
  lastCols: number;
  lastRows: number;
  lastW: number;
  lastH: number;
  lastUsedAt: number;
};

const slots: Slot[] = [];
// Monotonic — slot ids are never reused even after a reaped slot is spliced
// out of the pool, so `data-nexis-slot` stays unambiguous in DOM snapshots.
let nextSlotId = 0;
let recyclerEl: HTMLDivElement | null = null;
let adapter: SlotAdapter | null = null;

// Input tracking for terminal suggestions (keyed by leafId)
const inputBuffers = new Map<number, string>();
const inputTimers = new Map<number, ReturnType<typeof setTimeout>>();
const activeSuggestions = new Map<number, string>();

export function setActiveSuggestion(leafId: number, text: string): void {
  activeSuggestions.set(leafId, text);
}
export function clearActiveSuggestion(leafId: number): void {
  activeSuggestions.delete(leafId);
}

function applyInputData(current: string, data: string): string {
  let result = current;
  let i = 0;
  while (i < data.length) {
    const c = data[i];
    if (c === "\r" || c === "\n") {
      result = "";
    } else if (c === "\x03" || c === "\x15") {
      result = "";
    } else if (c === "\x7f" || c === "\x08") {
      result = result.slice(0, -1);
    } else if (c === "\x1b") {
      i++;
      if (i < data.length && (data[i] === "[" || data[i] === "O")) {
        i++;
        while (i < data.length && !/[A-Za-z~]/.test(data[i])) i++;
        // Up/down arrow = navigating history, reset tracking
        if (i < data.length && (data[i] === "A" || data[i] === "B")) result = "";
      }
    } else if (c >= " ") {
      result += c;
    }
    i++;
  }
  return result;
}

function trackInput(leafId: number, data: string, slot: Slot): void {
  if (isAltScreen(slot)) return;
  const current = inputBuffers.get(leafId) ?? "";
  const next = applyInputData(current, data);
  activeSuggestions.delete(leafId);
  inputBuffers.set(leafId, next);
  const timer = inputTimers.get(leafId);
  if (timer) clearTimeout(timer);
  if (next.length < 2) {
    inputTimers.delete(leafId);
    window.dispatchEvent(
      new CustomEvent("nexis:input-cleared", { detail: { leafId } }),
    );
    return;
  }
  const t = setTimeout(() => {
    inputTimers.delete(leafId);
    if (slot.currentLeafId !== leafId) return;
    const container = slot.host.parentElement;
    if (!container) return;
    const cols = slot.term.cols || 80;
    const rows = slot.term.rows || 24;
    const cellW = container.clientWidth / cols;
    const cellH = container.clientHeight / rows;
    const cx = slot.term.buffer.active.cursorX;
    const cy = slot.term.buffer.active.cursorY;
    window.dispatchEvent(
      new CustomEvent("nexis:input-updated", {
        detail: { leafId, input: next, x: cx * cellW, y: cy * cellH },
      }),
    );
  }, 150);
  inputTimers.set(leafId, t);
}

// Re-focus the active terminal slot whenever the Tauri window regains OS
// focus. On Windows, the WebView may receive the OS activation event AFTER
// React's initial effects + scheduleUnhide RAFs have already run, so the
// first term.focus() call silently fails (focus returns to document.body).
// This handler fires once per window-focus transition and re-applies focus.
if (typeof window !== "undefined") {
  window.addEventListener("focus", () => {
    for (const slot of slots) {
      if (
        slot.currentLeafId !== null &&
        (adapter?.isLeafFocused(slot.currentLeafId) ?? false)
      ) {
        slot.term.focus();
        break;
      }
    }
  });
}

export function configureRendererPool(a: SlotAdapter): void {
  adapter = a;
}

export function forEachSlot(fn: (slot: Slot) => void): void {
  for (const s of slots) fn(s);
}

export function poolSize(): number {
  return slots.length;
}

function getRecycler(): HTMLDivElement {
  if (recyclerEl && recyclerEl.isConnected) return recyclerEl;
  const el = document.createElement("div");
  el.setAttribute("data-nexis-recycler", "");
  el.style.cssText =
    "position:fixed;left:-99999px;top:-99999px;width:1024px;height:768px;overflow:hidden;pointer-events:none;contain:strict;";
  document.body.appendChild(el);
  recyclerEl = el;
  return el;
}

function termOptions() {
  const prefs = usePreferencesStore.getState();
  return {
    fontFamily: prefs.terminalFontFamily || detectMonoFontFamily(),
    letterSpacing: prefs.terminalLetterSpacing,
    fontSize: Math.max(4, Math.round(prefs.terminalFontSize * prefs.zoomLevel)),
    theme: buildTerminalTheme(),
    cursorBlink: prefs.terminalCursorBlink,
    cursorStyle: prefs.terminalCursorStyle,
    cursorInactiveStyle: "outline" as const,
    scrollback: prefs.terminalScrollback,
    allowProposedApi: true,
  };
}

function createSlot(): Slot {
  const term = new Terminal(termOptions());
  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();
  const serializeAddon = new SerializeAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(searchAddon);
  term.loadAddon(serializeAddon);
  term.loadAddon(
    new WebLinksAddon((_e, uri) => openUrl(uri).catch(console.error)),
  );

  const id = nextSlotId++;
  const host = document.createElement("div");
  host.style.cssText = "width:100%;height:100%;";
  host.setAttribute("data-nexis-slot", String(id));
  getRecycler().appendChild(host);
  term.open(host);

  const slot: Slot = {
    id,
    term,
    fitAddon,
    searchAddon,
    serializeAddon,
    host,
    webglAddon: null,
    webglCanvases: [],
    webglLossCount: 0,
    webglLastLossAt: 0,
    webglGaveUp: false,
    currentLeafId: null,
    oscDisposers: [],
    observer: null,
    fitTimer: null,
    ptyTimer: null,
    reapTimer: null,
    unhideRaf: null,
    lastCols: term.cols,
    lastRows: term.rows,
    lastW: 0,
    lastH: 0,
    lastUsedAt: 0,
  };

  attachWebgl(slot);

  term.attachCustomKeyEventHandler((event) => {
    const leafId = slot.currentLeafId;
    if (leafId === null) return false;
    const bridge = adapter?.resolveLeaf(leafId);
    if (!bridge) return true;

    // Accept inline suggestion on Tab when one is active.
    if (
      event.type === "keydown" &&
      event.key === "Tab" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      const sug = activeSuggestions.get(leafId);
      if (sug) {
        event.preventDefault();
        bridge.writeToPty(sug);
        activeSuggestions.delete(leafId);
        const prev = inputBuffers.get(leafId) ?? "";
        inputBuffers.set(leafId, prev + sug);
        window.dispatchEvent(
          new CustomEvent("nexis:suggestion-accepted", { detail: { leafId } }),
        );
        return false;
      }
    }

    // Intercept Ctrl+R before it reaches the PTY so we can show the history
    // overlay. Dispatch a DOM custom event that the React tree can listen to.
    if (
      event.type === "keydown" &&
      event.key === "r" &&
      event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      window.dispatchEvent(
        new CustomEvent("nexis:history-open", { detail: { leafId } }),
      );
      return false;
    }

    const wordNavigation = terminalWordNavigationSequence(event);
    if (wordNavigation) {
      event.preventDefault();
      if (event.type === "keydown") bridge.writeToPty(wordNavigation);
      return false;
    }
    if (isCtrlBackspace(event)) {
      event.preventDefault();
      if (event.type === "keydown") bridge.writeToPty("\x17");
      return false;
    }
    if (isShiftEnter(event)) {
      event.preventDefault();
      if (event.type === "keydown") bridge.writeToPty("\x1b\r");
      return false;
    }
    return true;
  });

  term.onData((data) => {
    const leafId = slot.currentLeafId;
    if (leafId === null) return;
    adapter?.resolveLeaf(leafId)?.writeToPty(data);
    trackInput(leafId, data, slot);
  });

  slots.push(slot);
  return slot;
}

type PickResult = { slot: Slot; previousLeafId: number | null };

function isAltScreen(s: Slot): boolean {
  try {
    return s.term.buffer.active.type === "alternate";
  } catch {
    return false;
  }
}

function pickSlotFor(leafId: number): PickResult {
  const free = slots.find((s) => s.currentLeafId === null);
  if (free) return { slot: free, previousLeafId: null };
  if (slots.length < POOL_MAX_SIZE)
    return { slot: createSlot(), previousLeafId: null };

  let best: Slot | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const s of slots) {
    if (s.currentLeafId === leafId) return { slot: s, previousLeafId: null };
    const focused =
      s.currentLeafId !== null &&
      (adapter?.isLeafFocused(s.currentLeafId) ?? false);
    const score =
      (isAltScreen(s) ? 100 : 0) + (focused ? 10 : 0) + s.lastUsedAt / 1e12;
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  const chosen = best!;
  return { slot: chosen, previousLeafId: chosen.currentLeafId };
}

export type AcquireParams = {
  leafId: number;
  container: HTMLDivElement;
  snapshot: string | null;
  // True if the slot was in alt-screen mode (TUI like vim, htop, dofek)
  // at the time it was released. When set, bindSlot skips ring replay
  // and kicks SIGWINCH so the TUI repaints from scratch.
  altScreen: boolean;
  drainRing: (write: (bytes: Uint8Array) => void) => void;
  shellExited: boolean;
  searchQuery: string | null;
  cols: number;
  rows: number;
  registerOsc: (term: Terminal) => (() => void)[];
  onSearchReady: (addon: SearchAddon) => void;
};

export function acquireSlot(params: AcquireParams): Slot {
  const existing = slots.find((s) => s.currentLeafId === params.leafId);
  if (existing) {
    rewireSlot(existing, params);
    return existing;
  }

  const pick = pickSlotFor(params.leafId);
  if (pick.previousLeafId !== null) {
    adapter?.evictLeaf(pick.previousLeafId);
  }
  if (
    pick.slot.currentLeafId !== null &&
    pick.slot.currentLeafId !== params.leafId
  ) {
    detachSlotFromLeaf(pick.slot);
  }
  bindSlot(pick.slot, params);
  return pick.slot;
}

function bindSlot(slot: Slot, p: AcquireParams): void {
  slot.currentLeafId = p.leafId;
  slot.lastUsedAt = performance.now();
  // Start fresh input tracking for the new leaf
  inputBuffers.delete(p.leafId);
  activeSuggestions.delete(p.leafId);

  // Slot is live again: cancel any pending reap and restore WebGL if it was
  // reaped while parked (attachWebgl no-ops when already attached, when the
  // pref is off, or when this slot gave up on WebGL).
  cancelReap(slot);
  attachWebgl(slot);

  cancelPendingUnhide(slot);
  slot.host.style.visibility = "hidden";

  if (slot.host.parentNode !== p.container) {
    p.container.appendChild(slot.host);
  }

  slot.term.options.disableStdin = p.shellExited;
  slot.term.clear();
  slot.term.reset();

  if (
    p.cols > 0 &&
    p.rows > 0 &&
    (slot.term.cols !== p.cols || slot.term.rows !== p.rows)
  ) {
    slot.term.resize(p.cols, p.rows);
  }

  if (p.snapshot) {
    try {
      slot.term.write(p.snapshot);
    } catch (e) {
      console.warn("[nexis] snapshot replay failed:", e);
    }
  }
  if (p.altScreen) {
    // Discard the dormant ring. TUI output is incremental cursor-positioned
    // updates that can't be replayed coherently on top of a stale snapshot
    // — see the SIGWINCH kick below, which makes the TUI redraw from scratch.
    p.drainRing(() => {});
  } else {
    p.drainRing((bytes) => slot.term.write(bytes));
  }
  try {
    slot.term.write("\x1b[?25h");
  } catch {}

  for (const d of slot.oscDisposers) {
    try {
      d();
    } catch {}
  }
  slot.oscDisposers = p.registerOsc(slot.term);

  setupResizeObserver(slot, p);
  slot.fitAddon.fit();
  slot.lastCols = slot.term.cols;
  slot.lastRows = slot.term.rows;
  slot.lastW = p.container.clientWidth;
  slot.lastH = p.container.clientHeight;
  if (slot.lastCols !== p.cols || slot.lastRows !== p.rows) {
    // resizePty updates session.cols/rows + pty backend; no separate scope call.
    adapter?.resolveLeaf(p.leafId)?.resizePty(slot.lastCols, slot.lastRows);
  }

  if (p.searchQuery) {
    try {
      slot.searchAddon.findNext(p.searchQuery);
    } catch {}
  }

  applyCursorBlinkOnSlot(slot, adapter?.isLeafFocused(p.leafId) ?? false);

  if (p.altScreen && !p.shellExited) {
    adapter?.resolveLeaf(p.leafId)?.kickPty(slot.term.cols, slot.term.rows);
  }

  scheduleUnhide(slot);

  p.onSearchReady(slot.searchAddon);
}

function scheduleUnhide(slot: Slot): void {
  slot.unhideRaf = requestAnimationFrame(() => {
    slot.unhideRaf = requestAnimationFrame(() => {
      slot.unhideRaf = null;
      slot.host.style.visibility = "";
      const leafId = slot.currentLeafId;
      if (leafId !== null && adapter?.isLeafFocused(leafId)) {
        slot.term.focus();
      }
    });
  });
}

function cancelPendingUnhide(slot: Slot): void {
  if (slot.unhideRaf !== null) {
    cancelAnimationFrame(slot.unhideRaf);
    slot.unhideRaf = null;
  }
}

function rewireSlot(slot: Slot, p: AcquireParams): void {
  slot.lastUsedAt = performance.now();
  if (slot.host.parentNode !== p.container) {
    p.container.appendChild(slot.host);
  }
  setupResizeObserver(slot, p);
  slot.fitAddon.fit();
  slot.lastW = p.container.clientWidth;
  slot.lastH = p.container.clientHeight;
  if (slot.term.cols !== p.cols || slot.term.rows !== p.rows) {
    adapter?.resolveLeaf(p.leafId)?.resizePty(slot.term.cols, slot.term.rows);
  }
  slot.lastCols = slot.term.cols;
  slot.lastRows = slot.term.rows;
  p.onSearchReady(slot.searchAddon);
}

function setupResizeObserver(slot: Slot, p: AcquireParams): void {
  slot.observer?.disconnect();
  if (slot.fitTimer) clearTimeout(slot.fitTimer);
  if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
  slot.fitTimer = null;
  slot.ptyTimer = null;

  const container = p.container;
  const flushPty = () => {
    slot.ptyTimer = null;
    if (slot.currentLeafId !== p.leafId) return;
    if (slot.term.cols === slot.lastCols && slot.term.rows === slot.lastRows)
      return;
    slot.lastCols = slot.term.cols;
    slot.lastRows = slot.term.rows;
    adapter?.resolveLeaf(p.leafId)?.resizePty(slot.lastCols, slot.lastRows);
  };

  slot.observer = new ResizeObserver(() => {
    if (slot.fitTimer) clearTimeout(slot.fitTimer);
    slot.fitTimer = setTimeout(() => {
      slot.fitTimer = null;
      if (slot.currentLeafId !== p.leafId) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === slot.lastW && h === slot.lastH) return;
      slot.lastW = w;
      slot.lastH = h;
      slot.fitAddon.fit();
      if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
      slot.ptyTimer = setTimeout(flushPty, PTY_RESIZE_DEBOUNCE_MS);
    }, FIT_DEBOUNCE_MS);
  });
  slot.observer.observe(container);
}

export type SerializeOutput = {
  snapshot: string | null;
  cols: number;
  rows: number;
  altScreen: boolean;
};

export function releaseSlot(leafId: number): SerializeOutput | null {
  const slot = slots.find((s) => s.currentLeafId === leafId);
  if (!slot) return null;
  const out = serializeSlot(slot);
  detachSlotFromLeaf(slot);
  return out;
}

function serializeSlot(slot: Slot): SerializeOutput {
  let snapshot: string | null = null;
  try {
    const cap = Math.min(
      SNAPSHOT_SCROLLBACK_CAP,
      usePreferencesStore.getState().terminalScrollback,
    );
    snapshot = slot.serializeAddon.serialize({ scrollback: cap });
  } catch (e) {
    console.warn("[nexis] serialize failed:", e);
  }
  return {
    snapshot,
    cols: slot.term.cols,
    rows: slot.term.rows,
    altScreen: isAltScreen(slot),
  };
}

function detachSlotFromLeaf(slot: Slot): void {
  // Clean up input tracking state for the departing leaf
  if (slot.currentLeafId !== null) {
    const leavingId = slot.currentLeafId;
    const t = inputTimers.get(leavingId);
    if (t) clearTimeout(t);
    inputTimers.delete(leavingId);
    inputBuffers.delete(leavingId);
    activeSuggestions.delete(leavingId);
  }

  for (const d of slot.oscDisposers) {
    try {
      d();
    } catch {}
  }
  slot.oscDisposers = [];

  slot.observer?.disconnect();
  slot.observer = null;
  if (slot.fitTimer) clearTimeout(slot.fitTimer);
  if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
  slot.fitTimer = null;
  slot.ptyTimer = null;

  cancelPendingUnhide(slot);
  slot.host.style.visibility = "";

  if (slot.host.parentNode !== getRecycler()) {
    getRecycler().appendChild(slot.host);
  }

  slot.currentLeafId = null;
  slot.lastUsedAt = performance.now();
  scheduleReap(slot);
}

function scheduleReap(slot: Slot): void {
  cancelReap(slot);
  slot.reapTimer = setTimeout(() => {
    slot.reapTimer = null;
    reapParkedSlot(slot);
  }, SLOT_REAP_GRACE_MS);
}

function cancelReap(slot: Slot): void {
  if (slot.reapTimer !== null) {
    clearTimeout(slot.reapTimer);
    slot.reapTimer = null;
  }
}

/**
 * Grace expired on a parked slot. Release its GL context (a hidden slot never
 * needs GPU frames; adoption re-attaches), then dispose grace-expired parked
 * slots beyond the warm set entirely — xterm buffers, host DOM, everything.
 *
 * This goes through disposeSlotWebgl, the same deliberate-teardown path as
 * the settings toggle: it never counts toward webglLossCount/webglGaveUp
 * (the 1.20.5 thrash heuristic is for *involuntary* losses only).
 */
function reapParkedSlot(slot: Slot): void {
  if (slot.currentLeafId !== null) return; // adopted since; nothing to reap
  disposeSlotWebgl(slot);
  const expired = slots.filter(
    (s) => s.currentLeafId === null && s.reapTimer === null,
  );
  expired.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  for (const victim of expired.slice(WARM_PARKED_SLOTS)) {
    disposeSlotEntirely(victim);
  }
}

function disposeSlotEntirely(slot: Slot): void {
  cancelReap(slot);
  disposeSlotWebgl(slot);
  cancelPendingUnhide(slot);
  slot.observer?.disconnect();
  slot.observer = null;
  if (slot.fitTimer) clearTimeout(slot.fitTimer);
  if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
  slot.fitTimer = null;
  slot.ptyTimer = null;
  for (const d of slot.oscDisposers) {
    try {
      d();
    } catch {}
  }
  slot.oscDisposers = [];
  try {
    slot.term.dispose();
  } catch (e) {
    console.warn("[nexis] slot dispose failed:", e);
  }
  slot.host.remove();
  const i = slots.indexOf(slot);
  if (i >= 0) slots.splice(i, 1);
}

const WEBGL_RECOVERY_DELAY_MS = 250;
/** Rapid context losses before we give up on WebGL for a slot and stay on the
 * DOM renderer. Some WebKitGTK + NVIDIA setups lose the context immediately and
 * repeatedly; re-attaching each time thrashes the terminal between GPU and DOM
 * (~4×/s) — far laggier than just using the DOM renderer. */
const WEBGL_MAX_LOSSES = 3;
/** If a slot goes this long without a context loss, treat WebGL as stable again
 * and reset its loss counter, so a genuine one-off later (sleep/wake, GPU reset)
 * still gets a fresh recovery attempt rather than counting toward the cap. */
const WEBGL_STABILITY_RESET_MS = 60_000;

/**
 * Lazy import of the WebGL addon (~110 KB GPU pipeline). vite.config.ts
 * splits it into its own chunk precisely so the terminal doesn't pull it in
 * upfront — a static import here re-eagered it into the startup preload set.
 * The pre-check flags (webglAddon/webglGaveUp/pref) are re-validated after
 * the await in attachWebgl, so a toggle during the load can't double-attach.
 */
let webglModule: Promise<typeof import("@xterm/addon-webgl")> | null = null;
function loadWebglAddon(): Promise<typeof import("@xterm/addon-webgl")> {
  webglModule ??= import("@xterm/addon-webgl").catch((e) => {
    webglModule = null;
    throw e;
  });
  return webglModule;
}

function attachWebgl(slot: Slot): void {
  if (slot.webglAddon || !slot.term.element) return;
  if (slot.webglGaveUp) return;
  if (!usePreferencesStore.getState().terminalWebglEnabled) return;
  loadWebglAddon()
    .then(({ WebglAddon }) => attachWebglWith(slot, WebglAddon))
    .catch((e) => console.warn("[nexis-webgl] addon load failed:", e));
}

function attachWebglWith(
  slot: Slot,
  WebglAddon: typeof import("@xterm/addon-webgl").WebglAddon,
): void {
  // Re-check: state may have changed while the chunk loaded.
  if (slot.webglAddon || !slot.term.element) return;
  if (slot.webglGaveUp) return;
  if (!usePreferencesStore.getState().terminalWebglEnabled) return;
  const elem = slot.term.element;
  const before = new Set<HTMLCanvasElement>(
    elem.querySelectorAll<HTMLCanvasElement>("canvas"),
  );
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      // Capture this addon's canvases before detaching so we can hard-release
      // them — otherwise the abandoned canvas keeps painting its last frame
      // (a frozen ghost cursor) on top of the DOM renderer, and leaks per loss.
      let canvases: HTMLCanvasElement[] = [];
      if (slot.webglAddon === webgl) {
        canvases = slot.webglCanvases;
        slot.webglAddon = null;
        slot.webglCanvases = [];
      }
      hardTeardownWebgl(webgl, canvases);
      // Count losses to tell a one-off (sleep/wake, GPU reset) apart from a
      // thrash loop. If WebGL was stable for a while, this is fresh — reset the
      // counter so the one-off still gets a recovery attempt.
      const now = performance.now();
      if (now - slot.webglLastLossAt > WEBGL_STABILITY_RESET_MS) {
        slot.webglLossCount = 0;
      }
      slot.webglLastLossAt = now;
      slot.webglLossCount += 1;
      // Repeated rapid losses → WebGL is unstable on this machine. Stop the
      // re-attach thrash and stay on the DOM renderer for good (this slot).
      if (slot.webglLossCount >= WEBGL_MAX_LOSSES) {
        slot.webglGaveUp = true;
        // Force the DOM renderer to repaint every row now that the GPU layer is
        // gone, so the cursor and cells draw clean instead of inheriting stale
        // state from the dead WebGL frame.
        try {
          slot.term.refresh(0, slot.term.rows - 1);
        } catch {}
        console.warn(
          "[nexis-webgl] repeated context loss — staying on DOM renderer",
        );
        return;
      }
      // Recovery: WebKit may transiently lose contexts on sleep/wake or GPU
      // reset; without re-attach the slot would silently fall back to DOM
      // forever. Defer past WebKit's reset window before retrying.
      setTimeout(() => {
        if (slot.webglAddon) return;
        if (slot.webglGaveUp) return;
        if (!usePreferencesStore.getState().terminalWebglEnabled) return;
        attachWebgl(slot);
      }, WEBGL_RECOVERY_DELAY_MS);
    });
    slot.term.loadAddon(webgl);
    const after = elem.querySelectorAll<HTMLCanvasElement>("canvas");
    const added: HTMLCanvasElement[] = [];
    for (const c of after) if (!before.has(c)) added.push(c);
    slot.webglAddon = webgl;
    slot.webglCanvases = added;
  } catch (e) {
    console.warn("[nexis-webgl] unavailable:", e);
  }
}

/**
 * Fully tear down a WebGL addon and the canvases it added: lose each GL context
 * and zero its dimensions (so a dead/frozen GPU layer can't sit over the DOM
 * renderer and leave a ghost cursor), dispose the addon, then null its internal
 * renderer refs to drop the dead context for GC. Shared by the manual toggle-off
 * path and the context-loss handler — both must clean up identically, or a
 * context-loss fallback leaves the abandoned canvas painting stale pixels.
 */
function hardTeardownWebgl(
  addon: WebglAddon,
  canvases: HTMLCanvasElement[],
): void {
  for (const canvas of canvases) releaseCanvasContext(canvas);
  try {
    addon.dispose();
  } catch (e) {
    console.warn("[nexis-webgl] dispose failed:", e);
  }
  try {
    const r = (
      addon as unknown as { _renderer?: Record<string, unknown> | null }
    )._renderer;
    if (r) {
      r._canvas = null;
      r._gl = null;
      r._charAtlas = null;
      r._atlas = null;
    }
    (
      addon as unknown as { _renderer?: unknown; _renderService?: unknown }
    )._renderer = null;
    (
      addon as unknown as { _renderer?: unknown; _renderService?: unknown }
    )._renderService = null;
  } catch {}
}

function disposeSlotWebgl(slot: Slot): void {
  if (!slot.webglAddon) return;
  const addon = slot.webglAddon;
  const canvases = slot.webglCanvases;
  slot.webglCanvases = [];
  slot.webglAddon = null;
  hardTeardownWebgl(addon, canvases);
}

function releaseCanvasContext(canvas: HTMLCanvasElement): void {
  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
  } catch {}
  if (!gl) {
    try {
      gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
    } catch {}
  }
  if (gl) {
    try {
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext && !gl.isContextLost()) ext.loseContext();
    } catch {}
  }
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {}
}

export function applyWebglPreference(enabled: boolean): void {
  for (const slot of slots) {
    if (enabled) {
      // Explicit user opt-in clears an earlier auto-give-up so WebGL gets a
      // fresh chance (and its loss counter restarts from clean).
      slot.webglGaveUp = false;
      slot.webglLossCount = 0;
      // Skip grace-expired parked slots: their GL context was deliberately
      // reaped, and re-attaching here would resurrect it with no reap timer
      // left to collect it. Adoption re-attaches WebGL anyway.
      const reaped = slot.currentLeafId === null && slot.reapTimer === null;
      if (!slot.webglAddon && !reaped) attachWebgl(slot);
    } else if (slot.webglAddon) {
      disposeSlotWebgl(slot);
    }
  }
}

export function applyFontSize(size: number): void {
  for (const slot of slots) {
    if (slot.term.options.fontSize === size) continue;
    slot.term.options.fontSize = size;
    slot.fitAddon.fit();
    if (slot.currentLeafId !== null) {
      slot.lastCols = slot.term.cols;
      slot.lastRows = slot.term.rows;
      const bridge = adapter?.resolveLeaf(slot.currentLeafId);
      bridge?.resizePty(slot.term.cols, slot.term.rows);
    }
  }
}

export function applyLetterSpacing(spacing: number): void {
  for (const slot of slots) {
    if (slot.term.options.letterSpacing === spacing) continue;
    slot.term.options.letterSpacing = spacing;
    slot.fitAddon.fit();
  }
}

export function applyFontFamily(family: string): void {
  const resolved = family || detectMonoFontFamily();
  for (const slot of slots) {
    if (slot.term.options.fontFamily === resolved) continue;
    slot.term.options.fontFamily = resolved;
    slot.fitAddon.fit();
    if (slot.currentLeafId !== null) {
      slot.lastCols = slot.term.cols;
      slot.lastRows = slot.term.rows;
      const bridge = adapter?.resolveLeaf(slot.currentLeafId);
      bridge?.resizePty(slot.term.cols, slot.term.rows);
    }
  }
}

export function applyScrollback(value: number): void {
  for (const slot of slots) {
    if (slot.term.options.scrollback === value) continue;
    slot.term.options.scrollback = value;
  }
}

export function applyCursorStyle(
  style: "bar" | "block" | "underline",
): void {
  for (const slot of slots) {
    if (slot.term.options.cursorStyle === style) continue;
    slot.term.options.cursorStyle = style;
  }
}

export function applyCursorBlink(blink: boolean): void {
  for (const slot of slots) {
    if (slot.term.options.cursorBlink === blink) continue;
    slot.term.options.cursorBlink = blink;
  }
}

export function applyTheme(): void {
  const theme = buildTerminalTheme();
  for (const slot of slots) {
    slot.term.options.theme = theme;
  }
}

export function focusSlot(leafId: number): void {
  const slot = slots.find((s) => s.currentLeafId === leafId);
  slot?.term.focus();
}

export function setSlotFocused(leafId: number, focused: boolean): void {
  const slot = slots.find((s) => s.currentLeafId === leafId);
  if (!slot) return;
  applyCursorBlinkOnSlot(slot, focused);
}

function applyCursorBlinkOnSlot(slot: Slot, focused: boolean): void {
  const desired = focused;
  if (slot.term.options.cursorBlink === desired) return;
  slot.term.options.cursorBlink = desired;
}

export function getSlotForLeaf(leafId: number): Slot | null {
  return slots.find((s) => s.currentLeafId === leafId) ?? null;
}

/** Write data directly into the PTY for a given leaf. Used by overlays. */
export function writeToLeaf(leafId: number, data: string): void {
  adapter?.resolveLeaf(leafId)?.writeToPty(data);
}

function isCtrlBackspace(e: KeyboardEvent): boolean {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isMac = /Mac|iPhone|iPad/.test(ua);
  const mod = isMac ? e.metaKey : e.ctrlKey;
  return mod && (e.key === "Backspace" || e.code === "Backspace");
}

function isShiftEnter(e: KeyboardEvent): boolean {
  return (
    e.key === "Enter" && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey
  );
}
