// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Loading placeholders in the shape of what is coming (RULES R16): text
 * lines, a row with a picture, a card, a block. A soft sheen sweeps across
 * them; the gradient is fixed to the viewport, so neighbouring placeholders
 * shimmer as one surface instead of each pulsing on its own. Under reduced
 * motion the sheen stops and the shapes stay. Not for anything shorter than
 * a second (use the control's busy state) or anything that can count (use
 * `Progress`).
 */

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden className={cn("nexis-skeleton rounded-2xl", className)} {...props} />
}

/** Lines of text: full width, the last one shorter, at the line height of `text-body`. */
function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-full", "w-5/6"]
  return (
    <div data-slot="skeleton-text" aria-hidden className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3 rounded-full", i === lines - 1 && lines > 1 ? "w-3/5" : widths[i % widths.length])} />
      ))}
    </div>
  )
}

/** A list row: a picture, a title and a line under it. */
function SkeletonRow({ media = "circle", className }: { media?: "circle" | "square" | "none"; className?: string }) {
  return (
    <div data-slot="skeleton-row" aria-hidden className={cn("flex items-center gap-3 py-2", className)}>
      {media !== "none" && <Skeleton className={cn("size-8 shrink-0", media === "circle" ? "rounded-full" : "rounded-lg")} />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-2/5 rounded-full" />
        <Skeleton className="h-2.5 w-3/5 rounded-full" />
      </div>
    </div>
  )
}

/** A card: a picture in its aspect, then a title and a meta line. */
function SkeletonCard({ aspect = "portrait", className }: { aspect?: "square" | "portrait" | "landscape"; className?: string }) {
  return (
    <div data-slot="skeleton-card" aria-hidden className={cn("flex min-w-0 flex-col gap-2", className)}>
      <Skeleton className={cn("w-full rounded-xl", aspect === "square" ? "aspect-square" : aspect === "portrait" ? "aspect-[4/5]" : "aspect-[4/3]")} />
      <Skeleton className="h-3 w-4/5 rounded-full" />
      <Skeleton className="h-2.5 w-2/5 rounded-full" />
    </div>
  )
}

/** Wraps placeholders so assistive tech hears one "Loading" instead of nothing. */
function SkeletonGroup({ label = "Loading", className, children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-label={label} aria-busy data-slot="skeleton-group" className={className}>
      {children}
    </div>
  )
}

export { Skeleton, SkeletonCard, SkeletonGroup, SkeletonRow, SkeletonText }
