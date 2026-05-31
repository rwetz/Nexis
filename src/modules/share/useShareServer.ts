/**
 * useShareServer — thin wrapper around the http_share Tauri commands.
 *
 * Manages the lifecycle of the LAN HTTP share server (start / update / stop).
 */
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";

export type ShareServerStatus = "stopped" | "starting" | "running" | "error";

export type UseShareServerReturn = {
  status: ShareServerStatus;
  port: number | null;
  error: string | null;
  start: (html: string) => Promise<number | null>;
  update: (html: string) => Promise<void>;
  stop: () => Promise<void>;
};

export function useShareServer(): UseShareServerReturn {
  const [status, setStatus] = useState<ShareServerStatus>("stopped");
  const [port, setPort] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const portRef = useRef<number | null>(null);

  const start = useCallback(async (html: string): Promise<number | null> => {
    setStatus("starting");
    setError(null);
    try {
      const actualPort = await invoke<number>("http_share_start", {
        html,
        port: 0, // auto-assign
      });
      portRef.current = actualPort;
      setPort(actualPort);
      setStatus("running");
      return actualPort;
    } catch (e) {
      setError(String(e));
      setStatus("error");
      return null;
    }
  }, []);

  const update = useCallback(async (html: string) => {
    if (status !== "running") return;
    try {
      await invoke("http_share_update", { html });
    } catch {
      // Non-fatal — server might have been stopped externally
    }
  }, [status]);

  const stop = useCallback(async () => {
    try {
      await invoke("http_share_stop");
    } catch {
      // Ignore — server may already be stopped
    }
    portRef.current = null;
    setPort(null);
    setStatus("stopped");
    setError(null);
  }, []);

  return { status, port, error, start, update, stop };
}

// ── Conversation → HTML serialization ────────────────────────────────────────

export type ShareMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

/**
 * Produce a self-contained HTML page from a list of chat messages.
 * Styled to be readable on any device — minimal CSS, no external resources.
 */
export function conversationToHtml(
  messages: ShareMessage[],
  title = "Nexis AI Conversation",
): string {
  const rows = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const escaped = escapeHtml(m.content);
      const roleClass = m.role === "user" ? "user" : "assistant";
      const roleLabel = m.role === "user" ? "You" : "AI";
      return `<div class="msg ${roleClass}"><span class="role">${roleLabel}</span><div class="body"><pre>${escaped}</pre></div></div>`;
    })
    .join("\n");

  const ts = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f0f0f;color:#e8e8e8;max-width:820px;margin:0 auto;padding:16px}
header{padding:12px 0 20px;border-bottom:1px solid #333;margin-bottom:16px}
h1{font-size:15px;font-weight:600;color:#aaa}
.ts{font-size:11px;color:#555;margin-top:4px}
.msg{margin-bottom:14px;border-radius:8px;overflow:hidden;border:1px solid #222}
.msg.user{background:#1a1a2e}
.msg.assistant{background:#0d1a0d}
.role{display:block;padding:5px 12px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:rgba(255,255,255,.04);color:#777;border-bottom:1px solid #222}
.body{padding:10px 12px}
.body pre{font-family:"JetBrains Mono",Consolas,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;color:#e0e0e0}
</style>
</head>
<body>
<header>
<h1>${escapeHtml(title)}</h1>
<p class="ts">Shared from Nexis · ${escapeHtml(ts)}</p>
</header>
${rows}
</body>
</html>`;
}

/**
 * Produce a self-contained HTML snapshot from terminal buffer text.
 */
export function terminalToHtml(bufferText: string, title = "Terminal Snapshot"): string {
  const escaped = escapeHtml(bufferText);
  const ts = new Date().toLocaleString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"JetBrains Mono",Consolas,monospace;background:#0f0f0f;color:#e0e0e0;padding:16px}
header{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #333}
h1{font-size:14px;font-weight:600;color:#aaa}
.ts{font-size:10px;color:#555;margin-top:3px}
pre{font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
</style>
</head>
<body>
<header><h1>${escapeHtml(title)}</h1><p class="ts">Shared from Nexis · ${escapeHtml(ts)}</p></header>
<pre>${escaped}</pre>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
