// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { Icon, type IconName } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { useEffect, useMemo } from "react";
import { estimateCost, getModel, getModelContextLimit } from "../config";
import type { SessionMeta } from "../lib/sessions";
import { useAgentsStore } from "../store/agentsStore";
import { getOrCreateChat, STREAM_THROTTLE_MS, useChatStore } from "../store/chatStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { usePlanStore } from "../store/planStore";
import { AgentSwitcher } from "./AgentSwitcher";
import { AiChatView } from "./AiChat";
import { AiInputBar } from "./AiInputBar";
import { PlanDiffReview } from "./PlanDiffReview";
import { TodoStrip } from "./TodoStrip";
import { useComposer } from "../lib/composer";

const SUGGESTIONS: {
  label: string;
  hint: string;
  icon: IconName;
  text: string;
}[] = [
  {
    label: "Understand the failure",
    hint: "Explain the latest terminal error",
    icon: "alert-circle",
    text: "Explain the last error in the terminal.",
  },
  {
    label: "Plan the next command",
    hint: "Describe the outcome you want",
    icon: "terminal",
    text: "Give me a command to ",
  },
  {
    label: "Catch me up",
    hint: "Summarize recent terminal activity",
    icon: "filter",
    text: "Summarize what just happened in the terminal.",
  },
  {
    label: "Inspect this workspace",
    hint: "Find the right files and next steps",
    icon: "search",
    text: "Help me understand this workspace and where I should start.",
  },
];

export function AiMiniWindow() {
  const closeMini = useChatStore((s) => s.closeMini);
  const sessionId = useChatStore((s) => s.activeSessionId);
  const openPanel = useChatStore((s) => s.openPanel);
  const expandToPanel = () => {
    closeMini();
    openPanel();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        closeMini();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMini]);

  return (
    <div
      data-ai-mini-window
      className={cn(
        "animate-in fade-in slide-in-from-bottom-3 zoom-in-[0.98] duration-200 ease-out",
        "no-scrollbar-deep fixed right-4 bottom-24 z-40 flex flex-col overflow-hidden",
        "h-[min(42rem,calc(100vh-7rem))] w-[min(34rem,calc(100vw-2rem))]",
        "rounded-2xl border border-border/60 bg-card text-[12px]",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_24px_48px_-12px_rgba(0,0,0,0.45),0_8px_16px_-8px_rgba(0,0,0,0.3)]",
        "ring-1 ring-black/5 dark:ring-white/5",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-foreground/[0.03] to-transparent"
      />
      {sessionId ? (
        <Body
          sessionId={sessionId}
          onClose={closeMini}
          onExpand={expandToPanel}
        />
      ) : (
        <EmptyShell onClose={closeMini} onExpand={expandToPanel} />
      )}
      <PlanDiffReview />
    </div>
  );
}

