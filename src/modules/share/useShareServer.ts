// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * useShareServer — global state + controller for the LAN HTTP share server.
 *
 * State lives in a Zustand store (not component state) so sharing keeps
 * running — and stays visible in the status bar — while the Share panel is
 * closed. The live-stream push loop is likewise module-level: it subscribes
 * to terminal output directly, so switching sidebar views doesn't stop the
 * feed remote viewers are watching.
 *
 * Every viewer request must carry a per-session token (`?k=<token>`); it is
 * generated here (crypto CSPRNG), enforced Rust-side with a constant-time
 * compare, and embedded into the live page's /ws + /stream URLs.
 */
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { redactSensitive } from "@/modules/ai/lib/redact";
import { onTerminalOutput } from "@/modules/terminal/lib/useTerminalSession";

export type ShareServerStatus = "stopped" | "starting" | "running" | "error";

export type ShareTarget = "conversation" | "terminal";

/** Which address the server listens on. */
export type ShareBindChoice = "all" | "lan" | "localhost";

type ShareState = {
  status: ShareServerStatus;
  port: number | null;
  error: string | null;
  /** View token of the running session (null while stopped). */
  token: string | null;
  /** Bind scope the user picked (applies at the next start). */
  bindChoice: ShareBindChoice;
  /** Primary LAN IP, best-effort — for the URL display and the "lan" bind. */
  lanIp: string | null;
  /** What the running server is showing. */
  target: ShareTarget | null;
  live: boolean;
};

type ShareActions = {
  setBindChoice: (c: ShareBindChoice) => void;
};

export const useShareStore = create<ShareState & ShareActions>((set) => ({
  status: "stopped",
  port: null,
  error: null,
  token: null,
  bindChoice: "all",
  lanIp: null,
  target: null,
  live: false,
  setBindChoice: (c) => set({ bindChoice: c }),
}));

// ── Terminal buffer provider ─────────────────────────────────────────────────
// Registered by App (which owns the tab/terminal refs); read by the live push
// loop below. Returns null when no terminal tab is active.

let bufferProvider: (() => string | null) | null = null;

export function registerShareTerminalBufferProvider(
  fn: (() => string | null) | null,
): void {
  bufferProvider = fn;
}

export function shareTerminalBuffer(): string | null {
  return bufferProvider?.() ?? null;
}

// ── Live push loop (module-level — survives panel unmount) ───────────────────

let unsubscribeLive: (() => void) | null = null;
let liveDebounce: ReturnType<typeof setTimeout> | null = null;

function startLivePush(): void {
  stopLivePush();
  const push = () => {
    const buf = shareTerminalBuffer();
    // No active terminal tab → keep the last frame instead of blanking viewers.
    if (buf !== null) void pushShareStream(buf);
  };
  push(); // seed connected viewers immediately
  unsubscribeLive = onTerminalOutput(() => {
    if (liveDebounce) return;
    liveDebounce = setTimeout(() => {
      liveDebounce = null;
      push();
    }, 120);
  });
}

function stopLivePush(): void {
  unsubscribeLive?.();
  unsubscribeLive = null;
  if (liveDebounce) {
    clearTimeout(liveDebounce);
    liveDebounce = null;
  }
}

// ── Controller ───────────────────────────────────────────────────────────────

/** 128 bits from the webview CSPRNG as 32 hex chars. */
function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function resolveBind(choice: ShareBindChoice, lanIp: string | null): string {
  if (choice === "localhost") return "127.0.0.1";
  if (choice === "lan" && lanIp) return lanIp;
  return "0.0.0.0";
}

/** Ask Rust for the primary LAN IP (display + "lan" bind). Call on panel open. */
export async function refreshShareLanIp(): Promise<void> {
  try {
    const ip = await invoke<string | null>("http_share_lan_ip");
    useShareStore.setState({ lanIp: ip ?? null });
  } catch {
    // Leave the placeholder; purely cosmetic.
  }
}

export type StartShareOptions = {
  /**
   * Builds the page for the session's token — live pages embed it in their
   * /ws + /stream URLs, which is why the token must exist before the HTML.
   */
  buildHtml: (token: string) => string;
  target: ShareTarget;
  live: boolean;
};

