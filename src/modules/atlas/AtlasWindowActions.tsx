import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { useGlidingRail } from "@/components/ui/use-gliding-rail";
import { cn } from "@/lib/utils";
import { m } from "motion/react";
import { useMemo } from "react";
import { useAtlasStore, type Mode } from "@/modules/atlas/repos/store";
import { attentionItems } from "@/modules/atlas/repos/types";

/** Controls shared by Atlas's panel toolbar and its dedicated window title bar. */
export function AtlasWindowActions() {
  const scanning = useAtlasStore((s) => s.scanning);
  const refresh = useAtlasStore((s) => s.refresh);
  const showLabels = useAtlasStore((s) => s.showLabels);
  const toggleLabels = useAtlasStore((s) => s.toggleLabels);
  const mode = useAtlasStore((s) => s.mode);

  return (
    <div className="flex items-center gap-1">
      <AtlasModeSwitch />
      {mode === "list" && <AttentionFilter />}
      {mode === "map" && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Toggle labels"
          title="Toggle labels (l)"
          onClick={toggleLabels}
          className={showLabels ? undefined : "text-muted-foreground/50"}
        >
          <Icon name="text" size="sm" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Rescan repositories"
        title="Rescan (r)"
        disabled={scanning}
        onClick={() => void refresh()}
      >
        <Icon name="refresh" size="sm" className={scanning ? "nexis-spin" : undefined} />
      </Button>
    </div>
  );
}

/** The two views are representations of one selection, so they read as a toggle. */
export function AtlasModeSwitch() {
  const mode = useAtlasStore((s) => s.mode);
  const setMode = useAtlasStore((s) => s.setMode);
  const options = [
    { id: "list" as Mode, label: "List", icon: "layout-left" as const },
    { id: "map" as Mode, label: "Map", icon: "map" as const },
  ];

  // The selected pill travels between the two rather than the card
  // background cutting from one to the other. Same mechanism as the sidebar
  // and Settings rails, so all three switches in the app move alike.
  const rail = useGlidingRail<Mode>(mode, "horizontal", options.length);

  return (
    <div
      ref={rail.containerRef}
      role="group"
      aria-label="Atlas view"
      className="relative flex items-center gap-0.5 rounded-xl border border-border/60 bg-background/70 p-0.5"
    >
      {rail.activeRect && (
        // Glides by transform alone: the width is set, not animated (a size
        // is a layout property). Not RailIndicator's clip, because this thumb
        // is a raised card whose shadow and ring a clip would cut away; with
        // two options the width change on a switch is a few pixels.
        <m.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 left-0 rounded-lg bg-card shadow-sm ring-1 ring-foreground/10"
          style={{ width: rail.activeRect.extent }}
          initial={false}
          animate={{ x: rail.activeRect.offset }}
          transition={rail.transition}
        />
      )}
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          ref={(el) => rail.registerItem(option.id, el)}
          aria-pressed={mode === option.id}
          title={`${option.label} view (v)`}
          onClick={() => setMode(option.id)}
          className={cn(
            "relative z-10 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-ui font-medium transition-colors",
            mode === option.id
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {/* No `active` weight here. Phosphor's fill weight redraws the
              globe as a different picture, so selecting Map changed which
              icon Map *was* — the pill and the label colour already carry
              the state without the glyph moving underneath it. */}
          <Icon name={option.icon} size="sm" />
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** "Needs attention" narrows the list to repos with something to tidy:
 *  uncommitted files, stale branches, linked worktrees or open PRs. The
 *  count is always shown, so it doubles as a machine-wide drift gauge. */
function AttentionFilter() {
  const repos = useAtlasStore((s) => s.repos);
  const prs = useAtlasStore((s) => s.prs);
  const attentionOnly = useAtlasStore((s) => s.attentionOnly);
  const toggleAttentionOnly = useAtlasStore((s) => s.toggleAttentionOnly);
  const count = useMemo(
    () => repos.filter((r) => attentionItems(r, prs).length > 0).length,
    [repos, prs],
  );

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={attentionOnly}
      title="Show only repos that need attention"
      onClick={toggleAttentionOnly}
      className={cn(
        "gap-1.5 text-ui",
        attentionOnly ? "bg-warning/14 text-warning hover:bg-warning/22" : "text-muted-foreground",
      )}
    >
      <Icon name="filter" size="sm" active={attentionOnly} />
      Needs attention
      <span className="tabular-nums">{count}</span>
    </Button>
  );
}
