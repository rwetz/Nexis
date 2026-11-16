// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Atlas as a Nexis sidebar view.
 *
 * This is the standalone app's `App.tsx` with everything that made it an *app*
 * removed: the `ThemeProvider`, the `TooltipProvider`, the `Toaster`, the
 * `MotionConfig`, `WindowControls`, `ResizeHandles`, the theme menu, and the
 * `data-tauri-drag-region` title bar. Nexis owns all of those once, for every
 * panel. What is left is the part that was actually Atlas: the two views of one
 * scan, the mode switch between them, and the shared selection.
 *
 * The keyboard map is deliberately narrower than the standalone app's. There it
 * could claim bare `j`/`k`/`r`/`t`/`o`/`v` because the whole window was Atlas.
 * Here the terminal is one pane away and a bare letter key belongs to whatever
 * has focus, so the bindings are scoped to this subtree and only fire when
 * focus is inside it — see `onKeyDown` below rather than a window listener.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AtlasWindowActions } from "@/modules/atlas/AtlasWindowActions";
import { DetailPanel } from "@/modules/atlas/list/DetailPanel";
import { RepoTable } from "@/modules/atlas/list/RepoTable";
import { CityCanvas } from "@/modules/atlas/map/CityCanvas";
import { Inspector } from "@/modules/atlas/map/Inspector";
import { Legend } from "@/modules/atlas/map/Legend";
import { projectStats } from "@/modules/atlas/map/projectStats";
import { RepoList } from "@/modules/atlas/map/RepoList";
import { configPath } from "@/modules/atlas/repos/api";
import {
  AtlasHostProvider,
  useAtlasHost,
  type AtlasHost,
} from "@/modules/atlas/repos/host";
import { useAtlasStore } from "@/modules/atlas/repos/store";
import { formatCount } from "@/modules/atlas/repos/types";

export type AtlasPanelProps = Partial<AtlasHost> & { standalone?: boolean };

export function AtlasPanel({ standalone = false, ...host }: AtlasPanelProps = {}) {
  return (
    <AtlasHostProvider host={host}>
      <Shell standalone={standalone} />
    </AtlasHostProvider>
  );
}

function Shell({ standalone }: { standalone: boolean }) {
  const refresh = useAtlasStore((s) => s.refresh);
  const mode = useAtlasStore((s) => s.mode);
  const repos = useAtlasStore((s) => s.repos);
  const hasRepos = repos.length > 0;
  const onKeyDown = useScopedKeys();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Self-healing open for the list view's detail pane.
  //
  // It used to be reachable only by a gesture — first a double-click, then a
  // single click once `select` opened it. Either way, a user who arrived at
  // the list with a repo already selected (a restored selection, a scan that
  // auto-selects, the companion window) saw no pane at all, and everything
  // in it — changed files, stashes, the commit heatmap — read as missing
  // rather than as closed. Gating a whole pane on a gesture the user may
  // never make is what kept the heatmap invisible.
  const selectedPath = useAtlasStore((s) => s.selectedPath);
  const detailOpen = useAtlasStore((s) => s.detailOpen);
  const openDetail = useAtlasStore((s) => s.openDetail);
  useEffect(() => {
    if (mode !== "list" || !selectedPath || detailOpen) return;
    void openDetail();
  }, [mode, selectedPath, detailOpen, openDetail]);

  return (
    // tabIndex so the subtree can hold focus and the key handler below has
    // somewhere to fire from; the outline is suppressed because the visible
    // focus affordance is the selected row, not a ring around the panel.
    <div
      role="region"
      aria-label="Atlas"
      className="flex h-full flex-col outline-none"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {!standalone && <Toolbar />}
      <div className="flex min-h-0 flex-1 bg-background">
        {mode === "map" && hasRepos && <RepoList />}
        <Stage />
        {mode === "map" && hasRepos && <Inspector />}
        {mode === "list" && <DetailPanel />}
      </div>
      <StatusLine />
    </div>
  );
}

function Toolbar() {
  const mapView = useAtlasStore((s) => s.mapView);
  const city = useAtlasStore((s) => s.city);
  const backToAtlas = useAtlasStore((s) => s.backToAtlas);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-card/60 px-3">
      <button
        type="button"
        onClick={backToAtlas}
        className="text-ui font-medium hover:text-foreground"
      >
        Atlas
      </button>
      {mapView === "city" && city && (
        <span className="flex min-w-0 items-center gap-1.5 text-ui text-muted-foreground">
          <span aria-hidden>/</span>
          <span className="truncate text-foreground">{city.summary.name}</span>
        </span>
      )}

      <div className="flex-1" />

      <AtlasWindowActions />
    </header>
  );
}

