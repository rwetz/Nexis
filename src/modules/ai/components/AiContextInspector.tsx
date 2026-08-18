// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getModel, getModelContextLimit } from "../config";
import { useChatStore } from "../store/chatStore";
import type { UIMessage } from "@ai-sdk/react";
import { useMemo, useState } from "react";

const APPROVAL_TOOLS = [
  "bash_run",
  "bash_background",
  "write_file",
  "edit",
  "multi_edit",
  "create_directory",
];

const READ_TOOLS = [
  "read_file",
  "list_directory",
  "grep",
  "glob",
  "get_terminal_output",
  "web_search",
  "open_preview",
  "suggest_command",
  "plan",
];

function countMessages(messages: UIMessage[]) {
  let user = 0, assistant = 0, toolCalls = 0;
  for (const m of messages) {
    if (m.role === "user") user++;
    else if (m.role === "assistant") {
      assistant++;
      for (const p of m.parts) {
        if (typeof p.type === "string" && p.type.startsWith("tool-")) toolCalls++;
      }
    }
  }
  return { user, assistant, toolCalls };
}

function formatK(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color =
    pct > 85 ? "bg-rose-500" : pct > 65 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Icon
          name={open ? "chevron-down" : "chevron-right"}
          size="xs"
          className="shrink-0"
        />
        {title}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

type Props = {
  messages: UIMessage[];
};

export function AiContextInspector({ messages }: Props) {
  const modelId = useChatStore((s) => s.selectedModelId);
  const tokens = useChatStore((s) => s.agentMeta.tokens);
  const lastInput = useChatStore((s) => s.agentMeta.lastInputTokens);
  const customInstructions = usePreferencesStore((s) => s.customInstructions);
  const contextLimit = usePreferencesStore((s) => s.openaiCompatibleContextLimit);

  const model = useMemo(() => {
    try { return getModel(modelId); } catch { return null; }
  }, [modelId]);

  const max = getModelContextLimit(modelId, contextLimit);
  const usedTokens = lastInput > 0 ? lastInput : Math.ceil(
    messages.reduce((acc, m) => {
      for (const p of m.parts) {
        if (p.type === "text") acc += (p as { text?: string }).text?.length ?? 0;
        else if (typeof p.type === "string" && p.type.startsWith("tool-")) {
          const tp = p as unknown as { input?: unknown; output?: unknown };
          if (tp.input) acc += JSON.stringify(tp.input).length;
          if (tp.output) acc += JSON.stringify(tp.output).length;
        }
      }
      return acc;
    }, 0) / 4,
  );

  const { user, assistant, toolCalls } = useMemo(
    () => countMessages(messages),
    [messages],
  );

  const systemSections: string[] = [];
  systemSections.push("Base system prompt");
  if (customInstructions?.trim()) systemSections.push("Custom instructions");
  systemSections.push("NEXIS.md (if present)");

  return (
    <div className="flex max-h-72 flex-col overflow-y-auto border-b border-border/50 bg-muted/20 text-[11px]">
      <Section title={`Model — ${model?.label ?? modelId}`}>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Provider</span>
            <span className="font-mono text-foreground capitalize">
              {model?.provider ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Context window</span>
            <span className="font-mono text-foreground">{formatK(max)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>In use (est.)</span>
            <span className="font-mono text-foreground">{formatK(usedTokens)}</span>
          </div>
          <ProgressBar value={usedTokens} max={max} />
          {tokens.outputTokens > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Session output</span>
              <span className="font-mono text-foreground">
                {formatK(tokens.outputTokens)}
              </span>
            </div>
          )}
          {tokens.cachedInputTokens > 0 && tokens.inputTokens > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Cached</span>
              <span className="font-mono text-foreground">
                {formatK(tokens.cachedInputTokens)} (
                {Math.round(
                  (tokens.cachedInputTokens / tokens.inputTokens) * 100,
                )}
                %)
              </span>
            </div>
          )}
        </div>
      </Section>

      <Section title={`Conversation — ${messages.length} messages`}>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
          <span>
            <span className="font-mono text-foreground">{user}</span> user
          </span>
          <span>
            <span className="font-mono text-foreground">{assistant}</span>{" "}
            assistant
          </span>
          <span>
            <span className="font-mono text-foreground">{toolCalls}</span> tool
            calls
          </span>
        </div>
      </Section>

      <Section title={`System prompt — ${systemSections.length} sections`}>
        <div className="space-y-0.5">
          {systemSections.map((s) => (
            <div key={s} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1 shrink-0 rounded-full bg-primary/60" />
              {s}
            </div>
          ))}
        </div>
        {customInstructions?.trim() && (
          <div className="mt-2 max-h-20 overflow-y-auto rounded border border-border/40 bg-background/60 p-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {customInstructions.trim().slice(0, 400)}
            {customInstructions.trim().length > 400 && "…"}
          </div>
        )}
      </Section>

      <Section title={`Tools — ${APPROVAL_TOOLS.length + READ_TOOLS.length} available`}>
        <div className="space-y-1">
          <div>
            <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground/60">
              Require approval
            </span>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {APPROVAL_TOOLS.map((t) => (
                <span
                  key={t}
                  className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-[9.5px] text-amber-600 dark:text-amber-400"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground/60">
              Auto-execute
            </span>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {READ_TOOLS.map((t) => (
                <span
                  key={t}
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
