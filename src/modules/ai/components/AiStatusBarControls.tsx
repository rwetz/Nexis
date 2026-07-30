// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Kbd } from "@/components/ui/kbd";
import { fmtShortcut, MOD_KEY } from "@/lib/platform";
import { cn } from "@/lib/utils";

export function AiOpenButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "animate-in slide-in-from-top-[15px] duration-200",
        "flex h-6 items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 text-xs",
        "text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground",
      )}
      title="Open AI agent"
    >
      <span>Open AI agent</span>
      <Kbd className="h-4 min-w-4 px-1">{fmtShortcut(MOD_KEY, "I")}</Kbd>
    </button>
  );
}
