# Roadmap

Where Nexis is heading, what's already in, and what I'm deliberately not building.

This gets updated as things shift. Day-to-day tracking lives in [GitHub Issues](https://github.com/rwetz/Nexis/issues).

---

## The point of Nexis

A terminal that treats AI as a first-class citizen — not a chatbot glued to the side, but something woven into the actual workflow. Fast, small, cross-platform, no cloud lock-in. You bring your own keys or run local models entirely offline.

The non-negotiables: terminal correctness, PTY fidelity, no telemetry.

Binary size used to be on that list. It isn't any more (2026-09) — Nexis grew into a full ADE, and a
byte budget that once kept a terminal honest had started vetoing features on principle rather than on
merit. A deliberately loose **40 MB tripwire** stays in `release.yml` as a regression guard: the binary
ships at ~9.5 MiB, so crossing 40 MB means an accident, not a feature. "Every dependency earns its
place" survives as a design principle — it just isn't enforced by a number any more.

## Hard limits (things that won't be built)

- **Not a VS Code replacement.** The goal is a focused terminal-first tool — not a feature-for-feature IDE clone.
- **Not a browser.** The preview pane exists for local dev servers only.
- **Not a document editor.** This is terminal-first.
- **Not a package manager UI.** Use `npm`, `cargo`, `pip` in the terminal like normal.
- **No accounts or telemetry.** Ever.
- **No extension marketplace.** Maybe narrow AI tool bundles someday, but not arbitrary plugins.
- **No bundled LLM inference.** This outlives the size budget that first justified it. What still holds: weights are gigabytes and no binary ceiling covers them; a real engine means per-backend builds (CUDA / ROCm / Metal / Vulkan) and a GPU-driver support surface this repo has no business carrying; and Ollama, LM Studio and MLX already do it well and are what people already have installed. Local models stay supported by shelling out, not by embedding an inference engine.
- **No mobile (iOS/Android).** The app's shape — real shells, PTY, arbitrary filesystem access — doesn't map onto mobile sandboxes. This is about Nexis *running* on a phone. Building mobile apps *with* Nexis is a different question and is planned — see the Mobile pack under custom feature requests.

## Design principles

1. AI should feel native, not bolted on — agents, autocomplete, and voice are first-class features
2. Keep the binary small. Every dependency earns its place.
3. Terminal correctness comes first. TUI apps, PTY edge cases, true-color — all matter.
4. Same experience on macOS, Linux, Windows, and WSL. No platform gets left behind.
5. Safe by default — path guards, SSRF protection, IPC sandboxing, tool approval flows.

---

## Shipped

The complete, versioned history of every shipped feature lives in **[CHANGELOG.md](CHANGELOG.md)** — that is the canonical record. This roadmap deliberately tracks only what's planned or in progress; items are removed once they land and written up in the changelog instead.

---

## Custom feature requests (top priority)

Owner-requested work, ahead of everything below it. These are handed out **one at a time** as normal
requests — each bullet is scoped to stand alone as a single task, so pick one, finish it, changelog it,
and stop. Don't batch them.

- [ ] **Lumen ↔ Nexis integration** — cross-compatibility between Lumen and Nexis: shared/portable
  config and theme formats, launching one from the other, and a defined handoff for workspace and session
  state. Start with a written interop contract (what's shared, what's owned by which app, what the
  versioning story is) before writing code — this is a design task first and an implementation task
  second.

- [ ] **SignPath.io code signing for Windows** — get Windows builds signed so SmartScreen and Defender
  stop blocking installs. Includes: SignPath project/OSS-sponsorship setup, wiring the signing step into
  the release workflow for the NSIS and MSI artifacts, and confirming a clean download-and-install on a
  fresh Windows VM. Largely external/account work — the blocking step is the SignPath approval, so start
  that early.

- [ ] **macOS release builds** — `release.yml` builds Windows and Linux (amd64 + arm64); there is no
  macOS job, so no release has ever carried a macOS artifact. This is the same gap the Linux job closed,
  and it is smaller than it looks: `tauri.conf.json` already sets `bundle.targets: "all"` with
  `macOS.minimumSystemVersion: "13.0"`, and CI's `test-rust-macos` job already compiles and tests the Rust
  side on `macos-latest` every run — so portability is largely answered and what is missing is the
  artifact. Design principle 4 currently claims "Same experience on macOS, Linux, Windows, and WSL" while
  shipping nothing for macOS; this is what closes that.
  - **Decide the architecture story first.** `macos-latest` is Apple Silicon, so the cheap version is an
    arm64-only `.dmg`. Intel Macs need either a second `macos-13` runner or a universal build
    (`--target universal-apple-darwin`, both Rust targets installed, one fat binary). Pick before writing
    the job — it changes the matrix, the artifact names, and what the download page has to explain.
  - **Signing and notarization is the blocking, external half**, and it is the same species as the
    SignPath item above: an Apple Developer Program membership (paid, annual), a Developer ID Application
    certificate, and the `APPLE_*` secrets Tauri's bundler reads (`APPLE_CERTIFICATE`,
    `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` as an
    app-specific password, `APPLE_TEAM_ID`). Unsigned is technically shippable and practically bad —
    Gatekeeper refuses the app and the workaround is right-click-Open or stripping the quarantine
    attribute by hand, which is exactly the first-run experience SignPath exists to fix on Windows.
    **Start the Apple enrolment early**: the approval is the long pole, and wiring the workflow is an
    afternoon once the secrets exist.
  - **No size tripwire on this job**, matching Linux — that ceiling is about `nexis.exe`.
  - **Verify on real hardware before calling it done.** A green build is not the deliverable. The
    platform-specific surface has never run on a Mac: the `MOD_KEY` / `src/lib/platform.ts` keybinding
    split, zsh as the default shell, the login-shell and `ZDOTDIR` integration, the quick-terminal global
    shortcut, and keychain storage. Expect a punch list, and budget for it as part of the item.
  - Unblocks the iOS half of the **Mobile pack** below — Xcode, and therefore the iOS Simulator, require
    macOS, and today there is no build of Nexis that could host that pane.

