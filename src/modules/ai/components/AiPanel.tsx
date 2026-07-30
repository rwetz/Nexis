// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  ArrowDown01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  Delete02Icon,
  Add01Icon,
  EyeIcon,
  Search01Icon,
  MessageMultiple01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  memo,
} from "react";
import { createPortal } from "react-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { AiChatView } from "./AiChat";
import { AiInputBar } from "./AiInputBar";
import { AiContextInspector } from "./AiContextInspector";
import { AgentSwitcher } from "./AgentSwitcher";
import { PlanDiffReview } from "./PlanDiffReview";
import { TodoStrip } from "./TodoStrip";
import { estimateCost, getModel, getModelContextLimit } from "../config";
import type { SessionMeta } from "../lib/sessions";
import { getOrCreateChat, STREAM_THROTTLE_MS, useChatStore } from "../store/chatStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { usePlanStore } from "../store/planStore";


// ── Constants ─────────────────────────────────────────────────────────────────

const SNAP_ZONE_PX = 80;
const MIN_W = 320;
const MIN_H = 220;
const FLOAT_POS_KEY = "nexis.ai.floatPos";
const FLOAT_SIZE_KEY = "nexis.ai.floatSize";

// ── Helpers ───────────────────────────────────────────────────────────────────

function readFloatPos(fallback: { x: number; y: number }) {
  try {
    const raw = localStorage.getItem(FLOAT_POS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { x?: number; y?: number };
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // ignore
  }
  return fallback;
}

function readFloatSize(fallback: { w: number; h: number }) {
  try {
    const raw = localStorage.getItem(FLOAT_SIZE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { w?: number; h?: number };
    if (typeof parsed.w === "number" && typeof parsed.h === "number") {
      return { w: parsed.w, h: parsed.h };
    }
  } catch {
    // ignore
  }
  return fallback;
}

function saveFloatPos(pos: { x: number; y: number }) {
  try {
    localStorage.setItem(FLOAT_POS_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

function saveFloatSize(size: { w: number; h: number }) {
  try {
    localStorage.setItem(FLOAT_SIZE_KEY, JSON.stringify(size));
  } catch {
    // ignore
  }
}

// ── Token / cost helpers (mirrors AiMiniWindow) ───────────────────────────────

function estimateTokens(messages: UIMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "text") chars += (p as { text?: string }).text?.length ?? 0;
      else if (p.type === "reasoning")
        chars += (p as { text?: string }).text?.length ?? 0;
      else if (typeof p.type === "string" && p.type.startsWith("tool-")) {
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

// ── ContextIndicator ──────────────────────────────────────────────────────────

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
                  <span className="font-mono text-foreground">
                    {cacheRate}%
                  </span>
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

// ── SessionPicker ─────────────────────────────────────────────────────────────

function compactSessionDate(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function SessionPicker() {
  const sessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeSessionId);
  const switchSession = useChatStore((s) => s.switchSession);
  const newSession = useChatStore((s) => s.newSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((s) =>
      (s.title || "New chat").toLowerCase().includes(q),
    );
  }, [sorted, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  if (!active) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-w-0 max-w-48 items-center gap-1 rounded-md px-1.5 py-1",
            "text-[11px] text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground",
          )}
          title="Chat history"
        >
          <HugeiconsIcon
            icon={MessageMultiple01Icon}
            size={11}
            strokeWidth={1.75}
            className="shrink-0 opacity-70"
          />
          <span className="truncate">{active.title || "New chat"}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={10}
            strokeWidth={2}
            className="shrink-0 opacity-70"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-72 p-0 shadow-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-1.5 border-b border-border/40 px-2 py-1.5">
          <HugeiconsIcon
            icon={Search01Icon}
            size={11}
            strokeWidth={1.75}
            className="shrink-0 text-muted-foreground/60"
          />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (query) {
                  setQuery("");
                } else {
                  setOpen(false);
                }
                e.stopPropagation();
              }
            }}
            placeholder="Search history…"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground/55"
          />
        </div>

        <div className="border-b border-border/40 px-1.5 py-1">
          <button
            type="button"
            onClick={() => {
              newSession();
              setOpen(false);
            }}
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={Add01Icon} size={11} strokeWidth={1.75} />
            New session
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">
              No sessions found
            </div>
          ) : (
            filtered.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                active={s.id === activeId}
                onSelect={() => {
                  switchSession(s.id);
                  setOpen(false);
                }}
                onDelete={() => deleteSession(s.id)}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
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
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors",
        active ? "bg-accent/50" : "hover:bg-accent/35",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-medium leading-snug text-foreground/90">
          {session.title || "New chat"}
        </div>
        <div className="text-[10px] tabular-nums text-muted-foreground/60">
          {compactSessionDate(session.updatedAt)}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete session"
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <HugeiconsIcon icon={Delete02Icon} size={11} strokeWidth={1.75} />
      </button>
    </button>
  );
}

// ── PlanModeStrip ─────────────────────────────────────────────────────────────

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

// ── ChatArea (inner — session guaranteed) ─────────────────────────────────────

function ChatAreaInner({ sessionId }: { sessionId: string }) {
  const chat = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const helpers = useChat<UIMessage>({
    chat,
    experimental_throttle: STREAM_THROTTLE_MS,
  });

  return (
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
  );
}

function ChatArea({ sessionId }: { sessionId: string | null }) {
  if (!sessionId) {
    return (
      <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
        Loading…
      </div>
    );
  }
  return <ChatAreaInner sessionId={sessionId} />;
}

// ── PanelHeader ───────────────────────────────────────────────────────────────

type PanelHeaderProps = {
  messages: UIMessage[];
  isBusy: boolean;
  step: string | null;
  onClose: () => void;
  /** undefined → no float button (already floating) */
  onFloat?: () => void;
  /** undefined → no dock button (already docked) */
  onDock?: () => void;
  inspectorOpen?: boolean;
  onToggleInspector?: () => void;
  /** drag handle props for floating mode */
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  className?: string;
};

const PanelHeader = memo(function PanelHeader({
  messages,
  isBusy,
  step,
  onClose,
  onFloat,
  onDock,
  inspectorOpen,
  onToggleInspector,
  dragHandleProps,
  className,
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        "relative flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3",
        dragHandleProps && "cursor-grab active:cursor-grabbing",
        className,
      )}
      {...dragHandleProps}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <AgentSwitcher isMiniWindow />
        <ContextIndicator messages={messages} />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isBusy && (
          <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            <Spinner className="size-2.5" />
            <span className="max-w-32 truncate">{step ?? "Thinking…"}</span>
          </span>
        )}
        {onToggleInspector && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onToggleInspector();
            }}
            className={cn("size-5", inspectorOpen && "bg-accent text-foreground")}
            aria-label="Toggle context inspector"
            title="Context inspector"
          >
            <HugeiconsIcon icon={EyeIcon} size={11} strokeWidth={1.75} />
          </Button>
        )}
        <SessionPicker />

        {onFloat && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onFloat();
            }}
            className="size-5"
            aria-label="Float panel"
            title="Float panel"
          >
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              size={11}
              strokeWidth={1.75}
            />
          </Button>
        )}

        {onDock && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDock();
            }}
            className="size-5"
            aria-label="Dock panel"
            title="Dock to bottom"
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={11}
              strokeWidth={1.75}
            />
          </Button>
        )}

        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="size-5"
          aria-label="Close"
          title="Close (Esc)"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
});