function Body({
  sessionId,
  onClose,
  onExpand,
}: {
  sessionId: string;
  onClose: () => void;
  onExpand: () => void;
}) {
  const step = useChatStore((s) => s.agentMeta.step);
  const composer = useComposer();

  const chat = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const helpers = useChat<UIMessage>({
    chat,
    experimental_throttle: STREAM_THROTTLE_MS,
  });
  const isBusy =
    helpers.status === "submitted" || helpers.status === "streaming";

  const onPick = (text: string) => {
    composer.setValue(text);
    requestAnimationFrame(() => {
      const el = composer.textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  return (
    <>
      <Header
        step={step}
        isBusy={isBusy}
        onClose={onClose}
        onExpand={onExpand}
        messages={helpers.messages}
      />

      <PlanModeStrip />

      <div className="flex min-h-0 flex-1 flex-col">
        {helpers.messages.length === 0 ? (
          <EmptyState onPick={onPick} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col [&_.text-sm]:text-[12px] [&_p]:leading-relaxed">
            <AiChatView
              messages={helpers.messages}
              status={helpers.status}
              error={helpers.error}
              clearError={helpers.clearError}
              addToolApprovalResponse={helpers.addToolApprovalResponse}
              stop={helpers.stop}
            />
          </div>
        )}
      </div>

      <TodoStrip sessionId={sessionId} />
      <AiInputBar />
    </>
  );
}

function PlanModeStrip() {
  const active = usePlanStore((s) => s.active);
  const queueLen = usePlanStore((s) => s.queue.length);
  const disable = usePlanStore((s) => s.disable);
  if (!active) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/40 px-3 py-1.5">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
      <span className="text-[11px] font-medium text-foreground">Plan mode</span>
      <span className="text-[11px] text-muted-foreground">
        {queueLen > 0 ? `· ${queueLen} queued` : "· no edits queued"}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => disable()}
        className="rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Exit
      </button>
    </div>
  );
}

function EmptyShell({
  onClose,
  onExpand,
}: {
  onClose: () => void;
  onExpand: () => void;
}) {
  return (
    <>
      <Header
        step={null}
        isBusy={false}
        onClose={onClose}
        onExpand={onExpand}
      />
      <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
        Loading sessions…
      </div>
    </>
  );
}

function Header({
  step,
  isBusy,
  onClose,
  messages,
}: {
  step: string | null;
  isBusy: boolean;
  onClose: () => void;
  onExpand: () => void;
  messages?: UIMessage[];
}) {
  const customAgents = useAgentsStore((s) => s.customAgents);
  void customAgents;

  return (
    <div className="relative flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <AgentSwitcher isMiniWindow />
        {messages !== undefined ? (
          <ContextIndicator messages={messages} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isBusy ? (
          <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            <Spinner className="size-2.5" />
            <span className="max-w-32 truncate">{step ?? "Thinking…"}</span>
          </span>
        ) : null}
        <SessionPicker />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="size-5"
          aria-label="Close"
          title="Close (Esc)"
        >
          <Icon name="close" size="xs" />
        </Button>
      </div>
    </div>
  );
}

function estimateTokens(messages: UIMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "text") {
        chars += (p as { text?: string }).text?.length ?? 0;
      } else if (p.type === "reasoning") {
        chars += (p as { text?: string }).text?.length ?? 0;
      } else if (typeof p.type === "string" && p.type.startsWith("tool-")) {
        const tp = p as unknown as { input?: unknown; output?: unknown };
        if (tp.input) chars += JSON.stringify(tp.input).length;
        if (tp.output) chars += JSON.stringify(tp.output).length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function ContextIndicator({ messages }: { messages: UIMessage[] }) {
  const modelId = useChatStore((s) => s.selectedModelId);
  const tokens = useChatStore((s) => s.agentMeta.tokens);
  const lastInput = useChatStore((s) => s.agentMeta.lastInputTokens);
  const lastCached = useChatStore((s) => s.agentMeta.lastCachedTokens);
  const estimated = useMemo(() => estimateTokens(messages), [messages]);
  const used = lastInput > 0 ? lastInput : estimated;
  const reported = tokens.inputTokens + tokens.outputTokens;
  const openaiCompatibleContextLimit = usePreferencesStore(
    (s) => s.openaiCompatibleContextLimit,
  );
  const max = getModelContextLimit(modelId, openaiCompatibleContextLimit);
  const modelLabel = useMemo(() => {
    try {
      return getModel(modelId).label;
    } catch {
      return modelId;
    }
  }, [modelId]);
  const cost = estimateCost(modelId, tokens);
  const cacheRate =
    tokens.inputTokens > 0
      ? Math.round((tokens.cachedInputTokens / tokens.inputTokens) * 100)
      : 0;

  return (
    <Context usedTokens={used} maxTokens={max} modelId={modelId}>
      <ContextTrigger className="h-6 gap-1 px-0 text-[10.5px]" />
      <ContextContent className="w-64 text-[11px]">
        <ContextContentHeader />
        <ContextContentBody>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Model</span>
            <span className="font-mono text-foreground">{modelLabel}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-muted-foreground">
            <span>{lastInput > 0 ? "Last request" : "Estimated context"}</span>
            <span className="font-mono text-foreground">
              {formatTokens(used)}
            </span>
          </div>
          {lastCached > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Of which cached</span>
              <span className="font-mono text-foreground">
                {formatTokens(lastCached)}
              </span>
            </div>
          )}
          {reported > 0 && (
            <>
              <div className="mt-1.5 flex items-center justify-between text-muted-foreground">
                <span>Session input</span>
                <span className="font-mono text-foreground">
                  {formatTokens(tokens.inputTokens)}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Session output</span>
                <span className="font-mono text-foreground">
                  {formatTokens(tokens.outputTokens)}
                </span>
              </div>
              {tokens.cachedInputTokens > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Cache hit</span>
                  <span className="font-mono text-foreground">{cacheRate}%</span>
                </div>
              )}
              {cost != null && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Session cost</span>
                  <span className="font-mono text-foreground">
                    ${cost.toFixed(cost < 0.01 ? 4 : cost < 1 ? 3 : 2)}
                  </span>
                </div>
              )}
            </>
          )}
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Window</span>
            <span className="font-mono text-foreground">
              {formatTokens(max)}
            </span>
          </div>
        </ContextContentBody>
        <ContextContentFooter>
          <span className="text-[10px] italic text-muted-foreground">
            {lastInput > 0
              ? "Last request reflects current context size; session totals are cumulative."
              : "Token count is approximate (chars / 4)."}
          </span>
        </ContextContentFooter>
      </ContextContent>
    </Context>
  );
}

