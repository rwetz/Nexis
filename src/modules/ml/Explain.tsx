// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Hover-to-explain wrapper for ML Lab terms. Wraps a label in a dotted
 * underline; hovering opens a small card explaining what the value means
 * (from lib/glossary.ts, or ad-hoc via the `info` prop for metric hints).
 * Renders children unchanged when there is nothing to explain, so callers
 * can wrap unconditionally.
 */
import type { ReactNode } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { explain, type GlossaryEntry } from "./lib/glossary";

type Props = {
  /** Glossary key (lib/glossary.ts). */
  term?: string;
  /** Ad-hoc explanation when the text isn't a glossary term (metric hints). */
  info?: GlossaryEntry | null;
  children: ReactNode;
  className?: string;
};

export function Explain({ term, info, children, className }: Props) {
  const entry = info ?? (term ? explain(term) : null);
  if (!entry) return <>{children}</>;
  return (
    <HoverCard openDelay={250} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span
          className={
            "cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 " +
            (className ?? "")
          }
        >
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        className="w-64 rounded-md p-2.5"
      >
        <p className="mb-1 text-[11px] font-semibold text-foreground">
          {entry.title}
        </p>
        <p className="text-[10.5px] leading-snug text-muted-foreground">
          {entry.body}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
