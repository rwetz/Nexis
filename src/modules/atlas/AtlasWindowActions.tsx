import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAtlasStore, type Mode } from "@/modules/atlas/repos/store";

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
    { id: "map" as Mode, label: "Map", icon: "globe" as const },
  ];

  return (
    <div
      role="group"
      aria-label="Atlas view"
      className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-background/70 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={mode === option.id}
          title={`${option.label} view (v)`}
          onClick={() => setMode(option.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
            mode === option.id
              ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon name={option.icon} size="sm" active={mode === option.id} />
          {option.label}
        </button>
      ))}
    </div>
  );
}
