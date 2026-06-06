// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { fmtShortcut, MOD_KEY } from "@/lib/platform";
import { BubbleChatIcon, BubbleChatSparkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
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
    <motion.div
      data-selection-ask-ai
      initial={{ opacity: 0, y: 4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      style={{ top, left }}
      className="fixed z-50 flex gap-1"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAsk();
        }}
        className="flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-card/95 px-2 text-xs shadow-lg backdrop-blur-md hover:border-border hover:bg-accent"
      >
        <HugeiconsIcon icon={BubbleChatIcon} size={11} strokeWidth={1.75} className="opacity-70" />
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
        <HugeiconsIcon icon={BubbleChatSparkIcon} size={11} strokeWidth={1.75} className="opacity-70" />
        <span>Explain</span>
      </button>
    </motion.div>
  );
}
