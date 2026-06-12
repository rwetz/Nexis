// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  conversationToHtml,
  terminalToHtml,
  type ShareMessage,
} from "./useShareServer";

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

  it("static snapshot carries no live script and no live badge", () => {
    const html = terminalToHtml("output", "T", false);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("WebSocket");
    expect(html).not.toContain("EventSource");
    expect(html).not.toContain("LIVE");
  });

  it("live page connects to /ws first with an SSE fallback to /stream", () => {
    const html = terminalToHtml("output", "T", true);
    expect(html).toContain("new WebSocket");
    expect(html).toContain("'/ws'");
    expect(html).toContain("new EventSource('/stream')");
    expect(html).toContain("LIVE");
    // The fallback must only ever fire once even if both onerror and
    // onclose trigger.
    expect(html).toContain("fellBack");
  });
});
