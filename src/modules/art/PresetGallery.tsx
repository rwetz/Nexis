// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The gallery of ready-made art.
 *
 * It is a grid of thumbnails and nothing else on purpose: a preset's whole job
 * is to stop being a preset the moment it is picked. There is no "preset mode"
 * to leave and no link back to where a document came from — it lands in the
 * editor as ordinary source, and every other tool in the pack treats it like
 * anything else you might have typed.
 *
 * Thumbnails render through the same sanitizer as every other preview here
 * (`svgSanitize.ts`), even though the art is ours and a test asserts it is
 * already clean. One rule, no exception to remember.
 */

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import {
  PRESET_GROUPS,
  presetsInGroup,
  type PresetGroup,
  type SvgPreset,
} from "./lib/presets";
import { sanitizeSvgForPreview } from "./lib/svgSanitize";

type Props = {
  /** Replace the editor's content with this markup. */
  onInsert: (svg: string) => void;
};

export function PresetGallery({ onInsert }: Props) {
  const [group, setGroup] = useState<PresetGroup>(PRESET_GROUPS[0]);
  const presets = useMemo(() => presetsInGroup(group), [group]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 px-2 py-1.5">
        {PRESET_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={g === group}
            onClick={() => setGroup(g)}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10.5px] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              g === group
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
          {presets.map((preset) => (
            <PresetTile
              key={preset.id}
              preset={preset}
              onPick={() => onInsert(preset.source)}
            />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-t border-border/50 px-3 py-2">
        <Icon name="info" size="xs" className="text-muted-foreground/60" />
        <span className="text-[9.5px] leading-relaxed text-muted-foreground/70">
          Picking one replaces the editor. Tune it from Shapes, the canvas, or
          the source.
        </span>
      </div>
    </div>
  );
}

function PresetTile({
  preset,
  onPick,
}: {
  preset: SvgPreset;
  onPick: () => void;
}) {
  const safe = useMemo(
    () => sanitizeSvgForPreview(preset.source).svg,
    [preset.source],
  );

  return (
    <button
      type="button"
      onClick={onPick}
      title={`Load "${preset.label}" into the editor`}
      className={cn(
        "group flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-card/40 p-2 transition-colors",
        "hover:border-primary/50 hover:bg-primary/[0.06]",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
      )}
    >
      <div
        className="flex aspect-square w-full items-center justify-center text-foreground/80 transition-colors group-hover:text-primary [&>svg]:h-full [&>svg]:w-full"
        // Ours, and sanitized above — see the module note.
        dangerouslySetInnerHTML={{ __html: safe }}
      />
      <span className="w-full truncate text-center text-[9.5px] text-muted-foreground">
        {preset.label}
      </span>
    </button>
  );
}