- [ ] **Ongoing: visual differentiation from terax** — a standing item, not a one-shot. Nexis should not
  read as a reskin. Sweep the UI surface for inherited layout, spacing, motion, and component idioms and
  make deliberate choices instead of default-inherited ones. Track what's been re-done so this doesn't
  get re-litigated; the credit in the README stays regardless — differentiation is about identity, not
  about hiding the lineage.
  *Re-done so far:* the theme set and the icon/mark; the icon surface (semantic choke point, Phosphor,
  house size scale, real provider brand marks) and the motion system (house easing/duration tokens wired
  into Tailwind's defaults, stepped spinner, caret-cadence status blink) and the file-tree retint onto the
  active theme's ANSI palette; and the emoji purge (v1.25.0) — an emoji is the one glyph that ignores the theme entirely, so removing them is identity work, not tidying, and a tripwire on both sides of the stack keeps them out. *Still inherited:* layout and spacing scale, panel/rail component idioms.

- [ ] **Get E2E green, then make it gate PRs** — the nightly suite has failed intermittently (2026-08-18,
  08-19, 09-02) and the notification backlog reads worse than the reality: 37 of the ~60 failure notices
  are E2E, accumulated over weeks rather than a live outage. The current failure is precise.
  `smoke.test.ts`'s `before all` hook dies with *"A modal was still blocking the UI after 20000 ms (an
  unnamed dialog)"*, and the likeliest culprit is `PackOnboardingDialog` — it renders whenever
  `hydrated && !packsOnboarded`, has no close button, and closes only by *choosing* a preset, so
  `dismissTopDialog()` has nothing to click. The intermittency fits a race: the dialog mounts when
  preferences hydrate, which can land after the dismiss window opens. Scope: (a) confirm the dialog's
  identity rather than assuming it — the error says "unnamed", so give every app dialog an accessible name
  while you are in there, which also makes the next failure of this class self-describing; (b) have the
  E2E harness put first-run preferences into a known state before the app loads, so onboarding is never a
  coin flip; (c) teach `dismissTopDialog()` the preset-picker shape as a backstop; (d) move E2E from
  nightly-only to a PR gate. The gate is the expensive half — a full Tauri release build is ~20 min cold —
  so scope it to PRs touching `src/`, `src-tauri/`, or the e2e config, keep the Rust cache shared with
  `test-rust`, and leave the nightly schedule on main. Sweep the 20 red **Security audit** runs in the same
  pass: that is a different workflow (`audit.yml` — `cargo deny` + `pnpm audit`) and a large share of the
  inbox noise, and a permanently red weekly job trains you to ignore the one time it matters. **Onboarding
  work lands after this, not before** — every first-run modal is another thing that can wedge the suite,
  which is exactly the bug being fixed here.

