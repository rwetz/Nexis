// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Button } from "@/components/ui/button";
import { PACK_IDS, PACKS, packForView } from "@/lib/packs";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setEnabledPacks } from "@/modules/settings/store";
import { LayersIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SidebarViewId } from "./types";

type Props = {
  view: SidebarViewId;
  /** Escape hatch back to a core view (the file explorer). */
  onShowExplorer: () => void;
};

/**
 * Rendered in the sidebar panel slot when the active view's expansion pack
 * is disabled: instead of silently snapping back to the explorer, offer to
 * enable the owning pack in place. Reached by disabling a pack while its
 * panel is open, or by a decoupled `nexis:open-sidebar-view` request (deep
 * link, plugin, status pill) targeting a gated view.
 */
export function PackGatePlaceholder({ view, onShowExplorer }: Props) {
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  const pack = packForView(view);
  if (!pack) return null; // core views are never gated
  const def = PACKS[pack];

  const enable = () => {
    // Persist in canonical PACK_IDS order so the stored value is stable
    // (same rule as Settings → Features).
    void setEnabledPacks(
      PACK_IDS.filter((p) => p === pack || enabledPacks.includes(p)),
    );
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <HugeiconsIcon
        icon={LayersIcon}
        size={22}
        strokeWidth={1.5}
        className="text-muted-foreground/60"
      />
      <div className="flex flex-col gap-1">
        <p className="text-[12.5px] font-medium text-foreground">
          This panel is part of the {def.label} pack
        </p>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {def.description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 px-3 text-[11.5px]" onClick={enable}>
          Enable {def.label}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-3 text-[11.5px] text-muted-foreground"
          onClick={onShowExplorer}
        >
          Show Files
        </Button>
      </div>
      <p className="max-w-56 text-[10.5px] leading-relaxed text-muted-foreground/70">
        Nothing gets installed — packs only show or hide features. Manage them
        any time in Settings&nbsp;→&nbsp;Features.
      </p>
    </div>
  );
}
