// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import {
  createShellIntegrationState,
  registerClipboardHandler,
  registerCwdHandler,
  registerPromptTracker,
  registerTitleHandler,
} from "./osc-handlers";

/**
 * Minimal in-memory fake of the xterm `Terminal` surface we touch — just
 * enough to register OSC handlers and invoke them with crafted payloads.
 * The OSC handler signature is `(data: string) => boolean | Promise<boolean>`.
 */
type OscHandler = (data: string) => boolean | Promise<boolean>;

function makeFakeTerm() {
  const handlers = new Map<number, OscHandler>();
  const term = {
    parser: {
      registerOscHandler(code: number, handler: OscHandler) {
        handlers.set(code, handler);
        return { dispose: () => handlers.delete(code) };
      },
    },
    registerMarker: vi.fn().mockReturnValue({ isDisposed: false, dispose: vi.fn() }),
  } as unknown as Terminal;
  return { term, handlers };
}

describe("OSC 7 cwd handler — gated by OSC 133 in-command state", () => {
  it("accepts OSC 7 when no command is running", () => {
    const { term, handlers } = makeFakeTerm();
    const state = createShellIntegrationState();
    const onCwd = vi.fn();
    registerPromptTracker(term, state);
    registerCwdHandler(term, onCwd, state);

    // OSC 133 A means "new prompt is about to be drawn" — we're between
    // commands and OSC 7 from the shell is legitimate here.
    handlers.get(133)?.("A");
    handlers.get(7)?.("file://host/home/me/project");

    expect(onCwd).toHaveBeenCalledWith("/home/me/project");
  });

  it("rejects OSC 7 emitted while a command is running", () => {
    const { term, handlers } = makeFakeTerm();
    const state = createShellIntegrationState();
    const onCwd = vi.fn();
    registerPromptTracker(term, state);
    registerCwdHandler(term, onCwd, state);

    // Simulate: user runs `ssh attacker.host`, which prints attacker bytes
    // including an OSC 7 trying to silently move the AI's cwd into /etc.
    handlers.get(133)?.("A"); // prompt drawn
    handlers.get(133)?.("B"); // command begins (user hit enter)
    handlers.get(7)?.("file://host/etc"); // attacker injection

    expect(onCwd).not.toHaveBeenCalled();
  });

  it("re-accepts OSC 7 after command finishes (OSC 133 D)", () => {
    const { term, handlers } = makeFakeTerm();
    const state = createShellIntegrationState();
    const onCwd = vi.fn();
    registerPromptTracker(term, state);
    registerCwdHandler(term, onCwd, state);

    handlers.get(133)?.("A");
    handlers.get(133)?.("B"); // running
    handlers.get(7)?.("file://host/etc"); // blocked
    handlers.get(133)?.("D;0"); // command exited
    handlers.get(7)?.("file://host/home/me/new-cwd"); // legitimate post-cmd OSC 7

    expect(onCwd).toHaveBeenCalledTimes(1);
    expect(onCwd).toHaveBeenCalledWith("/home/me/new-cwd");
  });

  it("marks integration as seen on OSC 133 and accepted OSC 7 only", () => {
    const { term, handlers } = makeFakeTerm();
    const state = createShellIntegrationState();
    registerPromptTracker(term, state);
    registerCwdHandler(term, vi.fn(), state);
    expect(state.markersSeen).toBe(false);

    // A rejected in-command OSC 7 (untrusted output) must NOT flip the flag —
    // it would switch off the OS-level cwd fallback for a shell that has no
    // real integration.
    state.inCommand = true;
    handlers.get(7)?.("file://host/etc");
    expect(state.markersSeen).toBe(false);
    state.inCommand = false;

    handlers.get(7)?.("file://host/home/me");
    expect(state.markersSeen).toBe(true);

    const fresh = createShellIntegrationState();
    const { term: term2, handlers: handlers2 } = makeFakeTerm();
    registerPromptTracker(term2, fresh);
    handlers2.get(133)?.("A");
    expect(fresh.markersSeen).toBe(true);
  });

  it("works without state for backwards compatibility (legacy callers)", () => {
    // The state parameter is optional — when omitted, OSC 7 is always
    // honored (legacy behavior). Tests must confirm we didn't break this.
    const { term, handlers } = makeFakeTerm();
    const onCwd = vi.fn();
    registerCwdHandler(term, onCwd);

    handlers.get(7)?.("file://host/home/me/project");
    expect(onCwd).toHaveBeenCalledWith("/home/me/project");
  });

  it("normalizes Windows drive-letter OSC 7 paths", () => {
    const { term, handlers } = makeFakeTerm();
    const onCwd = vi.fn();
    registerCwdHandler(term, onCwd);

    handlers.get(7)?.("file:///C:/Users/me/project");
    expect(onCwd).toHaveBeenCalledWith("C:/Users/me/project");
  });
});

