# Changelog

All notable changes to Nexis. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/) (pre-`1.0`, minor bumps may include breaking changes).

## [Unreleased]

### Security
- **LAN sharing now requires the link, not just the network — plus a bind-interface picker and a persistent "Sharing on" pill.** The share server previously served the conversation or terminal to *anyone* who could reach the port, always on every interface (`0.0.0.0`). Four changes close this out:
  - **Tokenized links.** Every share session gets a fresh 128-bit token (webview CSPRNG); every route — the page, the `/stream` SSE feed, and the `/ws` WebSocket — rejects requests without `?k=<token>` with a 403, before revealing anything (not even whether it's a conversation or a terminal). The compare is constant-time Rust-side, and Rust re-validates the token shape (≥16 chars, alphanumeric-only) so a frontend bug can't silently start an unauthenticated server. Live pages embed the token in their WS/SSE URLs, so viewers just open the link. Loopback tests cover missing/wrong/prefix tokens on all three routes.
  - **Bind-interface picker.** "Visible on" in the Share panel: **All networks** (0.0.0.0, the old behavior, still the default), **LAN only** (binds just the primary LAN interface — not exposed on VPN/Docker/other networks), or **This device only** (127.0.0.1). The LAN IP comes from a new `http_share_lan_ip` command (UDP route-lookup trick — no packet leaves the machine), which also replaces the URL display's literal `192.168.x.x` placeholder: the panel now shows — and the copy button copies — the real, complete, tokenized URL.
  - **Sharing outlives the panel, and the status bar says so.** Share state moved from panel-local React state to a global store: switching sidebar views no longer silently kills the server (or the live push loop, which now runs at module level). In exchange, a red pulsing **"Sharing on" pill** sits in the status bar the whole time the server runs — whatever panel or pack is active — with the URL and scope in its tooltip; clicking it opens the Share panel to stop or manage. You can share, work elsewhere, and never *unknowingly* keep broadcasting.
  - **The initial page is now redacted too.** `redactSensitive()` previously covered live updates and the stream but not the very first HTML handed to `http_share_start` — the first thing a viewer downloads. It now takes the same pass, and the redaction tripwire in `pitfall-guards.test.ts` grew a third assertion so this path stays covered.

  This is the read-only-auth half of the roadmap's multiplayer-terminal story; remote *input* still needs its own consent model and stays out.
- **AI command audit log.** Every shell command the agent runs — and every one the safety layer blocks — is appended as a JSON line to `{data}/nexis/ai-command-audit.log`: timestamp (stamped Rust-side), command, cwd, exit code/timeout for `bash_run`, spawn handle for `bash_background`, kills, and block reasons. The file is append-only from the app's side (never rewritten or truncated; entries themselves cap at 8 KiB), auditing is fire-and-forget so it can never break or slow a tool call, and **Settings → General → Debug → "AI command audit log" → Reveal** opens its location. The roadmap's companion idea — "require approval for commands matching *pattern*" — is deliberately not built: both agent shell tools already require approval unconditionally, so a pattern list would only matter if an auto-approve mode ever ships; noted on the roadmap for that day.
- **Secret redaction now covers the LAN share stream and saved recordings.** The `redactSensitive()` scrubber (OpenAI/Anthropic/AWS/GitHub/Google/Slack/Stripe key shapes, JWTs, `Bearer` headers, `*_PASSWORD/SECRET/TOKEN=` assignments) previously guarded only the AI-context path; it now also runs on everything the LAN share server emits (`http_share_update` HTML and the live SSE stream) and on every output event written into a `.cast` recording — the two surfaces that leave the machine, as remote viewers and bug-report attachments. A new tripwire in `pitfall-guards.test.ts` fails the build if either surface stops routing through the scrubber, and the scrubber itself gained a 20-case test suite (every pattern, false-positive checks, idempotence, and the documented fail-closed over-redaction of `PASSWORD_*`-named config values).

- **Webview `connect-src` no longer allows arbitrary HTTPS hosts.** The CSP's blanket `https:` in `connect-src` is now pinned to `https://api.github.com` (the update check, the webview's only legitimate remote fetch). Everything else already goes through the Rust proxy with its SSRF guards — AI providers via `ai_http_request/stream`, preview-port probes to `localhost` only — so any future or compromised frontend code can no longer silently exfiltrate via a direct `fetch` to an attacker host. Deliberately unchanged: `frame-src http: https:` stays, because the preview address bar intentionally loads user-typed sites in a sandboxed cross-origin iframe (no Tauri IPC access); tightening it is a product decision, not a hardening fix. Remote images in markdown remain blocked by the existing `img-src` (no `http:`/`https:`), which is the lock-down the hardening backlog asked for.

### Changed
- **Minimap rewritten as a canvas driven by a CodeMirror `updateListener` — the 200 ms poll is gone.** The minimap used to render one `<div>` per document line and refresh on an interval; on a 10k-line file that meant 10k DOM nodes diffed on a timer even when nothing changed. It's now a single `<canvas>` repainted (one `fillRect` per non-empty line, rAF-coalesced, DPR-aware) only when the document or geometry actually changes, delivered through a `minimapUpdateExtension` included in the editor's identity-stable extensions array. Scroll still only moves the viewport-indicator div — no repaint — and strip colors resolve from the container's computed foreground, so themes keep working with zero config. Idle cost is now exactly zero. (The cheap memoization half of this shipped in 1.20.6; this completes the rewrite the hardening backlog tracked.)