// ── DockedAiPanel ─────────────────────────────────────────────────────────────

export function DockedAiPanel() {
  return (
    <div className="flex flex-col bg-card">
      <PlanModeStrip />
      <AiInputBar compact />
      <PlanDiffReview />
    </div>
  );
}

// ── FloatingAiPanel ───────────────────────────────────────────────────────────

const DEFAULT_W = 480;
const DEFAULT_H = 560;

function computeDefaultPos(w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(8, vw - w - 16),
    y: Math.max(8, vh - h - 80),
  };
}

export function FloatingAiPanel() {
  const sessionId = useChatStore((s) => s.activeSessionId);
  const closePanel = useChatStore((s) => s.closePanel);
  const dockPanel = useChatStore((s) => s.dockPanel);
  const isBusy = useChatStore(
    (s) =>
      s.agentMeta.status === "thinking" || s.agentMeta.status === "streaming",
  );
  const step = useChatStore((s) => s.agentMeta.step);

  const [size, setSize] = useState(() =>
    readFloatSize({ w: DEFAULT_W, h: DEFAULT_H }),
  );
  const [pos, setPos] = useState(() => {
    const saved = readFloatPos({ x: -1, y: -1 });
    if (saved.x < 0 || saved.y < 0) return computeDefaultPos(size.w, size.h);
    return saved;
  });
  const [inSnapZone, setInSnapZone] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const chat = useMemo(
    () => (sessionId ? getOrCreateChat(sessionId) : null),
    [sessionId],
  );
  const helpers = useChat<UIMessage>({
    chat: chat!,
    experimental_throttle: STREAM_THROTTLE_MS,
  });
  const messages = chat ? helpers.messages : [];

  // ── Drag ──────────────────────────────────────────────────────────────────
  const dragRef = useRef<{
    mx: number;
    my: number;
    px: number;
    py: number;
  } | null>(null);

  // Refs that always hold the latest pos/size so that mouseup handlers can
  // read the final values without being listed as effect dependencies (which
  // would tear down and re-add the mousemove/mouseup listeners on every move).
  // Mirrored after commit rather than during render — the readers are DOM
  // mousemove/mouseup handlers, which only run between commits, so they always
  // see the last painted value.
  const posRef = useRef(pos);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      mx: e.clientX,
      my: e.clientY,
      px: posRef.current.x,
      py: posRef.current.y,
    };
  }, []); // posRef is a stable ref — no deps needed

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.mx;
      const dy = e.clientY - dragRef.current.my;
      const nx = dragRef.current.px + dx;
      const ny = dragRef.current.py + dy;
      setPos({ x: nx, y: ny });
      setInSnapZone(ny + sizeRef.current.h > window.innerHeight - SNAP_ZONE_PX);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      const currentPos = posRef.current;
      const wasSnapping = currentPos.y + sizeRef.current.h > window.innerHeight - SNAP_ZONE_PX;
      dragRef.current = null;
      if (wasSnapping) {
        dockPanel();
      } else {
        saveFloatPos(currentPos);
      }
      setInSnapZone(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dockPanel]); // stable: dockPanel is a store method; pos/size read via refs

  // ── Resize ────────────────────────────────────────────────────────────────
  const resizeRef = useRef<{
    mx: number;
    my: number;
    w: number;
    h: number;
  } | null>(null);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { mx: e.clientX, my: e.clientY, w: sizeRef.current.w, h: sizeRef.current.h };
  }, []); // sizeRef is a stable ref — no deps needed

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = e.clientX - resizeRef.current.mx;
      const dh = e.clientY - resizeRef.current.my;
      setSize({
        w: Math.max(MIN_W, resizeRef.current.w + dw),
        h: Math.max(MIN_H, resizeRef.current.h + dh),
      });
    };
    const onUp = () => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      saveFloatSize(sizeRef.current); // read latest size via ref, not stale closure
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []); // stable: all dynamic values read through sizeRef

  const el = (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        zIndex: 40,
      }}
      className={cn(
        "no-scrollbar-deep flex flex-col overflow-hidden",
        "rounded-2xl border border-border/60 bg-card text-[12px]",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_24px_48px_-12px_rgba(0,0,0,0.45),0_8px_16px_-8px_rgba(0,0,0,0.3)]",
        "ring-1 ring-black/5 dark:ring-white/5",
        "transition-shadow",
        inSnapZone &&
          "ring-2 ring-primary/40 shadow-[0_0_0_2px_hsl(var(--primary)/0.2)]",
      )}
    >
      {/* snap-to-dock indicator */}
      {inSnapZone && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-8 items-center justify-center bg-primary/10 text-[10px] font-medium text-primary">
          Release to dock
        </div>
      )}

      <PlanModeStrip />
      <PanelHeader
        messages={messages}
        isBusy={isBusy}
        step={step}
        onClose={closePanel}
        onDock={dockPanel}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((o) => !o)}
        dragHandleProps={{
          onMouseDown: onDragStart,
        }}
      />
      {inspectorOpen && <AiContextInspector messages={messages} />}
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatArea sessionId={sessionId} />
        {sessionId && <TodoStrip sessionId={sessionId} />}
      </div>
      <AiInputBar />
      <PlanDiffReview />

      {/* corner resize handle */}
      <div
        onMouseDown={onResizeStart}
        className={cn(
          "absolute right-0 bottom-0 z-10 size-4 cursor-se-resize",
          "after:absolute after:right-1 after:bottom-1 after:block after:size-2",
          "after:rounded-[1px] after:border-r-2 after:border-b-2 after:border-border/60",
        )}
        aria-hidden
      />
    </div>
  );

  return createPortal(el, document.body);
}