export async function startShare(opts: StartShareOptions): Promise<number | null> {
  const { bindChoice, lanIp } = useShareStore.getState();
  useShareStore.setState({ status: "starting", error: null });
  const token = generateToken();
  try {
    // The initial HTML takes the same redaction pass as every later update —
    // it is the first thing a viewer downloads.
    const html = redactSensitive(opts.buildHtml(token));
    const port = await invoke<number>("http_share_start", {
      html,
      port: 0, // auto-assign
      bind: resolveBind(bindChoice, lanIp),
      token,
    });
    useShareStore.setState({
      status: "running",
      port,
      token,
      target: opts.target,
      live: opts.live,
    });
    if (opts.live && opts.target === "terminal") startLivePush();
    return port;
  } catch (e) {
    useShareStore.setState({ status: "error", error: String(e) });
    return null;
  }
}

// Everything leaving over the LAN share is redacted first — key-shaped
// strings in scrollback (an `export OPENAI_API_KEY=` earlier in the
// session, a token in command output) must never reach remote viewers.
export async function updateShare(html: string): Promise<void> {
  if (useShareStore.getState().status !== "running") return;
  try {
    await invoke("http_share_update", { html: redactSensitive(html) });
  } catch {
    // Non-fatal — server might have been stopped externally
  }
}

export async function pushShareStream(data: string): Promise<void> {
  try {
    await invoke("http_share_push_stream", { data: redactSensitive(data) });
  } catch {
    // Ignore — server may be stopped
  }
}

export async function stopShare(): Promise<void> {
  stopLivePush();
  try {
    await invoke("http_share_stop");
  } catch {
    // Ignore — server may already be stopped
  }
  useShareStore.setState({
    status: "stopped",
    port: null,
    token: null,
    error: null,
    target: null,
    live: false,
  });
}

/**
 * The URL viewers open, from the current store state — or null while stopped.
 * When the exact LAN IP isn't known the host is a placeholder the UI already
 * explains ("replace with this machine's IP").
 */
export function shareUrl(s: {
  status: ShareServerStatus;
  port: number | null;
  token: string | null;
  bindChoice: ShareBindChoice;
  lanIp: string | null;
}): string | null {
  if (s.status !== "running" || s.port === null || !s.token) return null;
  const host =
    s.bindChoice === "localhost" ? "127.0.0.1" : (s.lanIp ?? "192.168.x.x");
  return `http://${host}:${s.port}/?k=${s.token}`;
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
 * When `live` is true the page connects to /ws via WebSocket for instant
 * push updates, falling back to the /stream SSE endpoint when the WebSocket
 * can't be established. Both live URLs carry the session's view token —
 * the Rust server rejects them without it.
 */
export function terminalToHtml(
  bufferText: string,
  title = "Terminal Snapshot",
  live = false,
  token = "",
): string {
  const escaped = escapeHtml(bufferText);
  const ts = new Date().toLocaleString();
  // Defensive: the token is hex from our own generator, but it lands inside a
  // JS string in served HTML — never interpolate anything else.
  const safeToken = /^[a-zA-Z0-9]*$/.test(token) ? token : "";

  const liveScript = live
    ? `<script>
(function(){
  var pre = document.getElementById('output');
  var dot = document.getElementById('live-dot');
  function show(text){
    pre.textContent = text;
    pre.scrollTop = pre.scrollHeight;
  }
  function startSse(){
    var es = new EventSource('/stream?k=${safeToken}');
    es.onmessage = function(e){
      // SSE data has escaped newlines → restore
      show(e.data.replace(/\\\\n/g,'\\n'));
    };
    es.onerror = function(){
      if(dot) dot.style.background='#f55';
    };
  }
  var fellBack = false;
  function fallback(){
    if(fellBack) return;
    fellBack = true;
    startSse();
  }
  try {
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    var ws = new WebSocket(proto + location.host + '/ws?k=${safeToken}');
    ws.onmessage = function(e){ show(e.data); };
    ws.onerror = fallback;
    ws.onclose = fallback;
  } catch (err) {
    fallback();
  }
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
