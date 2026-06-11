// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * SharePanel — LAN sharing of the AI conversation or terminal snapshot.
 *
 * Starts a local HTTP server (Rust) and shows the URL for opening on other
 * devices (phone, tablet, second monitor) on the same network.
 *
 * Terminal snapshot can be made "live" — the browser page connects via
 * WebSocket (SSE fallback) and updates the instant the terminal changes.
 */
import { cn } from "@/lib/utils";
import { useChatStore, getChat } from "@/modules/ai/store/chatStore";
import { onTerminalOutput } from "@/modules/terminal/lib/useTerminalSession";
import {
  Activity01Icon,
  Cancel01Icon,
  Copy01Icon,
  Globe02Icon,
  Refresh01Icon,
  Tick01Icon,
  ComputerTerminal01Icon,
  AiChat02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useShareServer,
  conversationToHtml,
  terminalToHtml,
  type ShareMessage,
} from "./useShareServer";

type ShareTarget = "conversation" | "terminal";

type Props = {
  /** Pass a function that returns the current terminal buffer text */
  getTerminalBuffer?: () => string | null;
};

function getLocalIpHint(): string {
  return "192.168.x.x";
}

export function SharePanel({ getTerminalBuffer }: Props) {
  const [target, setTarget] = useState<ShareTarget>("conversation");
  const [copied, setCopied] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const server = useShareServer();
  const sessionId = useChatStore((s) => s.activeSessionId);

  const buildConversationHtml = useCallback((): string => {
    const chat = getChat(sessionId ?? undefined);
    if (!chat) return conversationToHtml([], "Nexis AI Conversation");
    const rawMessages = (chat.messages as unknown) as Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
    }>;
    const messages: ShareMessage[] = rawMessages.map((m) => ({
      role: m.role as ShareMessage["role"],
      content:
        typeof m.content === "string"
          ? m.content
          : m.content
              .filter((p) => p.type === "text")
              .map((p) => p.text ?? "")
              .join("\n"),
    }));
    return conversationToHtml(messages, "Nexis AI Conversation");
  }, [sessionId]);

  const buildTerminalHtml = useCallback(
    (live = false): string => {
      const buf = getTerminalBuffer?.() ?? "(no terminal buffer available)";
      return terminalToHtml(buf, "Nexis Terminal", live);
    },
    [getTerminalBuffer],
  );

  const buildHtml = useCallback((): string => {
    return target === "conversation"
      ? buildConversationHtml()
      : buildTerminalHtml(liveMode);
  }, [target, liveMode, buildConversationHtml, buildTerminalHtml]);

  const handleStart = useCallback(async () => {
    await server.start(buildHtml());
  }, [server, buildHtml]);

  const handleUpdate = useCallback(async () => {
    await server.update(buildHtml());
  }, [server, buildHtml]);

  const handleCopy = useCallback(async () => {
    if (!server.port) return;
    const url = `http://${getLocalIpHint()}:${server.port}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [server.port]);

  // Live streaming — push the terminal buffer the moment output arrives,
  // debounced to one push per ~120 ms burst. WebSocket clients receive it
  // instantly; SSE fallback clients on the next event.
  const { pushStream } = server;
  useEffect(() => {
    if (!(liveMode && server.status === "running" && target === "terminal")) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const push = () => {
      const buf = getTerminalBuffer?.() ?? "";
      void pushStream(buf);
    };
    push(); // seed connected viewers immediately
    const unsubscribe = onTerminalOutput(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        push();
      }, 120);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [liveMode, server.status, target, pushStream, getTerminalBuffer]);

  // Disable live mode when switching away from terminal target
  useEffect(() => {
    if (target !== "terminal") setLiveMode(false);
  }, [target]);

  // Auto-stop when unmounted
  const stopRef = useRef(server.stop);
  useEffect(() => { stopRef.current = server.stop; }, [server.stop]);
  useEffect(() => { return () => { void stopRef.current(); }; }, []);

  const isRunning = server.status === "running";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <HugeiconsIcon icon={Globe02Icon} size={13} strokeWidth={1.75} className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Share
        </span>
        {isRunning && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[9px] font-bold text-green-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            {liveMode && target === "terminal" ? "Live" : "Running"}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* What to share */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Share
          </p>
          <div className="flex gap-1">
            {(["conversation", "terminal"] as ShareTarget[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1 text-[10.5px] font-medium transition-colors",
                  target === t
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <HugeiconsIcon
                  icon={t === "conversation" ? AiChat02Icon : ComputerTerminal01Icon}
                  size={11}
                  strokeWidth={1.75}
                />
                {t === "conversation" ? "AI Conversation" : "Terminal"}
              </button>
            ))}
          </div>
        </div>

        {/* Live mode toggle (terminal only) */}
        {target === "terminal" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLiveMode((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-[10.5px] font-medium transition-colors",
                liveMode
                  ? "bg-green-500/15 text-green-500"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <HugeiconsIcon icon={Activity01Icon} size={11} strokeWidth={1.75} />
              Live streaming
            </button>
            <span className="text-[9.5px] text-muted-foreground/50">
              Instant updates over WebSocket
            </span>
          </div>
        )}

        {/* Server controls */}
        {!isRunning ? (
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={server.status === "starting"}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-md py-2 text-[11.5px] font-medium transition-colors",
              "bg-primary/90 text-primary-foreground hover:bg-primary",
              "disabled:cursor-wait disabled:opacity-60",
            )}
          >
            <HugeiconsIcon icon={Globe02Icon} size={13} strokeWidth={1.75} />
            {server.status === "starting" ? "Starting…" : "Start Sharing"}
          </button>
        ) : (
          <div className="space-y-2">
            {/* URL display */}
            <div className="rounded-md border border-border/50 bg-muted/20 p-2.5">
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">
                Open in browser on the same network:
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground">
                  http://<span className="text-primary">{getLocalIpHint()}</span>:{server.port}
                </code>
                <button
                  type="button"
                  title="Copy URL"
                  onClick={() => void handleCopy()}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <HugeiconsIcon
                    icon={copied ? Tick01Icon : Copy01Icon}
                    size={11}
                    strokeWidth={2}
                    className={copied ? "text-green-500" : ""}
                  />
                </button>
              </div>
              <p className="mt-1.5 text-[9.5px] text-muted-foreground/60">
                Replace <em>{getLocalIpHint()}</em> with this machine's LAN IP.
                {liveMode && target === "terminal" && (
                  <> Live feed: <strong>/ws</strong> (WebSocket) or <strong>/stream</strong> (SSE fallback).</>
                )}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-1.5">
              {target === "conversation" && (
                <button
                  type="button"
                  onClick={() => void handleUpdate()}
                  title="Push current content to the server"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border/50 py-1 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  <HugeiconsIcon icon={Refresh01Icon} size={10} strokeWidth={2} />
                  Refresh content
                </button>
              )}
              <button
                type="button"
                onClick={() => void server.stop()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-red-500/30 py-1 text-[10.5px] text-red-500/80 transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
                Stop sharing
              </button>
            </div>
          </div>
        )}

        {server.status === "error" && server.error && (
          <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-[10.5px] text-destructive">
            {server.error}
          </p>
        )}

        {/* Info */}
        {!isRunning && (
          <div className="rounded-md border border-border/30 bg-muted/10 p-2.5">
            <p className="text-[10px] leading-relaxed text-muted-foreground/70">
              Starts a local HTTP server. Anyone on the same Wi-Fi can open
              the URL to view your{" "}
              {target === "conversation" ? "AI conversation" : "terminal"}{" "}
              read-only.{" "}
              {target === "terminal" && (
                <>Enable <strong>Live streaming</strong> so the browser updates automatically.</>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
