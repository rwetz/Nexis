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
