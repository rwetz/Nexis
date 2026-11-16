// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useChatStore, type AgentMeta } from "../store/chatStore";

type Props = {
  onClick: () => void;
};

export function AgentStatusPill({ onClick }: Props) {
  const meta = useChatStore((s) => s.agentMeta);

  if (meta.status === "idle" && !meta.error) return null;

  const { tone, icon, label } = describe(meta);

  return (
    // Keyed remount fades each status change in via CSS.
    <button
      key={`${meta.status}:${label}`}
      type="button"
      onClick={onClick}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-0.5 duration-150 flex h-6 items-center gap-1.5 rounded-md border px-1.5 text-caption transition-colors",
        tone,
      )}
      title="Open AI log"
    >
      {icon}
      <span className="max-w-[180px] truncate">{label}</span>
    </button>
  );
}

function describe(meta: AgentMeta): {
  tone: string;
  icon: React.ReactNode;
  label: string;
} {
  if (meta.status === "awaiting-approval") {
    return {
      tone:
        "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15",
      icon: (
        <Icon name="security" />
      ),
      label:
        meta.approvalsPending > 1
          ? `${meta.approvalsPending} approvals needed`
          : "Approval needed",
    };
  }
  if (meta.status === "error") {
    return {
      tone:
        "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15",
      icon: (
        <Icon name="alert-circle" />
      ),
      label: meta.error ?? "Error",
    };
  }
  // thinking | streaming
  return {
    tone:
      "border-border/60 bg-card text-muted-foreground hover:text-foreground",
    icon: <Spinner className="size-3" />,
    label: meta.step ?? "Thinking…",
  };
}
