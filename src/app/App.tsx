import { AtlasLogo } from "@/components/AppLogo";
import { ResizeHandles } from "@/components/ResizeHandles";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WindowControls } from "@/components/WindowControls";
import { IS_MAC } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { DetailPanel } from "@/modules/list/DetailPanel";
import { RepoTable } from "@/modules/list/RepoTable";
import { CityCanvas } from "@/modules/map/CityCanvas";
import { Inspector } from "@/modules/map/Inspector";
import { Legend } from "@/modules/map/Legend";
import { RepoList } from "@/modules/map/RepoList";
import { openConfig, openInTerminal, openPath } from "@/modules/repos/api";
import { useAtlasStore, type Mode } from "@/modules/repos/store";
import { formatCount } from "@/modules/repos/types";
import { ThemeProvider, useTheme } from "@/modules/theme/ThemeProvider";
import { BUILTIN_THEMES } from "@/modules/theme/themes";
import { StatusBar } from "./StatusBar";
import {
  Menu01Icon,
  Moon02Icon,
  MapsGlobal01Icon,
  RefreshIcon,
  Sun01Icon,
  TextFontIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { toast } from "sonner";

export default function App() {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2 }}>
        <TooltipProvider>
          <Shell />
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}

function Shell() {
  const refresh = useAtlasStore((s) => s.refresh);
  const mode = useAtlasStore((s) => s.mode);
  const repos = useAtlasStore((s) => s.repos);
  const hasRepos = repos.length > 0;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useGlobalKeys();

  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="zoom-content flex min-h-0 flex-1">
        {mode === "map" && hasRepos && <RepoList />}
        <Stage />
        {mode === "map" && hasRepos && <Inspector />}
        {mode === "list" && <DetailPanel />}
      </main>
      <StatusBar />
      <ResizeHandles />
    </div>
  );
}

function Header() {
  const scanning = useAtlasStore((s) => s.scanning);
  const refresh = useAtlasStore((s) => s.refresh);
  const showLabels = useAtlasStore((s) => s.showLabels);
  const toggleLabels = useAtlasStore((s) => s.toggleLabels);
  const mode = useAtlasStore((s) => s.mode);
  const mapView = useAtlasStore((s) => s.mapView);
  const city = useAtlasStore((s) => s.city);
  const backToAtlas = useAtlasStore((s) => s.backToAtlas);

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-card select-none",
        IS_MAC ? "pl-20" : "pl-3",
      )}
    >
      <AtlasLogo className="pointer-events-none size-6" />
      <button
        type="button"
        onClick={backToAtlas}
        className="font-heading text-sm font-semibold"
      >
        Atlas
      </button>
      {mode === "map" && mapView === "city" && city && (
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <span aria-hidden>/</span>
          <span className="truncate text-foreground">{city.summary.name}</span>
        </span>
      )}

      <div data-tauri-drag-region className="h-full flex-1" />

      <ModeSwitch />

      {mode === "map" && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Toggle labels (l)"
          title="Toggle labels (l)"
          onClick={toggleLabels}
          className={showLabels ? undefined : "text-muted-foreground/50"}
        >
          <HugeiconsIcon icon={TextFontIcon} size={15} strokeWidth={2} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Refresh (r)"
        title="Refresh (r)"
        disabled={scanning}
        onClick={() => void refresh()}
      >
        <HugeiconsIcon
          icon={RefreshIcon}
          size={15}
          strokeWidth={2}
          className={scanning ? "animate-spin" : undefined}
        />
      </Button>
      <ThemeMenu />
      <WindowControls />
    </header>
  );
}

/** The two views of one scan. A segmented control rather than a tab strip:
 *  these are two ways of looking at the same thing, not two places to be. */