describe("OSC 133 failed-command Explain chip", () => {
  type FakeMarker = { line: number; isDisposed: boolean; dispose: () => void };
  type FakeDecoration = {
    options: { anchor?: string };
    disposed: boolean;
    render: ((el: HTMLElement) => void) | null;
    dispose: () => void;
    onRender: (cb: (el: HTMLElement) => void) => void;
    onDispose: (cb: () => void) => void;
  };

  /**
   * Buffer-capable fake: real marker lines (recorded at the cursor position
   * at registration time), a line store for translateToString, and captured
   * decorations so tests can render the chip and click it — all without a
   * DOM, since the chip deliberately styles the decoration element itself.
   */
  function makeBufferTerm(lines: string[], wrappedRows: number[] = []) {
    const handlers = new Map<number, OscHandler>();
    const wrapped = new Set(wrappedRows);
    const cursor = { x: 0, y: 0 };
    const decorations: FakeDecoration[] = [];
    const term = {
      parser: {
        registerOscHandler(code: number, handler: OscHandler) {
          handlers.set(code, handler);
          return { dispose: () => handlers.delete(code) };
        },
      },
      registerMarker(): FakeMarker {
        const m: FakeMarker = {
          line: cursor.y,
          isDisposed: false,
          dispose: () => {
            m.isDisposed = true;
          },
        };
        return m;
      },
      registerDecoration(options: { anchor?: string }): FakeDecoration {
        const dec: FakeDecoration = {
          options,
          disposed: false,
          render: null,
          dispose: () => {
            dec.disposed = true;
          },
          onRender: (cb) => {
            dec.render = cb;
          },
          onDispose: () => {},
        };
        decorations.push(dec);
        return dec;
      },
      buffer: {
        active: {
          baseY: 0,
          get cursorY() {
            return cursor.y;
          },
          get cursorX() {
            return cursor.x;
          },
          getLine: (y: number) =>
            y >= 0 && y < lines.length
              ? {
                  isWrapped: wrapped.has(y),
                  translateToString: (_trim: boolean, start = 0) =>
                    (lines[y] ?? "").slice(start).replace(/\s+$/, ""),
                }
              : undefined,
        },
      },
    } as unknown as Terminal;
    return { term, handlers, cursor, decorations };
  }

  /** Minimal stand-in for the decoration element the chip styles. */
  function makeChipEl() {
    return {
      style: {} as Record<string, string>,
      textContent: "",
      title: "",
      onclick: null as
        | ((e: { preventDefault: () => void; stopPropagation: () => void }) => void)
        | null,
      onmouseenter: null as (() => void) | null,
      onmouseleave: null as (() => void) | null,
    };
  }

  const clickEvent = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

  type Fake = ReturnType<typeof makeBufferTerm>;

  /** Drive one full prompt cycle: A → B (input starts at `promptLen`) →
   * optional C on `cLine` → D with `exit`, cursor left at end position. */
  function runCommand(
    t: Fake,
    opts: {
      promptLine: number;
      promptLen: number;
      exit: string;
      cLine?: number;
      endLine: number;
      endX?: number;
    },
  ) {
    const h = t.handlers.get(133);
    t.cursor.y = opts.promptLine;
    t.cursor.x = 0;
    h?.("A");
    t.cursor.x = opts.promptLen;
    h?.("B");
    if (opts.cLine !== undefined) {
      t.cursor.y = opts.cLine;
      t.cursor.x = 0;
      h?.("C");
    }
    t.cursor.y = opts.endLine;
    t.cursor.x = opts.endX ?? 0;
    h?.(`D;${opts.exit}`);
  }

  const chipsOf = (t: Fake) =>
    t.decorations.filter((d) => d.options.anchor === "right");

  function setup(lines: string[], wrappedRows: number[] = [], enabled = true) {
    const t = makeBufferTerm(lines, wrappedRows);
    const onExplain = vi.fn();
    const tracker = registerPromptTracker(t.term, createShellIntegrationState(), {
      isEnabled: () => enabled,
      getCwd: () => "/home/me/dev",
      onExplain,
    });
    return { ...t, onExplain, tracker };
  }

  it("captures command, output, exit code, and cwd; clicking fires onExplain", () => {
    const t = setup([
      "~/dev ❯ cargo build",
      "error[E0308]: mismatched types",
      "error: could not compile",
    ]);
    runCommand(t, { promptLine: 0, promptLen: 8, cLine: 1, exit: "101", endLine: 3 });

    const chips = chipsOf(t);
    expect(chips).toHaveLength(1);

    const el = makeChipEl();
    chips[0].render?.(el as unknown as HTMLElement);
    expect(el.textContent).toBe("✦ Explain");
    expect(el.title).toContain("exit code 101");
    expect(el.style.pointerEvents).toBe("auto");

    el.onclick?.(clickEvent());
    expect(t.onExplain).toHaveBeenCalledTimes(1);
    expect(t.onExplain).toHaveBeenCalledWith({
      command: "cargo build",
      output: "error[E0308]: mismatched types\nerror: could not compile",
      exitCode: 101,
      cwd: "/home/me/dev",
    });
  });

  it("adds no chip on exit 0 (the green gutter bar still appears)", () => {
    const t = setup(["~/dev ❯ ls", "file.txt"]);
    runCommand(t, { promptLine: 0, promptLen: 8, cLine: 1, exit: "0", endLine: 2 });
    expect(chipsOf(t)).toHaveLength(0);
    // The plain exit-status gutter decoration is still registered.
    expect(t.decorations.length).toBe(1);
  });

  it("adds no chip on SIGINT (exit 130) — Ctrl+C is a cancel, not a failure", () => {
    const t = setup(["~/dev ❯ sleep 100", "^C"]);
    runCommand(t, { promptLine: 0, promptLen: 8, cLine: 1, exit: "130", endLine: 2 });
    expect(chipsOf(t)).toHaveLength(0);
  });

  it("adds no chip when the preference is off", () => {
    const t = setup(["~/dev ❯ cargo build", "error: boom"], [], false);
    runCommand(t, { promptLine: 0, promptLen: 8, cLine: 1, exit: "101", endLine: 2 });
    expect(chipsOf(t)).toHaveLength(0);
  });

  it("adds no chip for a bare Enter re-emitting the stale exit status", () => {
    const t = setup(["~/dev ❯ cargo build", "error: boom", "~/dev ❯"]);
    runCommand(t, { promptLine: 0, promptLen: 8, cLine: 1, exit: "101", endLine: 2 });
    // Empty prompt on line 2: Enter without a command — precmd re-emits
    // D with the stale nonzero status, no C fires, no output is printed.
    runCommand(t, { promptLine: 2, promptLen: 8, exit: "101", endLine: 3 });
    expect(chipsOf(t)).toHaveLength(1);
  });

  it("degrades without OSC 133 C (PowerShell): B line is the command, rest is output", () => {
    const t = setup([
      "PS C:\\Users\\me> git puhs",
      "git: 'puhs' is not a git command.",
    ]);
    runCommand(t, { promptLine: 0, promptLen: 16, exit: "1", endLine: 2 });

    const chips = chipsOf(t);
    expect(chips).toHaveLength(1);
    const el = makeChipEl();
    chips[0].render?.(el as unknown as HTMLElement);
    el.onclick?.(clickEvent());
    expect(t.onExplain).toHaveBeenCalledWith({
      command: "git puhs",
      output: "git: 'puhs' is not a git command.",
      exitCode: 1,
      cwd: "/home/me/dev",
    });
  });

  it("joins wrapped command rows without a newline", () => {
    const t = setup(
      ["~ ❯ echo aaaa", "bbbb wrapped", "out"],
      [1], // row 1 is a soft-wrap continuation of row 0
    );
    runCommand(t, { promptLine: 0, promptLen: 4, cLine: 2, exit: "1", endLine: 3 });

    const el = makeChipEl();
    chipsOf(t)[0].render?.(el as unknown as HTMLElement);
    el.onclick?.(clickEvent());
    expect(t.onExplain).toHaveBeenCalledWith(
      expect.objectContaining({ command: "echo aaaabbbb wrapped", output: "out" }),
    );
  });

  it("tail-truncates long output and says so", () => {
    const lines = ["~ ❯ seq 300"];
    for (let i = 1; i <= 300; i++) lines.push(`line-${i}`);
    const t = setup(lines);
    runCommand(t, { promptLine: 0, promptLen: 4, cLine: 1, exit: "1", endLine: 301 });

    const el = makeChipEl();
    chipsOf(t)[0].render?.(el as unknown as HTMLElement);
    el.onclick?.(clickEvent());
    const failure = t.onExplain.mock.calls[0][0];
    expect(failure.output.startsWith("[… earlier output truncated …]")).toBe(true);
    expect(failure.output).toContain("line-300");
    expect(failure.output).not.toContain("line-100\n");
  });

  it("disposes chip decorations with the tracker", () => {
    const t = setup(["~/dev ❯ false", ""]);
    runCommand(t, { promptLine: 0, promptLen: 8, cLine: 1, exit: "1", endLine: 1, endX: 0 });
    // `false` printed nothing: no output and C fired — chip still appears
    // (sawExec is the evidence a command ran).
    const chips = chipsOf(t);
    expect(chips).toHaveLength(1);
    t.tracker.dispose();
    expect(chips[0].disposed).toBe(true);
  });
});