- [ ] **Onboarding — a Getting Started checklist, plus a short first-run tour** — Nexis teaches itself
  badly. What exists is `WelcomeScreen` (an empty state with a few shortcut hints) and
  `PackOnboardingDialog` (a one-time preset picker); neither explains the AI/agent surface, which is both
  the differentiator and the least discoverable thing in the app. Two pieces. A **persistent "Getting
  Started" checklist** — a real panel, re-openable from the command palette after it is dismissed,
  tracking a handful of concrete first actions (open a workspace, run a command, open the AI panel and
  send a turn, approve a tool call, open the editor, make a commit), each with a one-line why and its
  keybinding. And a **short first-run tour**, 4–6 steps maximum, spotlighting the rail, the AI panel, the
  command palette, and Settings → Features. The checklist is the load-bearing half: it survives dismissal,
  which a tour does not, and it is what still works for someone who skipped everything on day one.
  Constraints: lead with the agent surface, not the terminal (people already know what a terminal is);
  persist progress through `writePref()` so it syncs across windows (pitfall #2); and every surface must
  close on Escape and carry an accessible name, so it cannot wedge E2E the way the preset picker just did.

- [ ] **Domain packs — Web Dev, Mobile, Art — plus icons on packs and presets** — the taxonomy in
  `src/lib/packs.ts` is organized by *tool kind* (navigation, code-tools, dev-tools). The next three are
  organized by *what you are building*, which is a different axis and the one that matches how the work
  actually splits. Add `web-dev`, `mobile` and `art` as packs, keep `ml-lab` as the AI/ML one it already
  is, and add domain-named **presets** beside Bare-Bones/Standard/Everything so first-run can offer "Web
  Dev" instead of asking someone to reason about six pack names. Presets stay nothing but starting values
  for `enabledPacks` — do not grow a second concept next to packs. Two icon decisions: `PackDef` gains an
  `icon: IconName` for the rail and the Settings → Features rows, resolved through
  `src/components/icon.tsx` like everything else (pitfall #18 — the vendor stays behind that choke point);
  the **preset cards** in the first-run picker get bespoke SVG art, which means widening `REGISTRY` in
  `icon.tsx` beyond `Record<string, PhosphorIcon>` to carry custom art rather than dropping a one-off
  inline `<svg>` at the call site. Ship the taxonomy and the icon plumbing as one change and the panels
  afterward; every pack that claims a view still owes the view-id remap discipline from expansion packs V2.

- [ ] **Art pack — SVG playground first, then generator, then animator** — the pack with the clearest itch
  behind it: browser-based SVG editors are bad at authoring the small, precise, icon-scale art this project
  keeps needing. Three features, ordered by value-per-effort, and **only the first is committed**:
  1. **SVG Playground** — a live code pane beside a preview, with a pixel grid and alignment guides at icon
     sizes, SVGO optimization showing a before/after byte count, and export/copy as raw SVG, JSX, and
     `data:` URI. This is the one that solves the stated problem, and it is mostly CodeMirror plus preview
     machinery that already ships. Pitfall #15 applies: a CodeMirror instance under `.zoom-content` needs
     the zoom exemption or clicks land on the wrong line.
  2. **Shape generator** — parametric shapes and patterns in the spirit of bookofshapes.com (blobs, waves,
     arcs, dividers, grain) with live parameter controls and the playground's export path.
  3. **Animator** — a keyframe timeline over SMIL / CSS / Web Animations. Last on purpose: a timeline UI is
     a genuinely large surface and should not start until the first two have earned it.

  This lives in Art rather than Web Dev because SVG authoring is a design activity a mobile or ML project
  wants just as much, and separating it leaves Web Dev free to be about running and inspecting web apps.

- [ ] **Web Dev pack** — the preview pane already handles local dev servers; the pack is what turns that
  into a workflow. Roughly in order: a **multi-viewport preview** (phone/tablet/desktop side by side
  against one dev server, built on the existing preview surface); an **HTTP/REST client** with
  per-workspace saved requests, environment variables and a response viewer — the thing people currently
  leave Nexis for; and **scratchpad tools** that are cheap and constantly wanted (JSON formatter and
  JSONPath, JWT decoder, regex tester, base64/URL codecs). Lower priority and worth re-deciding before
  building: contrast/palette checks and CSS gradient/shadow builders overlap the Art pack and may belong
  there instead. Each is its own change — the pack is a container, not a single PR.

- [ ] **Mobile pack — Expo / React Native, with an Android device mirror** — aimed at the workflow
  `rwetz/ateru` actually uses. Core: a **Metro / Expo dev-server runner** with status and an Expo Go QR
  code; streamed **device logs** (`adb logcat` filtered to the app, plus Metro's own output); an **`adb`
  device list** with connect/disconnect; and an **Android screen mirror pane** — `adb exec-out screencap`
  for a still, or an embedded scrcpy-class stream for live, with input forwarding as a later step. All of
  it works on Windows, which is the machine this gets built on. **iOS Simulator is out of scope**: it
  requires Xcode and therefore macOS, and `release.yml` has no macOS job today, so there is no build of
  Nexis that could host it. The **macOS release builds** item above is the prerequisite; once that ships,
  the Simulator pane is the first thing to revisit here. Until then the iOS half of an Expo workflow stays
  in Expo Go on a physical device.

- [ ] **Command ledger — the substrate under the terminal-native backlog** — a design task before it is a
  feature. Nexis already injects OSC 133 shell integration, so every command carries cwd, argv, exit code
  and timing, and an fswatch runs alongside it; today all of that feeds the block gutter and is then
  thrown away. A local, per-workspace ledger of command events is the single piece that six of the
  features in *"terminal-native features an IDE can't have"* below sit on — provenance, success-filtered
  history, the failure/fix loop, build-time trends, the searchable output archive, and "while you were
  away". Build it once, deliberately, or it gets built five incompatible times.
  **Write the data model and the privacy contract before any panel exists.** Two constraints are
  load-bearing and have to be designed in rather than retrofitted: **private terminals never enter the
  ledger** — that concept already exists for the AI and must hold here identically — and every record goes
  through the same redaction pass session recordings already get, because a command line is precisely
  where an API key ends up. Open questions for the decision note: storage (an append-only file per
  workspace vs. SQLite — weigh against "every dependency earns its place"); retention and a hard size cap,
  since this grows forever by construction; whether a ledger survives its workspace being reopened from a
  different path (see pitfall #23 — path strings are not stable identity); and what the user-facing
  "forget this" gesture is, both per-entry and per-workspace. Decision record in
  `docs/vault/decisions/command-ledger.md`; nothing ships until that note exists.

---

## Up next

- [ ] **Expansion packs — core + opt-in feature surface** — the sidebar's ~24 panels split into a fixed core (terminal, editor, Files, Recent Files, Source Control, AI chat via API) plus toggleable packs (navigation-plus, code-tools, ai-extras, dev-tools, ml-lab, advanced). Enablement gating, not installation — nothing is downloaded except the future nexis-ml flow. Taxonomy and decisions in `docs/vault/decisions/expansion-packs.md`; taxonomy source of truth in `src/lib/packs.ts`.
  - [ ] **V2 — migrate hardwired panels into the plugin registry**, one per PR as they're touched (Debugger/Database/Advanced group first — already lazy-loaded). The mechanism and design pass are done: `PanelContribution` carries icon/group/pack/order, the rail renders registry panels, and `plugin:`-namespaced view ids keep the built-in union closed (design + migration constraints in `docs/vault/decisions/expansion-packs.md`). **Each migration must ship a one-time view-id remap** in `readSidebarView` and `loadPinned` in the same change, or it orphans saved sidebar state and pinned-rail entries.
  - [ ] **V4 — polish, driven by real usage**: discoverability for Bare-Bones users; per-pack settings / simpler feature variants only if users ask (deliberately cut from V1). (The "enable this pack?" placeholder shipped; V3's pinned-checksum install flow shipped — decision in `docs/vault/decisions/nexis-ml-artifact-pinning.md`. Follow-up for nexis-ml-rs CI: publish `checksums.txt` per release so Nexis pins can be cross-checked against CI output.)
- [ ] **Persistent terminal sessions** — PTY sessions survive Nexis restarts; reconnect to a running shell without losing scrollback or process state; native implementation inspired by tmux session persistence but without the terminal multiplexer overhead. Two independently shippable milestones:
  - **Milestone B — live process persistence (PTY broker)**: shells keep running while Nexis is closed. PTY ownership moves to the same `nexis` binary launched headless (`nexis --pty-broker` — no second binary), talked to over a named pipe (Windows) / Unix socket with a length-prefixed `open/write/resize/close/list/attach` protocol plus a streamed output channel and a capped ring buffer replayed on `attach`. Per-tab opt-in ("Keep alive after close") + global default; private tabs excluded; broker exits with its last session; user-only socket permissions + random token handshake. Windows carry-overs: the ConPTY lifecycle lock and `hide_console` discipline move into the broker; ConPTY handles can't cross processes, so the broker owns the full PTY lifecycle. Non-goals: no tmux-style server-side window management, no multi-client input, no reboot survival.
- [ ] **ML Lab follow-ups** — publish `nexis-ml` to PyPI (trusted-publisher setup on pypi.org — external, blocks the panel's Python-engine install button working from a cold machine); close the Rust-engine feature gaps (config-only today: no textgen/blank templates, no inference playground, no HTML report); image-template ONNX export. Design record and known limits in `ML_SUITE.md`; the nexis-ml-rs `checksums.txt` CI follow-up is tracked under expansion packs V4 above.
- [ ] **AI SDK v7 migration** — `ai` v6 -> v7 plus eight `@ai-sdk/*` provider majors (anthropic/google/groq/openai/react 3 -> 4, cerebras/openai-compatible 2 -> 3, xai 3 -> 4). Dependabot's grouped bump (PR #11, opened 2026-06-08) was closed on 2026-08-19 rather than merged: 28 files import from the SDK and 22 of them import from `ai` directly, so this is a migration with a real breaking-change surface, not a version bump — merging it blind would have taken the whole AI subsystem with it. Read the v7 release notes first and scope the changes to `modules/ai/lib/agent.ts`, `transport.ts`, `sessions.ts` and `store/chatStore.ts` before touching call sites. Note pitfall #3 (reasoning-block pruning) sits on this path and must survive the move.

---

## Later

- [ ] **Remote workspace** — browse, edit, and run code on remote machines entirely over SSH; the file explorer and editor work against the remote filesystem via SFTP while the terminal is already there; the goal is a seamless local feel with zero local clones required
- [ ] **Selective TS → Rust migration** — profile hot paths (terminal input dispatch, diff rendering, file-tree diffing), identify where a Rust implementation gives a measurable win, migrate incrementally without growing bundle size; Zed's SumTree (summary-carrying copy-on-write B+-tree, `sum_tree` crate in their repo — one tree answers offset→line, line→hunk, path→subtree-size without separate indexes) is the reference design if diff rendering or tree diffing is the target; don't build it until a benchmark says the naive version is the bottleneck
- [ ] **Multiplayer terminal input (authenticated)** — the live view stays read-only for now, but the auth prerequisite shipped: the share URL carries a per-session token checked on every route (incl. `/ws`). Remaining for full multiplayer (remote viewers typing into the shared terminal): an input-consent toggle on the host, an input message protocol on the WS channel, and routing through the ordered per-session PTY writer

---

## Feature backlog — upstream terax adoption

Candidates from a survey of upstream terax-ai v0.6.4 → v0.8.5 (researched 2026-07-15; the full research notes — `TERAX_INSPIRATION.md`, `ZED_INSPIRATION.md`, `OPTIMIZATIONS.md`, `UI_IMPROVEMENTS.md`, `PLAN.md` — were consolidated into this file on 2026-07-17 and live in git history). A pool, not commitments — each is a product call. OSC 52 clipboard already landed from this list. Feasibility: ✅ doable now · 🟡 moderate · 🟠 heavy lift.

- 🟠 **Block-mode terminal — custom input bar.** The remaining half of the block-mode item; the pure-frontend slices are done (prompt-block navigation and the interactive per-command block gutter both shipped — see CHANGELOG `[1.23.0]`). What's left is the genuinely invasive part: a custom input bar with OSC-133-gated stdin routing, so typing goes to the bar at a prompt but falls through to the raw terminal the moment a full-screen program (vim/htop/sudo) owns the tty. **This is a product decision before it is an implementation** — it changes the app's fundamental typing model, and getting the gating wrong breaks terminal input, the one thing that must never regress. Known limitations to inherit knowingly: block tabs are single-pane, and the mode depends on OSC 133 shell integration (which Nexis already injects). Suggest it ship behind a pref, off by default.
- 🟡 **Spaces — persisted tab groups** with drag-to-organize, above tabs; natural fit with the existing layout-persistence store.
- 🟡 **whisper.cpp speech-to-text** — fully offline voice input by shelling out to a user-installed binary (like Ollama/LM Studio — never embedded, per the no-bundled-inference hard limit); voice is OpenAI-only today.

---

## Feature backlog — Warp / Zed / lightweight-terminal survey

A second inspiration pass (2026-07-18), this time against Warp, Zed, Ghostty, WezTerm, and Kitty rather than terax — looking for what each does *best* and where it fits without crossing a hard limit above (no accounts, no bundled inference, no VS Code scope creep). A pool, not commitments. Feasibility: ✅ doable now · 🟡 moderate · 🟠 heavy lift.

**Terminal UX**
- 🟠 **Kitty graphics protocol.** The remaining inline-image gap now that Sixel and the iTerm2 protocol have shipped (see CHANGELOG `[1.23.0]`). A separate specification with its own placement/z-index and animation model — not covered by `@xterm/addon-image`, so this is a real implementation rather than a config flag.

**AI / agent**
- 🟡 **Local edit-prediction via Zeta.** Zed's [Zeta](https://huggingface.co/zed-industries/zeta) is an open-weight, Qwen2.5-Coder-based next-edit-prediction model purpose-built for "what's the next small edit" rather than general chat. Running it through Ollama would give the editor's inline-completion and the "Command prediction" item below a local, zero-cost option — fits the existing BYOK/local-model shelling-out pattern exactly (no bundled inference, same posture as Ollama/LM Studio/MLX today).
- 🟡 **Shell-history semantic search.** Extends the "Local semantic code index" item below to also index command history — Warp Drive's "what was that docker command from last week" without an account or cloud sync, since the vector store would already be local.

**Editor**
- 🟡 **Grep results as an editable multibuffer.** Zed's standout editor feature: search-result matches across many files open as one scrollable, directly-editable view instead of jumping file to file, committing changes back per-file on save. Pairs cleanly with the existing `fs_grep` backend (already built on the same `grep-regex`/`grep-searcher`/`grep-matcher` crates ripgrep itself uses) — the new work is a CodeMirror view that maps regions back to source files, not a new search engine.

**Architecture / open-source tech note**
- 🟡 **`wasmtime` for the plugin-sandboxing stretch item.** Zed's own extension system already solved "sandboxed, typed, third-party code" with `wasmtime` + the WASM component model — worth adopting the same approach for the "Plugin sandboxing + first-party SDK" item below rather than re-deriving a sandbox story from scratch. Binary-size cost needs a real measurement before committing either way.

---

## Feature backlog — terminal-native features an IDE can't have

The differentiating pool, and the one place on this roadmap where nothing is borrowed. These exist
because Nexis owns the shell, the recorder and the agent in the same process: VS Code and JetBrains
treat the terminal as a dumb output pane, so the data every one of these is built on is discarded before
it ever reaches them. Effort is **cheap / moderate / heavy**; *(ledger)* marks the ones gated on the
**Command ledger** item under custom feature requests. A pool, not commitments — each is still a product
call. (These use words rather than the coloured markers the two surveys above use, per the no-emoji rule.)

**Built on the command ledger**

- **moderate** *(ledger)* — **Command provenance: "what produced this file?"** Correlate fswatch events
  against the command block that was running when they landed, and answer it from the explorer's context
  menu: *`dist/` was last written by `pnpm build`, 3h ago, exit 0, 42s*. Only possible because one process
  owns both the PTY and the watcher. The hard part is attribution confidence, not capture — concurrent
  commands, background jobs, and editor saves all write files, so the panel has to be honest about
  "probably" rather than inventing a causal claim.
- **cheap** *(ledger)* — **Success-filtered history.** Fuzzy shell-history search already ships; the
  filter missing from it is the one you always actually want — **exit code 0 only, scoped to this repo**.
  "The docker command that *worked* here" is a different query from "a docker command I typed," and no
  shell's history file stores the difference.
- **moderate** *(ledger)* — **Failure to fix loop.** The exit-status gutter already knows a command
  failed. Offer an inline fix that receives the real stderr, cwd, exit code and preceding commands — then
  **record whether the fix worked**, which is the part that makes it compound. Over months it becomes a
  repo-local playbook: *this error, this fix, worked 4 of 5 times.* A chatbot cannot build this because it
  never observes the outcome.
- **cheap** *(ledger)* — **Build-time trends.** Every block is already timed. Chart the p50 of a given
  command per repo over weeks: *`cargo build` went 18s to 47s three commits ago.* Nothing else times the
  commands you actually run, and the regression is usually invisible until it is unbearable.
- **moderate** *(ledger)* — **Searchable output archive.** Search all past terminal output for a
  workspace, not just the live buffer. "Where did I see that error string?" is currently unanswerable the
  moment scrollback rolls past the cap (pitfall #7). Storage cap and redaction are the whole design.
- **moderate** *(ledger)* — **"While you were away."** On reopening a workspace: commits pulled, files
  changed by other processes, dependency drift, CI status. A standup for one person. IDEs show git status;
  none of them narrate what changed since you last looked.
- **cheap** *(ledger)* — **Work journal.** Auto-assembled from the ledger, git, and AI turns: *"Today: 3
  commits, 47 builds, 2h in `src/modules/ai`."* Feeds standups, invoices, and your own memory of what you
  did last Tuesday. Worth naming why this is missing everywhere else: developer tools are built for teams,
  and a team gets this from the tracker. A solo developer has no tracker, and nothing reconstructs the day.
- **moderate** *(ledger)* — **"Where was I?"** Session restore already brings back tabs and layout. This
  restores *intent*: the test that was failing, the branch, the unanswered question left in the AI thread,
  the command that was half-typed. The gap between "my windows came back" and "I know what I was doing" is
  where most of the cost of a context switch actually sits.

**Independent of the ledger**

- **moderate** — **Session to runbook.** Turn a recorded cast into a replayable script: drop the failed
  attempts, keep what worked, emit a shell script or a README block. Documentation that writes itself from
  having done the thing once. Composes directly with the onboarding item — the fastest way to a good
  getting-started doc is to record someone doing it.
- **moderate** — **Environment snapshot and diff.** Capture the resolved toolchain for a workspace (tool
  versions, the PATH entries that matter, set env vars, WSL distro) and diff two snapshots: you now vs.
  you last week, or you vs. a teammate's exported file. The diagnostics bundle already collects a superset
  of this for bug reports; this is the targeted, comparable version, and it is the real answer to "works
  on my machine."
- **heavy** — **Literate shell notebook.** Prose, shell commands, captured output and inline images in one
  saveable document. Mostly composition rather than new capability — Sixel/iTerm2 inline images, the REPL
  panel and workspace notes all already ship. Jupyter does this for kernels; nobody does it for a shell.
  Heavy because the execution model (re-run a cell? in which session? with what cwd?) is a real design
  problem, not because the rendering is hard.
- **moderate** — **Companion CLI: `nexis`, answered by the running app.** `nexis` already accepts a
  directory on launch (`parse_launch_dir` in `src-tauri/src/lib.rs`), but there is no
  `tauri-plugin-single-instance`, so a second invocation starts a second app instead of talking to the
  first. Add that and the terminal can drive the GUI: `nexis diff a b` (the real diff pane, not a pager),
  `nexis open src/foo.ts:42`, `nexis ask "why is this failing?" < build.log`, `nexis pick` (the GUI shows
  a fuzzy picker and **the shell script gets the answer on stdout**), `nexis notify --on-exit`. That last
  group is the whole point: it turns Nexis into a UI toolkit for your own shell scripts, which is not
  something an IDE can be. **Free architectural win** — the PTY broker (Milestone B under "Up next")
  already needs a named-pipe / Unix-socket protocol with user-only permissions and a token handshake, so
  the CLI rides the same transport: one IPC surface, two features. Build them in that order or the broker
  will get a protocol shaped only by its own needs. `nexis notify` additionally needs
  `tauri-plugin-notification` — there is an in-app notifications center but no OS-level desktop
  notifications today, and that is a dependency decision rather than a detail.
- **moderate** — **Dangerous-command preflight.** Before `rm -rf`, a force-push, a `DROP TABLE`, or a
  down-migration, show what it will *actually* affect: the resolved glob and file count, how far
  ahead/behind the branch is, the estimated row count. The agent tool-approval flow already exists — this
  is the same idea pointed at the human rather than at the model. Shells have offered nothing here in
  fifty years, and the reason is structural: a shell cannot render a dialog and Nexis can. Three design
  constraints, all learned the hard way by everything that has tried: it must be OSC-133 gated so it never
  fires inside a full-screen program that owns the tty; it must be trivially skippable, because a
  preflight you cannot bypass becomes a preflight you disable; and the pattern list has to be
  user-editable or it will be wrong for somebody's stack on the first day.
- **cheap** — **Secret scan before commit.** Point the redaction machinery that already guards recordings
  and the diagnostics bundle at the staged diff, surfaced in the Source Control panel. Cheap because the
  detectors exist; the work is the panel affordance and a per-repo allowlist, without which one false
  positive becomes a reason to switch the whole thing off.

---

## Feature backlog — agent surface

Nexis's agent runs against a real machine with a real shell, not a hosted sandbox. That is the axis these
sit on: each is something a cloud coding assistant structurally cannot offer, however good its model is.

- **heavy** — **Shadow-workspace agent runs.** The agent works in a git worktree, and you review the diff
  **plus the full terminal transcript of what it actually ran** before anything touches your tree. Other
  tools ship background agents; none of them can show you the commands, because none of them own a shell.
  Heavy because worktree lifecycle, dependency install and merge-back are each their own problem — but the
  review surface is the differentiator, and it is the half worth paying for.
- **moderate** — **Repo-scoped agent memory that is a file.** A visible, diffable, human-editable
  `.nexis/memory.md` the agent reads and appends to: committable, reviewable, greppable, deletable. Static
  rules files are hand-written and go stale; this is learned and still auditable. The real design question
  is write discipline — an agent that appends freely produces a file nobody reads, so appends should be
  proposed and confirmed like any other side effect rather than written silently.
- **heavy** *(ledger)* — **A tiny local model trained on your own ledger** — next-command prediction,
  learned from your habits, on your machine, with nothing leaving it. Slightly gimmicky and entirely
  on-brand, and it would be the most convincing demonstration the ML Lab could possibly get: a real model,
  trained on real local data, doing something useful inside the app that trained it. Gated on the ledger
  existing and on there being enough history for it to beat plain frecency — measure that before building.

---

## Feature backlog — identity and craft

Differentiation that is visible rather than structural. Both of these surface machinery that already
exists and that users currently have no way to see.

- **moderate** — **Theme studio.** Live-edit a theme with every surface previewed at once: terminal ANSI,
  editor tokens, the file-tree retint, UI chrome, diff colors. Retinting catppuccin art onto the active
  theme's ANSI palette (`iconResolver.ts`, pitfall #18) is genuinely unusual machinery and nothing
  currently exposes it. Feeds the Art pack, and gives the house themes a way to grow that is not a
  hand-edit.
- **cheap** — **Themed block export.** Render a command block or a diff as an image in the active theme —
  carbon.now.sh, except from a real session with real output. Cheap, delightful, and it markets the app
  every time somebody posts one. One hard constraint: it runs the recording redaction pass first, because
  the entire premise is that these get shared.

---

## Hardening backlog

Reliability, security, and performance ideas tracked for the "bulletproof and solid" goal (migrated here from the former `IDEAS.md` brainstorm). These are a raw pool, not commitments. Feasibility: ✅ doable now · 🟡 moderate · 🟠 heavy lift.

**Reliability & correctness**
- 🟡 Finish the panic-lint gate: four modules remain outside `#![warn(clippy::unwrap_used, clippy::expect_used)]` because they still have production unwraps to convert — `fs/file.rs` (10), `lsp/mod.rs` (4), `dap/mod.rs` (4), `pty/session.rs` (2). The other 36 modules are gated as of 2026-07-19.
- 🟡 Windows startup self-test for the ConPTY path — open a hidden PTY, round-trip a sentinel, and warn if the #1 blank-terminal condition is present *before* the user hits it.

**Performance & resource safety**
(Derived from the 2026-07 Zed/terax research and the 2026-07-11 optimization sweep — full notes in git history, see the feature-backlog section above. The slot-reaping, alt-screen eviction, motion→CSS, Criterion harness, cargo-profile, and clippy-lint items that used to live here all shipped — see CHANGELOG `[1.21.0]`.)
- 🟡 Snapshot-pattern refactors — replace lock-shaped sharing with cheap `Arc` copy-on-write snapshots for git status recomputation and file-tree diffing; also the design basis for persistent-session scrollback. Zed's rule of thumb: if a background task needs a `Mutex` on the hot path, the data structure is wrong — make reads snapshot-cheap instead (our poisoned-mutex pitfalls #8/#9 are downstream symptoms of lock-shaped sharing).
- 🟡 React Compiler evaluation — try `babel-plugin-react-compiler` in the Vite react plugin (React 19 already in place); potentially large win for a UI that re-renders on terminal title/cwd churn, medium risk around CodeMirror/xterm ref patterns. Run `npx react-compiler-healthcheck` first.

**Testing & observability**
- 🟡 E2E coverage for the blank-terminal pitfalls — script the exact ConPTY failure modes (close-tab-then-open, cross-drive `cd` + new tab, PowerShell first-prompt) so pitfall #1 can never silently regress.
- 🟡 tmux resize desync test — targeted test for xterm grid vs PTY winsize desync after a pane resize; upstream terax has this open as #981 and Nexis's debounced fit + `pty_resize` may or may not be immune.

**Terminal & editor robustness**
- 🟡 Unicode/grapheme correctness golden-file suite — CJK width, emoji ZWJ sequences, combining marks, zero-width handling — so rendering-width bugs surface in CI.

**Docs (nexis-wiki — separate repo)**
Structure ideas taken from zed.dev/docs (July 2026 sidebar survey — full notes in git history).
- ✅ "Coming from…" migration guides — Warp, iTerm2, Windows Terminal, kitty/alacritty, VS Code terminal; highest-leverage docs addition.
- ✅ Top-level Privacy & Security section — no-telemetry stance, per-provider AI data flow, tool approval, path guards; it's a differentiator, currently undocumented publicly.
- 🟡 Generated Reference section — all-settings page generated from the settings store schema, keybindings table, CLI flags; hand-written reference pages rot.
- 🟡 Per-platform troubleshooting pages seeded from the internal pitfall checklists (e.g. public "blank terminal on Windows" walkthrough of CLAUDE.md pitfall #1, in user language).
- 🟡 "Developing Nexis" section — build from source, architecture front door linking to the repo, profiling guide.

**Stretch features**
- 🟠 Local semantic code index — embeddings over the workspace for sharper AI context retrieval; needs an embeddings source and a small vector store, weighed against the size budget.
- 🟡 Command prediction — next-command suggestions from recent context (BYOK or local), fitting the existing inline-suggestion UI.
- 🟠 Plugin sandboxing + first-party SDK — a sandboxed, typed, install-from-workspace SDK with a local test harness (pairs with "Custom AI tool authoring" above).
- 🟠🔴 Collaborative editing (CRDT) — real-time co-editing via a yjs/automerge-class CRDT; powerful but a major subsystem and a networking story, probably beyond a terminal-first tool's scope.

---

## Good places to help

If you want to contribute, these are areas where outside help actually moves things:

- **Tests** — PTY edge cases across platforms, AI tool security functions
- **Bundle size** — profile it, find wins, propose specific changes
- **Platform bugs** — niche distros, weird shell configs, WSL edge cases
- **Docs** — better examples, screenshots, non-English sections
- **Themes** — terminal palettes and editor themes that fit the aesthetic
- **Provider support** — only if it adds something the `openai-compatible` path can't cover

See `good-first-issue` and `help-wanted` labels for tracked tasks.

---

## Who decides

Me ([@rwetz](https://github.com/rwetz)). If a PR gets closed and you think it shouldn't have, open a GitHub Discussion or leave a comment — I'm happy to talk through it.
