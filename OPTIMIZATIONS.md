# Optimization sweep — findings checklist

Sweep date: 2026-07-11 (Fable 5 pass). Each item: what's wrong, where, why it matters, and the suggested fix.
Ordering within each section is by impact-per-effort, best first. Check items off as they land — and per
CLAUDE.md, every user-facing fix from this list needs a `CHANGELOG.md` entry in the same commit.

**Status (2026-07-11, same-day implementation pass):** everything except 1.3, 2.5, 3.5, and 3.6 is
landed (see `[Unreleased]` in CHANGELOG.md). Measured result: startup modulepreload 2.8 MB → 2.1 MB;
main chunk 978 KB → 813 KB. Implementation notes where the fix deviated from the suggestion:
- 1.2 used a per-session writer thread + FIFO channel rather than an async command — a
  `spawn_blocking` per write could reorder rapid keystrokes; the channel preserves byte order and
  `pty_write` stays sync and non-blocking (enqueue only).
- 2.x uncovered a fourth leak while verifying the build: Rollup had colocated `tailwind-merge`/`clsx`
  (the `cn()` helper) *inside* the lazy streamdown chunk, keeping it in the preload set even after the
  `React.lazy` fix. `vite.config.ts` now pins those (plus Vite's preload/commonjs helper virtual
  modules) to a `ui-utils` chunk. Lesson: after any chunking change, verify with
  `grep modulepreload dist/index.html`, not just by reading the source.
- 3.2 landed the cheap fix (doc-identity memoization + memoized strips + rAF-coalesced scroll), not
  the full canvas rewrite — the wasted work is gone; canvas remains a nice-to-have below.
- `ml_install`/`ml_spawn` from the 1.1 table were left sync on inspection: they only block for process
  *creation* (pip/training output streams on dedicated threads), which is cheap.

Overall: the hot paths that were already known to be hot (PTY byte pipeline, renderer pool, Vite chunking,
git `spawn_blocking` + caching) are in genuinely good shape. The findings below are the paths that grew
around them.

---

## 1. Rust / Tauri backend

### 1.1 ~45 sync commands run on the main thread — including workspace-wide grep ⚠️ HIGHEST IMPACT
- [x] **Fix: mark heavy sync commands `#[tauri::command(async)]` (one-line change each) or convert to `async fn` + `spawn_blocking` like git already does.**

Tauri executes non-`async` commands **on the main thread**; only `async fn` commands go to the async
runtime. `src-tauri/src/modules/git/commands.rs` does this correctly (`async fn` + `spawn_blocking`),
but nearly everything else is a plain `pub fn`:

| Command | File | Worst case on main thread |
|---|---|---|
| `fs_grep` | `fs/grep.rs:53` | parallel walk + regex over an entire workspace |
| `fs_search`, `fs_list_files` | `fs/search.rs:52,153` | walk up to MAX_SCANNED entries |
| `fs_read_file`, `fs_read_file_ai`, `fs_write_file` | `fs/file.rs:196,356,251` | multi-MB file I/O |
| `fs_delete` | `fs/mutate.rs:64` | recursive delete (deleting `node_modules` freezes the app) |
| `fs_read_dir`, `list_subdirs` | `fs/tree.rs:34,109` | large-dir stat storm |
| `shell_session_open`, `shell_bg_spawn` | `shell/mod.rs:177,252` | process spawn latency |
| `read_shell_history`, `search_shell_history` | `shell/mod.rs:481,497` | read + scan a large history file |
| `ml_detect`, `ml_gpu_probe`, `ml_install`, `ml_spawn` | `ml.rs` | subprocess probes / installs |
| `wsl_home` | `workspace.rs:471` | spawns `wsl.exe` (slow on cold WSL) |
| `list_crash_reports` | `crash.rs:142` | directory scan |

The compounding failure: while any of these runs, **every other command queues behind it — including
`pty_write`**. A background `fs_grep` from the AI agent visibly stalls keystrokes in the terminal.
On Linux it also freezes the GTK event loop (window resize/close). Cheap commands that just lock a
map (`pty_resize`, `pty_close`, `dap_stop`, `lsp_notify`…) are fine to leave sync.

### 1.2 `pty_write` can block the main thread on a full PTY pipe
- [x] **Fix: make `pty_write` async (or route writes through a per-session writer thread with a bounded queue).**

`pty/mod.rs:83` — `pty_write` is sync (main thread, see 1.1) and takes the writer mutex, then does a
blocking `write_all` to the PTY master. If the child has stopped reading (Ctrl+S flow control, stopped
process, TUI busy) and the kernel pipe buffer fills, a large paste blocks **the whole app**, not just
that terminal. Repro: `sleep 999`, Ctrl+S, paste a few hundred KB.

