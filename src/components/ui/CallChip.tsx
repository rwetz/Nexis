// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * An "ongoing session" pill: a live dot, a label, a running timer, and one
 * way to end it.
 *
 * The pattern comes from call UIs, but the thing it is good at is any
 * long-lived activity the user started and can still stop — here, a
 * background process. It answers the two questions a plain "running"
 * indicator does not: *how long* has this been going, and *how do I stop it*,
 * without navigating to the panel that owns it.
 *
 * The timer ticks on a one-second interval owned by this component, so the
 * duration is derived from `startedAtMs` on every tick rather than stored and
 * incremented — a stored counter drifts whenever the tab is throttled, and
 * this one is correct the instant it becomes visible again.
 */

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/** `m:ss`, or `h:mm:ss` once it runs past an hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = `${s}`.padStart(2, "0");
  if (h > 0) return `${h}:${`${m}`.padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

type Props = {
  label: string;
  /** Epoch milliseconds the activity started. */
  startedAtMs: number;
  /** Ends the activity. Omit to render without a stop control. */
  onEnd?: () => void;
  /** Opens whatever owns this activity. */
  onClick?: () => void;
  endLabel?: string;
  className?: string;
};

export function CallChip({
  label,
  startedAtMs,
  onEnd,
  onClick,
  endLabel = "Stop",
  className,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = formatElapsed(now - startedAtMs);

  return (
    <span
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 pr-1 pl-2 text-[11px]",
        className,
      )}
    >
      {/* The live dot blinks at the caret cadence, the app's one "this is
          happening now" rhythm. */}
      <span
        aria-hidden
        className="nexis-blink size-1.5 shrink-0 rounded-full bg-emerald-500"
      />
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="flex min-w-0 items-center gap-1.5 disabled:cursor-default"
        title={label}
      >
        <span className="max-w-[140px] truncate text-foreground/80">
          {label}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {elapsed}
        </span>
      </button>
      {onEnd && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEnd();
          }}
          aria-label={`${endLabel} ${label}`}
          title={`${endLabel} ${label}`}
          className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
        >
          <Icon name="close" size="xs" />
        </button>
      )}
    </span>
  );
}