/** Whichever view is up, or whatever needs saying instead of it. */
function Stage() {
  const repos = useAtlasStore((s) => s.repos);
  const mode = useAtlasStore((s) => s.mode);

  if (repos.length === 0) return <EmptyState />;
  if (mode === "list") return <RepoTable />;

  return (
    <div className="nexis-scene-enter relative flex min-h-0 min-w-0 flex-1">
      <CityCanvas />
      <CityLocReadout />
      <Legend />
      <CityLoading />
      <Incomplete />
    </div>
  );
}

/** A persistent, at-a-glance LOC reading while walking a project's city. */
function CityLocReadout() {
  const mapView = useAtlasStore((s) => s.mapView);
  const city = useAtlasStore((s) => s.city);
  if (mapView !== "city" || !city) return null;

  const stats = projectStats(city.root);
  return (
    <div className="nexis-scene-enter pointer-events-none absolute top-3 left-3 rounded-xl border border-primary/25 bg-card/90 px-3 py-2.5 shadow-sm backdrop-blur">
      <div className="text-micro font-medium text-muted-foreground">Measured source lines</div>
      <div className="mt-0.5 text-2xl font-semibold text-foreground tabular-nums">
        {formatCount(stats.lines)} LOC
      </div>
      <div className="mt-0.5 text-micro text-muted-foreground">
        {formatCount(stats.codeFiles)} readable files
      </div>
    </div>
  );
}

function EmptyState() {
  const scanning = useAtlasStore((s) => s.scanning);
  const elapsedMs = useAtlasStore((s) => s.elapsedMs);
  const scanError = useAtlasStore((s) => s.scanError);
  const scanRoot = useAtlasStore((s) => s.scanRoot);
  const openConfig = useOpenConfig();

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center p-6">
      <div className="max-w-sm rounded-xl border border-border/60 bg-card p-5 text-center">
        {scanning && elapsedMs === null ? (
          <p className="text-sm text-muted-foreground">Scanning repositories…</p>
        ) : scanError ? (
          <>
            <p className="text-sm font-medium text-destructive">Scan failed</p>
            <p className="mt-2 break-all font-mono text-ui text-muted-foreground">
              {scanError}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">No git repos found</p>
            <p className="mt-2 text-ui leading-relaxed text-muted-foreground">
              {scanRoot
                ? `Nothing under ${scanRoot}. Add explicit paths or point scan_root somewhere else.`
                : "Add repo paths or a scan_root to atlas.toml."}
            </p>
          </>
        )}
        {!scanning && (
          <Button size="sm" variant="outline" className="mt-4" onClick={openConfig}>
            Edit atlas.toml
          </Button>
        )}
      </div>
    </div>
  );
}

/** Open `atlas.toml` in an editor tab. The standalone app handed it to the OS's
 *  default handler because it had nowhere else to put it; Nexis has an editor. */
function useOpenConfig(): () => void {
  const host = useAtlasHost();
  return useCallback(() => {
    void configPath()
      .then((path) => host.openFile(path))
      .catch((e) =>
        toast.error("Could not open atlas.toml", { description: String(e) }),
      );
  }, [host]);
}

function CityLoading() {
  const mapView = useAtlasStore((s) => s.mapView);
  const cityLoading = useAtlasStore((s) => s.cityLoading);
  const activeRepo = useAtlasStore((s) => s.activeRepo);
  const repoName = useAtlasStore(
    (s) => s.repos.find((r) => r.path === s.activeRepo)?.name ?? null,
  );
  const loading = mapView === "city" && cityLoading;

  // Small repos read in a frame or two; only a walk that is still running
  // after this long earns a skeleton, so quick switches never flash one.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!loading) {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), SKELETON_DELAY_MS);
    return () => clearTimeout(t);
  }, [loading, activeRepo]);

  if (!loading || !shown) return null;

  // Covers the previous repo's city (switching keeps it on the canvas until
  // the new walk lands) so nothing on screen claims to be a repo it is not.
  return (
    <div
      role="status"
      aria-live="polite"
      className="nexis-content-enter absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm"
    >
      <CitySkeleton />
      <div className="text-caption text-muted-foreground">
        Reading {repoName ?? "the repository"}…
      </div>
    </div>
  );
}

const SKELETON_DELAY_MS = 120;

/** An isometric city in outline: terraces and towers in the skeleton tone,
 *  breathing in sequence so it reads as "being built", not as an error. */