### 1.3 Sync command audit tripwire
- [ ] **Optional: add a pitfall-style test asserting that commands in a known "heavy" list are `async`** (mirrors `pitfall_invariants.rs` style) so a future new command doesn't silently reintroduce 1.1.

---

## 2. Frontend — startup & bundle

Measured from the shipped `dist/`: **2.8 MB of JS is modulepreloaded at startup** (main 978 KB,
streamdown 482 KB, ai-sdk-shared 399 KB, xterm 380 KB, react 217 KB, index 194 KB, radix 130 KB,
motion 126 KB, xterm-webgl 110 KB, ai-openai 95 KB). Several chunks the Vite config *intends* to be
lazy got re-eagered by static imports:

### 2.1 `@ai-sdk/openai` pulled eagerly by the Whisper hook (~500 KB with ai-sdk-shared)
- [x] **Fix: `const { createOpenAI } = await import("@ai-sdk/openai")` inside the record/transcribe call.**

`modules/ai/lib/agent.ts:110` carefully lazy-imports the provider, but
`modules/ai/hooks/useWhisperRecording.ts:7` statically imports `createOpenAI`, defeating it. This is
why `ai-openai` + `ai-sdk-shared` are in the startup preload set.

### 2.2 `streamdown` (482 KB markdown pipeline) eager via ai-elements
- [x] **Fix: lazy-load the `Streamdown` renderer (`React.lazy` inside `MessageResponse`, or dynamic-import the module where messages first render).**

`components/ai-elements/message.tsx:31` statically imports `Streamdown`; message.tsx is reachable from
App via AiChat/AiPanel, so the entire remark/rehype/micromark stack loads before the first terminal
paints — even for users who never open the AI panel. (`modules/markdown/MarkdownPreviewPane.tsx` is
already behind `MarkdownStackLazy`, so this one import is the whole problem.)

