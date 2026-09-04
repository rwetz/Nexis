// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝
//
// Tripwire tests for the frontend pitfalls documented in CLAUDE.md.
//
// These scan the source tree because the invariants they protect are
// architectural (which file is allowed to call what), not behavioral —
// a unit test on today's code can't see tomorrow's new call site.
//
// If a test here fails: do NOT weaken or delete the test. Open CLAUDE.md,
// read the pitfall named in the failure message, and restore the invariant.
// Every one of these guards a bug that shipped once.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, rel), "utf8");
}

/** All non-test .ts/.tsx files under src/, as [relativePath, content]. */
function sourceFiles(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        /\.(ts|tsx)$/.test(entry.name) &&
        !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)
      ) {
        const rel = path.relative(SRC_ROOT, full).replace(/\\/g, "/");
        out.push([rel, fs.readFileSync(full, "utf8")]);
      }
    }
  };
  walk(SRC_ROOT);
  return out;
}

describe("CLAUDE.md pitfall tripwires (frontend)", () => {
  // Pitfall #1C: pty_open on a cwd outside the authorized workspace roots
  // fails silently and leaves a blank terminal. openPty() in pty-bridge.ts
  // calls workspace_authorize first; any new caller that invokes pty_open
  // directly skips that and reintroduces the bug.
  it("pitfall 1C: pty_open is only invoked via pty-bridge.ts", () => {
    const offenders = sourceFiles()
      .filter(([, text]) => text.includes('"pty_open"'))
      .map(([rel]) => rel)
      .filter((rel) => rel !== "modules/terminal/lib/pty-bridge.ts");
    expect(
      offenders,
      `these files invoke pty_open directly — route new PTY opens through openPty() ` +
        `in src/modules/terminal/lib/pty-bridge.ts, which pre-authorizes the cwd via ` +
        `workspace_authorize; a direct pty_open on an unauthorized cwd silently ` +
        `produces a blank terminal (CLAUDE.md pitfall #1C)`,
    ).toEqual([]);
  });

  // PTY input ordering (hardening backlog 2026-07): xterm emits device-query
  // replies (DA/DSR/CPR) through the same onData stream as keystrokes, and
  // byte order on the PTY holds because every write funnels through the one
  // pty_write invoke in pty-bridge.ts into the per-session writer channel.
  // A second invoke site is a parallel path that can interleave replies into
  // the middle of user input — upstream terax's #1004 bug class. The Rust
  // half (pty_write stays sync + enqueue-only) is guarded in
  // src-tauri/tests/pitfall_invariants.rs.
  it("pty ordering: pty_write is only invoked via pty-bridge.ts", () => {
    const offenders = sourceFiles()
      .filter(([, text]) => text.includes('"pty_write"'))
      .map(([rel]) => rel)
      .filter((rel) => rel !== "modules/terminal/lib/pty-bridge.ts");
    expect(
      offenders,
      `these files invoke pty_write directly — write through the PtySession returned ` +
        `by openPty() (pty-bridge.ts); a second write path can interleave ` +
        `device-query replies (DA/DSR/CPR) with user keystrokes on the PTY`,
    ).toEqual([]);
  });

  // Pitfall #2: LazyStore.onChange only fires within the writing process.
  // Every preference write must go through writePref(), which mirrors the
  // change to other windows via a Tauri event. A raw store.set()+store.save()
  // silently breaks cross-window sync — invisible in single-window testing.
  it("pitfall 2: settings store writes only happen inside writePref()", () => {
    const store = readSrc("modules/settings/store.ts");
    const bodyStart = store.indexOf("async function writePref");
    expect(bodyStart, "writePref() is gone from settings/store.ts").toBeGreaterThan(-1);
    const bodyEnd = store.indexOf("\n}", bodyStart) + 2;
    const body = store.slice(bodyStart, bodyEnd);

    expect(
      body.includes("emit(PREFS_CHANGED_EVENT"),
      "writePref() must emit PREFS_CHANGED_EVENT so other windows see the change " +
        "(CLAUDE.md pitfall #2)",
    ).toBe(true);

    for (const match of store.matchAll(/store\.(set|save)\(/g)) {
      const inWritePref = match.index >= bodyStart && match.index < bodyEnd;
      expect(
        inWritePref,
        `store.${match[1]}() called outside writePref() — raw writes never reach ` +
          `other windows; always route preference writes through writePref() ` +
          `(CLAUDE.md pitfall #2)`,
      ).toBe(true);
    }
  });

  // Pitfall #5: disabling the composer textarea while the agent streams
  // blurs it (very visible focus steal on Windows). Busy-state must be
  // indicated with CSS, never the disabled attribute.
  it("pitfall 5: composer textarea is never disabled", () => {
    const bar = readSrc("modules/ai/components/AiInputBar.tsx");
    const start = bar.indexOf("<textarea");
    expect(start, "composer <textarea> not found in AiInputBar.tsx").toBeGreaterThan(-1);
    const jsx = bar.slice(start, bar.indexOf("/>", start));
    expect(
      /\bdisabled\s*[={]/.test(jsx),
      "do not put `disabled` on the composer textarea — it blurs the input and " +
        "steals keyboard focus on Windows while the agent streams; indicate busy " +
        "state with CSS instead (CLAUDE.md pitfall #5)",
    ).toBe(false);
  });

  // Pitfall #3: reasoning/thinking blocks left in model history make Cerebras
  // error mid-conversation and burn compaction budget everywhere else.
  it("pitfall 3: agent history prunes reasoning before compaction", () => {
    const agent = readSrc("modules/ai/lib/agent.ts");
    expect(
      agent.includes("pruneMessages") && agent.includes('reasoning: "all"'),
      'agent.ts must call pruneMessages({ reasoning: "all", ... }) on history ' +
        "before compaction — some providers reject prior-turn reasoning blocks " +
        "(CLAUDE.md pitfall #3)",
    ).toBe(true);
  });

  // Pitfall #14: a Zustand selector that returns a fresh array/object on every
  // getSnapshot call loops useSyncExternalStore forever → blank screen. This
  // catches the common single-line forms; use useShallow (zustand/react/shallow)
  // when a derived array/object is genuinely needed.
  it("pitfall 14: no Zustand selectors returning fresh arrays/objects", () => {
    const derivedArray = /use[A-Z]\w*\(\s*\(\s*(\w+)\s*\)\s*=>\s*\1(?:\.\w+)+\.(?:filter|map|slice)\(/;
    const objectLiteral = /use[A-Z]\w*\(\s*\(\s*(\w+)\s*\)\s*=>\s*\(\{/;
    const offenders: string[] = [];
    for (const [rel, text] of sourceFiles()) {
      text.split("\n").forEach((line, i) => {
        if (line.includes("useShallow")) return;
        if (derivedArray.test(line) || objectLiteral.test(line)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `selector returns a new reference on every call — React re-renders forever ` +
        `("Maximum update depth exceeded", blank screen). Select the stable store ` +
        `reference and derive in the render body, or wrap the selector in useShallow ` +
        `(CLAUDE.md pitfall #14):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  // Pitfall #15: CodeMirror under an ancestor CSS zoom maps clicks to the
  // wrong line on WebKitGTK (zoom 1.4 → click line 13, cursor lands line 19).
  // The fix is two-part and both halves must stay: .cm-editor is zoom-exempt
  // in globals.css, and app zoom reaches the code via a font-size that scales
  // with --app-zoom in the shared editor theme.
  it("pitfall 15: CodeMirror is exempt from CSS zoom and scales via font-size", () => {
    const css = readSrc("styles/globals.css");
    const exemptRule = /\.zoom-content \.cm-editor\s*\{[^}]*zoom:\s*calc\(\s*1\s*\/\s*var\(--app-zoom/;
    expect(
      exemptRule.test(css),
      "globals.css must keep the `.zoom-content .cm-editor { zoom: calc(1 / " +
        "var(--app-zoom, 1)) }` exemption — without it, CSS zoom makes every " +
        "editor click land on the wrong line on WebKitGTK (CLAUDE.md pitfall #15)",
    ).toBe(true);

    const theme = readSrc("modules/editor/lib/extensions.ts");
    expect(
      /fontSize:\s*"calc\([^"]*var\(--app-zoom/.test(theme),
      "the shared editor theme must scale .cm-scroller font-size by " +
        "var(--app-zoom) — the editor is zoom-exempt, so this is the only way " +
        "app zoom reaches the code (CLAUDE.md pitfall #15)",
    ).toBe(true);
  });

  it("pitfall 22: the terminal session effect does not depend on initialCwd", () => {
    const src = readSrc("modules/terminal/lib/useTerminalSession.ts");
    // The pane-tree leaf's `cwd` is rewritten by setLeafCwd on every OSC 7, so
    // depending on it re-ran the session effect on every `cd` — detaching the
    // leaf from its renderer slot, resetting the xterm buffer, replaying a
    // snapshot, and blanking the pane for two frames. ensureSession only reads
    // the value when it creates the session, so the dep bought nothing.
    const deps = /\}, \[leafId, container[^\]]*\]\);/.exec(src);
    expect(
      deps,
      "could not find the useTerminalSession attach effect's dep array — if it " +
        "was restructured, update this guard rather than deleting it",
    ).not.toBeNull();
    expect(
      deps?.[0].includes("initialCwd"),
      "the terminal attach effect must not depend on initialCwd: it changes on " +
        "every directory change, and re-running the effect tears the leaf off " +
        "its renderer slot and resets the buffer (CLAUDE.md pitfall #22)",
    ).toBe(false);

    // The other half: the value still has to reach ensureSession.
    expect(
      /ensureSession\(leafId, initialCwdRef\.current\)/.test(src),
      "ensureSession must still receive the initial cwd, via the ref mirror",
    ).toBe(true);
  });

  it("pitfall 22: a failed pty_open is shown in the terminal, not just logged", () => {
    const src = readSrc("modules/terminal/lib/useTerminalSession.ts");
    // Every openPty rejection used to render identically to a working shell
    // that printed nothing: a cursor and no prompt. That is what let a
    // corrupted WSL home probe go undiagnosed.
    expect(
      /function reportSpawnFailure\(/.test(src),
      "useTerminalSession must keep reportSpawnFailure — a rejected pty_open " +
        "has to be visible in the pane, not only in console.error",
    ).toBe(true);
    const catches = src.match(/\.catch\(\(e\) => \{[^}]*ptyOpening = false[^}]*\}/gs) ?? [];
    for (const block of catches) {
      expect(
        block.includes("reportSpawnFailure"),
        "every openPty failure path must call reportSpawnFailure",
      ).toBe(true);
    }
  });

  /**
   * The command ledger's two invariants, both from
   * `docs/vault/decisions/command-ledger.md`. The decision record names this
   * guard explicitly and says it must land in the same change as the writer.
   *
   * The store is durable and holds command lines, which is exactly where an
   * API key ends up; and a ledger that records a private terminal is a silent
   * privacy failure. Silent failures need tripwires, not review.
   */
  it("command ledger: argv and output are redacted before they reach IPC", () => {
    const ledger = readSrc("modules/terminal/lib/ledger.ts");

    expect(
      /redactSensitive\(input\.argv\)/.test(ledger),
      "recordCommand must pass argv through redactSensitive() before writing — " +
        "a command line is precisely where an API key ends up, and the ledger " +
        "is durable by design (command-ledger.md §3)",
    ).toBe(true);

    expect(
      /redactSensitive\(input\.output\)/.test(ledger),
      "recordCommand must pass captured output through redactSensitive() too — " +
        "the decision record says argv *and* the output blob (command-ledger.md §3)",
    ).toBe(true);

    // Redaction is frontend-side on purpose: redactSensitive has no Rust
    // counterpart, and two copies of a security-critical pattern list drift.
    const rust = fs.readFileSync(
      path.join(SRC_ROOT, "..", "src-tauri", "src", "modules", "ledger.rs"),
      "utf8",
    );
    // Comments stripped first: the module documents *why* it does not redact,
    // and matching that prose would fail the guard for saying the right thing.
    const rustCode = rust
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(
      /redact/i.test(rustCode),
      "ledger.rs must NOT redact — redaction is frontend-side by decision, and " +
        "a second implementation is how the first stops being maintained",
    ).toBe(false);
  });

  it("command ledger: private terminals are excluded at the OSC 133 source", () => {
    const osc = readSrc("modules/terminal/lib/osc-handlers.ts");
    // The gate must be in the handler, not downstream: a filter applied at
    // write time is a filter someone later moves (command-ledger.md §4).
    expect(
      /if \(ledger\?\.isEnabled\(\)\)/.test(osc),
      "the OSC 133 D branch must gate the ledger write on ledger.isEnabled() — " +
        "the exclusion belongs where the event is born, not at write time",
    ).toBe(true);

    const ledger = readSrc("modules/terminal/lib/ledger.ts");
    expect(
      /let isPrivateLeaf: PrivacyResolver = \(\) => true;/.test(ledger),
      "the privacy resolver must default to `private` — forgetting to wire it " +
        "must fail closed (record nothing), never open (record a private tab)",
    ).toBe(true);
    expect(
      /if \(!ledgerAllowsLeaf\(input\.leafId\)\) return null;/.test(ledger),
      "recordCommand must re-check the privacy gate itself: it is the entry " +
        "point the other gated features will call directly",
    ).toBe(true);
  });

  it("secret redaction: outbound surfaces route through redactSensitive", () => {
    // The LAN share stream and saved recordings leave the machine (viewers,
    // bug-report attachments). Key-shaped strings captured from terminal
    // output must be scrubbed at these seams. If this fails, wire
    // redactSensitive() back into the named call path — do not delete this.
    const share = readSrc("modules/share/useShareServer.ts");
    expect(
      /http_share_update.*redactSensitive|redactSensitive\(html\)/s.test(share),
      "useShareServer.update must pass html through redactSensitive() before http_share_update",
    ).toBe(true);
    expect(
      /redactSensitive\(data\)/.test(share),
      "useShareServer.pushStream must pass data through redactSensitive() before http_share_push_stream",
    ).toBe(true);
    expect(
      /redactSensitive\(opts\.buildHtml\(token\)\)/.test(share),
      "startShare must scrub the INITIAL page through redactSensitive() before http_share_start — " +
        "it is the first thing a viewer downloads (this path shipped unredacted once; keep it covered)",
    ).toBe(true);

    const recording = readSrc("modules/terminal/lib/useRecording.ts");
    expect(
      /redactSensitive\(/.test(recording),
      "useRecording's save path must scrub event text with redactSensitive() before save_cast_recording",
    ).toBe(true);
  });

  it("inline images: recycled slots reset the image addon's storage", () => {
    // Renderer slots are pooled and reused across unrelated terminal
    // sessions. Decoded Sixel/IIP images live in the addon's own FIFO
    // storage, NOT in the xterm buffer that term.reset() clears — so
    // acquireSlot must reset the addon explicitly. Without it a fresh
    // terminal can surface the previous session's images and hold their
    // memory indefinitely.
    const pool = readSrc("modules/terminal/lib/rendererPool.ts");
    expect(
      /imageAddon\.reset\(\)/.test(pool),
      "acquireSlot must call slot.imageAddon.reset() when recycling a slot — " +
        "term.reset() does not clear decoded image storage",
    ).toBe(true);

    // A per-terminal storage cap is load-bearing: the addon defaults to
    // 128 MB, and POOL_MAX_SIZE terminals at that default would authorize
    // well over half a gigabyte of decoded RGBA.
    expect(
      /storageLimit:\s*\d+/.test(pool),
      "the ImageAddon must be constructed with an explicit storageLimit — " +
        "the 128 MB default is per-terminal and this pool holds POOL_MAX_SIZE of them",
    ).toBe(true);
  });

  it("pitfall 18: the icon vendor is imported only by the Icon choke point", () => {
    // `src/components/icon.tsx` maps semantic names ("close", "refresh") onto
    // whichever icon package Nexis ships. Two things depend on that being the
    // ONLY module that names the vendor: swapping the package stays a one-file
    // change, and one concept keeps rendering as one glyph.
    //
    // The direct-import era is what this prevents. It accumulated three
    // different "refresh" icons, three "checkmark", four "edit", four
    // "terminal", and 13 pixel sizes across 12 stroke weights — 160 imports
    // expressing 136 ideas — because nothing stopped a new call site from
    // reaching for its own. It also leaked the vendor into the plugin API:
    // `PanelContribution.icon` was typed as a vendor icon object, so a plugin
    // could not contribute a panel without depending on the same package.
    //
    // If this fails: import { Icon } from "@/components/icon" and use a
    // semantic name. If the glyph you need has no name yet, add it to REGISTRY.
    const offenders = sourceFiles().filter(
      ([rel, src]) =>
        rel !== "components/icon.tsx" &&
        /from\s*["']@phosphor-icons\/react["']/.test(src),
    );
    expect(
      offenders.map(([rel]) => rel),
      "only src/components/icon.tsx may import the icon vendor directly — " +
        "everything else names an icon semantically via <Icon name=...>",
    ).toEqual([]);
  });

  it("pitfall 18: file-tree art is retinted to the theme, not to a vendor palette", () => {
    // The catppuccin file icons ship the Catppuccin Macchiato palette baked
    // into the art, which no Nexis theme can reach — open Aurelian (warm gold
    // over umber) and the tree stayed lilac. iconResolver maps those 19 hexes
    // onto the active theme's own ANSI palette instead.
    //
    // The substitution emits `var(--terminal-ansi-*)`, which only resolves if
    // the art is INLINED into the document: a `data:` URL is an isolated
    // document that the page's custom properties do not cascade into. Going
    // back to <img src="data:…"> silently un-themes the whole file tree.
    const resolver = readSrc("modules/explorer/lib/iconResolver.ts");
    expect(
      /--terminal-ansi-/.test(resolver),
      "iconResolver must map catppuccin's palette onto the theme's ANSI colours",
    ).toBe(true);
    expect(
      /data:image\/svg/.test(resolver),
      "iconResolver must NOT build data: URLs — theme variables do not " +
        "cascade into them; render the art inline via <FileTypeIcon> instead",
    ).toBe(false);
  });
  it("E2E config overlay stays in sync with the shipping window config", () => {
    // src-tauri/tauri.e2e.conf.json exists only to compile
    // --remote-debugging-port into the E2E build (wry sets
    // AdditionalBrowserArguments unconditionally, so the env var tauri-driver
    // uses never reaches the browser process).
    //
    // Tauri merges configs with RFC 7386, under which an ARRAY IS REPLACED
    // WHOLESALE — so the overlay has to restate every window field, and any
    // field added to the base config here is silently dropped from the build
    // the E2E suite actually exercises. That makes the suite pass against a
    // window shape no user ever runs.
    const repoRoot = path.join(SRC_ROOT, "..");
    const read = (rel: string) =>
      JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf8"));

    const base = read("src-tauri/tauri.conf.json").app.windows[0];
    const overlay = read("src-tauri/tauri.e2e.conf.json").app.windows[0];

    const { additionalBrowserArgs, ...overlayRest } = overlay;

    expect(
      overlayRest,
      "tauri.e2e.conf.json must restate the shipping window config verbatim — " +
        "Tauri replaces the whole windows array rather than merging into it, " +
        "so a field only in tauri.conf.json is missing from the E2E build",
    ).toEqual(base);

    expect(
      additionalBrowserArgs,
      "the overlay must keep wry's default --disable-features args: setting " +
        "additionalBrowserArgs REPLACES them rather than appending",
    ).toContain("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
    expect(
      additionalBrowserArgs,
      "the overlay exists to open the DevTools port; without this the E2E " +
        "session dies with 'DevToolsActivePort file doesn't exist'",
    ).toContain("--remote-debugging-port=");

    // The port is duplicated in the wdio harness, which attaches to it.
    const port = /--remote-debugging-port=(\d+)/.exec(additionalBrowserArgs)?.[1];
    const wdio = fs.readFileSync(path.join(repoRoot, "e2e/wdio.conf.ts"), "utf8");
    expect(
      new RegExp(`DEBUG_PORT\\s*=\\s*${port}\\b`).test(wdio),
      `e2e/wdio.conf.ts DEBUG_PORT must match the overlay's port (${port}) — ` +
        "the driver attaches to a port the app never opened otherwise",
    ).toBe(true);
  });

  it("every E2E spec clears startup modals before it interacts", () => {
    // The E2E job builds on a clean runner, so every run is a first run and
    // PackOnboardingDialog opens as soon as preferences hydrate. Its Radix
    // overlay is `fixed inset-0` with `pointer-events: auto`, so it receives
    // every click meant for app chrome and WebDriver reports "element click
    // intercepted" — never anything naming the dialog. That took the nightly
    // job down: the terminal spec could not reach the "New tab" button, so
    // the failure surfaced as a missing `.xterm` 15 s later.
    //
    // Any new spec inherits the same first-run profile, so this is a property
    // of the suite rather than of one file.
    const repoRoot = path.join(SRC_ROOT, "..");
    const specDir = path.join(repoRoot, "e2e/specs");
    const specs = fs
      .readdirSync(specDir)
      .filter((f) => f.endsWith(".test.ts"));

    expect(
      specs.length,
      "no E2E specs found — this guard is reading the wrong directory",
    ).toBeGreaterThan(0);

    for (const spec of specs) {
      const src = fs.readFileSync(path.join(specDir, spec), "utf8");
      expect(
        /dismissStartupDialogs\s*\(/.test(src),
        `e2e/specs/${spec} must await dismissStartupDialogs() in its before() ` +
          "hook — a first-run modal's overlay intercepts every click on app " +
          "chrome, and the resulting failure names the overlay rather than " +
          "the dialog. Helper lives in e2e/support/dialogs.ts",
      ).toBe(true);
    }
  });

  // Pitfall #19: no emoji in the product. Emoji render from the OS emoji
  // font, not the theme — wrong colour, wrong weight, wrong size, a different
  // glyph on every platform, and entirely outside the semantic icon layer
  // that exists so one idea has exactly one mark (pitfall #18). Every idea an
  // emoji stood in for already has an `<Icon name="...">`.
  //
  // The boundary is Unicode's own: `Emoji_Presentation` is the property for
  // "renders as colour emoji by default", plus U+FE0F, the selector that
  // forces emoji presentation onto a text glyph. Typographic marks stay
  // allowed — arrows (→ ↑ ↵), modifier keys (⇧), box drawing, the checkmark,
  // the warning sign — because those are text: they inherit the font and the
  // theme's colour, and they are load-bearing in the file headers and the
  // keyboard hints.
  // The SVG canvas draws a selection box and drag handles on top of the art.
  // The first version computed those positions as container-relative *client*
  // pixels and drew them into the overlay SVG's own coordinate space, which are
  // the same thing only when nothing in between applies a scale. This app
  // applies one — `zoom: var(--app-zoom)` on `.zoom-content` — so the box and
  // every handle sat offset from the shape and mis-scaled by the zoom factor,
  // and grabbing a handle made the point it controlled jump to the cursor.
  //
  // Two independent things keep it honest, and both are asserted here because
  // either one alone would leave the other free to rot.
  it("pitfall 15 (canvas): the SVG canvas overlay shares the art's coordinate space", () => {
    const src = readSrc("modules/art/SvgCanvas.tsx");

    expect(
      /className="zoom-exempt/.test(src),
      "the SvgCanvas viewport must stay `zoom-exempt` — under an ancestor CSS " +
        "zoom, getScreenCTM/clientWidth and pointer clientX stop agreeing, " +
        "which is the same class of bug as CLAUDE.md pitfall #15",
    ).toBe(true);

    expect(
      /viewBox=\{viewBox\.join\(" "\)\}/.test(src),
      "the overlay <svg> must mirror the art's viewBox — that is what makes " +
        "its user units the art's user units, so no pixel conversion is needed",
    ).toBe(true);

    expect(
      /rootCtm\.inverse\(\)\.multiply\(nodeCtm\)/.test(src),
      "overlay geometry must map node space to root space with a matrix " +
        "*ratio* — any factor the two share (ancestor zoom, device pixel " +
        "ratio, viewBox fit) then cancels instead of needing to be divided out",
    ).toBe(true);

    expect(
      src.includes("getBoundingClientRect"),
      "SvgCanvas must not measure overlay geometry with getBoundingClientRect " +
        "— it returns client pixels, and the overlay draws in user units",
    ).toBe(false);
  });

  it("pitfall 19: no emoji anywhere in the frontend source", () => {
    const EMOJI = /[\p{Emoji_Presentation}\uFE0F]/u;
    const offenders: string[] = [];
    for (const [rel, text] of sourceFiles()) {
      text.split("\n").forEach((line, i) => {
        if (EMOJI.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(
      offenders,
      "emoji are banned in Nexis source — they ignore the theme, differ per " +
        "platform, and bypass the semantic icon layer. Use <Icon name=\"...\"> " +
        "(src/components/icon.tsx); add a name there if the idea has none.",
    ).toEqual([]);
  });
});
