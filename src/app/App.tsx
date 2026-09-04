import { ImagineLogo } from "@/components/AppLogo";
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
import { openConfig } from "@/modules/city/api";
import { CityCanvas } from "@/modules/city/CityCanvas";
import { Inspector } from "@/modules/city/Inspector";
import { Legend } from "@/modules/city/Legend";
import { RepoList } from "@/modules/city/RepoList";
import { StatusBar } from "@/modules/city/StatusBar";
import { useCityStore } from "@/modules/city/store";
import { ThemeProvider, useTheme } from "@/modules/theme/ThemeProvider";
import { BUILTIN_THEMES } from "@/modules/theme/themes";
import {
  Moon02Icon,
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
  const refresh = useCityStore((s) => s.refresh);
  const repos = useCityStore((s) => s.repos);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useGlobalKeys();

  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="zoom-content flex min-h-0 flex-1">
        {repos.length > 0 && <RepoList />}
        <Stage />
        {repos.length > 0 && <Inspector />}
      </main>
      <StatusBar />
      <ResizeHandles />
    </div>
  );
}

function Header() {
  const scanning = useCityStore((s) => s.scanning);
  const refresh = useCityStore((s) => s.refresh);
  const showLabels = useCityStore((s) => s.showLabels);
  const toggleLabels = useCityStore((s) => s.toggleLabels);
  const view = useCityStore((s) => s.view);
  const city = useCityStore((s) => s.city);
  const backToAtlas = useCityStore((s) => s.backToAtlas);

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-card select-none",
        IS_MAC ? "pl-20" : "pl-3",
      )}
    >
      <ImagineLogo className="pointer-events-none size-6" />
      <button
        type="button"
        onClick={backToAtlas}
        className="font-heading text-sm font-semibold"
      >
        Imagine
      </button>
      {view === "city" && city && (
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <span aria-hidden>/</span>
          <span className="truncate text-foreground">{city.summary.name}</span>
        </span>
      )}

      <div data-tauri-drag-region className="h-full flex-1" />

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

/** The canvas, or whatever needs saying instead of it. */
function Stage() {
  const repos = useCityStore((s) => s.repos);
  const scanning = useCityStore((s) => s.scanning);
  const elapsedMs = useCityStore((s) => s.elapsedMs);
  const scanError = useCityStore((s) => s.scanError);
  const configPath = useCityStore((s) => s.configPath);
  const scanRoot = useCityStore((s) => s.scanRoot);
  const cityLoading = useCityStore((s) => s.cityLoading);
  const city = useCityStore((s) => s.city);
  const view = useCityStore((s) => s.view);

  if (repos.length === 0) {
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
              <p className="text-sm font-medium">Nothing to build</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {scanRoot
                  ? `No git repos under ${scanRoot}. Add explicit paths or point scan_root somewhere else.`
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

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <CityCanvas />
      <Legend />
      {view === "city" && cityLoading && !city && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="aurora-border rounded-2xl border border-border/60 bg-card/90 px-5 py-3 text-sm text-muted-foreground backdrop-blur">
            Reading the repository…
          </div>
        </div>
      )}
      {view === "city" && city?.summary.truncated && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-border/60 bg-card/85 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
          Truncated at the configured max_files — the city is partial.
        </div>
      )}
    </div>
  );
}

/** App-level bindings. Camera keys (q/e/f/l) live with the canvas. */
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

      const s = useCityStore.getState();
      switch (e.key) {
        case "r":
          void s.refresh();
          break;
        case "Escape":
          if (s.view === "city") s.backToAtlas();
          else s.setSelected(null);
          break;
        case "Enter": {
          const ref = s.selected?.ref;
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