### 2.3 `@xterm/addon-webgl` eager despite its dedicated chunk
- [x] **Fix: dynamic-import `WebglAddon` inside `attachWebgl()` (it's already fully async-tolerant — attach happens post-open and retries on a timer).**

`vite.config.ts:56` splits `xterm-webgl` into its own chunk explicitly "so the main terminal chunk
doesn't pull in the GPU pipeline upfront" — but `modules/terminal/lib/rendererPool.ts:15` statically
imports it, so it's preloaded anyway (visible in `dist/index.html`).

### 2.4 Heavy panels statically imported into `App.tsx` (bulk of the 978 KB main chunk)
- [x] **Fix: convert to `lazy()` + `Suspense` like MarkdownStack/NotebookStack/ImageStack already are.**

Candidates confirmed static in `app/App.tsx`: `MlPanel` (2,169 lines, `App.tsx:103`),
`SettingsDialog` + all settings sections incl. 957-line ModelsSection (`App.tsx:73`),
`DatabasePanel` (`App.tsx:88`), `DebuggerPanel` (`App.tsx:104`). Source control already has
`SourceControlPanelLazy` — follow that pattern. These are opened rarely relative to app launches;
lazy-loading them cuts main-chunk parse/compile on every startup.

### 2.5 Minor bundle notes
- [ ] `vscodeFolderIcons.json` (437 KB) is lazy ✅ but ships as a JS module — importing it via `fetch` + `JSON.parse` (or `import(..., { with: { type: "json" } })`) parses meaningfully faster than executing a 437 KB JS module.
- [ ] `icons` chunk (310 KB, hugeicons) is *not* preloaded ✅ — no action, just don't regress it into main.

---

## 3. Frontend — runtime / render

### 3.1 AI streaming: no throttle on `useChat` → per-token re-render of four subscribers
- [x] **Fix: pass `experimental_throttle: 50` (ms) to each `useChat` call.**

Consumers: `AgentRunBridge.tsx:69`, `AiMiniWindow.tsx:140`, `AiPanel.tsx:475,683`. Every stream part
re-renders all four, and worse, several `useMemo`s keyed on `messages` re-scan the **entire
conversation** per token:
- `AgentRunBridge.tsx:101` `approvalsPending` — full message+part scan
- `AgentRunBridge.tsx:146` `fileMutationFingerprint` — full scan (the effect behind it is guarded ✅, the scan itself is not)
- `AiPanel.tsx:113` `estimateTokens` in `ContextIndicator` — full scan, string-length math over every part

At 50–100 tokens/sec on a long conversation this is O(conversation) work × 4 components × token rate.
A 50 ms throttle cuts it ~5–10× with no visible latency change.

### 3.2 Editor Minimap: full document → React divs, 5×/sec + every scroll frame
- [x] **Landed the cheap fix: line extraction memoized on doc identity, strips in a `memo` component, scroll rAF-coalesced, idle ticks bail without re-render.**
- [ ] Nice-to-have: full `<canvas>` rewrite driven by a CodeMirror `updateListener` (drops the 200 ms interval and per-line DOM entirely).

`modules/editor/Minimap.tsx:22-66` — `getMinimapState` extracts **every line of the doc as a string
array** on a 200 ms interval *and* on every (unthrottled) scroll event, then `setState` re-renders one
`<div>` per line. A 10k-line file = 10k `doc.line(i)` calls + 10k-element DOM diff, 5×/sec while idle,
per scroll frame while scrolling. This is very likely the single biggest editor-side CPU sink.
Cheap intermediate fix if canvas is deferred: memoize `lines` on `view.state.doc` identity (docs are
immutable — same reference = skip), and rAF-throttle the scroll handler.

### 3.3 Animated backgrounds never pause (5 shader/canvas rAF loops)
- [x] **Fix: gate the rAF loop on `document.visibilitychange` + window blur (the `BackgroundImage` path in `SurfaceLayer.tsx:179` already models this with `useDocumentHidden`/`suspendAnimated` — the shader components just never got it).**
- [x] **DotField additionally: skip the frame entirely when at rest** (`engagement === 0`, no wave/sparkle, dots settled) instead of clearRect + redrawing every dot; hoist `createLinearGradient` out of the frame loop (`DotField.tsx:149`).

`Aurora.tsx`, `Threads.tsx`, `Particles.tsx`, `DarkVeil.tsx`, `DotField.tsx` — all run unconditional
`requestAnimationFrame` loops while mounted. On the RTX 4070/Wayland dev box this is invisible; on
laptops it's constant GPU burn while the app sits idle. DotField also runs a 50 Hz `setInterval`
(`DotField.tsx:123`) for mouse speed that could fold into the rAF tick.

### 3.4 MlPanel 1 Hz tick runs even when idle
- [x] **Fix: gate the interval on training-active** (`MlPanel.tsx:1505` — comment says "while training" but the effect has no condition).**

Minor, but it re-renders a 2,169-line component tree every second whenever the ML panel is open.

### 3.5 React Compiler (structural option)
- [ ] **Evaluate `babel-plugin-react-compiler` in the Vite react plugin.** React 19 is already in place; the codebase hand-memoizes well in hot spots but App.tsx (1,910 lines, ~28 useState) and the settings/panels tree would get automatic memoization everywhere. Medium risk (verify CodeMirror/xterm ref patterns), potentially large win for a UI that re-renders on terminal title/cwd churn. Run the healthcheck first: `npx react-compiler-healthcheck`.

### 3.6 File explorer refresh is 3 s polling
- [ ] **Consider: native FS watcher (`notify` crate) emitting a debounced `nexis://fs-changed` event, replacing the poll.** `FileExplorer.tsx:465` polls `tree.refresh` every 3 s while focused — correctly gated on focus/visibility ✅, but each poll re-runs sync `fs_read_dir` calls (main-thread, see 1.1) over expanded dirs. Weigh `notify` against the <10 MB binary budget (~200–300 KB); if rejected, at least this becomes cheap once 1.1 makes `fs_read_dir` async.

---

## 4. Verified healthy (no action — don't "fix" these)

- **PTY byte pipeline** (`session.rs`): coalesced flusher (4 ms), 16 KB reads, raw-bytes `Channel<Response>` (no JSON/base64), bounded backpressure, poison-recovery throughout. Leave as is.
- **Renderer pool** (`rendererPool.ts`): slot recycling, debounced fit (8 ms) vs PTY resize (256 ms), WebGL thrash detection with give-up + stability reset, serialize-on-release with scrollback cap.
- **Git backend**: `async` + `spawn_blocking`, output caching (`run_git`/`run_git_uncached`), `from_utf8_lossy`, `git_panel_snapshot` batching.
- **Zustand discipline**: no unstable-selector violations found anywhere (pitfall-14 tripwires are working).
- **Release profile**: `lto=fat`, `codegen-units=1`, `opt-level=s`, `panic=abort`, `strip` — appropriate for the binary budget.
- **Chat persistence**: debounced with flush-on-idle/unmount (`AgentRunBridge.tsx:92`).
- **AI provider chunking**: per-provider chunks + lazy import in `agent.ts` — correct except the two leaks in 2.1/2.2.
- **Compaction safety**: `safeJsonLength` guards circular tool output (pitfall 11).

---

## Suggested order of attack

1. **1.1** sync→async commands (mechanical, huge UX payoff: no more app-wide stalls)
2. **3.1** `experimental_throttle` on the four `useChat` calls (one-line each)
3. **2.1 + 2.2 + 2.3** un-eager the three leaked chunks (~1.1 MB off startup preload)
4. **3.2** Minimap rewrite (canvas + updateListener)
5. **2.4** lazy panels (MlPanel, SettingsDialog, DatabasePanel, DebuggerPanel)
6. **3.3** background pause-on-hidden/idle
7. **1.2** pty_write blocking, **3.4/3.6** small gates, **3.5** React Compiler evaluation
