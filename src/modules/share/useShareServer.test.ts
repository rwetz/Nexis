// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
// The share module subscribes to terminal output at module level for live
// push; the real useTerminalSession drags xterm/IPC into the node env.
vi.mock("@/modules/terminal/lib/useTerminalSession", () => ({
  onTerminalOutput: vi.fn(() => () => {}),
}));

import {
  conversationToHtml,
  terminalToHtml,
  useShareStore,
  startShare,
  stopShare,
  updateShare,
  shareUrl,
  registerShareTerminalBufferProvider,
  type ShareMessage,
} from "./useShareServer";

function resetStore() {
  useShareStore.setState({
    status: "stopped",
    port: null,
    error: null,
    token: null,
    bindChoice: "all",
    lanIp: null,
    target: null,
    live: false,
  });
  registerShareTerminalBufferProvider(null);
}

describe("conversationToHtml", () => {
  it("escapes HTML in message content (terminal/AI text is untrusted)", () => {
    const messages: ShareMessage[] = [
      { role: "user", content: '<script>alert("x")</script>' },
    ];
    const html = conversationToHtml(messages);
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("escapes the page title", () => {
    const html = conversationToHtml([], '<img src=x onerror="p()">');
    expect(html).not.toContain('<img src=x onerror="p()">');
  });

  it("drops system messages and labels roles", () => {
    const html = conversationToHtml([
      { role: "system", content: "SYSTEM-PROMPT-SECRET" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(html).not.toContain("SYSTEM-PROMPT-SECRET");
    expect(html).toContain(">You<");
    expect(html).toContain(">AI<");
  });
});

describe("terminalToHtml", () => {
  it("escapes terminal buffer content", () => {
    const html = terminalToHtml("$ cat <file> && echo \"done\"");
    expect(html).toContain("&lt;file&gt;");
    expect(html).toContain("&quot;done&quot;");
  });

  it("static snapshot carries no live script, no live badge, and no token", () => {
    const html = terminalToHtml("output", "T", false, "abc123DEF456");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("WebSocket");
    expect(html).not.toContain("EventSource");
    expect(html).not.toContain("LIVE");
    expect(html).not.toContain("abc123DEF456");
  });

  it("live page connects to tokenized /ws with an SSE fallback to /stream", () => {
    const html = terminalToHtml("output", "T", true, "abc123DEF456");
    expect(html).toContain("new WebSocket");
    expect(html).toContain("'/ws?k=abc123DEF456'");
    expect(html).toContain("new EventSource('/stream?k=abc123DEF456')");
    expect(html).toContain("LIVE");
    // The fallback must only ever fire once even if both onerror and
    // onclose trigger.
    expect(html).toContain("fellBack");
  });

  it("refuses to embed a non-alphanumeric token into the live script", () => {
    const html = terminalToHtml("output", "T", true, "x'};alert(1);//");
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("'/ws?k='");
  });
});

describe("share store lifecycle", () => {
  let invokeMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const core = await import("@tauri-apps/api/core");
    invokeMock = vi.mocked(core.invoke);
    invokeMock.mockReset();
    resetStore();
  });

  it("startShare passes a CSPRNG token + bind and transitions to running", async () => {
    invokeMock.mockResolvedValue(4567);
    const port = await startShare({
      target: "conversation",
      live: false,
      buildHtml: () => "<html>x</html>",
    });
    expect(port).toBe(4567);
    const [cmd, args] = invokeMock.mock.calls[0] as [
      string,
      { html: string; port: number; bind: string; token: string },
    ];
    expect(cmd).toBe("http_share_start");
    expect(args.bind).toBe("0.0.0.0"); // default: all interfaces
    expect(args.token).toMatch(/^[0-9a-f]{32}$/); // 128-bit hex
    const s = useShareStore.getState();
    expect(s.status).toBe("running");
    expect(s.port).toBe(4567);
    expect(s.token).toBe(args.token);
    expect(s.target).toBe("conversation");
  });

  it("each session gets a fresh token", async () => {
    invokeMock.mockResolvedValue(1);
    await startShare({ target: "conversation", live: false, buildHtml: () => "" });
    const first = useShareStore.getState().token;
    await stopShare();
    await startShare({ target: "conversation", live: false, buildHtml: () => "" });
    expect(useShareStore.getState().token).not.toBe(first);
  });

  it("resolves the bind choice: localhost and lan", async () => {
    invokeMock.mockResolvedValue(1);
    useShareStore.setState({ bindChoice: "localhost" });
    await startShare({ target: "conversation", live: false, buildHtml: () => "" });
    expect((invokeMock.mock.calls[0][1] as { bind: string }).bind).toBe("127.0.0.1");

    invokeMock.mockClear();
    invokeMock.mockResolvedValue(1);
    useShareStore.setState({ bindChoice: "lan", lanIp: "192.168.1.20" });
    await startShare({ target: "conversation", live: false, buildHtml: () => "" });
    expect((invokeMock.mock.calls[0][1] as { bind: string }).bind).toBe("192.168.1.20");
  });

  it("redacts the INITIAL page before http_share_start", async () => {
    invokeMock.mockResolvedValue(1);
    const secret = `sk-${"a1B2".repeat(10)}`;
    await startShare({
      target: "terminal",
      live: false,
      buildHtml: () => `<pre>export KEY=${secret}</pre>`,
    });
    const html = (invokeMock.mock.calls[0][1] as { html: string }).html;
    expect(html).not.toContain(secret);
  });

  it("the live token reaches buildHtml so pages can embed it", async () => {
    invokeMock.mockResolvedValue(1);
    let seen: string | null = null;
    await startShare({
      target: "terminal",
      live: true,
      buildHtml: (tok) => {
        seen = tok;
        return "";
      },
    });
    expect(seen).toBe(useShareStore.getState().token);
  });

  it("start failure lands in error state, not running", async () => {
    invokeMock.mockRejectedValue(new Error("bind: in use"));
    const port = await startShare({
      target: "conversation",
      live: false,
      buildHtml: () => "",
    });
    expect(port).toBeNull();
    const s = useShareStore.getState();
    expect(s.status).toBe("error");
    expect(s.error).toContain("bind: in use");
  });

  it("updateShare is a no-op while stopped", async () => {
    await updateShare("<html>y</html>");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("stopShare resets the session (port + token cleared)", async () => {
    invokeMock.mockResolvedValue(4567);
    await startShare({ target: "conversation", live: false, buildHtml: () => "" });
    await stopShare();
    const s = useShareStore.getState();
    expect(s.status).toBe("stopped");
    expect(s.port).toBeNull();
    expect(s.token).toBeNull();
  });

  it("live terminal start subscribes to terminal output and seeds viewers", async () => {
    const { onTerminalOutput } = await import(
      "@/modules/terminal/lib/useTerminalSession"
    );
    const onOutputMock = vi.mocked(onTerminalOutput);
    onOutputMock.mockClear();
    invokeMock.mockResolvedValue(1);
    registerShareTerminalBufferProvider(() => "seed buffer");
    await startShare({ target: "terminal", live: true, buildHtml: () => "" });
    expect(onOutputMock).toHaveBeenCalledTimes(1);
    const pushCalls = invokeMock.mock.calls.filter(
      (c) => c[0] === "http_share_push_stream",
    );
    expect(pushCalls.length).toBe(1);
    expect((pushCalls[0][1] as { data: string }).data).toBe("seed buffer");
    await stopShare();
  });
});

describe("shareUrl", () => {
  it("is null while stopped, tokenized while running", () => {
    expect(
      shareUrl({ status: "stopped", port: null, token: null, bindChoice: "all", lanIp: null }),
    ).toBeNull();
    expect(
      shareUrl({
        status: "running",
        port: 8080,
        token: "t0k3n",
        bindChoice: "all",
        lanIp: "10.0.0.5",
      }),
    ).toBe("http://10.0.0.5:8080/?k=t0k3n");
    // localhost bind always displays 127.0.0.1, whatever the LAN IP is
    expect(
      shareUrl({
        status: "running",
        port: 8080,
        token: "t0k3n",
        bindChoice: "localhost",
        lanIp: "10.0.0.5",
      }),
    ).toBe("http://127.0.0.1:8080/?k=t0k3n");
  });
});