function SessionPicker() {
  const sessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeSessionId);
  const switchSession = useChatStore((s) => s.switchSession);
  const newSession = useChatStore((s) => s.newSession);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  if (!active) return null;

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-w-0 max-w-48 items-center gap-1 rounded-md px-1.5 py-1",
            "text-[11px] text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground",
          )}
          title="Switch session"
        >
          <span className="truncate">{active.title || "New chat"}</span>
          <Icon name="chevron-down" size="xs" className="opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem
          onSelect={() => newSession()}
          className="gap-2 text-xs"
        >
          <Icon name="add" />
          New session
        </DropdownMenuItem>
        {sorted.length > 0 ? <DropdownMenuSeparator /> : null}
        {sorted.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            active={s.id === activeId}
            onSelect={() => switchSession(s.id)}
            onDelete={() => deleteSession(s.id)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: SessionMeta;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        // Don't dismiss if user clicked the trash icon — handle below.
        const target = e.target as HTMLElement | null;
        if (target?.closest("[data-session-delete]")) {
          e.preventDefault();
          return;
        }
        onSelect();
      }}
      className={cn(
        "group flex items-center justify-between gap-2 text-xs",
        active && "bg-accent/40",
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        {session.title || "New chat"}
      </span>
      <button
        type="button"
        data-session-delete
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete session"
        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <Icon name="delete" size="xs" />
      </button>
    </DropdownMenuItem>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
      <div className="relative overflow-hidden rounded-xl border border-border/70 bg-muted/30 px-4 py-3.5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-12 size-32 rounded-full bg-primary/[0.09] blur-2xl"
        />
        <div className="relative flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card shadow-sm">
            <img src="/nexis-logo.png" alt="" className="size-6 opacity-90" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold tracking-tight">
              Start with the work in front of you
            </p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
              Nexis can use the active terminal, workspace, and files as context.
            </p>
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/70 px-1.5 py-1 text-[10px] text-muted-foreground">
            <Icon name="terminal" size="xs" /> Active terminal
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/70 px-1.5 py-1 text-[10px] text-muted-foreground">
            <Icon name="folder" size="xs" /> Workspace aware
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/70 px-1.5 py-1 text-[10px] text-muted-foreground">
            <Icon name="file" size="xs" /> Attach files with @
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between px-0.5">
        <div>
          <p className="text-[11px] font-semibold text-foreground">Jump in</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Or write your own prompt below
          </p>
        </div>
        <Icon name="sparkle" size="sm" className="text-primary/75" />
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.text)}
            className={cn(
              "group flex min-h-24 flex-col items-start rounded-lg border border-border/70 bg-card/50 p-3 text-left",
              "transition-[background-color,border-color,transform] duration-150 hover:-translate-y-px hover:border-primary/35 hover:bg-primary/[0.045]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
            )}
          >
            <div className="flex size-7 items-center justify-center rounded-md border border-border/50 bg-muted/65 text-muted-foreground transition-colors group-hover:border-primary/20 group-hover:bg-primary/10 group-hover:text-primary">
              <Icon name={s.icon} size="sm" />
            </div>
            <div className="mt-2 text-[11px] font-medium leading-tight text-foreground">
              {s.label}
            </div>
            <div className="mt-1 text-[10px] leading-snug text-muted-foreground">
              {s.hint}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
