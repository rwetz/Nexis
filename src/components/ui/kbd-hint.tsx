// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { tween } from "@/lib/motion";

type Props = {
  keys: string[];
  /** Optional leading label, e.g. "Open with". */
  label?: string;
  className?: string;
};

/**
 * Inline contextual keyboard hint — a muted label + key chips that fades in
 * where it's relevant (empty states, hover affordances, near actions).
 * Linear-style. Respects reduced motion via the app-root MotionConfig.
 */
export function KbdHint({ keys, label, className }: Props) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tween.base}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] text-muted-foreground/70",
        className,
      )}
    >
      {label ? <span>{label}</span> : null}
      <span className="inline-flex items-center gap-0.5">
        {keys.map((k, i) => (
          <kbd
            key={`${k}-${i}`}
            className="rounded border border-border/60 bg-muted/50 px-1 py-px font-mono text-[10px] leading-none text-muted-foreground"
          >
            {k}
          </kbd>
        ))}
      </span>
    </motion.span>
  );
}