function CitySkeleton() {
  // [x, y, height] on a small iso grid; drawn back to front.
  const towers: Array<[number, number, number]> = [
    [0, 0, 26], [1, 0, 14], [2, 0, 34],
    [0, 1, 18], [1, 1, 40], [2, 1, 12],
    [0, 2, 10], [1, 2, 22], [2, 2, 16],
  ];
  const W = 22; // half the tile width
  const H = 11; // half the tile height
  return (
    <svg
      aria-hidden
      viewBox="-80 -70 160 130"
      className="h-28 w-36 text-muted-foreground"
    >
      <path
        d={`M0 ${-H * 0.5} L${W * 3.5} ${H * 3} L0 ${H * 6.5} L${-W * 3.5} ${H * 3} Z`}
        transform="translate(0 -8)"
        className="fill-muted/60"
      />
      {towers.map(([gx, gy, h], i) => {
        const cx = (gx - gy) * W;
        const cy = (gx + gy) * H - 8 + H;
        const top = `M${cx} ${cy - H - h} L${cx + W * 0.8} ${cy - h - H * 0.2} L${cx} ${cy - h + H * 0.6} L${cx - W * 0.8} ${cy - h - H * 0.2} Z`;
        const left = `M${cx - W * 0.8} ${cy - h - H * 0.2} L${cx} ${cy - h + H * 0.6} L${cx} ${cy + H * 0.6} L${cx - W * 0.8} ${cy - H * 0.2} Z`;
        const right = `M${cx + W * 0.8} ${cy - h - H * 0.2} L${cx} ${cy - h + H * 0.6} L${cx} ${cy + H * 0.6} L${cx + W * 0.8} ${cy - H * 0.2} Z`;
        return (
          <g
            key={i}
            className="nexis-blink"
            style={{ animationDelay: `${(gx + gy) * 140}ms` }}
          >
            <path d={left} fill="currentColor" opacity={0.16} />
            <path d={right} fill="currentColor" opacity={0.1} />
            <path d={top} fill="currentColor" opacity={0.24} />
          </g>
        );
      })}
    </svg>
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
    <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full border border-border/60 bg-card/85 px-2.5 py-0.5 text-micro text-muted-foreground backdrop-blur">
      Partial view: {parts.join(", ")}.
    </div>
  );
}

/**
 * The scan's provenance, always visible.
 *
 * This row is not decoration: Atlas scans the *host* machine even when the
 * active Nexis workspace is a WSL distro (see the module docs on the Rust
 * side). Pitfall #20 is about a host-scoped answer being mistaken for a
 * workspace-scoped one, and saying where the numbers came from is how this
 * panel avoids that.
 */
function StatusLine() {
  const repos = useAtlasStore((s) => s.repos);
  const elapsedMs = useAtlasStore((s) => s.elapsedMs);
  const scanning = useAtlasStore((s) => s.scanning);
  const scanRoot = useAtlasStore((s) => s.scanRoot);
  const openConfig = useOpenConfig();

  return (
    <footer className="flex h-6 shrink-0 items-center gap-2 border-t border-border/40 px-2 text-micro text-muted-foreground">
      <span className="tabular-nums">
        {scanning
          ? "scanning…"
          : `${repos.length} ${repos.length === 1 ? "repo" : "repos"}`}
      </span>
      {elapsedMs !== null && !scanning && (
        <span className="tabular-nums">{elapsedMs} ms</span>
      )}
      <span className="truncate" title="Atlas always scans this machine, not the active workspace">
        this machine{scanRoot ? ` · ${scanRoot}` : ""}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={openConfig}
        className="shrink-0 hover:text-foreground"
      >
        atlas.toml
      </button>
    </footer>
  );
}

/**
 * Keys that mean different things per view dispatch on the mode; the ones that
 * act on "the selected repo" work in both, which is the point of the selection
 * being shared. Camera keys (q/e/f/l) live with the canvas.
 *
 * Scoped to this subtree rather than bound to `window`: in the standalone app
 * the whole window was Atlas, so a bare `r` could mean "rescan". In Nexis a
 * bare letter belongs to whatever has focus.
 */
function useScopedKeys() {
  const host = useAtlasHost();
  const hostRef = useRef<AtlasHost | null>(null);
  useEffect(() => {
    hostRef.current = host;
  }, [host]);

  return useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (
      el &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
    )
      return;

    const s = useAtlasStore.getState();
    const host = hostRef.current;

    switch (e.key) {
      case "v":
        e.preventDefault();
        s.toggleMode();
        return;
      case "r":
        e.preventDefault();
        void s.refresh();
        return;
      case "t":
        if (s.selectedPath && host) {
          e.preventDefault();
          host.openTerminal(s.selectedPath);
        }
        return;
      case "o":
        if (s.selectedPath && host) {
          e.preventDefault();
          host.openWorkspace(s.selectedPath);
        }
        return;
    }

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
  }, []);
}

export default AtlasPanel;
