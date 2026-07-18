// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * SharePanel — LAN sharing of the AI conversation or terminal snapshot.
 *
 * Starts a local HTTP server (Rust) and shows the URL for opening on other
 * devices (phone, tablet, second monitor) on the same network. The URL
 * carries a per-session access token — the link is the credential.
 *
 * Server state lives in the global share store, so sharing keeps running
 * when this panel closes; the status bar shows a persistent "Sharing on"
 * pill until it's stopped here (or the app exits).
 */
import { cn } from "@/lib/utils";
import { useChatStore, getChat } from "@/modules/ai/store/chatStore";
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
import { useCallback, useEffect, useState } from "react";
import {
  useShareStore,
  startShare,
  stopShare,
  updateShare,
  refreshShareLanIp,
  shareUrl,
  shareTerminalBuffer,
  conversationToHtml,
  terminalToHtml,
  type ShareBindChoice,
  type ShareTarget,
} from "./useShareServer";

const BIND_LABELS: Array<{ value: ShareBindChoice; label: string; hint: string }> = [
  {
    value: "all",
    label: "All networks",
    hint: "Reachable on every network this machine is on (Wi-Fi, VPN, Docker …)",
  },
  {
    value: "lan",
    label: "LAN only",
    hint: "Bind just the primary LAN interface — not exposed on VPN or other networks",
  },
  {
    value: "localhost",
    label: "This device only",
    hint: "Bind 127.0.0.1 — for browsers on this machine (e.g. OBS, a second monitor)",
  },
];

export function SharePanel() {
  const status = useShareStore((s) => s.status);
  const port = useShareStore((s) => s.port);
  const token = useShareStore((s) => s.token);
  const error = useShareStore((s) => s.error);
  const bindChoice = useShareStore((s) => s.bindChoice);
  const setBindChoice = useShareStore((s) => s.setBindChoice);
  const lanIp = useShareStore((s) => s.lanIp);
  const runningTarget = useShareStore((s) => s.target);
  const runningLive = useShareStore((s) => s.live);

  // Pre-start selections (the running server's mode lives in the store).
  const [target, setTarget] = useState<ShareTarget>(
    () => useShareStore.getState().target ?? "conversation",
  );
  const [liveMode, setLiveMode] = useState<boolean>(
    () => useShareStore.getState().live,
  );
  const [copied, setCopied] = useState(false);
  const sessionId = useChatStore((s) => s.activeSessionId);

  // Resolve the real LAN IP for the URL display and the "LAN only" bind.
  useEffect(() => {
    void refreshShareLanIp();
  }, []);

  const buildConversationHtml = useCallback((): string => {
    const chat = getChat(sessionId ?? undefined);
    if (!chat) return conversationToHtml([], "Nexis AI Conversation");
    const rawMessages = (chat.messages as unknown) as Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
    }>;
    const messages = rawMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
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

  const handleStart = useCallback(async () => {
    await startShare({
      target,
      live: liveMode && target === "terminal",
      buildHtml: (tok) =>
        target === "conversation"
          ? buildConversationHtml()
          : terminalToHtml(
              shareTerminalBuffer() ?? "(no terminal buffer available)",
              "Nexis Terminal",
              liveMode,
              tok,
            ),
    });
  }, [target, liveMode, buildConversationHtml]);

  const handleUpdate = useCallback(async () => {
    await updateShare(buildConversationHtml());
  }, [buildConversationHtml]);

  const url = shareUrl({ status, port, token, bindChoice, lanIp });

  const handleCopy = useCallback(async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [url]);

  // Disable live mode when switching away from terminal target
  useEffect(() => {
    if (target !== "terminal") setLiveMode(false);
  }, [target]);

  const isRunning = status === "running";
  const bindMeta =
    BIND_LABELS.find((b) => b.value === bindChoice) ?? BIND_LABELS[0];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <HugeiconsIcon icon={Globe02Icon} size={13} strokeWidth={1.75} className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Share
        </span>
        {isRunning && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-bold text-red-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            {runningLive && runningTarget === "terminal" ? "Live" : "Sharing"}
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
                disabled={isRunning}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1 text-[10.5px] font-medium transition-colors",
                  (isRunning ? runningTarget === t : target === t)
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  isRunning && "cursor-default opacity-70",
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
        {!isRunning && target === "terminal" && (
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

        {/* Bind-interface picker (pre-start) */}
        {!isRunning && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Visible on
            </p>
            <div className="flex gap-1">
              {BIND_LABELS.map((b) => {
                const unavailable = b.value === "lan" && !lanIp;
                return (
                  <button
                    key={b.value}
                    type="button"
                    title={unavailable ? "No LAN interface detected" : b.hint}
                    disabled={unavailable}
                    onClick={() => setBindChoice(b.value)}
                    className={cn(
                      "rounded px-2 py-1 text-[10.5px] font-medium transition-colors",
                      bindChoice === b.value
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                      unavailable && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[9.5px] text-muted-foreground/50">{bindMeta.hint}</p>
          </div>
        )}

        {/* Server controls */}
        {!isRunning ? (
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={status === "starting"}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-md py-2 text-[11.5px] font-medium transition-colors",
              "bg-primary/90 text-primary-foreground hover:bg-primary",
              "disabled:cursor-wait disabled:opacity-60",
            )}
          >
            <HugeiconsIcon icon={Globe02Icon} size={13} strokeWidth={1.75} />
            {status === "starting" ? "Starting…" : "Start Sharing"}
          </button>
        ) : (
          <div className="space-y-2">
            {/* URL display */}
            <div className="rounded-md border border-border/50 bg-muted/20 p-2.5">
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">
                {bindChoice === "localhost"
                  ? "Open in a browser on this machine:"
                  : "Open in a browser on the same network:"}
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground">
                  {url}
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
                Only people with this exact link can view — the{" "}
                <code className="text-[9px]">?k=</code> token is the key.
                Sharing continues while this panel is closed; stop it here or
                from the status-bar pill.
                {bindChoice !== "localhost" && !lanIp && (
                  <> Replace <em>192.168.x.x</em> with this machine's LAN IP.</>
                )}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-1.5">
              {runningTarget === "conversation" && (
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
                onClick={() => void stopShare()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-red-500/30 py-1 text-[10.5px] text-red-500/80 transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
                Stop sharing
              </button>
            </div>
          </div>
        )}

        {status === "error" && error && (
          <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-[10.5px] text-destructive">
            {error}
          </p>
        )}

        {/* Info */}
        {!isRunning && (
          <div className="rounded-md border border-border/30 bg-muted/10 p-2.5">
            <p className="text-[10px] leading-relaxed text-muted-foreground/70">
              Starts a local HTTP server and generates a tokenized link — only
              people you give the link to can view your{" "}
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