describe("OSC 0/2 title handler", () => {
  it("fires onTitle when OSC 0 is received", () => {
    const { term, handlers } = makeFakeTerm();
    const onTitle = vi.fn();
    registerTitleHandler(term, onTitle);

    handlers.get(0)?.("my project — vim");
    expect(onTitle).toHaveBeenCalledWith("my project — vim");
  });

  it("fires onTitle when OSC 2 is received", () => {
    const { term, handlers } = makeFakeTerm();
    const onTitle = vi.fn();
    registerTitleHandler(term, onTitle);

    handlers.get(2)?.("~/projects/nexis");
    expect(onTitle).toHaveBeenCalledWith("~/projects/nexis");
  });

  it("stops firing after disposer is called", () => {
    const { term, handlers } = makeFakeTerm();
    const onTitle = vi.fn();
    const dispose = registerTitleHandler(term, onTitle);

    handlers.get(0)?.("before dispose");
    dispose();
    handlers.get(0)?.("after dispose");

    expect(onTitle).toHaveBeenCalledTimes(1);
    expect(onTitle).toHaveBeenCalledWith("before dispose");
  });

  it("both OSC 0 and OSC 2 call the same onTitle callback", () => {
    const { term, handlers } = makeFakeTerm();
    const onTitle = vi.fn();
    registerTitleHandler(term, onTitle);

    handlers.get(0)?.("from osc0");
    handlers.get(2)?.("from osc2");

    expect(onTitle).toHaveBeenCalledTimes(2);
    expect(onTitle).toHaveBeenNthCalledWith(1, "from osc0");
    expect(onTitle).toHaveBeenNthCalledWith(2, "from osc2");
  });
});

