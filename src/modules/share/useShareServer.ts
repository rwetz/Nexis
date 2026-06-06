// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * useShareServer — thin wrapper around the http_share Tauri commands.
 *
 * Manages the lifecycle of the LAN HTTP share server (start / update / stop)
 * and exposes a `pushStream` function for live SSE terminal streaming.
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
  pushStream: (data: string) => Promise<void>;
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

  const pushStream = useCallback(async (data: string) => {
    try {
      await invoke("http_share_push_stream", { data });
    } catch {
      // Ignore — server may be stopped
    }
  }, []);

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

  return { status, port, error, start, update, pushStream, stop };
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
 * When `live` is true the page connects to /stream via Server-Sent Events
 * and updates the terminal output automatically.
 */
export function terminalToHtml(
  bufferText: string,
  title = "Terminal Snapshot",
  live = false,
): string {
  const escaped = escapeHtml(bufferText);
  const ts = new Date().toLocaleString();

  const liveScript = live
    ? `<script>
(function(){
  var pre = document.getElementById('output');
  var dot = document.getElementById('live-dot');
  var es = new EventSource('/stream');
  es.onmessage = function(e){
    // data is JSON-escaped newlines → restore
    pre.textContent = e.data.replace(/\\\\n/g,'\\n');
    pre.scrollTop = pre.scrollHeight;
  };
  es.onerror = function(){
    if(dot) dot.style.background='#f55';
  };
})();
</script>`
    : "";

  const liveBadge = live
    ? `<span id="live-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#4ade80;margin-right:6px;vertical-align:middle;animation:pulse 1.5s infinite"></span><span style="font-size:10px;color:#4ade80;vertical-align:middle">LIVE</span>`
    : "";

  const pulseKeyframes = live
    ? `@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"JetBrains Mono",Consolas,monospace;background:#0f0f0f;color:#e0e0e0;padding:16px;height:100vh;display:flex;flex-direction:column}
header{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #333;flex-shrink:0}
h1{font-size:14px;font-weight:600;color:#aaa}
.ts{font-size:10px;color:#555;margin-top:3px}
#output{font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;flex:1;overflow-y:auto}
${pulseKeyframes}
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)} ${liveBadge}</h1>
  <p class="ts">Shared from Nexis · ${escapeHtml(ts)}</p>
</header>
<pre id="output">${escaped}</pre>
${liveScript}
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