### Added
- **AI command search — natural language → command, in the terminal.** **Ctrl/Cmd+Shift+I** (or "AI command search" in the palette) floats a compact bar over the active terminal pane: describe what you want in plain English, Enter asks the configured provider (any BYOK/local model — the same `buildConfiguredLanguageModel` path as chat, with shell, OS, and the pane's current cwd in the prompt), and back comes one runnable command plus a one-line explanation. A second Enter — or the button — **inserts the command at the shell prompt; nothing is ever executed from the bar**, so the user's own Enter at the prompt is the confirmation step (the roadmap's "confirm before it goes to the shell", done structurally instead of with a dialog). That insert-only contract is enforced in the parser, not the UI: suggestions are rejected outright if multi-line or containing any control character (a stray `\r` in inserted text would execute without consent), multi-line fenced scripts are refused rather than truncated to a first line that would do something else, and over-long output is dropped. Commands the destructive-command heuristic flags get an inline ⚠ caution (not a block — nothing runs without the user); the model is prompted to decline destructive/ambiguous requests with an explanation instead of guessing, and a decline renders as prose, not an insertable command. Parser tolerates bare JSON, fenced JSON, JSON embedded in prose, single-command fences, and bare single-line replies (21 unit tests, including the control-character and truncation guarantees). No provider configured → the error state links to Settings → Models. The shortcut dispatches a window event (`nexis:terminal-ai-command`) answered by the visible focused pane — same decoupling as selections and the Explain chip.
- **Scoped auto-approve for read-only agent shell commands.** The tool-approval policies (Settings → Agents) grow a fourth option, offered only for `bash_run`: **"Auto-approve read-only"** (`auto-safe`). Eligible commands run without the approval pause — the chat shows a compact "Auto-approved · read-only" line with the command — and *everything else falls back to today's prompt*, unlike the pre-existing blanket "Auto-approve" (Warp's Yolo-mode shape, which remains available but now has a sane middle ground). Eligibility (`checkAutoApprove` in `ai/lib/security.ts`) is an allowlist, not a denylist: printable ASCII only (rejects homoglyph/bidi tricks wholesale), zero shell machinery (no pipes, redirects, substitutions, quoting, globs, `;`/`&` — nor `%`, because the Windows agent shell can be cmd.exe where `%VAR%` expands past any literal check), a curated set of read-only binaries (`ls`, `cat`, `head`, `tail`, `wc`, `stat`, `file`, `du`, `df`, `pwd`, `which`, `echo`, …), and git confined to read-only subcommands with the `-c`/`--git-dir` global-flag tricks structurally impossible (the token after `git` must itself be an allowlisted subcommand) and `--output*`/`--ext-diff`/`--textconv` denied. Every path-shaped argument — including `--flag=value` values and each segment of git's `rev:path` syntax, so `git show HEAD:.env` is as blocked as `cat .env` — must pass the same `checkReadable` secret-file guards the auto-approving fs read tools use; the mode can read nothing they couldn't already. Deliberately excluded: `bash_background` (a "read-only" daemon is a contradiction), recursive readers like `rg`/`grep`/`find` (they surface protected content from innocent starting points), `env`/`printenv` (the environment carries secrets), and user-editable patterns (an allowlist you can append `rm *` to isn't an allowlist — revisit only if real usage demands it). The audit log now annotates every `run`/`background` entry with how the gate was passed (`approval: "user" | "auto" | "auto-safe"`), completing the "pattern rules only alongside an auto-approve mode" plan from the audit-log release. Covered by ~100 unit cases plus fuzz properties (never throws; everything eligible also passes the destructive-command check; no eligible command names a path `checkReadable` refuses).
- **PTY input-ordering audit + tripwires — device-query replies verified unable to interleave with keystrokes.** The hardening backlog asked whether frontend-generated device-query replies (DA/DSR/CPR cursor reports, which xterm.js answers on the app's behalf) could interleave with user keystrokes on the PTY — the exact ordering-bug class upstream terax hit in July 2026 (their #1004). Verified immune by construction: xterm emits replies through the same `onData` stream as keystrokes, every write funnels through the single `pty_write` invoke in `pty-bridge.ts`, `pty_write` is a *sync* command (Tauri executes those on the main thread in IPC arrival order — async commands run concurrently and could reorder rapid writes), and it only enqueues to the per-session `nexis-pty-writer` FIFO channel that serializes bytes onto the PTY. Since every link is load-bearing and none would fail a test if quietly broken, the chain is now tripwired both sides: `pty_write_stays_sync_and_enqueue_only` in `src-tauri/tests/pitfall_invariants.rs` (stays sync, enqueues to `write_tx`, no `spawn_blocking`/`thread::spawn`/direct `write_all`) and a `pty_write`-confinement guard in `src/lib/pitfall-guards.test.ts` (no second invoke site, mirroring the existing `pty_open` guard).
- **"✦ Explain" on a failed command — one click sends the failure to the AI chat.** Commands that exit nonzero (already detected via the OSC 133 shell-integration markers that drive the red exit gutter) now grow a small right-anchored "✦ Explain" chip on their prompt line; clicking it attaches the command line, its output, the exit code, and the cwd it ran in as terminal context and auto-submits a fix-suggestion prompt to the AI chat (Warp's flagship AI affordance, built entirely on data Nexis already had). Capture happens at command-exit time from the buffer between the B/C markers and the cursor: output is tail-biased and capped (200 lines / 16 KB, `[… earlier output truncated …]` when cut, errors live at the end), cwd is read *before* the shell's post-command OSC 7 so a failed `cd` can't skew it, and the chip persists down the scrollback like the gutter bar so older failures stay clickable until they scroll out. Deliberate non-triggers: exit 130 (Ctrl+C is a cancel, not a failure), a bare Enter re-emitting the stale `$?` (zsh/bash precmd does this — the chip requires evidence a command actually ran), and shells without integration (no markers, no chip — same constraint as the gutter). On PowerShell, whose profile emits no `C` marker, the capture degrades gracefully: the input line is the command, everything below is treated as output. No AI provider configured → the click opens Settings → Models, matching every other AI entry point. Toggle: **Settings → General → "Explain failed commands with AI"** (`terminalExplainFailures`, default on, `writePref()`-synced). The terminal side only dispatches a `nexis:ai-explain-failure` window event — the same decoupling as selections — bridged into the composer in `App.tsx`; capture, guards, truncation, wrapped-row joining, and chip lifecycle are covered by nine new osc-handler tests.
- **Diagnostics bundle export.** **Settings → General → Debug → "Diagnostics bundle" → Export** writes `~/nexis-diagnostics-<unix>.zip` containing: app/OS versions, the settings JSON (passed through `redactSensitive()` frontend-side — the command never reads the raw store), the 5 newest log files and crash reports (last 512 KiB of each, tail-snapped to a UTF-8 boundary), and the newest terminal recording (≤4 MiB, already redacted at save). Everything stays local — the user attaches the file to a bug report themselves. The zip is produced by a ~100-line store-only writer instead of a zip crate: logs and JSON are small, and the <10 MB binary budget outweighs compressed bundles. Structure, CRC-32, and the UTF-8 tail-snap are unit-tested.
- **PTY thread watchdog — a stalled terminal now says so.** Pitfall #8's failure shape (an internal reader/flusher thread dies while the shell keeps running) previously left the terminal permanently, silently blank. Each PTY I/O thread now carries a drop-guard sentinel that flips on any exit — panic included — and a single global `nexis-pty-watchdog` thread scans registered sessions every 5 s: a thread dead past a 5 s grace period without the session's normal exit handoff pushes a red `[nexis: terminal stalled …]` notice into the terminal, delivered straight down the session's IPC channel, which still works with both PTY threads dead. Deliberately *not* surfaced as a fake shell-exit event: the frontend auto-respawns (or closes the pane) on exit, which would silently kill a child that may still be running the user's work — a stalled terminal stays open with an explanation and the user decides. The grace window absorbs normal teardown (reader EOF precedes the waiter's exit record by design); the decision core is a pure function with unit tests covering the transient-vs-stall distinction and the panic-unwind sentinel.
- **Editor autosave + crash recovery.** While a buffer is dirty, the editor snapshots it to `~/.cache/nexis/editor-autosave/` two seconds after the last keystroke (atomic tmp+rename; skipped above 4 MiB, matching the large-file tier), and deletes the snapshot on save — so a crash or force-kill never loses more than a couple of seconds of typing. On the next open of the same file (tab restore reopens editor tabs, so this happens automatically after a crash), a snapshot that still differs from disk raises a banner — **Restore** adopts it as the dirty buffer (the snapshot stays until an actual save, in case this session dies too), **Discard** deletes it; one matching disk is silently dropped as a completed-save leftover. Files are keyed by an FNV-1a hash of the path with the original path stored inside the record, so a hash collision can never surface another file's content — and the hash is hand-pinned rather than `DefaultHasher`, whose output may change between Rust releases and would orphan recoveries across an app upgrade. Recoveries older than 7 days are swept once per launch. New IPC family `editor_autosave_write/read/delete/sweep` (async via `heavy()`), unit-tested including the collision guard and the sweep.
- **Opt-in FPS meter in the status bar.** **Settings → General → Debug → "FPS meter"** (default off) shows a Zed-style frame-rate pill: frames over the last rolling second, turning red below 30 fps, with average and worst frame time over a 5 s window in the tooltip. Measured via `requestAnimationFrame` — rAF ticks every vsync while the main thread keeps up, so missed ticks are exactly main-thread jank (long tasks, layout storms); it deliberately does *not* claim to see GPU/compositor stalls, and the tooltip says so. Hidden-window gaps (rAF suspends) are filtered out so resume doesn't register as a fake jank spike, and the loop itself stays allocation-light with display updates throttled to 2/s so the meter doesn't distort what it measures. Zero cost while off — the pill isn't mounted and no rAF loop runs.
- **Large-file editor mode — heavy tooling backs off above 2 MiB.** Opening a file larger than `LARGE_FILE_BYTES` (2 MiB) still loads the buffer, but the pane starts with the language server, syntax linting, code folding, the minimap, and AI inline completion disabled, under a banner naming the size and offering **Enable anyway** (remembered per path for the session). Everything reactivates in place on click — LSP attaches, lint reconfigures via a compartment (the extensions array keeps its identity, per the editor's stable-identity invariant), the fold gutter and minimap return. Distinct from the existing hard `fs_read_file` cap, which refuses to open the file at all; this tier keeps huge logs and generated files *editable* without the tooling churn that made them crawl. (Upstream terax shipped the same tiering in 0.8.5, confirming the demand.)
- **Persistent terminal sessions, Milestone A — scrollback survives a relaunch.** On window close, each non-private terminal tab's buffer is serialized (the renderer pool's `SerializeAddon` path for on-screen tabs; parked tabs reuse their parked snapshot plus any dormant output) and written atomically (tmp + rename) to `~/.cache/nexis/session-snapshots/<id>.snap`, keyed by a stable per-tab snapshot id carried in the persisted tab state. On relaunch, a restored tab replays that scrollback above a dim `── session restored · previous shell ended ──` divider *before* the fresh shell spawns in the saved cwd — the load is chained ahead of the slot bind and PTY open, so the first prompt can never race the replay. Toggle: **Settings → General → Startup → "Restore scrollback on relaunch"** (default on; it only applies while "Restore tabs on launch" is on). Guardrails: private tabs never write snapshots; closing a tab (or resetting the workspace) deletes its file; an exit-time gc removes files for tabs that no longer exist — or all files when either setting is off; snapshots are trimmed to 4M chars frontend-side and hard-capped at 12 MiB in Rust (`session_snapshot_save/load/delete/gc`, all `heavy()`-async, ids charset-validated against path traversal); the close handler waits at most 1.5 s so a hung IPC can never block exit. Known limits, inherited from tab persistence: only the active pane of a split tab is snapshotted, and alt-screen (TUI) dormant output is skipped — the same reason slot rebinds discard it. Live processes still end with the app; that's Milestone B (the PTY broker).
- **Shell-integration resilience — cwd tracking no longer silently dies when the integration isn't sourced.** Nexis's cwd tracking (tab labels, "open new tab here", terminal suggestions, the git panel's repo resolution) depends on the shell profile emitting OSC 7, which never arrives under a custom shell or rc files that skip the injected integration. Each session now tracks whether *any* integration marker (OSC 133, or an OSC 7 accepted outside a running command) has arrived; if none has ~5 s after the shell starts, Nexis logs the degradation once and falls back to asking the OS for the shell process's real cwd (`pty_cwd`, a `/proc/<pid>/cwd` readlink — Linux only; other platforms keep the old behavior) on a low-rate 3 s poll. The poll self-cancels the moment a real marker arrives (late-sourced integration wins), and a rejected in-command OSC 7 deliberately does *not* count as "integration present" — untrusted command output must not be able to switch the fallback off. Timers are cleared on dispose/respawn; covered by new osc-handler tests.
- **Opt-in memory self-report in the status bar.** **Settings → General → Debug → "Memory self-report"** (default off) adds a compact status-bar pill polling every 2 s: renderer-pool slot count and live WebGL contexts (so the 1.20.7 slot-reaping win stays observably true), buffered scrollback lines across both xterm buffers per slot (arithmetic over line counts — never serializes buffer contents), dormant-tab output bytes and parked snapshot sizes, in-flight recording size, and the approximate serialized size of AI chat histories (~4 bytes/token) — hover for the full breakdown. Zero cost while off: the pill isn't mounted, no polling runs, and the AI-history tracker stores only array references (`approxHistoryBytes()` serializes lazily, with the pitfall-#11 defensive catch). New stat probes: `poolMemoryStats()` (rendererPool), `sessionMemoryStats()` (useTerminalSession), `totalRecordingBytes()` (useRecording).
- **Tripwire test: known-heavy Tauri commands must stay `async`.** `heavy_commands_stay_async` in `src-tauri/tests/pitfall_invariants.rs` scans the source tree and fails if any command on a 29-entry heavy list (filesystem walks like `fs_grep`/`fs_delete`, subprocess probes like `ml_detect`/`wsl_home`, `pty_open`, …) is declared as a sync `pub fn`. Tauri runs non-`async` commands on the main thread, so the regression this guards — quietly dropping `async` in a refactor — reintroduces the app-wide input stalls fixed in 1.20.6 with no test failure and no visible error, which is exactly the failure shape tripwires exist for. The failure message tells the offender to route work through `modules::heavy()`; the list is the place to register new heavy commands.
- **Branch checkout from the source-control panel.** The branch chip in the panel header is now a dropdown: click it to list local branches (most recent commit first, current one checked) and select one to `git switch` to it — closing the "create exists (worktree -b), switch doesn't" gap. The menu stays open while the switch runs and on failure, so a dirty-tree conflict error is readable right where you clicked; success refreshes the whole panel (status, sections, per-branch accent color). Backed by two new IPC commands — `git_branches` (`for-each-ref refs/heads`, sorted by committer date) and `git_checkout_branch`, which validates the name against the branch list before invoking `git switch` (clear error for stale UI state, and no option-injection via a leading `-`). Remote branches are deliberately not listed — fetch first, then the local view is authoritative; creating a branch stays with the worktree section / terminal.
- **Go to line in the editor (Alt+G).** New `editor.goToLine` shortcut (rebindable, listed in the shortcuts dialog under Editor) opens CodeMirror's go-to-line panel in the focused editor pane — type a line number (or `+n`/`-n` relative, `n%` percentage, `:col` suffix, all supported by the stock panel) and Enter jumps and scrolls there. Inert outside editor tabs, so Alt+G still types normally in the terminal.
- **Editor language override dropdown.** The editor pane header (next to the word-wrap toggle) now shows the file's syntax language and lets you override it — pick from ~37 curated languages, "Plain Text" (highlighting off), or "Auto (…)" to return to extension/filename detection. Fixes the daily annoyances detection can't cover: extensionless scripts, config files with odd names, a `.conf` that's actually YAML. The override re-uses the existing lazy language loaders (a pack is only downloaded into the bundle chunk when first used, same as detection) and feeds the same compartment reconfiguration path, so switching is instant on open files; snippet expansion follows the override too. Session-only and per-path (`useLanguageOverrides` Zustand store) — deliberately not persisted until real usage says otherwise.
- **User-selectable default shell.** **Settings → General → "Default shell"** takes the full path of the shell to launch in new terminals (e.g. `/usr/bin/fish`), overriding the hardcoded detection order (login shell → `$SHELL` → `/bin/zsh` on unix; pwsh → Windows PowerShell → cmd on Windows). The override still gets shell integration when it's a shell Nexis knows (zsh/bash/fish, and PowerShell on Windows). Guardrails: the path is validated Rust-side (`sanitize_shell_override` in `shell_init.rs`) and a nonexistent path falls back to auto-detection with a logged warning instead of spawning a shell that instantly dies — the pitfall-#1 blank-terminal shape. WSL sessions ignore it (the distro's login shell applies inside the distro). Plumbing: new optional `shell` arg on `pty_open`, threaded through `openPty` from the `defaultShellPath` pref; applies to terminals opened after the change.
- **Terminal font weight setting.** **Settings → General → "Font weight"** (Light 300 → Bold 700, default Normal 400) sets the weight of regular terminal text — bold ANSI output keeps its own weight. Useful for thin-rendering Nerd Fonts on Linux and for anyone who prefers a heavier terminal face. Stored as `terminalFontWeight` (clamped to 100–900 in the setter), applied live to every pooled renderer slot via a new `applyFontWeight()` (with a refit, since glyph metrics change), and `writePref()`-synced across windows like every terminal pref.
- **Zen mode — hide the header and status bar with Alt+Z.** A new `view.zenMode` shortcut (rebindable; also in the command palette as "Toggle zen mode") collapses the window to nothing but the working surface — tabs, window controls, cwd pill, and status pills all disappear until toggled back. The chrome is hidden with `display: none`, not unmounted, so header search state and open find sessions survive the round-trip. Deliberately session-only (not persisted): relaunching into a chrome-less window with no visible way back would read as breakage. While zen is on there is no window-drag region (the header is the drag surface on the borderless chrome) — keyboard shortcuts, including Ctrl+Tab and the sidebar toggle, keep working. (Adopted from upstream terax-ai.)
- **Closing a terminal that's still running a command now asks first.** Closing a tab (X button, middle-click, Ctrl+W), a split pane (Ctrl+W with splits, the pane close button), or a pane whose shell is mid-command pops a "Process Still Running — closing will kill it" confirm instead of silently killing the child, mirroring the existing unsaved-editor-changes dialog. Busy detection rides the OSC 133 shell-integration markers Nexis already injects (the `inCommand` flag that also guards OSC 7 cwd spoofing): between `B`/`C` and the next `D`/`A` the shell is running something — vim and htop count, an idle prompt doesn't. The flag was lifted from per-slot-bind to session level (`sessionHasRunningCommand()` in `useTerminalSession.ts`) so it survives a background/foreground renderer-slot cycle, and it resets on respawn. Fail-open by design: without shell integration (no markers) the check can't tell busy from idle and closing stays silent. Opt out via the new **Settings → General → "Confirm closing a busy terminal"** toggle (`terminalConfirmCloseBusy`, default on, `writePref()`-synced). (Adopted from upstream terax-ai.)
- **Ctrl+Tab now switches tabs in most-recently-used order, Alt-Tab style.** Pressing Ctrl+Tab (`tab.next`) opens a small centered overlay listing tabs by recency; holding Ctrl and pressing Tab again advances the highlight (Ctrl+Shift+Tab / `tab.prev` goes backward, arrow keys work too), and *releasing Ctrl* commits the highlighted tab — so a single quick Ctrl+Tab toggles between your two most recent tabs, the most common case the old positional next-tab made a multi-press affair. Escape or window blur cancels without switching; clicking a row commits it. Tabs never activated this session (e.g. restored but not yet visited) are appended in tab-bar order so everything stays reachable, and if the user rebinds `tab.next` to a chord with no modifier the switcher degrades to an instant switch to the most recent other tab (there is no held key to release). MRU order is session-local state in `src/modules/tabs/lib/useMruTabSwitcher.ts`; the pure ordering rules live in `lib/mru.ts` with a unit-test suite (added to the coverage gate). Replaces the positional cycle — there is no setting to get the old behavior back. (Adopted from upstream terax-ai.)
- **Expansion packs (V1) — the feature surface is now core + opt-in packs.** The sidebar's panels split into a fixed core (terminal, editor, Files, Recent Files, Source Control, Activity queue, and the AI chat/agent) plus six toggleable packs: Navigation+ (outline, bookmarks), Code Tools (build, tests, debugger, symbol search, code review), AI Extras (refactor, prompt templates), Dev Tools (processes, ports, REPL, database, profiles, SSH), ML Lab, and Advanced (share, notes, snippets, release). A first-run dialog offers Bare-Bones / Standard / Everything presets (dismissing keeps everything on — upgrades change nothing), and **Settings → Features** has per-pack toggles plus the same presets, live-synced across windows via `writePref()`. Disabling a pack hides its rail items and panels (pinned rail entries survive in storage for re-enable) and deactivates pack-owned plugins (ML Suite) through `PluginHost`; a gated active view initially snapped back to the explorer silently — superseded in this same release by the in-place "enable pack" placeholder (see the V4 entry below). This is enablement gating, not installation — all code still ships; the future nexis-ml on-demand download will live under the ML Lab pack. Taxonomy is the single source of truth in `src/lib/packs.ts`, enforced by a test that every sidebar view is core or claimed by exactly one pack; rationale in `docs/vault/decisions/expansion-packs.md`.
- **Expansion packs (V2) — the command palette and keybindings now respect pack gating.** V1 gated the rail, the panel switch, and plugin activation, but a disabled pack's features stayed reachable through two side doors: the command palette still listed "Show activity (processes + agent queue)" with Dev Tools off, and the pack-owned keybindings — Send selection to REPL (Alt+Shift+R, Dev Tools), Refactor selection with AI (Alt+Shift+X, AI Extras), Toggle bookmark (Alt+D, Navigation+) — still fired and could open panels the rail no longer offers. `Shortcut` and `CommandDef` entries can now declare the pack that owns their target (`pack:` field, validated against the `src/lib/packs.ts` taxonomy by tests); while that pack is disabled the palette entry disappears, the binding is inert in `useGlobalShortcuts` (behaves as unbound — it doesn't shadow anything), and the shortcut row is hidden from both the shortcuts dialog and Settings → Shortcuts (customizations survive in storage for re-enable, like pinned rail entries). Core shortcuts are untouched; the new `packEnabled()` helper in `src/lib/packs.ts` is the single predicate for any non-sidebar-view gated surface.
- **Expansion packs (V4) — a gated panel now offers to enable its pack instead of vanishing.** When the active sidebar view's pack is disabled (a Settings toggle in another window, a first-run preset, or a decoupled `nexis:open-sidebar-view` request from a plugin/status pill/deep link), the panel slot renders a new `PackGatePlaceholder` — "This panel is part of the X pack", the pack's description, an **Enable** button (routed through `setEnabledPacks()`/`writePref()`, so it syncs across windows), and a "Show Files" escape hatch — replacing V1's silent snap-to-explorer and its silent dropping of open requests for gated views. Enabling restores the exact panel in place with no view switch. Alongside this, the sidebar now restores *any* last-open view across restarts (`readSidebarView` previously floored everything except Files/Source Control back to Files): heavy panels are lazy-loaded so restore stays cheap, and a restored view whose pack was disabled in the meantime lands on the placeholder instead of a broken panel — the exact "this tab needs the X pack" session-restore case from the roadmap.
- **Expansion packs (V3) — the nexis-ml engine download is now a consented, checksum-pinned install flow.** The ML Lab's standalone-engine download (the only thing Nexis ever downloads) previously fetched the GitHub *latest* release with no integrity check — its only vetting was running the unverified binary with `--version`. Decision (see `docs/vault/decisions/nexis-ml-artifact-pinning.md`): artifacts stay on the `rwetz/nexis-ml-rs` GitHub Releases, and each Nexis release compiles in an exact engine pin — release tag (`v0.8.0`), per-platform asset name, byte size, and SHA-256 — in `src-tauri/src/modules/ml.rs`. `ml_download` now derives the URL from the pin (the frontend can no longer supply one), hashes the bytes **before** they touch the managed dir or execute, refuses on mismatch, and post-install asserts `--version` reports exactly the pinned version. The panel's download button opens a consent step first: version, source, size, and the full pinned SHA-256, stated as "verified before it can run". New alongside it: an offline **"Install from a local copy"** path (`ml_install_local` — download the asset on another machine, point Nexis at the file; the same hash gate applies, so self-built engines still belong on PATH/venvs, which detection accepts unverified as before), an **uninstall** button with a disk-usage readout (`ml_uninstall` / `ml_engine_status`; removal falls detection back to venv/PATH engines), and unit tests covering the hash gate, the pin's well-formedness, and the no-URL IPC contract. Shipping a new engine now means bumping the pin (tag + hashes) in a Nexis release; the nexis-ml-rs release workflow should start publishing a `checksums.txt` so the pin can be cross-checked against CI output.
- **OSC 52 clipboard support — programs inside the terminal (tmux, vim, anything over ssh) can now copy to the system clipboard.** Write-only by design: an OSC 52 *read* request (`Pd` = `?`) asks the terminal to type the system clipboard back into the PTY, handing its contents to whatever program — or remote host — printed the sequence, so reads are consumed silently with no reply, unconditionally. Writes are gated behind a new **Settings → General → "Program clipboard access (OSC 52)"** toggle (`terminalOsc52Clipboard`, default on, routed through `writePref()` so it syncs live across windows and applies to open terminals without a rebind). The selection parameter (`c`, `p`, `s`, …) is ignored — everything targets the one system clipboard, matching most emulators — and base64 payloads over ~1 MB (~750 KB of text) are dropped as not-a-human-copy. Handler in `src/modules/terminal/lib/osc-handlers.ts` with tests covering the read-block, pref gating, malformed/oversized payloads, and UTF-8 decoding. (Adopted from upstream terax-ai 0.8.1.)

### Changed
- **The explorer icon sets no longer ship (or execute) as JavaScript.** The two Iconify JSONs behind file/folder icons — the pruned vscode-icons folder set (430 KB) and `@iconify-json/catppuccin` (300 KB) — were dynamic `import()`s, so Vite compiled each into a JS module chunk that the engine had to parse and evaluate as code. They're now `?url` asset imports: the raw `.json` files ship as static assets, fetched lazily off the critical path (same timing as before) and parsed with the native JSON parser. ~750 KB of "JS" leaves the bundle without regressing the lazy-load into main (the module statically imports only two URL strings). A failed fetch logs and clears the memoized load promise so the next `preloadIcons()` retries (the cached-rejected-promise lesson from pitfall #10); the icon-resolver tests shim `fetch` to serve the assets from disk in the node environment.
- **Active tab indication is now minimal: fill + text contrast only.** The brand-orange sliding indicator (with its glow shadow) above the active tab is gone, along with its measurement machinery (`ResizeObserver` + rect math in `TabBar.tsx`), and the base `TabsTrigger` focus ring (`focus-visible:ring-[3px]` + outline) is suppressed on tab triggers — on WebKitGTK it also fired on click-focus, double-ringing the tab you just selected. The active tab now reads by its `bg-accent` fill and full-foreground text against the dimmed inactive tabs. No accessibility loss: Radix tabs activate on focus (roving tabindex), so the active-tab style *is* the keyboard focus indicator.
- **Parked terminal renderer slots no longer hold WebGL contexts and DOM trees forever.** The renderer pool parks a slot when its tab is backgrounded, but every parked slot kept its live GL context (texture atlas included), xterm buffers, and DOM tree for the rest of the session — the exact shape of upstream terax's 914 MB webview-RSS bug, and more idle GL contexts also mean more context-loss events on the fragile Linux/NVIDIA drivers 1.20.5 fought. Now a parked slot loses its WebGL context after a 30 s grace period (`SLOT_REAP_GRACE_MS`), and grace-expired parked slots beyond one warm slot (`WARM_PARKED_SLOTS`) are disposed entirely; adopting a tab re-attaches WebGL on the spot, and the warm slot keeps instant tab-switching. Deliberate reaping goes through the same teardown path as the settings toggle, so it never counts toward the 1.20.5 `webglLossCount` thrash heuristic (that's for *involuntary* losses), and `applyWebglPreference` skips resurrecting reaped slots. Slot ids are now monotonic instead of index-based so `data-nexis-slot` stays unambiguous after a disposal. (Terax notes §2.1/§2.2.)
- **The `motion` animation library is gone — every animation is now plain CSS.** motion ran its spring/tween loops in per-frame JS on the main thread; CSS transitions and keyframes composite on the GPU side of WebKitGTK and cost nothing when idle, and the dependency (plus its dedicated lazy chunk and the `src/lib/motion.ts` tween presets) drops out of the bundle. The two non-trivial ports: the TabBar's sliding active-tab indicator was a motion `layoutId` shared-layout element and is now a single measured span following the active trigger via a CSS `left`/`width` transition (re-measured by a `ResizeObserver`, since tab labels change width live), and the AI shimmer label is now the `nexis-shimmer` keyframes in `globals.css`. Everything else (`AnimatePresence` fades/slides in the AI panel, input bar, mini window, explorer/header search, status-bar controls, kbd hints, chat code blocks) became `tw-animate-css` `animate-in` utilities — exit animations were dropped where they existed; entrances match the old timing. motion's `MotionConfig` honored the OS reduced-motion setting app-wide; a global `prefers-reduced-motion` rule in `globals.css` keeps that promise for both the `animate-in/out` utilities and the shimmer. (Terax notes §2.3 — upstream's equivalent pass was their 0.8.0 #710.)
- **Criterion benchmark harness for the Rust hot paths** (`src-tauri/benches/hot_paths.rs`, run with `cargo bench --features bench-internals`): PTY reader `DaFilter` throughput (plain-text fast path vs ANSI-dense worst case), `git status --porcelain=v2` parsing at 5k files including the lossy-UTF-8 conversion (pitfall #13 path), and end-to-end `fs_grep` over a synthetic 200-file tree. Exists so the ROADMAP "Selective TS → Rust migration" item and any PTY/grep tuning start from numbers, not guesses. The `bench-internals` cargo feature only re-exports internals to the bench target and is never enabled in shipping builds (dev-dependency + `required-features` double-lock). Alongside it: two non-shipping cargo profiles — `profiling` (release + symbols, thin LTO, for perf/flamegraph) and `release-fast` (no LTO, 16 codegen units, for iteration without the fat-LTO wait; the size-first shipping profile is untouched) — and three new workspace clippy lints borrowed from Zed (`redundant_clone`, `dbg_macro`, `todo`; CI's `-D warnings` promotes them to errors). `redundant_clone` immediately caught six real paper-cuts, now fixed: needless clones per searched file in `fs_grep`, per status snapshot and commit-file diff in git operations, and needless `AppHandle`/`Arc` clones in the git path-guard error, ML waiter threads, and the DAP reader spawn. (Zed notes §2.1–2.3.)

### Security
- **`ml_download` no longer accepts a frontend-supplied URL, and downloaded engine bytes are SHA-256-verified before first execution.** Previously any code that could reach the IPC layer could pass an arbitrary `https://` URL to `ml_download` and Nexis would write the response into the managed engine dir and execute it (`--version`) as the validity check. The URL now comes only from the compiled-in release pin, and the hash gate runs before the bytes are written or executed (details under the V3 entry in Added).
- **RustSec advisories resolved so `cargo deny` gates clean**: `crossbeam-epoch` bumped 0.9.18 → 0.9.20 in the lockfile (RUSTSEC-2026-0204 — invalid pointer dereference in a `fmt::Pointer` impl; reached us through criterion's dev-dependency tree, never shipped). The two quick-xml 0.39.4 DoS advisories (RUSTSEC-2026-0194/0195) are documented ignores in `src-tauri/deny.toml`: the fix landed in quick-xml 0.41.0, but tauri-utils/plist pin 0.39.x, so there is no upgrade path until Tauri bumps it — and the exposure is parsing our own local plist/config XML, never attacker-controlled input. Re-check the exception on every Tauri upgrade.

### Fixed
- **Images finally render — the asset protocol was never enabled.** The image viewer tab and the ML panel's sample grid have been broken since they shipped (v1.2.0): both build `asset://` URLs via `convertFileSrc()`, and the CSP even allowlisted `asset:` — but Tauri's asset protocol itself was never turned on, so every request died at the (nonexistent) protocol handler and the pane showed "Failed to load image". Two halves were missing: the `protocol-asset` cargo feature on the `tauri` crate (without it the handler isn't even compiled in) and the `app.security.assetProtocol` block in `tauri.conf.json` (`enable: true`, scope `**`). The scope is deliberately full-disk: the viewer follows the explorer anywhere the user navigates, and the webview already has arbitrary-path reads through the `fs_read_file` IPC, so a narrower scope would only re-create this bug on mounted drives without removing any capability. Also added `http://asset.localhost` to `img-src` — on Windows the asset protocol serves over http, so the existing `https://asset.localhost` entry alone would have kept Windows broken even with the protocol on. Cost: one tiny new transitive crate (`http-range`); `cargo deny` clean.

### Docs
- **README rewritten as a lean overview that delegates to the wiki.** The old README duplicated the full feature tour (~130 bullet lines), the complete keyboard-shortcut table, the AI-provider matrix, and per-platform install notes — all of which now live canonically on [wiki.nexisdev.org](https://wiki.nexisdev.org) (features/, configuration/keybindings, configuration/ai-providers, installation/). The new README keeps the pitch, a nine-bullet highlights section linking into the wiki, install/AI-setup/build-from-source quick paths, a docs directory (wiki · CHANGELOG · ROADMAP · docs/vault · ML guides · SECURITY), and the Terax attribution. Also fixed while in there: the three screenshot links pointed at `docs/*.png` files that were never committed (broken images on GitHub — real screenshots still need re-taking), and the hardcoded version badge (stale at 1.20.2 since June) is replaced by an auto-updating `img.shields.io/github/v/release` badge.
- **Planning docs consolidated into `ROADMAP.md`.** The July 2026 Zed/terax research notes (`ZED_INSPIRATION.md`, `TERAX_INSPIRATION.md` — zed.dev/docs information architecture for nexis-wiki, Rust perf lessons, and the upstream terax v0.6.4→v0.8.5 feature/optimization survey that drove the OSC 52, slot-reaping, motion→CSS, and Criterion work above), the 2026-07-11 optimization-sweep checklist (`OPTIMIZATIONS.md`), the June 2026 UI critique (`UI_IMPROVEMENTS.md` — P1–P7 shipped in 1.15.0), and the release plan (`PLAN.md` — its persistent-sessions spec now lives inline in ROADMAP) were folded into ROADMAP's backlog sections and deleted; the full research detail remains in git history. ROADMAP is now the single planning doc; `ML_SUITE.md` stays as the ML protocol/design record (referenced from code) and `ML_LAB_GUIDE.md` as the user guide.

## [1.20.6] — 2026-07-12

A performance release. The headline: heavy Tauri commands no longer run on the main thread, so a workspace-wide grep from the AI agent, a `node_modules` delete, or the explorer's refresh poll can't stall terminal keystrokes or freeze the window anymore — and PTY input got a dedicated writer thread so a flow-stopped shell can't wedge the app on paste. Startup also got measurably lighter (2.8 MB → 2.1 MB of preloaded JS; main chunk 978 KB → 813 KB) by fixing four silently-defeated code-splits and lazy-loading the Settings/ML/Database/Debugger panels, and the biggest steady-state render sinks (per-token AI streaming re-renders, the editor minimap, always-on background animations) were throttled, memoized, or paused. Rounding it out: the Linux borderless-window fixes and editor/zoom/LSP fixes that landed since 1.20.5.

### Changed
- **Performance sweep: heavy Tauri commands moved off the main thread — no more app-wide stalls while the AI agent greps or the explorer refreshes.** Tauri runs non-`async` commands on the main thread; while one runs, the UI event loop and every queued IPC call (including terminal keystrokes via `pty_write`) wait behind it. The git module already did this correctly (`async fn` + `spawn_blocking`), but ~25 other commands were plain sync `pub fn` — including `fs_grep` (parallel regex walk over the whole workspace), `fs_search`/`fs_list_files`, `fs_read_file`/`fs_write_file`/`fs_read_file_ai`, `fs_delete` (recursive — deleting `node_modules` froze the app), `fs_read_dir`/`list_subdirs` (polled every 3 s by the explorer), shell history load/search, `shell_session_open`/`shell_bg_spawn` (process spawn; WSL cwd resolution can take seconds on a cold distro), `ml_detect`/`ml_env` (probe subprocesses that import torch — seconds each), `ml_gpu_probe`, `wsl_home`, and `list_crash_reports`. All now run on the blocking thread pool via a shared `modules::heavy()` helper (`src-tauri/src/modules/mod.rs`); commands that only lock a map (`pty_resize`, `pty_close`, `shell_bg_*`, …) intentionally stay sync. State-taking commands (`shell_session_open`, `shell_bg_spawn`) re-fetch state from an `AppHandle` inside the closure, following git/commands.rs. No frontend changes needed — the JS `invoke` contract is identical.
- **Terminal input writes can no longer freeze the app on a full PTY pipe.** `pty_write` did a blocking `write_all` to the PTY master on the main thread; if the child stopped reading (Ctrl+S flow control, a stopped process) the kernel pipe buffer filled and a large paste blocked the entire app until the pipe drained. Each PTY session now has a dedicated `nexis-pty-writer` thread fed by a FIFO channel: `pty_write` just enqueues (never blocks), byte order is preserved by the channel (a naive `spawn_blocking` per write could reorder rapid keystrokes), and the thread exits when the session drops or the pipe closes. The writer thread is covered by the existing `ThreadSpawnGuard` teardown, and the input queue is unbounded but bounded in practice by typing/paste volume (output already has the 4 MiB backpressure cap).
- **Startup JS payload cut 25% (2.8 MB → 2.1 MB preloaded) by fixing four defeated code-splits.** The Vite config carefully splits lazy chunks, but static imports had silently re-eagered them: (1) `useWhisperRecording` statically imported `createOpenAI`, dragging the OpenAI SDK into startup — now dynamic-imported at transcription time, matching agent.ts's per-provider lazy imports; (2) `ai-elements/message.tsx` statically imported `Streamdown`, loading the entire remark/rehype/micromark pipeline (~480 KB) before the first terminal paints even for users who never open the AI panel — now `React.lazy`, loaded on the first rendered assistant message; (3) `rendererPool.ts` statically imported `WebglAddon` (~110 KB GPU pipeline) despite its dedicated chunk — now dynamic-imported in `attachWebgl()` with post-await re-validation so a preference toggle during load can't double-attach; (4) `tailwind-merge` + `clsx` (the `cn()` helper used by every component) had been colocated by Rollup *inside* the lazy streamdown chunk, forcing it into the preload set anyway — `vite.config.ts` now pins them (plus Vite's preload/commonjs helper virtual modules, same hazard) to a small always-loaded `ui-utils` chunk.
- **Heavy, rarely-open panels now lazy-load instead of shipping in the main chunk** (main: 978 KB → 813 KB): the Settings dialog (with all its sections incl. the 950-line Models section — mounted only after first open, then kept mounted so the close animation still plays), the ML panel (2,100+ lines; the ML plugin now imports the status pill from concrete files instead of the module barrel so the panel actually splits), the Database panel, and the Debugger panel + toolbar — all via the same `lazy()`/`Suspense` pattern as the Markdown/Notebook/Image stacks.
- **AI streaming re-renders throttled.** None of the four `useChat` consumers (panel, floating panel, mini window, run bridge) passed `experimental_throttle`, so every streamed token re-rendered all of them — and several `useMemo`s keyed on `messages` (pending-approval count, file-mutation fingerprint, the context-indicator token estimate) re-scanned the entire conversation per token. A shared `STREAM_THROTTLE_MS = 50` caps UI updates at 20/s — imperceptible next to token cadence, ~5-10× less render work on long conversations.
- **Editor minimap no longer rebuilds the whole document view 5×/second.** The minimap extracted every line of the document as strings and re-rendered one `<div>` per line on a 200 ms interval *and* on every scroll event — on a 10k-line file, easily the biggest editor-side CPU sink. Line extraction is now memoized on CodeMirror's immutable doc identity (only re-runs when the document actually changes), the strips render through a `memo` component keyed on that stable array, scroll updates are rAF-coalesced and only move the viewport indicator, and idle interval ticks bail out without re-rendering.
- **Animated backgrounds pause while the window is hidden, and DotField idles at zero cost.** All five animated backgrounds (Aurora, Particles, Threads, DarkVeil, DotField) ran unconditional `requestAnimationFrame` loops — constant GPU burn while minimized, since WebKitGTK doesn't reliably suspend hidden rAF. A shared `runRafLoopWhileVisible` helper (`src/components/ui/backgrounds/rafLoop.ts`) gates every loop on `visibilitychange`, mirroring what the background-image path already did. DotField additionally: folds its separate 50 Hz mouse-speed `setInterval` (which kept firing while hidden) into the rAF tick, caches its fill gradient instead of rebuilding it every frame, and skips clear+redraw entirely once the field is fully at rest (no cursor engagement, no wave/sparkle) — an idle visible window now costs ~zero instead of a full canvas repaint per frame. Particles clamps its time delta so the animation doesn't leap after a pause.
- **ML panel's 1 Hz elapsed-timer tick now only runs while a run is actually training** (starting/running/cancelling and not paused) — it previously re-rendered the whole 2,100-line panel every second even for a finished run left open in the sidebar.

### Fixed
- **Linux: window couldn't be resized by dragging its edges (and showed no resize cursor there).** Fallout from the 1.20.5 borderless chrome: the invisible resize-grab zone around a normal window is part of GTK's client-side decoration shadow, so `decorations: false` + `shadow: false` (`tauri.linux.conf.json`) removed it entirely — the compositor had nothing to hit-test at the window edges, leaving KWin's Super+Right-drag as the only way to resize. (Windows was never affected: tao gives undecorated windows native `WM_NCHITTEST` resize borders; GTK has no equivalent.) A new `WindowResizeEdges` component (`src/components/WindowResizeEdges.tsx`, Linux-only) restores the affordance in the webview: invisible fixed-position strips along the edges (5px) and corners (14px) that show the matching resize cursor from the Tailless Smooth set and hand the gesture to the compositor via `startResizeDragging()` on pointer-down. The strips mount at the App shell root, deliberately *outside* `.zoom-content`, so app zoom can't scale the hit areas away from the real window edges; they unmount while maximized/fullscreen so screen-edge UI (tabs, scrollbars) keeps its clicks, and they carry an explicit `pointer-events-auto` so Radix modal dialogs (which set `pointer-events: none` on `<body>`) don't silently disable resizing while open. — resize cursor over the file explorer, grabbing cursor over the editor.** Two mechanisms, both worst on Linux/Wayland: (1) react-resizable-panels injects a global `*, *:hover { cursor: <resize> !important }` stylesheet while a handle is hovered or dragged; WebKitGTK re-evaluates the cursor lazily when that rule toggles, and a dropped pointer event leaves it applied outright — so the resize cursor bled over the UI next to a handle (the file tree sits 4px from the sidebar handle). The global rule is now disabled (`disableCursor` on every panel group) and the handle element itself carries the resize cursor via `[data-slot="resizable-handle"]` CSS. Tradeoff: the cursor no longer shows as resize in the library's few-px grab zone *around* a handle, only on the handle. (2) The tab-reorder and file-explorer move drags set a document-wide grabbing cursor cleared on window `mouseup` — but those listeners take no pointer capture, so releasing the button outside the window (or a mid-drag focus steal by the native drag region / Alt-Tab) meant the mouseup never arrived: the drag stayed armed and the grabbing cursor stuck until some future click. Both drags now self-heal: a `mousemove` arriving with no buttons held ends the drag (tab drag commits like a normal drop; the explorer drag cancels rather than dropping files onto whatever is under the pointer), and a window `blur` cancels outright. The explorer drag also uses the custom grabbing PNG cursor now, matching the tab drag.
- **Terminal exit-status gutter bar painted down the entire terminal instead of one line.** The OSC 133 exit decoration (`addExitDecoration` in `src/modules/terminal/lib/osc-handlers.ts`) overrode the decoration element's height with `100%`, which resolves against xterm's decoration container — the whole screen — not the row, so every prompt grew a full-height 2px green/red line hugging the left edge (easily mistaken for an active-pane indicator). xterm already sizes decoration elements to exactly one cell row; the override is simply removed, so the bar now accents only the command's prompt line as intended.
- **LSP never activated for tabs restored at startup (empty Problems counts / no inline diagnostics until the tab was reopened).** `EditorPane` activated LSP once, when the file finished loading — but the workspace root it needs comes from the chat store's `live` registry, which starts as a no-op (root = `null`) until App re-registers it after `explorerRoot`/`launchCwd`/`home` hydrate. Restored tabs usually lost that race, `activateLsp` returned `null`, and nothing ever retried — so a reload silently killed diagnostics, hover, completion, and go-to-definition for every restored editor. The pane now subscribes to the live workspace root (a primitive selector, pitfall-#14 safe) and re-runs LSP activation when it appears or changes.
- **CodeMirror lint/hover tooltips rendered as white boxes on dark themes.** None of the bundled editor themes style CM's tooltip layer, so diagnostic hovers fell back to the base theme's light-gray background — near-unreadable white rectangles on a dark UI. The shared editor theme now paints `.cm-tooltip`/`.cm-diagnostic` with the app's popover palette.
- **Editor clicks landed on the wrong line whenever app zoom ≠ 100%.** App zoom (Ctrl+= / Ctrl+- / Ctrl+0) is implemented as CSS `zoom` on the main content, and WebKitGTK's caret-from-point APIs — which CodeMirror uses to turn a mouse click into a document position — ignore an ancestor CSS `zoom`. The click's coordinates and the editor's geometry then disagree by exactly the zoom factor: at zoom 1.4, clicking line 13 put the cursor on line ~19 (13 × 1.4), with the offset growing further down the file. Because `zoomLevel` persists in preferences, one accidental Ctrl+= left the editor mis-clicking across restarts. Every CodeMirror instance (editor, git diff, AI diff — the terminal and REPL were already `zoom-exempt`) is now exempted from layout zoom via `.zoom-content .cm-editor { zoom: calc(1 / var(--app-zoom)) }`, and app zoom reaches the code by scaling the shared theme's font-size (`calc(13px * var(--app-zoom))`) instead — so zoom still visibly zooms the code, but click coordinates stay 1:1. Known limitation: in-editor popups (autocomplete list, LSP hover) no longer scale with app zoom, since they live inside the exempted subtree. Documented as CLAUDE.md pitfall #15 with a tripwire in `src/lib/pitfall-guards.test.ts` guarding both halves of the fix.

## [1.20.5] — 2026-07-08

A Linux-focused release that makes Nexis genuinely smooth on NVIDIA + Wayland. It removes the WebKitGTK-on-NVIDIA render lag (the DMABUF renderer and per-frame `backdrop-filter` repaints), fixes a theme-switch crash and a terminal WebGL context-loss thrash loop (with its frozen ghost cursor), and finally gives Linux the borderless window chrome — no double title bar, real rounded corners — that Windows already shipped. All changes are `#[cfg(target_os = "linux")]`/Linux-attribute scoped; macOS and Windows behavior is unchanged.

### Fixed
- **Terminal lag on Linux/NVIDIA from a WebGL context-loss thrash loop.** On some WebKitGTK + NVIDIA setups the terminal's xterm.js WebGL renderer loses its GL context immediately and repeatedly. The recovery path in `src/modules/terminal/lib/rendererPool.ts` re-attached WebGL 250 ms after every loss — so a machine that loses the context on every attach got stuck flipping the terminal between the GPU and DOM renderers ~4×/second, which is far laggier than just using the DOM renderer (the editor, which uses no WebGL, stayed perfectly smooth — a dead giveaway). `attachWebgl`'s `onContextLoss` now counts rapid losses: after `WEBGL_MAX_LOSSES` (3) within a stability window it gives up and stays on the DOM renderer for that slot instead of thrashing. A genuine one-off loss (sleep/wake, GPU reset) still recovers — the counter resets after `WEBGL_STABILITY_RESET_MS` (60 s) of stability — and machines where WebGL is stable (Mesa, etc.) are unaffected. Toggling the "Hardware-accelerated rendering" setting back on clears the auto-give-up for a fresh attempt. The manual toggle in Settings → General remains as an explicit override. As part of this, the context-loss path was fixed to fully tear down the abandoned WebGL layer (shared `hardTeardownWebgl` helper): it previously cleared its canvas tracking *without* releasing the GL contexts or zeroing the canvases, so the dead GPU layer kept painting its last frame — a **frozen ghost cursor** — on top of the live DOM renderer (and leaked a canvas per loss). The give-up path now also forces `term.refresh()` so the DOM cursor and cells repaint clean.
- **Theme switch crashed the whole window on Linux/NVIDIA.** Changing the app theme (or light/dark mode) ran the palette swap inside a `document.startViewTransition` crossfade, which makes WebKitGTK capture a full-page **GPU snapshot** to composite the animation. On the NVIDIA proprietary driver that snapshot crashes the WebKit web process outright — a silent renderer death (no Rust panic, so nothing lands in `~/.cache/nexis/crash/`) that takes the window down on every theme change. `withViewTransition()` in `src/modules/theme/ThemeProvider.tsx` now short-circuits to an instant swap on Linux (same fallback it already used for `prefers-reduced-motion`), so the theme changes without the crossfade. macOS/Windows keep the animation. Same underlying WebKitGTK-on-NVIDIA compositing weakness as the DMABUF lag below.
- **Linux render lag on NVIDIA GPUs — WebKitGTK DMABUF renderer now disabled where it hurts.** WebKitGTK 2.44+ composites through a DMABUF-backed accelerated path by default; on the **NVIDIA proprietary driver** that path is buggy and slow — tearing, stutter, and high CPU on *every* frame (terminal scroll, editor, the whole webview), which is the "a tad laggy" feeling on an otherwise fast machine (e.g. an RTX 4070 on KDE Wayland). `tune_linux_webkit()` in `src-tauri/src/lib.rs` now sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` **before** the webview forks its WebKit processes, so compositing falls back to the reliable GL/EGL path. It's scoped tightly: the switch only flips when the proprietary driver is actually loaded (`/proc/driver/nvidia/version` or `/dev/nvidia0` present) — Mesa (Intel/AMD) drives DMABUF well and is *faster* with it on, so those users are untouched — and it never clobbers the env var if you've already exported it yourself. macOS/Windows unaffected (`#[cfg(target_os = "linux")]`).

### Changed
- **Linux gets the custom borderless window chrome (no double title bar, real rounded corners).** Linux had no platform config override, so it fell back to the base window config — decorations on — and KDE/GNOME drew their **native server-side title bar** *on top of* Nexis's own header (two title bars), while the opaque rectangular window squared off the corners the app tries to round. A new `src-tauri/tauri.linux.conf.json` mirrors the existing `tauri.windows.conf.json` (`decorations: false, transparent: true, shadow: false`), so the native bar is gone and the window is transparent — letting the already-active `data-chrome="borderless"` CSS (12px `border-radius` on `#root`) render as the actual window corners. Drag (`data-tauri-drag-region` in the header) and the custom min/max/close controls were already wired for Linux; they just needed the undecorated window. On KDE Plasma, KWin draws a *server-side* title bar for GTK/WebKit windows even when the app requests `decorations: false` (a double bar); `tune_linux_webkit()` now sets `GTK_CSD=1` (forces client-side decorations so KWin defers to the app) and the Tauri `setup` hook re-asserts `set_decorations(false)` after the webview initializes, since webkit2gtk can reset the window hint during startup.
- **Linux: `backdrop-filter` blur dropped to cut per-frame paint cost.** WebKitGTK re-composites the blurred backdrop region every frame — cheap on Mesa, expensive on the NVIDIA proprietary driver, and worst on the sticky panel/table headers and the source-control side panel, which repaint on every scroll. On Linux only (keyed off a new `data-os="linux"` attribute set in `src/main.tsx`), `src/styles/globals.css` now neutralizes every `backdrop-blur*` surface. All ~22 sites that used it already carry an opacity-backed background (`bg-card/80`, `bg-popover/90`, `bg-black/30`, …), so overlays, popovers, and headers stay legible — they just render as solid translucency instead of frosted glass. macOS/Windows keep the blur.

## [1.20.4] — 2026-07-04

A terminal-bulletproofing pass: the ConPTY invariants documented in CLAUDE.md are now enforced by the build — clippy config plus two tripwire test suites — instead of by prose, so a future coding session that reintroduces one of the blank-terminal pitfalls gets a red build instead of a silently broken terminal. Plus a redundancy sweep that consolidates ~30 duplicated helper implementations left behind by earlier feature passes. Also: the ML Lab is refactored from a "train your first model" showcase into a workspace-rooted workbench, gaining a network graph, hover-to-explain cards, ONNX and Rust-engine inference along the way (see the ML Lab entries below). Re-cut to add Linux release artifacts (app binaries unchanged).

### Added
- **Linux release builds.** The release workflow (`.github/workflows/release.yml`) now runs a `build-linux` job alongside the Windows one, so tagged releases ship Linux artifacts for the first time: an **`.AppImage`** (the portable download that runs on any modern distro, including Arch-based CachyOS), plus **`.deb`** and **`.rpm`** for native package managers. The Tauri Linux bundle config already existed in `tauri.conf.json`; only the CI job was missing, which is why prior releases were Windows-only. The job builds on `ubuntu-22.04` for the broadest glibc/webkit baseline and installs the same webkit/appindicator/rsvg stack as CI plus the gstreamer plugins that `appimage.bundleMediaFramework` bundles. The 10 MB size gate stays Windows-only (it targets the `nexis.exe`; a webkit-bundling AppImage is expectedly larger).
- **`proc::command()` is now the only sanctioned subprocess constructor (pitfalls #1D/#4).** All 17 non-PTY `Command::new` call sites (git, shell one-shots, agent background procs, WSL probes, LSP/DAP servers, ML engine + nvidia-smi, python probes) now build through `crate::modules::proc::command()`, which pre-applies `CREATE_NO_WINDOW` at construction. A raw `std::process::Command::new` is banned via `disallowed-methods` in `src-tauri/clippy.toml` (CI runs `clippy -D warnings`), so forgetting `hide_console` — the mistake that used to blank live terminals — no longer compiles past CI. PTY sessions stay on `portable_pty`, which sets the flag itself.
- **Rust tripwire suite `src-tauri/tests/pitfall_invariants.rs`** — six source-level guards for lifecycle invariants a unit test can't observe: `CONPTY_LIFECYCLE_LOCK` held on both the create side (`spawn`, *before* `openpty`) and the close side (`drop_session`) (#1A); `pty_close` dropping via a detached `session::drop_session` thread with no `.unwrap()`/`.expect()` (#1A/#9); `authorize_spawn_cwd` gating `pty_open` (#1C); PowerShell launched with `-Command` + `NEXIS_PWSH_PROFILE`, never `-File` (#1B); no raw `Command::new` outside `proc.rs` (#1D — survives even deletion of the clippy config); and no `.lock().unwrap()` in the PTY module (#8). Every failure message names the CLAUDE.md pitfall and the required fix, so the tripwire steers rather than just blocks.
- **Frontend tripwire suite `src/lib/pitfall-guards.test.ts`** — five architecture guards: `pty_open` may only be invoked via `pty-bridge.ts`, which pre-authorizes the cwd (#1C); settings writes must route through `writePref()` so cross-window sync keeps working (#2); the composer textarea must never carry a `disabled` attribute (#5); agent history must prune reasoning blocks before compaction (#3); and no Zustand selector may return a fresh array/object per call (#14, the blank-screen render loop).
- **ML Lab: hover-to-explain cards everywhere.** Every hyperparameter in the form (epochs, learning rate, batch size, hidden layers, context, temperature, …), every metric chart label, the playground's temperature dial, and the run-details values now show a small explanation card on hover — what the value means and what turning it up/down does, written for someone training their second model. Backed by a new `lib/glossary.ts` (20+ entries) plus a tripwire test that fails if a new `train.toml` knob ships without an explanation.
- **ML Lab: run-details diagnostics strip** — the run in view (just-finished or historical) gets a facts panel: run id, status, device, passes, wall-clock duration, and each metric's final *and* best value, all hover-explained. Historical runs now also carry device/startedAt through from `summary.json`.
- **ML Lab: see the model itself — a network graph in the panel.** Every model project now renders its architecture from `train.toml`: tabular MLPs draw as an actual node graph (named input features from the data CSV's header → hidden layers → class labels from the confusion matrix, with big layers bucketed — 64 units → ~13 drawn nodes so it fits the panel), while CNN and tiny-GPT projects render as labeled block diagrams. Works on both engines, before any training exists, and updates when a run starts with edited layer sizes. Hover cards explain each part.
- **ML Lab: learned-weight overlay on the network graph (Tier 2).** The graph subscribes to a new per-eval `weights` artifact (`{"layers":[{"in":I,"out":O,"w":[[…]]}]}` — contract documented in ML_SUITE.md): when an engine emits it, edge thickness/opacity follows bucket-averaged |weight| magnitudes and re-renders every eval, so you can watch connections strengthen and die off live during training. Store plumbing, defensive parser (`parseWeights` — malformed files degrade to structure-only, never throw), and size-mismatch handling ship in Nexis, and `nexis-ml-rs` v0.8 emits the artifact per eval (capped at 200k weights) — so tabular training animates connection strengths live, end-to-end.
- **ML Lab: the Playground now works with the standalone Rust engine.** `nexis-ml-rs` v0.8 implements `serve` (same NDJSON dialect as Python: `ready` with feature/class meta, then one `prediction`/`error` per request), reloading the tabular MLP from a new `checkpoints/best-weights.json` that `train` writes — a burn-free plain-Rust forward pass, so sessions start instantly. Nexis's Playground gate switched from engine-kind to **capability-based**: the env probe reads the engine's new `"serve": true` flag, so a v0.8+ standalone engine gets the full feature-form → class-probability playground, while older ones see a "update the engine (v0.8+)" note instead of a cryptic spawn failure. Rust-engine runs trained before v0.8 (no saved weights) and image runs get a clear in-panel error from the engine.
- **ML Lab: ONNX surfaced in the UI.** On the standalone Rust engine, an "⤓ Export ONNX model" action runs `nexis-ml export --onnx .` (retrains from `train.toml` — reproducible via `[train] seed` — and writes `model.onnx`), streams its output into the panel log, and reveals the file on success. Projects with a `model.onnx` get an ONNX badge next to the model selector (click to reveal). The Rust engine has had this export since v0.5.0; the panel just never called it.

### Fixed
- **ML Lab: Rust-engine models were invisible to the panel** — project discovery required a `train.py`, but the standalone Rust engine scaffolds config-only projects (`train.toml`, no Python), so a folder with a fully trained model still showed the "Train your first model" card. Discovery now keys on `train.toml` (either engine) with `train.py` as a legacy fallback; regression-tested against the config-only layout.
- **ML Lab: two Python-only features were offered on the Rust engine and failed cryptically** — "Export HTML report" spawned `export --run` (the Rust engine's `export` only speaks `--onnx`; exit 2), and the Playground spawned `nexis-ml serve`, which the Rust engine doesn't have. Both are now hidden while the Rust engine is active, with store-level guards so a stale click can't spawn a doomed process.
- **Pitfall #8's poison-cascade fix now covers all five shared-thread subsystems, not just the PTY.** A code review of the core command surface found the same bare `.lock().unwrap()` / `.read().unwrap()` / `.write().unwrap()` pattern the PTY module was cured of still live in the agent shell session map (`shell/mod.rs`, `shell/session.rs`), the background-process log buffers (`shell/background.rs`, shared between reader threads and the polling command), and the LSP and DAP sessions (pending-request maps + stdin writers shared with their reader threads). In each, one panicked thread would have permanently bricked that subsystem (dead shell tools, dead log polling, dead LSP/DAP) or crashed a Tauri worker thread. All now recover via `unwrap_or_else(|e| e.into_inner())`, and the pitfall-#8 tripwire test was extended to scan all five modules for all three lock patterns so the fix can't silently regress again.
- **`fs_stat` could never report `kind: "symlink"`** — it checked `is_symlink()` on `std::fs::metadata`, which follows symlinks, so the symlink branch was unreachable dead code. It now consults `symlink_metadata` for the kind while keeping dir-first precedence, so a symlink-to-dir still reports `"dir"` (existing callers gate on that).
- **ConPTY lifecycle lock no longer poison-cascades** — `CONPTY_LIFECYCLE_LOCK.lock().unwrap()` in `spawn`/`drop_session` meant a single panic while holding the lock would panic every subsequent terminal open *and* close forever (pitfall #8's cascade applied to #1A). Both sites now recover with `unwrap_or_else(|e| e.into_inner())`; the lock serializes timing only (it guards no data), so recovery is safe.
- **Drive-root `dirname` bug (pitfall #12) was still live in seven private copies** — QuickFilePicker, BookmarksPanel, GitHistoryPane, SymbolSearchPanel, SourceControlPanel, RecentFilesPanel, and the cwd breadcrumb each had a local naive `dirname`/`dirpart` with the exact bug `lib/path.ts` fixed (`"C:/file"` → `"C:"`); the breadcrumb one also skipped backslash normalization, so navigating up from a `C:\...` file path landed on `/`. All seven now use the new shared `displayDirname` (display contract: `""` when no parent) or `absoluteDirname` (navigation contract: floors at `/` / `C:/`) from `lib/path.ts`, both covered by `path.test.ts`.
- **`fs_grep` sink mutex now recovers from poisoning** (same pitfall-#8 rationale: the hits buffer is shared across parallel walker threads), and the agent panel's `shortPath` label helper now delegates to the shared `basename`, so Windows backslash paths shorten correctly in tool-step labels.

### Changed
- **ML Lab: workbench, not showcase.** The panel now leads with what's actually in the folder: an engine-identity chip states *which* engine is running ("Rust engine 0.5.2" / "Python engine", with backend/PyTorch detail on hover, and the GPU chip now also lights up for the Rust engine's wgpu backend); a "Models" section lists every model project discovered in the workspace; and an empty folder plainly says "No models in this folder" instead of pitching a demo. Project creation is demoted to an explicit "New model…" action — the card drops the "sample data, results within seconds" framing for a factual description of what gets scaffolded, and **auto-train on create is now opt-in** (default off) so the flow is create → review hyperparameters → train.
- **Helper consolidation** — 18 duplicate `basename` implementations (three behavioral variants: some broke on trailing separators, some on backslashes) collapsed into one canonical `basename` in `lib/path.ts`, re-exported from `explorer/lib/dnd.ts` and `tabs/lib/tabTypes.ts` so existing importers keep working; 4 duplicate `formatBytes` copies collapsed into a new `lib/format.ts`. Exception kept on purpose: `ai/lib/security.ts` retains its private `basename` because it feeds the hardened path-comparison surface, where silently changing edge-case semantics (trailing separators) could alter an allow/deny decision.
- **`shell_init.rs` de-duplicated** — `write_if_changed` and `integration_root` were implemented (and tested) twice, once per platform submodule, and six `*_script()` wrapper fns plus a second set of `include_str!` consts duplicated the embedded-script plumbing. One shared implementation and one shared test module now serve both platforms; the pitfall-#6 idempotence regression test is preserved. No behavior change.

## [1.20.3] — 2026-06-26

Explorer quality-of-life: drag-and-drop file moves, plus fixes to the refresh button and the delete confirm.

### Added
- **Drag-and-drop file moves in the explorer** — drag a file or folder onto another folder to move it there, instead of dropping to a terminal `mv`. Dropping onto a file targets that file's parent directory; dropping onto the workspace-name header bar or the empty space below the tree moves the item up to the project root. The drop target is highlighted, the dragged row dims under a grabbing cursor, and hovering a collapsed folder for a beat springs it open so you can drill into nested directories mid-drag. Moves go through the existing `fs_rename` command (workspace-authorized, refuses to overwrite an existing target, surfaces a toast on failure), and open editor tabs follow the moved path — including tabs for files inside a moved folder. Invalid drops (onto itself, into its own subtree, or back into its current directory) highlight no target and are ignored on release. The drag is driven by mouse events rather than the HTML5 drag API, which Tauri's webview intercepts (the same reason tab reordering is mouse-driven).

### Fixed
- **Explorer refresh button now actually refreshes** — it re-lists *every* loaded directory (root plus expanded subfolders), not just the root, so an external change anywhere in the visible tree is picked up. Previously it silently re-listed only the root — the same thing the 3-second live-sync poll already does — so it appeared to do nothing. The icon now also spins briefly to acknowledge the click even when nothing changed on disk.
- **Explorer delete confirm no longer disarms between clicks** — the "Delete → Click again to confirm" item reset its armed state via a 1.5 s `mouseleave` timer that raced the label's reflow; a spurious `mouseleave` could disarm the confirm so the second click only re-armed it, making delete appear broken. The confirm now resets cleanly when the context menu closes instead.

### Security
- Bumped the transitive `quinn-proto` lockfile entry 0.11.14 → 0.11.15 to clear **RUSTSEC-2026-0185** (a high-severity remote memory-exhaustion advisory). The crate is an orphan `Cargo.lock` entry — not compiled into any of Nexis's build targets — so there is no user impact; this keeps `cargo audit` green.

## [1.20.2] — 2026-06-22

A reliability, security, and supply-chain hardening pass — no user-facing features, just CI gates, panic-safety, and resource ceilings. Also makes `CHANGELOG.md` the canonical record (see Docs) and retires the `IDEAS.md` brainstorm (its content moved into `ROADMAP.md`'s hardening backlog).

### Added
- **Binary-size budget gate** — the release workflow fails if `nexis.exe` exceeds 10 MiB, making the "<10 MB" non-negotiable actually enforced so a careless dependency can't quietly blow the budget (currently ~8.4 MiB).
- **Coverage gate** — CI now runs `pnpm test:coverage` instead of bare `pnpm test`; the `vitest.config.ts` thresholds were raised from 40/35/45/40 to just below the current numbers (lines/statements ~72%, branches ~82%, functions ~56%), so a real coverage regression fails the build.
- **`cargo-deny` supply-chain gate** — `src-tauri/deny.toml` adds a license allow-list, advisory checks, and a source-registry lock on top of `cargo audit`, run by the weekly `audit.yml` workflow (and on any `Cargo.lock`/`deny.toml` change). Documented exceptions cover unmaintained *transitive* Tauri dependencies (the gtk-rs GTK3 bindings, the rust-unic Unicode tables, proc-macro-error) that have no fix path.
- **Panic-lint gate** — `src-tauri/clippy.toml` plus `#![warn(clippy::unwrap_used, clippy::expect_used)]` on the security-critical command modules (`net`, `secrets`, `recording`) make a new `.unwrap()`/`.expect()` in their production code a CI failure (test code is exempt via `allow-unwrap-in-tests`).

### Changed
- **All GitHub Actions are pinned to a commit SHA** (with the tag in a trailing comment) across the CI, audit, release, and E2E workflows, so a re-pointed tag can't swap in unreviewed action code. `dtolnay/rust-toolchain` gained an explicit `toolchain: stable` input to remain pinnable.
- Marked the `nexis` crate `publish = false` and documented the intentionally-minimal `rt`-only `tokio` feature set in `Cargo.toml` (a contributor note tied to the size budget).

### Fixed
- **PTY thread-spawn no longer panics on exhaustion** — if the reader/flusher/waiter thread fails to spawn (OS thread limit / OOM), the spawn path now kills the child shell and unwinds cleanly via a new `ThreadSpawnGuard` instead of `.expect()`-panicking on a Tauri worker thread (which could take down the whole process — pitfall #9 territory).

### Security
- **Buffer ceilings** (defense against unbounded growth): terminal recordings are capped (a 64 MiB frontend accumulation ceiling with a truncation notice, plus a 512 MiB Rust-side guard on the saved `.cast` payload); the AI message history gained a hard context-window backstop so a single very large recent tool result can't push the history past the model's window; and the explorer live-sync re-list fan-out is bounded.
- **Audited minimal Tauri capability surface** — verified every granted capability in `capabilities/*.json` maps to a real feature (no blanket `fs:`/`shell:`/`http:` grants) and documented the posture in `SECURITY.md`.

### Docs
- **CHANGELOG is now the canonical, contiguous record.** Backfilled the entirely-missing 1.3.0–1.14.0 history (12 releases, ~25 features — stash manager, port forwarding, REPL, AI code review, multi-window, worktrees, bookmarks, and more) and the undocumented 1.20.1 visual/provider work. Retired ROADMAP's ~150-line "Shipped" section in favor of a pointer to this file; `CLAUDE.md` now codifies keeping the changelog current as a top priority and the roadmap as a disposable to-do list.

## [1.20.1] — 2026-06-18

A look-and-feel pass that spreads the AI panel's polish across the whole app, four new AI providers, full editor split-pane parity with the terminal, and an explorer-stability fix.

### Added
- **New AI providers** — **Z.ai** (Zhipu GLM) cloud provider with 7 GLM models (GLM-4.6 / 4.5 / 4.5-X / Air / AirX / Flash / 4.5V) via its OpenAI-compatible endpoint (`api.z.ai/api/paas/v4`), plus three LM Studio-style local providers — **vLLM**, **xLLM**, and **SGLang** — each with its own icon and a configurable base URL + model id in the LOCAL & CUSTOM list. All four are threaded through chat, inline autocomplete, and commit/PR generation, persist via `writePref`, and the local ones satisfy the composer's local-model gate.
- **Editor split panes** — editor tabs now split into multiple file panes just like the terminal (`Ctrl+D` split right, `Ctrl+Shift+D` split down), each independently resizable and closable, up to 4 panes per tab. Opening a file while a split pane is focused loads it into that pane (unless it has unsaved changes), so you can view different files side by side. Split layouts persist across restart.
- **Close panes individually** — a hover ✕ on each terminal/editor pane, shown only when a tab is split.
- **Move panes** — reorder a pane within its split with `Ctrl+Alt+Arrow`.
- **Command exit-status gutter** — `OSC 133;D` exit codes now paint a thin green/red gutter bar on each command's line (xterm decorations anchored to the prompt marker), so success/failure is scannable down the scrollback. Degrades silently where decorations aren't available; the cwd-gating path is untouched. (The achievable slice of command blocks — full Warp-style interactive blocks would need replacing the WebGL renderer.)
- **ML training progress on the OS taskbar** — a training run mirrors its progress onto the taskbar/dock icon via `setProgressBar` (normal / paused / indeterminate), cleared when the run ends.
- **Per-branch source-control accent** — the source-control panel gets a peacock-style top strip whose color is a stable hash of the current branch name, so branches are distinguishable at a glance.
- **Motion system** — shared spring/tween presets (`lib/motion.ts`) and a root `<MotionConfig reducedMotion="user">`, so animations share one vocabulary and respect `prefers-reduced-motion`.
- **Themed toasts** — a Sonner `<Toaster>` at the app root; the explorer's rename / delete / reveal errors now surface as toasts instead of `window.alert()`. (Adds the `sonner` dependency.)
- **Sliding brand tab indicator** — one shared-layout (`layoutId`) element that springs between tabs with a glow, replacing the static per-tab accent line.
- **Theme-aware brand accent** — `applyTheme` now sources `--brand` from each theme's signature ring color, so the tab indicator, composer aurora, and active-pane glow all match the active theme and crossfade with it (the default theme keeps coral).
- **Signature effects** — a rotating brand conic "aurora" border on the composer while the agent works; an inset brand glow on the focused split pane (multi-pane only); a terminal file-drop overlay; a glassy command palette; an AI code-block copy button that springs copy → green check; and a reduced-motion-aware crossfade when the theme palette/mode changes.
- **New reusable UI components** — `<ScrollFade>` (scroll affordance) and `<KbdHint>` (keyboard-hint pill).

### Fixed
- **Focused-pane indicator** — the brand-colored focus ring no longer leaks as a stray line along the bottom of the active pane. It's now rendered as a clean overlay ring on all four sides (previously an inset shadow that the terminal canvas hid on three edges, leaking only through xterm's bottom row-rounding gap).
- **Explorer folder-icon cache poisoning** — folder/file icon URLs were being cached as `""` when looked up before the icon JSON finished loading, permanently breaking the default folder icon (the empty box before the workspace name). The negative cache is now skipped while the icon set is still loading, and the tree re-renders once `preloadIcons()` resolves so icons fill in immediately.
- **Explorer live-sync flicker** — the 3 s live-sync poll flipped each node to "loading" (clearing its entries) before `fs_read_dir` resolved, flashing the list empty every cycle. The poll now does a background fetch that keeps the loaded rows on screen and swaps in new entries only on success.

### Changed
- The split-pane tree is now generic and shared between terminal and editor tabs.
- **macOS ML standalone-engine download deferred** — `ml_engine_release_url` now returns `None` on macOS (no prebuilt `nexis-ml-rs` asset is published — the Intel runner kept hanging), so the panel guides Mac users to the Python engine instead of offering a 404 download.

## [1.20.0] — 2026-06-17

ML Lab grows up: the rest of the ML Suite's **Phase 2** (inference + richer graphs) and **Phase 3** (a Python-free engine) ship here. Still an early feature — verified end-to-end, but young.

### Added
- **More templates** — Text generator (a tiny character-level GPT over any `.txt`, streaming a generated-text snapshot each pass), Image classifier (a folder-per-class CNN with a per-epoch sample-prediction grid), and Blank (scaffold your own `train.py`). The create card scaffolds and trains any of them in one click.
- **Inference playground** — load a trained model and try it live without leaving the panel: prompt → continuation for text, a feature form → class + probability bars for tabular. Backed by `nexis-ml serve` (an NDJSON request/response loop); started per-run and torn down on navigation to free GPU memory.
- **Run browser, comparison & annotation** — past runs list with final metrics; check 2+ to overlay them on shared charts (one color per run), and annotate each with notes, tags, and a pin-to-top "baseline" marker (`notes.json` per run).
- **Confusion matrices & sample grids** — classification runs render a colored confusion matrix (accuracy + per-cell counts); image runs render a green/red sample-prediction grid — live and for historical runs.
- **Hyperparameter form** — edit the keys present in `train.toml` (epochs / lr / batch / device / model size …) with Save and Save & train; surgical value replacement preserves comments, alignment, and line endings.
- **HTML report export** — one-click self-contained report of any run (inline SVG charts, summary, confusion matrix, sample grid, generated-text samples, config) via `nexis-ml export`.
- **Pause / resume, early stopping & GPU-memory telemetry** — Pause/Resume honored at the epoch boundary; the harness exposes `run.should_stop(patience=…)`; CUDA runs plot a per-epoch `mem/gpu_mb` footprint.
- **Auto-open on train** — an opt-in, cross-window-synced preference that opens the panel automatically when training starts.
- **Standalone Rust engine (no Python)** — Nexis can detect and download [nexis-ml-rs](https://github.com/rwetz/nexis-ml-rs), a single ~31 MB binary that trains tabular and image models on CPU or any GPU (burn's `wgpu` backend — no CUDA toolchain) and exports a tabular model to ONNX. It speaks the same protocol and writes the same run store, so the panel renders its runs unchanged. The setup card offers a one-click "Download standalone engine" alongside the Python install.
- **Engine-aware UI** — the panel identifies which engine is active (from `nexis-ml env`) and gates features to it: the config-only Rust engine hides the Text generator and Blank templates (which need an editable `train.py`) and the GPU/CUDA upsell, showing only what it can do, with a hint pointing to the Python engine for the rest.

### Fixed
- The setup card now surfaces *why* engine setup, install, or download failed instead of failing silently, and "Create & train" reports why it didn't start.
- The engine install falls back to installing from GitHub when the package isn't on PyPI yet, and the project folder is authorized (not merely checked) before `ml_spawn`.
- ML engine/Python path guards parse the executable stem host-independently (split on both `/` and `\`), so engine detection behaves identically on Windows and Unix.

### Security
- The standalone-engine download (`ml_download`) only fetches over HTTPS into a managed app-data directory and verifies the binary with a `--version` probe before it can be spawned; the spawn guard still requires the executable's stem to be exactly `nexis-ml`.

## [1.19.0] — 2026-06-12

ML Lab: train small machine-learning models inside Nexis. An early feature — functional and verified end-to-end, but young; expect rough edges.

### Added
- **ML Lab panel** — a new sidebar view (own rail icon, pinned by default with a one-time promotion for existing rails) for training small models on your own data. Live charts with plain-language metric names ("Accuracy", not `acc/val`), a progress bar with elapsed time, and a trend-aware status sentence that explains what the model is doing — including an overfitting warning when validation worsens. Raw logs live in a collapsed Details disclosure. A status-bar pill shows progress and jumps to the panel.
- **External engine, LSP-style** — the heavy lifting happens in [nexis-ml](https://github.com/rwetz/nexis-ml) (Python/PyTorch, Apache-2.0), spawned over an NDJSON stdio protocol. The Nexis binary stays under 10 MB; the panel degrades to an actionable setup card when the engine is missing.
- **One-click setup and project creation** — the panel installs the engine into the detected venv (CPU or CUDA torch, fixed pip-argument allowlist on the Rust side), scaffolds an example project, and starts training in a single Create & train click. Past runs render from on-disk `metrics.jsonl` with no engine running.
- **GPU training** — `device = "auto" | "cpu" | "gpu"` per project; `auto` uses the GPU only when the job is big enough to benefit and says why. NVIDIA detection via `nvidia-smi`, engine capability probe via `nexis-ml env`, an install-time GPU checkbox, and an "Enable GPU" upgrade path that handles pip's refusal to swap `+cpu` for `+cuXXX` builds (`--force-reinstall`).

### Security
- New `ml_*` Tauri commands are deliberately narrow: only an executable whose stem is `nexis-ml` (or a CPython launcher, for installs) can be spawned, subcommands and pip invocations are fixed allowlists, and project directories pass the same `authorize_spawn_cwd` guard as terminal spawns. All spawn sites use `CREATE_NO_WINDOW` (pitfall #4).

## [1.18.1] — 2026-06-11

Shortcut polish, a test-suite expansion that caught three real bugs, and CI maintenance.

### Fixed
- **LSP refactor shortcut is now rebindable** — `editor.codeActions` (default `Ctrl+Shift+R` / `Cmd+Shift+R`) was display-only in Settings → Shortcuts with the key hardcoded in the editor keymap, so remapping it had no effect. It now dispatches through the global shortcut system like Format document: the editor pane exposes `openCodeActions()`, the app routes the binding to the active editor, and the shortcut falls through harmlessly when the active tab isn't an editor.
- **Unix paths from language servers lost their leading slash** — `uriToPath` stripped all three slashes from `file:///home/...`, turning absolute paths relative and silently breaking go-to-definition and workspace edits on macOS/Linux. Windows drive paths were unaffected.
- **Share-server connections could die instantly on Windows** — sockets accepted by the LAN share server inherit the listener's non-blocking mode, so per-connection reads (request headers, WebSocket ping/close frames) could fail immediately with `WouldBlock`; the WS reader thread died at spawn, leaving ping/close handling dead. Accepted sockets are now reset to blocking, and WS clients register for broadcasts before the handshake response so a push can't slip past a freshly connected viewer.
- **Same-position LSP inserts applied in reverse order** — `applyEditsToText` applied multiple zero-width inserts at one position bottom-up without a tiebreak, reversing the array order the LSP spec mandates.

### Tests
- **Suite grown from 105 to 142 Vitest tests and 126 to 130 Rust tests** — new suites for LSP URI/hover protocol helpers, share-page HTML escaping (untrusted terminal/AI content), shortcut matching and registry invariants (duplicate ids, conflicting default bindings), and explorer icon resolution (catppuccin→vscode-icons fallback chain); plus WebSocket frame-length boundary tests and real loopback integration tests of the share server (RFC 6455 handshake with the spec example key, broadcast delivery, masked close, 400 on missing key). The three fixes above all fell out of these tests.

### CI
- **GitHub Actions bumped for the Node 24 runner switchover** (forced June 16, 2026): `actions/checkout` v4→v6, `actions/setup-node` v4→v6, `pnpm/action-setup` v4→v6 across all workflows, and `softprops/action-gh-release` v2→v3 in the release workflow.

## [1.18.0] — 2026-06-11

WebSocket live terminal sharing, LSP extract/inline refactorings, instant tab reload after multi-file edits, and a richer folder icon set.

### Added
- **WebSocket live terminal view** — the LAN share server gains a `/ws` endpoint (RFC 6455 handshake and framing implemented stdlib-only, with unit tests against the RFC vectors) so live terminal viewing pushes the instant output arrives instead of on the ~2 s SSE poll. The shared page connects via WebSocket and falls back to the kept `/stream` SSE endpoint automatically. The app now pushes on terminal output events (debounced to one push per ~120 ms burst) via a new zero-cost-when-idle output-listener registry in `useTerminalSession`. The view stays read-only by design — the server has no auth, so client frames are never forwarded to the terminal.
- **LSP refactorings: Extract Function / Inline Variable (Ctrl+Shift+R)** — a new editor dialog lists `refactor.*` code actions from the language server for the current selection (extract function and inline variable sorted first) and applies the chosen workspace edit to disk. Actions without a literal edit are resolved via `codeAction/resolve` (`resolveSupport`/`dataSupport` now advertised); command-only actions run through `workspace/executeCommand`. The buffer is saved before requesting actions so edits are computed against disk content. Listed in the shortcuts dialog as a display-only Editor entry.
- **LSP proxy answers server→client requests** — the Rust session reader previously dropped server-initiated requests (emitting them as events without replying), which stalls servers that block on the response. It now acks `workspace/applyEdit` (forwarding the edit to the frontend applier), answers `workspace/configuration` with per-item nulls, accepts `client/(un)registerCapability`, `window/workDoneProgress/create`, and `window/showMessageRequest`, and returns `-32601` for anything else.
- **vscode-icons folder fallback** — the explorer falls back to a pruned `@iconify-json/vscode-icons` subset (folder types only, light-theme and `-opened` variants dropped; 179 icons, ~420 KB lazy chunk, regenerated via `pnpm icons:folders`) when catppuccin has no folder match. `dotnet` now resolves to NuGet art and `jvm` to Maven instead of the old lib/gradle aliases; Kotlin, iOS, Flutter, Electron, MongoDB, and ~170 other ecosystem folders get purpose-built icons. `mobile`/`devops` keep their catppuccin approximations — no dedicated art exists in either set.

### Fixed
- **Hidden editor tabs went stale after multi-file edits** — `applyWorkspaceEdit` (LSP rename/refactor) and the text-rename fallback now broadcast the rewritten paths via a `nexis:files-rewritten` event, and every open editor pane force-reloads its file immediately instead of only the active tab (the rest previously waited for FS sync to catch up).

## [1.17.0] — 2026-06-11

Unified activity view, cancellable agent tasks, and semantic LSP rename.

### Added
- **Unified Activity panel** — the background-process manager and the AI agent queue are merged into a single sidebar view (relabeled "Activity"). Background shell processes can be killed and queued/running agent tasks stopped from one place. Resolves the "Background job viewer + canceler" roadmap item.
- **Stop a running agent task** — the agent queue can now abort an *in-flight* task, not just queued ones. It calls the chat store's `stop()` to unwind the agent turn and finalizes the task as `cancelled` (a new, retryable status). Previously only queued/done/failed tasks could be removed; a running task had no cancel control.
- **Semantic rename via LSP (F2)** — symbol rename now issues `textDocument/rename` when a language server is active and applies the returned WorkspaceEdit across files, so only true references change (not comments, strings, or substrings). It falls back to the previous word-boundary text find/replace when no server is available, and the dialog shows a `Semantic`/`Text` badge. New `lsp/applyEdit.ts` workspace-edit applier, covered by unit tests.

### Changed
- **Sidebar rail** — the separate "Processes" and "Agent Queue" entries are replaced by a single "Activity" item. The `processes` and `agent-queue` views both render the unified panel, so saved layouts keep working.

### Docs
- **ROADMAP corrections** — the Shipped "AI-powered rename … with AI verification" line was inaccurate (the shipped rename was a regex word-boundary find/replace, with no AI); it now describes the LSP-backed rename with text fallback. The multiplayer-terminal item now describes the shipped SSE transport accurately instead of "polling". The background-job item is marked shipped, and the LSP refactoring item is narrowed to the remaining extract-function / inline-variable work.

## [1.16.0] — 2026-06-10

Editor linting reaches the C-family languages, plus file-tree and fold-placeholder polish.

### Added
- **Java and C/C++ syntax linting** — C, C++, and Java move off the legacy `clike` StreamParser modes onto proper Lezer grammars (`@codemirror/lang-cpp`, `@codemirror/lang-java`), so they now surface real-time syntax-error markers like the other Lezer-backed languages. A new `syntaxErrorRanges` helper expands zero-width error nodes (an expected-but-missing closing delimiter reports as a zero-width node) to a 1-char range, so missing-brace warnings actually render instead of being invisible. Covered by a new `linting.test.ts` (18 tests).
- **Bracket-balance linter for StreamParser languages** — languages without a Lezer grammar produce no error nodes, so they now get a `delimiterLinter` bracket-balance check for the extensions where brackets are reliably balanced.
- **C# language server config** — `csharp-ls` (Roslyn-based, `dotnet tool install --global csharp-ls`) wired into the LSP server registry for `.cs` files.
- **More folder icons** — `mobile`, `systems`, `query`, `functional`, `jvm`, `devops`, and `dotnet` folder names now resolve to catppuccin folder glyphs (android, core, database, functions, gradle, workflows, and lib respectively) instead of the plain default folder.

### Fixed
- **Fold-placeholder pill now follows the theme** — the inline `…` shown in place of folded code used CodeMirror's hardcoded light-gray base-theme box, which clashed with every dark theme. It's now styled from the active theme's CSS variables (translucent fill/border off `--foreground`, `--muted-foreground` text, hover brighten) so it adapts per theme across the editor, git-diff, and AI-diff panes.

## [1.15.15] — 2026-06-10

Code-quality cleanups — no behavior change.

### Changed
- **De-duplicated `display_path`** — the byte-identical helper in `fs/search.rs` and `fs/grep.rs` is hoisted to `fs/mod.rs` and shared.
- **`percent_encode_path` no longer allocates per byte** — `lsp/session.rs` built a temporary `String` and `Vec<char>` for every encoded byte inside a `flat_map`; it now writes directly into a single output `String`.

(The third flagged dedup, `write_if_changed`, was intentionally left as-is: hoisting it out of the two `#[cfg]`-gated `shell_init` submodules cascades into platform-specific import cleanup that's only verifiable on CI's Unix runners — more risk than a stable 15-line helper's duplication is worth.)

## [1.15.14] — 2026-06-09

Correctness + code-quality cleanups from the v1.15.13 review — the low-risk subset.

### Fixed
- **Git output silently dropped on non-UTF-8 bytes** — five `from_utf8(...).unwrap_or("")` sites in `git/operations.rs` (status / log / diff-tree parsers) returned *empty* on a single invalid UTF-8 byte (e.g. a Latin-1 path), losing the whole parse — the pitfall-#13 failure mode. Four now use `from_utf8_lossy`; `split_name_status_numstat` was rewritten to operate on raw bytes so a non-UTF-8 path can't desync the split offset or panic.
- **Editor breakpoint sync ran on every render** — `EditorPane` derived breakpoints via `breakpointsForPath()`, which returns a fresh array each call, so the gutter-sync effect fired on every keystroke. It now selects the stable store array and derives the per-path lines in a `useMemo`.
- **`useFileTree.dirname` mishandled Windows drive roots** — it lacked the pitfall-#12 handling (`C:/file` → `C:` instead of `C:/`), unlike `lib/path.ts`. Added separator normalization + drive-root handling.

### Changed
- **`AgentSwitcher` reads the agent list reactively** — replaced a `useAgentsStore.getState().all()` snapshot + a `void customAgents` subscription-keepalive hack with a `useMemo` keyed on the subscribed `customAgents`.

## [1.15.13] — 2026-06-09

Bugfix sweep.

### Security
- **Git worktree commands now enforce workspace authorization** — `git_worktree_list/add/remove/prune` bypassed the `WorkspaceRegistry` authorization that all 20+ other git commands run through, so a compromised renderer or plugin could operate on git worktrees of an arbitrary repo *outside* the authorized workspace (including `worktree add` writing to an arbitrary path and `worktree remove --force`). All four now call `authorized_repo_root` first, matching every sibling command.

### Fixed
- **LSP/DAP unbounded `Content-Length` allocation** — the JSON-RPC reader loops allocated `vec![0u8; len]` straight from the subprocess's `Content-Length` header with no upper bound, so a malformed or hostile language server / debug adapter could force a multi-GB allocation (OOM → abort under `panic = "abort"`). Both are now capped at 64 MiB.
- **Git availability cache: stray panic on a poisoned lock** — one of the two `availability_cell().lock()` sites in `git/process.rs` still used `.expect()` (it had dodged the earlier sweep due to indentation); it now recovers from poison like its sibling.
- **Two Rules-of-Hooks violations** — `AiChat`'s `RenderedMessage` called `useMemo` *after* an early `return` for user messages, and `WorkspaceEnvSelector` called five store hooks after a `return null` platform guard. Both are safe today only because the branch condition is fixed per component instance, but they are latent crashes (and lint violations); the hooks now run unconditionally before the early return.

## [1.15.12] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **AI HTTP egress front-door fuzz** — `net.rs` gains two property tests completing the egress-security coverage (the `ip_kind` SSRF classifier was already fuzzed in 1.15.5): `validate_url` never panics and only accepts URLs with an http(s) scheme, no embedded userinfo, and a non-blocked host (50,000 random inputs); `sanitize_headers` never lets a blocklisted header or a value carrying CR/LF/NUL (the header-injection vector) through (30,000 random header maps).

## [1.15.11] — 2026-06-09

Supply-chain — clear the remaining advisories in the shipped dependency tree.

### Security
- **mermaid → 11.15.0 + uuid → 14.0.0** — added pnpm overrides in `pnpm-workspace.yaml` lifting the resolved `mermaid` floor to `>=11.14.1` (pulled in via `streamdown`), clearing the moderate HTML/CSS-injection and Gantt-chart infinite-loop DoS advisories, plus `uuid` to `>=11.1.1` (resolves to 14.0.0, which mermaid accepts) for GHSA-w5hq-g745-h8pq. `pnpm audit --prod` now reports zero advisories. The overrides live in `pnpm-workspace.yaml`, not `package.json` — pnpm 11 no longer reads a `pnpm.overrides` field from `package.json`.

## [1.15.10] — 2026-06-09

Reliability hardening (A5) — bound a network-facing buffer.

### Fixed
- **LAN share server: cap request header reads** — `http_share` read the HTTP request line and headers with unbounded `read_line()`, so a malicious client on the same network could exhaust the host's memory by sending an endless line or an unbounded header stream. The request reader is now bounded to 64 KiB via `Read::take`, after which parsing ends cleanly. (The SSE client list already self-prunes dead senders on each broadcast.)

## [1.15.9] — 2026-06-09

Reliability hardening (A1) — convert avoidable production panics to errors. Because the release profile is `panic = "abort"`, every reachable `.unwrap()`/`.expect()` is a potential whole-app abort.

### Changed
- **`git push` no longer relies on a distance-coupled `unwrap`** — `git/operations.rs` replaced `upstream.unwrap()` (sound only because of an `is_none()` early-return a dozen lines above) with a `let…else`, so the value can never panic-abort the app if that guard is ever moved or refactored.
- **Poison-resilient locks** — the git-availability cache (`git/process.rs`) and the grep results collector (`fs/grep.rs`) now recover from a poisoned lock instead of `.unwrap()`/`.expect()`-panicking, matching the established PTY/workspace pattern.
- **Secrets store (Linux)** — `with_store` returns an error on the (unreachable) empty-cache branch instead of `.expect()`-panicking.

### Notes
- The PTY reader/flusher/waiter thread-spawn sites (`pty/session.rs`) were intentionally left as `.expect()`: a correct conversion to error-returns must kill the just-spawned child shell on the failure path (the kill-guard is already disarmed by then), and that cleanup carries real risk in the delicate ConPTY lifecycle for an extremely rare (OS thread-exhaustion) failure that the crash reporter already captures.

## [1.15.8] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **AI tool-safety property/fuzz tests** — `security.test.ts` gains property tests over the path/command guards (`checkReadable`, `checkWritable`, `checkShellCommand`): on 20,000 random/adversarial inputs they never throw and always return a boolean `ok`; `checkWritable` is proven at least as strict as `checkReadable` (writes inherit every read denial); any path or command containing a control byte is always refused; and a file under `.ssh` is blocked regardless of case, path separator, drive prefix, or depth.

## [1.15.7] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **Shell session sentinel anti-spoof fuzz** — `shell/session.rs` gains a 50,000-iteration fuzz test for `strip_cwd_sentinel`, asserting its security guarantee: a working-directory update is extracted only when the exact random per-session sentinel is present, so untrusted command output (laced with foreign/partial sentinels, multibyte text, and control bytes) can never spoof a cwd change or alter the passed-through stdout — and never panics.

## [1.15.6] — 2026-06-09

Robustness + more bug-catching tests.

### Added
- **Git porcelain-v2 parser fuzz + edge tests** — `git/parser.rs` gains a 50,000-iteration fuzz test asserting the parser never panics on malformed, truncated, or non-ASCII `git status --porcelain=v2 -z` output (it consumes attacker-influenced branch names and file paths), plus regression cases for empty input and a rename record whose paired original-path token is missing.

### Changed
- **Workspace registry lock recovery** — `WorkspaceRegistry`'s `roots` and `canonical_cache` mutexes now recover from a poisoned lock (`unwrap_or_else(|e| e.into_inner())`) instead of `.expect()`-panicking, matching the pattern already used in the PTY subsystem. Poisoning can only occur under unwind (dev/test builds — release is `panic = "abort"`), but this stops a panic in one thread from cascading through the security-critical authorization path during development.

## [1.15.5] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **SSRF classifier fuzz + boundary tests** — `net.rs` gains a 1,000,000-iteration property test asserting the safety invariant of the `ip_kind` SSRF guard: an IPv4 in any reserved/internal range (RFC1918, CGNAT, link-local, loopback, broadcast, multicast, benchmarking) is never classified `Public`/fetchable. It cross-checks against std's own range predicates, so it's an independent oracle rather than a restatement of the implementation. Plus off-by-one boundary tests for the `172.16/12` and `100.64/10` ranges.

## [1.15.4] — 2026-06-09

CI and tooling hardening — no runtime changes.

### Changed
- **CI: macOS Rust job** — `cargo test` now also runs on `macos-latest`, the only job that compiles and exercises the apple-native keychain backend and the macOS window-controls path.
- **CI: production supply-chain gate** — the frontend job runs `pnpm audit --prod --audit-level high`, failing the build on a high/critical advisory in the *shipped* (runtime) dependency tree. Dev-tool advisories are excluded; moderate advisories remain tracked by the weekly `audit.yml` job.
- **Docs: pre-push checklist** — `CLAUDE.md` now lists every command CI gates on (`tsc --noEmit`, `cargo fmt --check`, `cargo clippy -- -D warnings`), with a note to run `fmt` last after any clippy fixes (the ordering that bit the 1.15.0 cycle).

## [1.15.3] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **Sandbox prefix-matching tests for the workspace authorization guard** — `workspace.rs` gains a pure (filesystem-free) test module for `WorkspaceRegistry::is_authorized`, the component-prefix check at the heart of the spawn sandbox. Includes a regression test that a sibling sharing only a *string* prefix with an authorized root (e.g. `/ws/project-evil` vs root `/ws/project`) is rejected — the classic sandbox escape a switch from `Path::starts_with` to `str::starts_with` would silently reintroduce — plus a 5,000-iteration fuzz cross-check against an independent component-prefix reference.

## [1.15.2] — 2026-06-09

Reliability hardening — no user-facing UI changes yet.

### Added
- **Crash reporter** — a global panic hook writes a structured report (app version, thread, panic location, message, and backtrace) to `{cache}/nexis/crash/` before the process exits. Because the release profile uses `panic = "abort"`, a panic on any thread previously vanished with no trace; it now leaves a diagnosable report on disk. A new `list_crash_reports` command (capped at 10 reports, 64 KB each) lets the UI surface a "Nexis recovered from a crash" notice on the next launch.

### Fixed
- **`get_launch_dir` no longer panics on a poisoned mutex** — it recovers the inner value via `unwrap_or_else(|e| e.into_inner())` instead, so a poisoned `LaunchDir` lock can't abort the whole app under `panic = "abort"`.

## [1.15.1] — 2026-06-09

CI and test hardening — no user-facing changes.

### Changed
- **CI now typechecks** — the `test-frontend` job runs `tsc --noEmit` before Vitest. A type error that doesn't happen to break a test can no longer pass CI green (the job previously ran only `pnpm test`).

### Added
- **Fuzz-lite property tests for the DA (Device Attributes) filter** — `da_filter.rs` gains a dependency-free 20k-iteration property test asserting the invariants that matter for an untrusted-byte parser: chunk-boundary invariance (splitting the stream anywhere yields identical output and replies), no byte synthesis (`out` is always an in-order subsequence of the input and never longer), and that every emitted reply is exactly one of the two canonical DA answers. Plus regression cases for a trailing ESC and SGR sequences.

## [1.15.0] — 2026-06-08

A focused polish pass — no new features and no breaking changes. Implements P1–P7 from the June 2026 UI critique (`UI_IMPROVEMENTS.md`) plus a Rust lint/format cleanup.

### Added
- **Brand accent color** — new `--brand` / `--brand-foreground` CSS variables (coral `oklch(0.72 0.15 35)`) defined in `globals.css` and wired into the Tailwind theme. Applied to the welcome-screen CTA button and the zoom-slider range track so the accent is consistent instead of hardcoded per component.
- **Welcome screen AI entry point** — the shortcut grid's first action is now **Open AI agent** (`Ctrl+I`) instead of a duplicate "New terminal", and the subtitle surfaces the AI agent in one line.

### Changed
- **Sidebar overflow menu** — the overflow popover is restructured into five named, labeled groups (Navigation / Code / AI / Dev Tools / Advanced), replacing the flat 20-item PINNED / MORE split. Pin/unpin toggles and top-to-bottom keyboard navigation are preserved.
- **Shortcuts modal key badges** — every key token now renders as a pill badge, including punctuation (`,` `` ` `` `]`). "Jump to tab 1–9" reads as two distinct badges with a dash separator rather than one elongated pill.
- **Section header weight** — settings and shortcuts-modal section headers upgraded to `text-xs font-semibold text-foreground/70`, making them clearly distinct from body copy.
- **Settings modal scroll affordance** — a bottom fade overlay appears when the active tab's content overflows and disappears once scrolled to the bottom, making the cut-off Terminal section discoverable.
- **Terminal recording dot** — the recording toggle gains a `hover:bg-muted` boundary so it reads as a clickable target in its resting state.

### Fixed
- **Undo/redo in the shortcuts list** — `editor.undo` and `editor.redo` are marked `displayOnly` (they are handled by CodeMirror's history keymap and cannot be remapped via the global shortcut system), matching their code comment.
- **Settings scroll fade on reopen** — the scroll-reset effect now keys off the dialog open state, so reopening on the same tab clears the stale "scrolled to bottom" flag and the fade shows correctly.
- **Welcome-screen CTA hover** — brand button hover opacity normalized to `/80` to match the default button variant.

### Internal
- **CI** — added Dependabot, a Rust lint job (`cargo fmt --check` + `cargo clippy -D warnings`), and a weekly `cargo audit`.
- **Rust cleanup** — applied `cargo fmt` across all source files and resolved every `clippy -D warnings` violation (a `PendingMap` type alias for the DAP/LSP pending-request maps, `next_back()` over `.last()`, and a stray doc comment).

## [1.14.0] — 2026-06-07

### Added
- **Expanded syntax highlighting** — CodeMirror language packs for 15 additional languages, with per-file header blocks added across the source tree and GitHub issue/PR templates.

## [1.13.0] — 2026-06-01

### Added
- **OSC 0/2 tab titles** — terminal programs can set the tab title via escape sequences.
- **Cursor preferences** — configurable cursor style and blink rate.
- **Debugger sidebar panel + pinnable rail** — the DAP debugger gets a dedicated sidebar panel, and sidebar-rail items can be pinned.

### Fixed
- **Render-crash error boundary** — a React error boundary renders a recoverable fallback instead of a blank window on a render crash.
- **PowerShell tab title** — corrected PowerShell tab-title handling.

## [1.12.0] — 2026-05-31

### Added
- **E2E harness** — a WebdriverIO end-to-end harness, plus expanded Rust and Vitest unit coverage.
- **Release automation** — the release workflow builds the Windows NSIS/MSI installer on a `v*` tag push.

### Fixed
- Assorted bug fixes surfaced by the new test coverage.

## [1.11.0] — 2026-05-31

### Added
- **AI explain commit** — an "Explain" button in the git-history commit-detail popover loads the full diff and sends it to the AI panel with author/SHA context.
- **Shell command snippets** — a sidebar panel for saving and running frequently-used shell commands; one-click sends to the active terminal, with `{VAR}` placeholder support and five built-in starters.

## [1.10.0] — 2026-05-31

### Added
- **Workspace notes** — a per-workspace Markdown scratch-pad saved to `.nexis/NOTES.md`; auto-saves on keystroke, with a live-preview toggle, accessible from the sidebar.
- **Git worktrees** — list, add, and remove git worktrees from the source-control panel; clicking a worktree switches the workspace; supports a branch-creation flag and prune.

## [1.9.0] — 2026-05-31

### Added
- **Live terminal streaming** — the LAN share server gained Server-Sent Events; the browser page auto-updates every 2 s with current terminal output via a `/stream` SSE endpoint, for real-time viewing on any device on the same network.
- **Prompt templates** — reusable named AI prompts stored in localStorage; one-click sends any template to the AI panel; create/edit/delete from the sidebar, with four built-in starters.
- **File bookmarks** — bookmark any file or line with `Alt+D`; a persistent, keyboard-navigable sidebar panel grouped by file, with inline label editing, backed by localStorage.

## [1.8.0] — 2026-05-31

### Added
- **Semantic / AST-aware search** — a structural symbol-search panel with pattern prefixes (`fn:` `class:` `hook:` `import:` `type:` `const:`) that translate to language-aware regexes fed to the existing grep backend.
- **Remote Prompt viewing** — a local stdlib-only TCP HTTP server serves the current AI conversation as a self-contained HTML page accessible from any device on the same LAN; the same server also handles terminal snapshots.
- **AI refactoring engine** — a sidebar panel with Extract Function, Inline Variable, Add Types, Simplify, Add Error Handling, and Add Docs operations; `Alt+Shift+X` captures the active editor selection and prompts the AI with structured refactoring instructions.
- **Multi-window** — open Nexis in multiple independent windows via `Ctrl+Shift+N`; each window has its own workspace, tabs, and layout, sharing the OS keychain and theme.

## [1.7.0] — 2026-05-31

### Added
- **AI code review** — on-demand review of the staged or all-unstaged diff via a dedicated sidebar panel; shows file/line stats and a scrollable diff preview, and "Review with AI" sends the diff as a structured prompt.
- **AI-assisted git conflict resolution** — conflict files are surfaced automatically in the source-control panel; "Resolve with AI" reads the conflicted file and sends a structured three-way resolution prompt including conflict markers and context.
- **Background agent queue** — a sidebar panel for queuing multiple AI prompts to run sequentially; tasks show queued/running/done/failed status with duration, failed tasks can be retried, and there's a clear-completed action.

## [1.6.0] — 2026-05-31

### Added
- **Streaming build errors → AI** — a "Fix with AI" button appears in the Build panel when a build fails, sending the compiler output directly to the AI panel as a pre-filled prompt.
- **Workspace profiles** — named configurations storing a root path, env-var overrides, and an optional startup command (saved to localStorage); a sidebar panel with full CRUD, where activating a profile switches workspace, applies env vars, and optionally runs the startup command.
- **Embedded REPL panel** — an interactive Python, Node.js, Ruby, or shell REPL in the sidebar via a dedicated TerminalPane; `Alt+Shift+R` sends the active editor or terminal selection directly into the running REPL.

## [1.5.0] — 2026-05-31

### Added
- **Terminal session recording** — record PTY output to an asciinema v2 `.cast` file with a single toggle button, saved to `~/nexis-recordings/`; useful for demos and bug reports.
- **Port forwarding panel** — a dedicated sidebar panel that detects locally listening TCP ports via `ss`/`lsof`/`netstat`, with one-click open-in-preview for web/dev-server ports and a 5 s auto-refresh.
- **SSH key manager** — a collapsible section in the SSH panel listing `~/.ssh/*.pub` keys; generate new Ed25519 key pairs via `ssh-keygen` with an optional passphrase, and one-click copy of the public key.
- **Diffstat in commit view** — per-file +/− line counts in the git-history commit-detail view for every changed file.

## [1.4.0] — 2026-05-31

### Added
- **Workspace switcher** — a keyboard picker (Ctrl + backtick) for recently opened folders with fuzzy search; switching resets the workspace and starts a fresh terminal at the selected directory, and the recent list persists across restarts.
- **Persistent AI chat history** — a searchable session-history popover in the AI panel header; sessions sorted by last-updated, filterable by title, with compact timestamps, backed by the Tauri store across restarts.
- **Git submodule support** — a collapsible submodule list in the source-control panel with status badges (ok / modified / uninitialized / conflict), short SHA, path display, and per-entry init/update actions.

## [1.3.0] — 2026-05-30

### Added
- **Git stash manager** — list, create, apply, pop, and drop stashes from the source-control panel; a collapsible stash list with message, timestamp, and per-entry actions.
- **AI inline explain** — select any terminal output or code and click "Explain" to submit an explanation request to the AI mini-window instantly, no full panel required.
- **Terminal → AI** — "Explain" and "Ask Nexis" buttons appear on text selection in the terminal or editor; the selection is attached as context and the AI responds in the mini-window.

## [1.2.0] — 2026-05-30

### Added
- **Image viewer** — open PNG, JPG, GIF, WebP, SVG, BMP, ICO, AVIF, and TIFF files directly in a new tab. Supports fit-to-window mode, zoom in/out (scroll wheel or toolbar), pixel-perfect rendering at high zoom, fullscreen toggle, and animated GIF/WebP playback pause during window resize or when the tab is hidden.
- **Tab drag-to-reorder** — drag any tab left or right to reorder the tab strip. Chrome-style live preview: the tab slides to its new position in real-time as you drag. Grab cursor on hover, grabbing cursor during drag.
- **Custom cursor set (Tailless Smooth)** — app-wide custom cursors using the Tailless Smooth set. All 29 cursor states are covered (arrow, pointer, text, resize handles, grab/grabbing, crosshair, wait, not-allowed, zoom, and more). Hotspot coordinates read directly from the original `.cur` file headers.
- **Source Control panel icon** — replaced the animated folder in the "No repository" empty state with a static `FolderGitTwo` icon for a cleaner look.

### Changed
- **Welcome screen** — replaced the animated folder with the Nexis logo PNG backed by a theme-colored radial glow. DarkVeil background tuned (speed `0.4 → 0.3`, noise `0.025 → 0.04`). Added a gradient horizontal rule between the CTA and shortcuts grid. `<kbd>` chips now have an inset bevel shadow for a keycap feel.
- **Tab bar** — active tab now shows a 1.5 px primary-color accent line along the top edge.
- **Sidebar rail** — active view indicator changed from a bottom underline to a left-edge 2 px line (matching VS Code / Fleet style).
- **Panel headers** — subtle `primary/4%` gradient sweep on the header row of Recent Files, Snippets, Database, and Source Control panels.
- **Status bar** — hard `border-t` replaced with a soft gradient line that fades at the edges.
- **Scrollbars** — added `.nexis-scrollbar` utility (3 px, semi-transparent thumb) applied to sidebar panel list containers.
- **Empty states** — Snippets panel now shows a `FileCode` icon above the "No snippets yet" text; Database panel icon normalized to size 28 / `30%` opacity to match Source Control and Snippets.

### Fixed
- **Tab reorder via HTML5 drag API** — replaced with mouse-event-based drag (pointerdown → global mousemove/mouseup) to avoid conflicts with Tauri's `data-tauri-drag-region` intercepting drag events on the tab bar container.

---

## [1.1.0] — 2026-05-29

### Added
- **Recent Files panel** — new **Recent Files** entry in the sidebar rail (clock icon, second position after Files). Tracks every file you open through the explorer or that the AI agent writes/edits, persisted across sessions via localStorage (up to 50 entries). Displays filename, directory path, and a relative timestamp ("just now", "3m ago", "2d ago"). Hover any row to reveal a remove button; **Clear** in the panel header wipes the whole list.
- **Fuzzy search on Recent Files** — a filter input appears in the panel whenever the list is non-empty. Matches against the filename (higher weight) and directory path simultaneously, ranks results by consecutive-character runs and proximity to the start of the name, and highlights matching characters inline. Keyboard-navigable: `↓ / ↑` moves the selection, `Enter` opens the file, `Escape` clears the query. Mouse hover and keyboard selection stay in sync.
- **AI-edit tracking in Recent Files** — files written by the AI agent via `edit`, `write_file`, and `multi_edit` tools are automatically pushed to the Recent Files list via the `fs:file-written` event, without any manual action needed.
- **AI mini-window input bar** — the floating AI popup now contains a full text input bar (same `AiInputBar` component as the docked panel). Typing in the mini-window works identically to the main panel; picking a quick-action suggestion pre-fills the input instead of jumping away to the full panel.
- **AI mini-window logo** — Nexis logo displayed at the top of the mini-window popup.

### Fixed
- **App reset to welcome page after AI file edits** — when the AI agent wrote a file and the only open tab was a transient `ai-diff` or `git-diff` tab, `saveTabState` serialized an empty tab list and overwrote the previously-saved terminal/editor tabs in localStorage. On next reload the app found no tabs and showed the welcome page. Fixed by skipping the save when the serialized list would be empty but in-memory tabs still exist.

---

## [1.0.0] — 2026-05-27

This is the first stable release of Nexis. The milestone closes out the initial feature roadmap with release tooling and represents the full pre-1.0 feature set built across the 0.x series.

### Added
- **Release tooling panel** — a dedicated **Release** panel in the sidebar surfaces everything needed to ship: current version from `package.json`, the last git tag, all commits since that tag formatted as a conventional changelog entry, one-click copy to clipboard, and buttons to create a git tag for patch/minor/major bumps directly from the UI.
- **AI skill bundles** — the agent skill system is now extensible. Skill bundles are composable packages of slash commands and agent tools; the foundation for community-installable bundles is in place.

### What's in 1.0

Over the 0.x series, Nexis shipped: multi-tab PTY terminal, CodeMirror 6 editor with AI autocomplete, AI agent panel with 12+ providers (including offline via LM Studio/MLX/Ollama and Hugging Face hosted models), source control, git history, test runner, build system, database panel, SSH connection manager, Jupyter notebook viewer, Python environment awareness, Docker/devcontainer detection, workspace-wide symbol rename, code minimap, snippet library, find-and-replace, command palette, symbol outline, breadcrumb navigation, background process manager, keybinding editor, markdown preview, code formatter, run-file integration, drag-to-float AI panel, notifications center, and more.

No accounts. No telemetry. BYOK or fully offline.

---

## [0.9.15] — 2026-05-27

### Added
- **Jupyter notebook viewer** — right-click any `.ipynb` file in the explorer and select **Open Notebook** to view it in a dedicated tab. Code cells render with syntax-aware styling and execution count labels; markdown cells render as formatted text; stream and error outputs are shown below each code cell with ANSI escape stripping. Static read-only view (no kernel required).

---

## [0.9.14] — 2026-05-27

### Added
- **Container-aware environments** — Nexis now detects Docker and devcontainer configurations in the workspace root (`.devcontainer/devcontainer.json`, `docker-compose.yml`, `Dockerfile`, etc.) and surfaces a **Container** pill in the status bar. The pill shows the detected type (Dev Container, Docker Compose, or Dockerfile) with a tooltip. Detection is automatic and re-runs when the workspace changes.

---

## [0.9.13] — 2026-05-27

### Added
- **SSH connection manager** — a dedicated SSH panel in the sidebar lets you save, edit, and delete SSH connections (host, port, user, identity file). Click **Connect** on any saved connection to open it in a new terminal tab with the correct `ssh` command pre-entered and executed. Connections persist across sessions via the Tauri store.
- **Code minimap** — the editor now shows a 52 px minimap panel alongside the code. Each line is rendered as a thin strip colored by content type (comments vs. code). Click or drag anywhere on the minimap to jump to that position; a viewport indicator shows your current scroll location.

---

## [0.9.12] — 2026-05-27

### Added
- **Workspace-wide symbol rename** — press **F2** on any identifier in the editor to rename it across all files in the workspace. A dialog shows the symbol, a count of occurrences by file, and an input for the new name. Pressing Enter or clicking Rename applies word-boundary-aware replacement to every matching file simultaneously and reloads the editor. Supports any text file; uses the same fast native grep engine as the AI tools.

---

## [0.9.11] — 2026-05-27

### Added
- **Hugging Face integration** — Hugging Face is now a first-class AI provider. Add your HF access token in Settings → AI and choose from five pre-configured hosted models: Llama 3.1 70B, Llama 3.1 8B, Qwen 2.5 Coder 32B, Phi-4, and Mistral 7B. All models run through the HF Inference API and work in the AI panel, autocomplete, and any other model-using feature.

---

## [0.9.10] — 2026-05-27

### Added
- **Integrated build system** — new **Build** tab in the sidebar. Auto-detects your build tool from the workspace root (pnpm, Cargo, Make, Gradle, Maven, CMake, Go, Python). Enter any custom command or use the detected one. Click **Build** (or press Enter) to run; live output streams into the panel. Stop the build at any time. Success/failure status is parsed from the output and shown with a summary line.

---

## [0.9.9] — 2026-05-27

### Added
- **Database panel** — new **Database** tab in the sidebar. Connect to SQLite, PostgreSQL, and MySQL databases. Browse tables with the schema browser; click a table chip to instantly run a `SELECT * … LIMIT 100` query. Write and run arbitrary SQL in the built-in query editor (Ctrl+Enter to run). Results render in a scrollable table with a sticky header. Connections persist across sessions.

---

## [0.9.8] — 2026-05-27

### Added
- **Live file system sync** — the file explorer now auto-refreshes every 3 seconds when the app is focused and the window is visible. Files created, renamed, or deleted by terminal commands or external tools appear immediately without requiring a manual refresh click.
- **Test runner panel** — new **Tests** tab in the sidebar. Auto-detects the test framework from your workspace (Vitest, Jest, Cargo Test, pytest, Go Test, Gradle). Run tests with one click; live output streams into the panel as the suite runs. Stop the run at any time. Test results show pass/fail status with a summary line parsed from the test output.

---

## [0.9.7] — 2026-05-27

### Added
- **AI PR description generation** — **Generate PR Description** button in the Source Control panel opens a dialog that reads the last 20 commits and uses AI to draft a pull request title and Markdown body. The title and body are independently editable before copying. Powered by the same model selected for the AI panel.

---

## [0.9.6] — 2026-05-27

### Added
- **Snippets library** — new **Snippets** tab in the sidebar rail. Create, edit, and delete code snippets with tab-stop placeholders (`$1`, `$2`, …, `$0` for final cursor position), scoped by language. Built-in starter snippets for TypeScript, Python, Rust, and Go. Trigger any snippet in the editor by typing its prefix then pressing **Tab** — the prefix is replaced with the snippet body and the cursor is placed at the first tab stop. Snippets persist across sessions via a local store.

---

## [0.9.5] — 2026-05-27

### Added
- **Breadcrumb navigation** — the editor toolbar now shows the file's path relative to the workspace root as a row of clickable segments. Clicking any folder segment switches the sidebar to the file explorer. The final segment (filename) is styled differently and non-interactive.
- **Symbol outline panel** — new **Outline** tab in the sidebar rail shows a live, scrollable tree of symbols in the active file: functions, classes, interfaces, types, enums, and methods. Symbols are extracted via language-aware regex patterns covering TypeScript/JavaScript, Python, Rust, and Go. Each entry shows the symbol kind (with a color-coded icon), name, and line number.

---

## [0.9.4] — 2026-05-27

### Added
- **Command palette** — `Ctrl+Shift+P` (`Cmd+Shift+P`) opens a fuzzy-searchable overlay of every app action: open settings, toggle panels, new tab, split panes, change sidebar view, toggle the AI panel, zoom controls, and more. Built on `cmdk` for instant keyboard-driven filtering. Commands are grouped by category and navigable with arrow keys; Enter executes, Escape dismisses.

---

## [0.9.3] — 2026-05-27

### Added
- **Find & replace across project** — `Ctrl+Shift+H` (`Cmd+Shift+H`) opens a workspace search overlay. Supports plain text and regex search, case sensitivity toggle, and per-file match preview with syntax-highlighted match regions. **Replace all** reads every matching file, applies the replacement, and writes it back — with a confirmation count on completion. Results show file name, relative path, and each match line with its line number. Shortcut also appears in the keyboard shortcuts dialog.

---

## [0.9.2] — 2026-05-27

### Added
- **Background process manager** — new **Processes** panel in the sidebar shows every `bash_background` process with its command, working directory, start time, and live status (running / exited + exit code). Kill any running process with one click. Badge on the rail shows the count of running processes at a glance.
- **Notifications center** — bell icon in the status bar tracks in-app events (AI completions, errors, background process events). Unread count badge clears on open; individual notifications can be dismissed or bulk-cleared.

---

## [0.9.1] — 2026-05-27

### Added
- **Word wrap toggle** — wrap long lines at the viewport edge instead of scrolling horizontally. Toggle with the **Wrap** button in the editor toolbar or set it permanently in Settings → General → Editor. Persisted across sessions and synced across windows.
- **Code folding improvements** — fold all regions in the active file with `Ctrl+K Ctrl+0` (`Cmd+K Cmd+0` on macOS); unfold all with `Ctrl+K Ctrl+J`. Region comment folding now collapses `// #region` … `// #endregion` blocks (VS Code–compatible syntax) without any extra toolchain.

---

## [0.8.3] — 2026-05-25

### Added
- **Code formatting** — per-language formatter integration triggered from the editor (`Shift+Alt+F`) or automatically on save. Supports Prettier (JS/TS/CSS/HTML/JSON/Markdown), rustfmt, clang-format (C/C++), black (Python), and gofmt (Go). All commands use a `{file}` placeholder and run in the file's directory.
- **Settings → Formatters tab** — enable/disable per language, edit the formatter command, and reset to default. "Format on save" toggle applies the configured formatter after every Ctrl+S save.

### Changed
- **Settings is now an in-app modal dialog** — replaces the separate OS window. Opens centered over the app with a blurred backdrop at 920 × 700 px. Closes on Escape or ×. All existing shortcuts and `openSettingsWindow("tab")` deep-links continue to work.

---

## [0.8.1] — 2026-05-24

### Fixed
- **Terminal keyboard input on fresh launch** — typing in a new terminal tab immediately after launch was silently dropped until the PTY IPC channel was fully ready. Writes are now queued and flushed once the session is open.

---

## [0.8.0] — 2026-05-24

### Added
- **Inline linting and diagnostics** — real-time syntax error markers in the editor gutter via `@codemirror/lint`. Lezer parser errors surface for JS/TS, Python, Rust, Go, JSON, HTML, CSS, and Markdown with zero external toolchain required.

---

## [0.7.6] — 2026-05-24

### Fixed
- **Explorer rename failure is now visible** — `fs_rename` errors were silently swallowed; the user now sees an alert describing what went wrong instead of the rename silently reverting.
- **Explorer delete failure is now visible** — `fs_delete` errors were silently swallowed; the user now sees an alert instead of the file appearing to still exist.
- **Shell history overlay load error** — `read_shell_history` failures were silently caught and left the overlay showing "No shell history found" with no indication of the real problem. The overlay now shows "Could not load shell history" when the invoke fails.
- **Autostart toggle failure is now visible** — enabling/disabling launch-at-login could fail silently (e.g. missing OS permission); the user now sees an alert explaining the failure instead of the toggle appearing to have worked.
- **File attach skips binary/oversized files visibly** — attaching a binary or oversized file to an AI message silently discarded it; the user now sees an alert naming the file and the reason it was skipped.
- **Whisper mic/transcription errors surfaced** — microphone access denial and Whisper API failures were only logged to the console; the user now sees an actionable alert ("Microphone access denied — allow access in system settings" / "Transcription failed — check your OpenAI key and try again").
- **Reveal in file manager failure is now visible** — `revealItemInDir` failures were silently logged; the user now sees an alert when the OS can't reveal the file.

## [0.7.5] — 2026-05-23

### Fixed
- **Installer context-menu entries** — Windows right-click "Open in …" registry entries (for folders, folder backgrounds, and drives) still referenced the old "Terax" app name and executable. Updated `installer-hooks.nsh` to write and clean up `OpenInNexis` keys pointing to `nexis.exe`.

## [0.7.4] — 2026-05-23

### Fixed

**Rust backend**
- **PTY thread panic propagation** — All `.lock().unwrap()` calls on the shared `pending` mutex in `session.rs` (reader, flusher, waiter threads) now use `.unwrap_or_else(|e| e.into_inner())`. A panic in one thread no longer poisons the mutex and silently kills output in all other threads.
- **`pty_close` killer-lock panic** — `s.killer.lock().unwrap()` in `pty_close` replaced with `if let Ok(mut k) = s.killer.lock()`. A poisoned killer mutex (child process had already crashed) no longer panics the Tauri worker thread.
- **`pty_close` thread-spawn panic** — `thread::spawn(...).expect("spawn pty drop thread")` replaced with `.map_err(...)? `. Out-of-memory or thread-limit conditions now return an error to the frontend instead of aborting the process.
- **Git stdout silent UTF-8 data loss** — `git_stdout_line_opt` and `git_stdout_lines` in `process.rs` used `std::str::from_utf8(&output.stdout).unwrap_or("")`, which discards all output on invalid UTF-8 (e.g. Latin-1 encoded commit messages, binary filenames). Changed to `String::from_utf8_lossy(...)` to replace invalid bytes with `U+FFFD` instead of returning empty results.

**TypeScript / Frontend**
- **Shell agent session permanently broken after open failure** — `getSessionShell()` in `tools/shell.ts` cached rejected promises in `sessionShells`. If `shellSessionOpen` failed, every subsequent `bash_run` in that session re-threw the original error forever. The promise's `.catch()` handler now deletes the map entry before re-throwing, so the next call retries cleanly.
- **`approxBytes` throws on circular tool output** — `JSON.stringify(part.output)` in `compact.ts` throws a `TypeError` on circular object references. Replaced with a `safeJsonLength()` wrapper that catches the exception and returns a conservative estimate, preventing context compaction from crashing mid-conversation.
- **`dirname()` wrong result for Windows drive roots** — `dirname("C:/file.txt")` returned `"C:"` instead of `"C:/"`, breaking any path-based git or navigation operation for files at the drive root. Fixed by special-casing `idx === 2 && path[1] === ':'` to preserve the trailing slash. Also fixed `idx === 0` to return `"/"` (Unix root) instead of the full path.

## [0.7.3] — 2026-05-22

### Added
- **Theme editor** — Create/Edit buttons in Settings → Themes now open the `.nexis-theme` file in the code editor. Create generates a starter theme, saves it to custom themes, and opens it for editing. Edit opens the existing file. Main-window listener for `nexis://theme-edit` wired up in `App.tsx`.
- **Installer logo** — Nexis logo added as the Windows installer header image.

### Fixed
- Theme editor Create/Edit buttons were visually present but did nothing — the `nexis://theme-edit` event had no listener in the main window.

## [0.7.2] — 2026-05-22

### Added
- **Custom themes** — create, import, and delete `.nexis-theme` files from Settings → Themes. Swatch grid with live color previews.
- **Background images** — set a custom background image with adjustable opacity (0–100%) and blur (0–64px) in Settings → Themes. Stored locally; no cloud dependency.
- **Theme system foundation** — modular architecture: `types`, `validateTheme`, `themeFiles`, `customThemes`, `applyTheme`, `bgImageStore`, `SurfaceLayer`. Cross-window theme-change sync via `nexis://prefs-changed`.
- **Background preference store** — `backgroundKind`, `backgroundImageId`, `backgroundOpacity`, `backgroundBlur` added to preferences with full cross-window propagation.

### Changed
- Terminal renderer pool and `TerminalPane` updates.
- Settings layout and section polish (Agents, General, Themes sections).
- Style token and global CSS improvements.
- Workspace module updated in Rust backend.

## [0.7.1] — 2026-05-22

### Added
- **Shell history search** — Ctrl+R now opens a fuzzy, keyboard-navigable overlay sourced from your shell history (`~/.zsh_history`, `~/.bash_history`, fish history, PowerShell history). Arrow keys to navigate, Enter to insert, Escape to dismiss.
- **Terminal color themes** — built-in ANSI palette switcher in Settings → General: Default Dark, Catppuccin Mocha, Dracula, Nord, Solarized Dark, One Dark. Swaps hot without restart.
- **Tab and layout persistence** — terminal tabs (with working directory) and editor tabs are saved on change and restored on next launch. Toggle in Settings → General → Startup. Off by default clears saved state immediately.
- **Quick file open (Cmd+P / Ctrl+P)** — fuzzy workspace file picker. Respects `.gitignore`. Opens selected file in a new editor tab.

### Fixed
- Settings window 1px DWM border on Windows 10 removed (matching the main window fix).
- Replaced Terax logo with the Nexis logo in About section.

## [0.7.0] — 2026

### Changed
- Rebranded from Terax to Nexis.
- New Nexis logo across all platforms.
- Updated all branding, storage keys, and event namespaces.

## [0.5.9] — 2026

### Added
- Window management for Linux.

### Changed
- Secrets (keyring) redesign.
- Auto updater stabilization.

## [0.5.8] — 2026

### Added
- Auto-updater wired into release builds.
- GitHub Actions workflow for cross-platform builds and releases.

### Fixed
- Linux window initialization issue on first launch.

### Changed
- CI: bumped Node and pnpm versions used in release pipeline.

## [0.5.7]

### Changed
- Default working directory for new sessions is now `$HOME`.
- Stabilized shell init scripts (zsh / bash / pwsh) — fewer edge cases on first prompt.

## [0.5.6]

### Changed
- Reduced app size and startup cost via lazy loading of editor/AI modules.

## [0.5.5]

### Added
- Demo assets and updated README screenshots.

### Changed
- Dependency version sweep.

## [0.5.4]

### Changed
- Combined snippets and commands into a single surface for a cleaner UX.

## [0.5.3]

### Changed
- UI polish across AI / agent views.

## [0.5.2]

### Changed
- AI mini-window UI/UX improvements.

## [0.5.1]

### Added
- Full agentic workflow: plans, sub-agents, tasks, project init.
- Improved shell tool for the agent.

## [0.4.7]

### Added
- Vim mode in the code editor.
- Keyboard navigation across the file explorer.

## [0.4.6]

### Changed
- Cleanup pass: dependencies, UI, icon set.

## [0.4.5]

### Changed
- Optimized PTY resizing, session lifecycle, and AI context handling.

## [0.4.4]

### Changed
- Agents UI/UX improvements.

## [0.4.3]

### Added
- Skills and multi-agent support.
- Settings UI improvements.

## [0.4.2]

### Changed
- AI autocomplete improvements (latency, accuracy).

## [0.4.1]

### Added
- Local LLM support via LM Studio.
- Groq and Cerebras providers.
- AI autocomplete in the code editor.

## [0.3.9]

### Added
- AI edit diffs — preview and approve agent edits before applying.

## [0.3.8]

### Added
- File search across the workspace.
- Separate editor tab type, decoupled from terminal tabs.

## [0.3.7]

### Added
- Web preview tab with auto-detection of local dev servers.

## [0.3.6]

### Added
- Autostart and window-state persistence.

### Changed
- Settings UI improvements.

## [0.3.5]

### Added
- Standalone settings window.

## [0.3.4]

### Added
- New AI mini-window.
- Text selection handling and session persistence.

## [0.3.1]

### Changed
- Internal refactor.

## [0.3.0]

### Added
- AI agents (initial implementation).
- Apache-2.0 license.

## [0.2.9]

### Added
- Tauri keyring integration — API keys now stored in the OS keychain.

### Changed
- Internal renaming pass.

## [0.2.8]

### Changed
- Icon set and theme refresh.

## [0.2.7]

### Added
- Context menu in the file explorer.

### Changed
- General refactor; editor improvements.

## [0.2.4]

### Fixed
- Various bug fixes.

## [0.2.3]

### Added
- File explorer (first version).
- Code editor based on CodeMirror 6.

## [0.2.1]

### Added
- Logging.

### Fixed
- Shell script handling and session edge cases.

## [0.2.0]

### Added
- AI side panel.
- Status bar.
- Keyboard shortcuts.

## [0.1.3]

### Added
- AI SDK and AI Elements integration.

## [0.1.2]

### Added
- New app logo.
- Configurable window size.

## [0.1.1]

### Changed
- Rendering and resize improvements.
- Header and tabs UI polish.

## [0.1.0]

### Changed
- New UI shell.
- Internal refactor; fixed render/resize race.

## [0.0.8]

### Added
- Multi-tab support.
- Basic layout UI.

## [0.0.7]

### Changed
- Switched icon library from Lucide to HugeIcons.

## [0.0.6]

### Added
- Custom font and theme.
- Tauri window management.

## [0.0.5]

### Added
- xterm.js WebGL renderer, search, and link plugins.

## [0.0.4]

### Added
- shadcn/ui component set and supporting deps.

## [0.0.3]

### Added
- Child process lifecycle handling.
- Per-session locking.

## [0.0.2]

### Added
- Initial Rust PTY backend with xterm.js in React (prototype).
