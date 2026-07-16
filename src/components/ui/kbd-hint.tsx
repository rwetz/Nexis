// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { cn } from "@/lib/utils";

type Props = {
  keys: string[];
  /** Optional leading label, e.g. "Open with". */
  label?: string;
  className?: string;
};

/**
 * Inline contextual keyboard hint — a muted label + key chips that fades in
 * where it's relevant (empty states, hover affordances, near actions).
 * Linear-style. Respects reduced motion via the global animate-in rule.
 */
export function KbdHint({ keys, label, className }: Props) {
  return (
    <span
      className={cn(
        "animate-in fade-in slide-in-from-bottom-0.5 duration-200 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70",
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
    </span>
  );
}
