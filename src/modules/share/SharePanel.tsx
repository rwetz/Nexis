/**
 * SharePanel — LAN sharing of the AI conversation or terminal snapshot.
 *
 * Starts a local HTTP server (Rust) and shows the URL for opening on other
 * devices (phone, tablet, second monitor) on the same network.
 */
import { cn } from "@/lib/utils";
import { useChatStore, getChat } from "@/modules/ai/store/chatStore";
import {
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
  // We can't directly get the LAN IP in Tauri without native code.
  // Show a helpful hint instead.
  return "192.168.x.x";
}

export function SharePanel({ getTerminalBuffer }: Props) {
  const [target, setTarget] = useState<ShareTarget>("conversation");
  const [copied, setCopied] = useState(false);
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

  const buildTerminalHtml = useCallback((): string => {
    const buf = getTerminalBuffer?.() ?? "(no terminal buffer available)";
    return terminalToHtml(buf, "Nexis Terminal Snapshot");
  }, [getTerminalBuffer]);

  const buildHtml = useCallback((): string => {
    return target === "conversation" ? buildConversationHtml() : buildTerminalHtml();
  }, [target, buildConversationHtml, buildTerminalHtml]);

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

  // Auto-stop when unmounted
  const stopRef = useRef(server.stop);
  useEffect(() => {
    stopRef.current = server.stop;
  }, [server.stop]);
  useEffect(() => {
    return () => { void stopRef.current(); };
  }, []);

  const isRunning = server.status === "running";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <HugeiconsIcon
          icon={Globe02Icon}
          size={13}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Share
        </span>
        {isRunning && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[9px] font-bold text-green-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            Live
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
                {t === "conversation" ? "AI Conversation" : "Terminal Snapshot"}
              </button>
            ))}
          </div>
        </div>

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
                Port <strong>{server.port}</strong> is automatically chosen.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => void handleUpdate()}
                title="Push current content to the server"
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border/50 py-1 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <HugeiconsIcon icon={Refresh01Icon} size={10} strokeWidth={2} />
                Refresh content
              </button>
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
              Starts a local HTTP server on your machine. Anyone on the same
              Wi-Fi network can open the URL in a browser to view a read-only
              snapshot of your {target === "conversation" ? "AI conversation" : "terminal"}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