function ModeSwitch() {
  const mode = useAtlasStore((s) => s.mode);
  const setMode = useAtlasStore((s) => s.setMode);

  const options: { id: Mode; label: string; icon: typeof Menu01Icon }[] = [
    { id: "list", label: "List", icon: Menu01Icon },
    { id: "map", label: "Map", icon: MapsGlobal01Icon },
  ];

  return (
    <div
      role="group"
      aria-label="View"
      className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/60 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={mode === o.id}
          title={`${o.label} view (v)`}
          onClick={() => setMode(o.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
            mode === o.id
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <HugeiconsIcon icon={o.icon} size={13} strokeWidth={2} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ThemeMenu() {
  const { mode, resolvedMode, themeId, setMode, setThemeId } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Theme">
          <HugeiconsIcon
            icon={resolvedMode === "dark" ? Moon02Icon : Sun01Icon}
            size={15}
            strokeWidth={2}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mode</DropdownMenuLabel>
        {(["light", "dark", "system"] as const).map((m) => (
          <DropdownMenuCheckboxItem
            key={m}
            checked={mode === m}
            onCheckedChange={() => setMode(m)}
            className="capitalize"
          >
            {m}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {BUILTIN_THEMES.map((t) => (
          <DropdownMenuCheckboxItem
            key={t.id}
            checked={themeId === t.id}
            onCheckedChange={() => setThemeId(t.id)}
          >
            {t.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Whichever view is up, or whatever needs saying instead of it. */
function Stage() {
  const repos = useAtlasStore((s) => s.repos);
  const mode = useAtlasStore((s) => s.mode);

  if (repos.length === 0) return <EmptyState />;
  if (mode === "list") return <RepoTable />;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <CityCanvas />
      <Legend />
      <CityLoading />
      <Incomplete />
    </div>
  );
}

function EmptyState() {
  const scanning = useAtlasStore((s) => s.scanning);
  const elapsedMs = useAtlasStore((s) => s.elapsedMs);
  const scanError = useAtlasStore((s) => s.scanError);
  const configPath = useAtlasStore((s) => s.configPath);
  const scanRoot = useAtlasStore((s) => s.scanRoot);

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center p-8">
      <div
        className={cn(
          "max-w-md rounded-2xl border border-border/60 bg-card p-6 text-center",
          scanning && "aurora-border",
        )}
      >
        {scanning && elapsedMs === null ? (
          <p className="text-sm text-muted-foreground">Scanning repositories…</p>
        ) : scanError ? (
          <>
            <p className="text-sm font-medium text-destructive">Scan failed</p>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
              {scanError}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">No git repos found</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {scanRoot
                ? `Nothing under ${scanRoot}. Add explicit paths or point scan_root somewhere else.`
                : "Add repo paths or a scan_root to your config."}
            </p>
            {configPath && (
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground/60">
                {configPath}
              </p>
            )}
          </>
        )}
        {!scanning && (
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() =>
              void openConfig().catch((e) =>
                toast.error("Could not open config", { description: String(e) }),
              )
            }
          >
            Open config.toml
          </Button>
        )}
      </div>
    </div>
  );
}

function CityLoading() {
  const mapView = useAtlasStore((s) => s.mapView);
  const cityLoading = useAtlasStore((s) => s.cityLoading);
  const city = useAtlasStore((s) => s.city);
  if (!(mapView === "city" && cityLoading && !city)) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="aurora-border rounded-2xl border border-border/60 bg-card/90 px-5 py-3 text-sm text-muted-foreground backdrop-blur">
        Reading the repository…
      </div>
    </div>
  );
}

/** Says so out loud when the scene is not the whole story — either the walk
 *  stopped at `max_files`, or the layout ran out of room for the smallest
 *  boxes. Both used to fail silently, which is the one thing a view like this
 *  cannot afford. */
function Incomplete() {
  const mapView = useAtlasStore((s) => s.mapView);
  const city = useAtlasStore((s) => s.city);
  const omitted = useAtlasStore((s) => s.omitted);

  const truncated = mapView === "city" && Boolean(city?.summary.truncated);
  if (!truncated && omitted === 0) return null;

  const parts: string[] = [];
  if (truncated) parts.push("stopped at the configured max_files");
  if (omitted > 0) parts.push(`${formatCount(omitted)} too small to draw`);
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-border/60 bg-card/85 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
      Partial view — {parts.join(", ")}.
    </div>
  );
}

/** App-level bindings. Keys that mean different things per view dispatch on
 *  the mode; the ones that act on "the selected repo" work in both, which is
 *  the point of the selection being shared. Camera keys (q/e/f/l) live with
 *  the canvas. */
function useGlobalKeys() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      )
        return;

      const s = useAtlasStore.getState();

      // ── both views ─────────────────────────────────────────────────────
      switch (e.key) {
        case "v":
          e.preventDefault();
          s.toggleMode();
          return;
        case "r":
          void s.refresh();
          return;
        case "t":
          if (s.selectedPath) {
            openInTerminal(s.selectedPath)
              .then((term) => toast.success(`Opened ${term}`))
              .catch((err) =>
                toast.error("Could not open terminal", { description: String(err) }),
              );
          }
          return;
        case "o":
          if (s.selectedPath) {
            openPath(s.selectedPath).catch((err) =>
              toast.error("Could not open folder", { description: String(err) }),
            );
          }
          return;
      }

      // ── per view ───────────────────────────────────────────────────────
      if (s.mode === "list") {
        switch (e.key) {
          case "j":
          case "ArrowDown":
            e.preventDefault();
            s.moveSelection(1);
            break;
          case "k":
          case "ArrowUp":
            e.preventDefault();
            s.moveSelection(-1);
            break;
          case "Enter":
            e.preventDefault();
            void s.toggleDetail();
            break;
          case "Escape":
            s.closeDetail();
            break;
        }
        return;
      }

      switch (e.key) {
        case "Escape":
          if (s.mapView === "city") s.backToAtlas();
          else s.setSelectedBlock(null);
          break;
        case "Enter": {
          const ref = s.selectedBlock?.ref;
          if (ref && (ref.kind === "repo" || ref.kind === "district")) {
            void s.enterRepo(ref.repo.path);
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
