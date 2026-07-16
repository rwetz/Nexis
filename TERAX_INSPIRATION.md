# Terax inspiration notes — upstream survey & optimization research

Research date: 2026-07-15. Upstream: [crynta/terax-ai](https://github.com/crynta/terax-ai) at
**v0.8.5** (2026-07-10), ~8.5k stars, active (550 commits on main, releases every 1–3 weeks).
Nexis forked from terax and has since diverged heavily; this survey covers upstream releases
v0.6.4 → v0.8.5 plus the perf-relevant issues and PRs behind them.

Two halves: (1) what upstream shipped that's worth adopting, (2) how optimized terax actually is
on Linux/Windows and what that implies for Nexis. Perf/robustness action items are mirrored in
`ROADMAP.md` (hardening backlog); feature adoption is a product call and stays in this file only.

---

## Part 1 — What upstream shipped recently

Release timeline (items already present in Nexis omitted below the table):

| Version | Date | Highlights |
|---|---|---|
| 0.8.5 | 2026-07-10 | LSP depth + 13 languages, formatters w/ format-on-save, editor language override, branch checkout in SC panel |
| 0.8.2 | 2026-06-23 | terminal font weight setting, user-selectable default shell, word wrap |
| 0.8.1 | 2026-06-19 | OSC 52 clipboard, MRU Ctrl+Tab switcher (release-to-select), drag-to-reorder tabs, Groq + whisper.cpp STT |
| 0.8.0 | 2026-06-12 | **block-mode terminal**, Spaces (tab groups), command palette, zen mode, perf pass (#725), motion lib → native CSS (#710) |
| 0.7.x | 2026-05 | git graph, theme editor, backgrounds, MLX/Ollama, reasoning-block stripping, live FS watcher, security hardening |

A lot of 0.7.x–0.8.5 is parity with things Nexis already has (often earlier and deeper: DAP, LSP
refactorings, worktrees, conflict resolver, ML Lab, recording/LAN share have no upstream
equivalent). What follows is the delta that Nexis *lacks*.

### 1.1 Block-mode terminal — upstream disproved our renderer assumption ⚠️ read this one

Nexis's 1.20.1 changelog shipped the exit-status gutter as "the achievable slice of command
blocks — full Warp-style interactive blocks would need replacing the WebGL renderer." **Terax
0.8.0 (#726, #738) built full command blocks without replacing anything:**

- Built as a **layer over the existing renderer pool** — xterm.js + WebGL untouched, no second engine.
- Blocks are delimited by **OSC 133 markers** (which Nexis already parses for the exit gutter),
  driving per-command decorations: bottom-border marks colored by exit code + overview-ruler ticks.
- A **lightweight custom input bar** (plain input, no CodeMirror) replaces the shell prompt as the
  sole prompt UI; a PTY env flag (`TERAX_BLOCKS`) suppresses the native shell prompt in zsh.
- **xterm stdin is gated by OSC 133 state**: between commands, keystrokes go to the custom bar;
  once a command runs (or an alt-screen TUI is active) raw passthrough resumes — vim/htop/sudo work.
- Their unified bar doubles as the AI input — one input, shell or AI.

Known limitations to inherit knowingly: block tabs are single-pane, and the whole mode depends on
OSC 133 shell integration (Nexis already injects that via its shell profiles).

Nexis has every primitive this needs: OSC 133 handlers (`osc-handlers.ts`), the renderer pool,
shell-integration profiles, and an AI input bar. This is a heavy feature but no longer a
renderer-rewrite-sized one. Suggested first slice: decorations + block navigation only (no custom
input bar), which is pure frontend over existing markers.

### 1.2 Other features worth adopting

- **Spaces — persisted tab groups with drag-to-organize** (0.8.0 #766). Nexis persists tab/pane
  layout but has no grouping above tabs. Natural fit with the existing layout-persistence store.
- **OSC 52 clipboard handler** (0.8.1). Copy from ssh/tmux/vim straight to the system clipboard.
  Nexis has no OSC 52 support (grep confirms). Must go through the existing terminal OSC trust
  model — OSC 52 *read* should stay blocked (clipboard exfiltration), write gated per-session.
- **MRU Ctrl+Tab switcher with release-to-select** (0.8.1). Nexis's Ctrl+Tab is positional
  next-tab; an MRU overlay (hold Ctrl, tap Tab, release to commit) is the editor-grade version.
- **Confirmation before closing a tab with a running process** (0.8.0). Nexis closes silently;
  we already track child processes per session, so the check is cheap.
- **whisper.cpp speech-to-text** (0.8.1). Nexis voice input is OpenAI-only today. A whisper.cpp
  path makes voice fully offline — but per the ROADMAP hard limits, shell out to a user-installed
  binary (like Ollama/LM Studio), never embed the engine (size budget).
- **Zen mode** (0.8.0) — hide header + status bar. Cheap, pairs well with the borderless chrome.
- **Small settings wins** (0.8.2/0.8.5): terminal **font weight**, **user-selectable default
  shell** (Nexis hardcodes detection order), **editor language override** dropdown, **go-to-line**,
  and **branch checkout from the source-control panel** (Nexis can create but not switch).
- **Large-file editor mode + indent detection** (0.8.5 editor overhaul). Large-file mode is
  already in the ROADMAP backlog; upstream shipping it confirms the demand.

### 1.3 Watch list (upstream bugs that may exist in Nexis too)

- **#981 (open):** tmux content bleeds across panes after resize — xterm grid vs PTY winsize
  desync. Nexis debounces fit + `pty_resize`; worth a targeted tmux-resize test.
- **#1004 (merged 2026-07-15):** "preserve terminal response order". Upstream hit PTY
  write-ordering bugs — the class Nexis solved in 1.20.6 with the per-session writer thread.
  Verify device-query *replies* (DA/DSR/CPR, generated frontend-side) also route through the
  ordered writer path and can't interleave with user keystrokes.

---

## Part 2 — How optimized is terax on Linux/Windows?

Short verdict: **Nexis 1.20.5/1.20.6 is ahead on platform-specific optimization** (NVIDIA/DMABUF
fallback, backdrop-filter neutralization, main-thread IPC offload, startup chunk discipline —
none of which upstream has). Terax's perf work is concentrated in one place Nexis hasn't gone:
**the frontend renderer lifecycle**, done in the 0.8.0 perf pass (#725) after real user reports —
914 MB webview RSS (#238), input delay (#214), EGL launch failure on Linux (#105).

### 2.1 WebGL/slot reaping — the real gap ⚠️ highest-impact adoption

What terax does (#725): WebGL contexts attach **only to visible slots**; hidden idle slots are
reaped after a grace period → **one active GL context in steady state** (down from five). Idle
pool slots beyond a single warm slot are disposed entirely, freeing xterm buffers and DOM.

What Nexis does today (`src/modules/terminal/lib/rendererPool.ts`): `createSlot()` calls
`attachWebgl()` unconditionally; `POOL_MAX_SIZE = 5`; `detachSlotFromLeaf()` parks the slot in the
recycler with its xterm instance, DOM tree, **and live WebGL context** intact, forever. Open five
terminals once and the webview holds five GL contexts (texture atlases each) plus five detached
DOM trees for the rest of the session — the same failure shape as upstream's 914 MB issue. More
contexts also means more context-loss events on fragile drivers (the exact Linux/NVIDIA surface
1.20.5 fought).

Suggested design, adapted to Nexis's pool:
- On `detachSlotFromLeaf`: start a grace timer (~30 s). On expiry, dispose the WebGL addon only
  (slot falls back to the DOM renderer while parked) — keep **one** warm slot fully attached.
- Parked slots beyond the one warm slot: dispose the whole slot (xterm + host DOM) on expiry.
- On adopt/re-attach: re-run `attachWebgl` (already async-safe with post-await re-validation).
- Care: a deliberate teardown must **not** increment `webglLossCount` (don't let reaping trip the
  1.20.5 give-up heuristic), and the pitfall-guard tests around the pool must keep passing.

### 2.2 TUI keep-alive — Nexis is halfway there

Terax keeps alt-screen apps' grid buffers alive while hidden and repaints from the buffer on
return — no serialize round-trip, no SIGWINCH, no corrupted vim/htop. Nexis slots stay live while
in the pool (equivalent behavior), but on pool eviction (6th terminal) the victim is chosen by
LRU and *serialized* — lossy for alt-screen TUIs. Cheap fix: make eviction alt-screen-aware
(`isAltScreen` already exists) — prefer evicting non-TUI slots, and only serialize a TUI slot as
a last resort.

### 2.3 Motion library → native CSS animations

Terax replaced its motion library with native CSS (#710) in the same perf pass. Nexis went the
other direction in 1.20.1 (`motion` v12 + `lib/motion.ts` presets, ~15 importing files). On
WebKitGTK this matters: JS-driven animation burns main-thread time per frame and fights the
compositor, while CSS transitions/animations run compositor-side — and `motion` sits in the
startup bundle. Most Nexis uses are simple fades/slides/scale-ins that convert 1:1 to CSS.
Suggested: audit the 15 call sites; keep `motion` only if a layout animation genuinely needs FLIP,
otherwise drop the dependency (startup JS win + steadier frames on Linux).

### 2.4 Treat webview memory as a tracked number

Upstream's #238 (914 MB RSS) shows how this class of regression gets caught: a user measured it.
The ROADMAP already has the "opt-in memory self-report" backlog item — slot reaping (§2.1) is the
biggest single lever, and the self-report is how we'd prove it and keep it fixed. Consider adding
GL-context count and pool-slot count to that readout.

### 2.5 What Nexis already does better (keep, don't regress)

- **Linux:** NVIDIA-scoped DMABUF renderer fallback, theme-switch view-transition crash fix,
  `backdrop-filter` neutralization, WebGL context-loss give-up — upstream has none of these; their
  EGL issue (#105) was fixed case-by-case.
- **IPC:** heavy commands off the main thread + the ordered PTY writer thread (1.20.6). Upstream
  was still fixing PTY ordering in July 2026 (#1004).
- **Windows:** ConPTY lifecycle lock, `-Command` launch, `CREATE_NO_WINDOW` discipline with
  clippy/tripwire enforcement — Nexis-original hardening, ahead of upstream.
- **Build gates:** 10 MB binary budget, coverage floor, cargo-deny, modulepreload verification.

Nothing Windows-specific surfaced in terax's recent perf work beyond the generic renderer fixes —
their optimization story is renderer-lifecycle-first, platform-second; Nexis's is the inverse.
Adopting §2.1–2.3 closes the renderer-lifecycle side and leaves Nexis ahead on both.