describe("OSC 52 clipboard handler — write-only, pref-gated", () => {
  /** `Pc;Pd` payload with `Pd` base64 of the given text, like tmux emits. */
  const payload = (text: string) => `c;${btoa(text)}`;

  function setup(enabled = true) {
    const { term, handlers } = makeFakeTerm();
    const writeClipboard = vi.fn().mockResolvedValue(undefined);
    const dispose = registerClipboardHandler(term, () => enabled, writeClipboard);
    return { handlers, writeClipboard, dispose };
  }

  it("writes decoded base64 text to the clipboard when enabled", () => {
    const { handlers, writeClipboard } = setup();
    expect(handlers.get(52)?.(payload("hello from tmux"))).toBe(true);
    expect(writeClipboard).toHaveBeenCalledWith("hello from tmux");
  });

  it("decodes multi-byte UTF-8 payloads correctly", () => {
    const { handlers, writeClipboard } = setup();
    // btoa can't take non-Latin-1 input directly — encode bytes first, the
    // same way a real terminal program base64s raw UTF-8.
    const bytes = new TextEncoder().encode("naïve — 日本語");
    const b64 = btoa(String.fromCharCode(...bytes));
    handlers.get(52)?.(`c;${b64}`);
    expect(writeClipboard).toHaveBeenCalledWith("naïve — 日本語");
  });

  it("always blocks read requests (Pd = '?'), even when enabled", () => {
    // A read would type the system clipboard back into the PTY — clipboard
    // exfiltration to whatever printed the sequence. Consumed, no reply.
    const { handlers, writeClipboard } = setup(true);
    expect(handlers.get(52)?.("c;?")).toBe(true);
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it("consumes but ignores writes when the preference is off", () => {
    const { handlers, writeClipboard } = setup(false);
    // Returning true even when disabled: the sequence must never leak
    // through to another handler or the screen.
    expect(handlers.get(52)?.(payload("blocked"))).toBe(true);
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it("re-reads the preference on every sequence (live toggle, no rebind)", () => {
    const { term, handlers } = makeFakeTerm();
    const writeClipboard = vi.fn().mockResolvedValue(undefined);
    let enabled = false;
    registerClipboardHandler(term, () => enabled, writeClipboard);

    handlers.get(52)?.(payload("while off"));
    enabled = true;
    handlers.get(52)?.(payload("while on"));

    expect(writeClipboard).toHaveBeenCalledTimes(1);
    expect(writeClipboard).toHaveBeenCalledWith("while on");
  });

  it("consumes malformed payloads (no separator, bad base64) without writing", () => {
    const { handlers, writeClipboard } = setup();
    expect(handlers.get(52)?.("no-separator")).toBe(true);
    expect(handlers.get(52)?.("c;!!!not-base64!!!")).toBe(true);
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it("drops oversized payloads (> ~750 KB decoded)", () => {
    const { handlers, writeClipboard } = setup();
    handlers.get(52)?.(`c;${"A".repeat(1_000_001)}`);
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it("stops handling after the disposer runs", () => {
    const { handlers, writeClipboard, dispose } = setup();
    dispose();
    expect(handlers.get(52)).toBeUndefined();
    expect(writeClipboard).not.toHaveBeenCalled();
  });
});
