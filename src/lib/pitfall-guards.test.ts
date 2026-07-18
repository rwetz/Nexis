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

    const recording = readSrc("modules/terminal/lib/useRecording.ts");
    expect(
      /redactSensitive\(/.test(recording),
      "useRecording's save path must scrub event text with redactSensitive() before save_cast_recording",
    ).toBe(true);
  });
});
