// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { fmtShortcut, MOD_KEY } from "@/lib/platform";
import { useEffect } from "react";

export type SelectionAskAiProps = {
  x: number;
  y: number;
  onAsk: () => void;
  onExplain: () => void;
  onDismiss: () => void;
};

const OFFSET = 32;

export function SelectionAskAi({ x, y, onAsk, onExplain, onDismiss }: SelectionAskAiProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const top = Math.max(8, y - OFFSET);
  const left = Math.max(8, Math.min(x - 120, window.innerWidth - 248));

  return (
    <div
      data-selection-ask-ai
      style={{ top, left }}
      className="animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-150 fixed z-50 flex gap-1"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAsk();
        }}
        className="flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-card/95 px-2 text-xs shadow-lg backdrop-blur-md hover:border-border hover:bg-accent"
      >
        <Icon name="chat" size="xs" className="opacity-70" />
        <span>Ask Nexis</span>
        <KbdGroup>
          <Kbd className="h-4 min-w-4 px-1 text-[10px]">{fmtShortcut(MOD_KEY, "L")}</Kbd>
        </KbdGroup>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExplain();
        }}
        title="Explain this selection with AI"
        className="flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-card/95 px-2 text-xs shadow-lg backdrop-blur-md hover:border-border hover:bg-accent"
      >
        <Icon name="chat-ai" size="xs" className="opacity-70" />
        <span>Explain</span>
      </button>
    </div>
  );
}
