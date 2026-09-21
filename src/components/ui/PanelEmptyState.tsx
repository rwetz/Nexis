// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * One empty state for every sidebar panel.
 *
 * The rail's panels each drew their own: an illustrated folder in Files, a
 * faded icon in Bookmarks and Source Control, a single grey line of text in
 * Outline, Symbol Search and Recent Files. Six panels side by side read as
 * six authors. This is the shared shape — art, a title that names the state,
 * a sentence that says what to do about it, and an optional hint — with two
 * kinds of art so a panel can pick the weight it deserves:
 *
 * - `PanelEmptyFolder` is the themed `FolderPreview` with sheets drawn to
 *   suit the panel (outline bars, file rows). It is the heavier, friendlier
 *   mark, for "there is nothing here *yet*": no file open, no history.
 * - `PanelEmptyGlyph` is a quiet plate around a semantic icon, for states
 *   that are about a query or a condition rather than a place.
 *
 * All art takes the theme: the folder through `getFolderColor`, the glyph
 * through `currentColor` and the primary token. Nothing here names a hex.
 */

import { Icon, type IconName } from "@/components/icon";
import { FolderPreview } from "@/components/ui/FolderPreview";
import { cn } from "@/lib/utils";
import { getFolderColor, useTheme } from "@/modules/theme";
import type { ReactNode } from "react";

export function PanelEmptyState({
  art,
  title,
  description,
  hint,
  className,
}: {
  art?: ReactNode;
  title: string;
  description?: ReactNode;
  /** A keybinding or example, set in smaller type under the description. */
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center",
        className,
      )}
    >
      {art}
      <div className="max-w-60 space-y-1">
        <p className="text-[12px] font-medium text-foreground/80">{title}</p>
        {description && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        )}
        {hint && (
          <p className="pt-1 text-[10.5px] leading-relaxed text-muted-foreground/70">{hint}</p>
        )}
      </div>
    </div>
  );
}

/** The themed folder, with sheets suited to the panel. */
export function PanelEmptyFolder({ sheets = "lines" }: { sheets?: "outline" | "lines" }) {
  const { themeId, resolvedMode } = useTheme();
  const items = [0, 1, 2].map((i) =>
    sheets === "outline" ? <OutlineSheet key={i} seed={i} /> : <LinesSheet key={i} seed={i} />,
  );
  return <FolderPreview color={getFolderColor(themeId, resolvedMode)} size={1.1} items={items} />;
}

/** A quiet plate around a semantic icon. */
export function PanelEmptyGlyph({ icon }: { icon: IconName }) {
  return (
    <div className="relative flex size-14 items-center justify-center text-primary">
      <svg
        aria-hidden
        viewBox="0 0 56 56"
        className="absolute inset-0 size-full text-border"
        fill="none"
        stroke="currentColor"
      >
        <rect x="6" y="6" width="44" height="44" rx="12" strokeWidth="1" />
        <rect x="0.5" y="0.5" width="55" height="55" rx="15.5" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
      </svg>
      <Icon name={icon} size="lg" className="relative opacity-80" />
    </div>
  );
}

/** Indented bars: the shape of a symbol outline. */
function OutlineSheet({ seed }: { seed: number }) {
  const rows = [
    [0, 70],
    [8, 52],
    [8, 60],
    [16, 38],
    [0, 64],
    [8, 44],
  ];
  return (
    <svg viewBox="0 0 100 80" className="size-full" aria-hidden>
      {rows.map(([x, w], i) => (
        <rect
          key={i}
          x={12 + x}
          y={12 + i * 10}
          width={w - seed * 4}
          height="4"
          rx="2"
          fill="currentColor"
          opacity={i === 0 || i === 4 ? 0.55 : 0.28}
        />
      ))}
    </svg>
  );
}

/** Even rows: the shape of a file list. */
function LinesSheet({ seed }: { seed: number }) {
  return (
    <svg viewBox="0 0 100 80" className="size-full" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} opacity={0.4}>
          <rect x="12" y={12 + i * 12} width="6" height="6" rx="1.5" fill="currentColor" />
          <rect x="24" y={13 + i * 12} width={56 - ((i + seed) % 3) * 10} height="4" rx="2" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}
