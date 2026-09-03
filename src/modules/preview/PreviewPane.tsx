import { Icon } from "@/components/icon";
// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  PreviewAddressBar,
  type PreviewAddressBarHandle,
} from "./PreviewAddressBar";
import { layoutViewports, VIEWPORTS, type Viewport } from "./viewports";

export type PreviewPaneHandle = {
  reload: () => void;
  focusAddressBar: () => void;
  getUrl: () => string;
};

type Props = {
  url: string;
  visible: boolean;
  onUrlChange: (url: string) => void;
};

// Tear the iframe down after this much invisibility — a background dev
// server page can hold hundreds of MB inside the WebView.
const SUSPEND_AFTER_MS = 30_000;

// sandbox grants the bare minimum for a dev preview: scripts, same-origin
// (cookies/storage for the previewed app), forms, popups for "open in new
// tab". Critically OMITS `allow-top-navigation*` — without it the iframe
// cannot navigate the parent Tauri webview to an attacker origin, which would
// otherwise expose `window.__TAURI__` IPC.
//
// react-doctor flags `allow-scripts` + `allow-same-origin` as self-defeating,
// because content that is same-origin *with the embedder* can reach
// `frameElement`, strip this attribute and reload. That escape needs the
// framed page to share an origin with the app shell: here the shell is the
// Tauri webview and the frame is a user-supplied dev-server URL, so
// `frameElement` access throws and the escape doesn't apply. Dropping
// `allow-same-origin` would give the preview an opaque origin and break
// cookies/localStorage for essentially every real app being previewed, which
// is the entire point of the pane.
//
// Hoisted to a constant so the multi-viewport frames cannot drift from the
// single-frame one — a second copy of this is a second thing to get wrong.
const PREVIEW_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads";

const VIEWPORT_STORAGE_KEY = "nexis:preview:viewports";

function loadViewportSelection(): string[] {
  try {
    const raw = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export const PreviewPane = forwardRef<PreviewPaneHandle, Props>(
  function PreviewPane({ url, visible, onUrlChange }, ref) {
    // `nonce` is part of the iframe `key`. Bumping it remounts the iframe,
    // which is the only reliable cross-origin reload (calling
    // contentWindow.location.reload() throws on cross-origin frames).
    const [nonce, setNonce] = useState(0);
    const [loaded, setLoaded] = useState(visible);
    const addressRef = useRef<PreviewAddressBarHandle>(null);

    // An empty selection means the single full-size frame — the original
    // behaviour, and still the default. Most previewing is one viewport, and
    // N frames is N page loads against the dev server.
    const [selected, setSelected] = useState<string[]>(loadViewportSelection);
    const frameHostRef = useRef<HTMLDivElement>(null);
    const [hostSize, setHostSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
      if (visible) {
        setLoaded(true);
        return;
      }
      const t = setTimeout(() => setLoaded(false), SUSPEND_AFTER_MS);
      return () => clearTimeout(t);
    }, [visible]);

    useEffect(() => {
      try {
        localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(selected));
      } catch {
        // A full or disabled store is not a reason to break the preview.
      }
    }, [selected]);

    // The frames are scaled to fit, so the layout is recomputed whenever the
    // pane resizes — a split, a sidebar drag, a window resize. The dependency
    // is the selection *length* because that is what mounts or unmounts the
    // host element this observes.
    useEffect(() => {
      const el = frameHostRef.current;
      if (!el) return;
      const observer = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect) setHostSize({ width: rect.width, height: rect.height });
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, [selected.length]);

    useImperativeHandle(
      ref,
      () => ({
        reload: () => {
          setLoaded(true);
          setNonce((n) => n + 1);
        },
        focusAddressBar: () => addressRef.current?.focus(),
        getUrl: () => url,
      }),
      [url],
    );

    const showXfoHint = url ? !isLocalUrl(url) : false;

    const chosen: Viewport[] = VIEWPORTS.filter((v) => selected.includes(v.id));
    const multi = chosen.length > 0;
    const layout = layoutViewports(hostSize.width, hostSize.height, chosen);

    const toggleViewport = (id: string) =>
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
      );

    return (
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background"
        style={{
          visibility: visible ? "visible" : "hidden",
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        <PreviewAddressBar
          ref={addressRef}
          url={url}
          onSubmit={onUrlChange}
          onReload={() => setNonce((n) => n + 1)}
        />

        {/* Viewport picker. Nothing selected is the plain single frame, which
            is why "Fit" is a real option rather than an absence. */}
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border/60 px-2">
          <button
            type="button"
            aria-pressed={!multi}
            onClick={() => setSelected([])}
            className={
              "rounded px-1.5 py-0.5 text-[10.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 " +
              (!multi
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            Fit
          </button>
          {VIEWPORTS.map((v) => {
            const on = selected.includes(v.id);
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={on}
                title={`${v.label} — ${v.width}x${v.height} CSS px`}
                onClick={() => toggleViewport(v.id)}
                className={
                  "rounded px-1.5 py-0.5 text-[10.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 " +
                  (on
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {v.label}
              </button>
            );
          })}
          {multi && (
            <span className="ml-auto text-[9.5px] tabular-nums text-muted-foreground/60">
              {chosen.length} {chosen.length === 1 ? "frame" : "frames"} · one
              load each
            </span>
          )}
        </div>

        {showXfoHint ? (
          <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/60 bg-amber-500/8 px-3 text-[11px] text-amber-600 dark:text-amber-400">
            <Icon name="alert" className="shrink-0" />
            <span className="truncate">
              Many public sites refuse to embed (X-Frame-Options). If the page
              is blank, open it externally.
            </span>
          </div>
        ) : null}

        <div
          className={
            url && !multi
              ? "relative min-h-0 flex-1 bg-white"
              : "relative min-h-0 flex-1 bg-background"
          }
        >
          {url ? (
            loaded ? (
              multi ? (
                <div
                  ref={frameHostRef}
                  className="flex h-full w-full items-start justify-center gap-4 overflow-auto p-4"
                >
                  {layout.boxes.map(({ viewport, width, height }) => (
                    <div
                      key={viewport.id}
                      className="flex shrink-0 flex-col items-center gap-1"
                      style={{ width }}
                    >
                      <div
                        className="overflow-hidden rounded-md border border-border/60 bg-white"
                        style={{ width, height }}
                      >
                        <iframe
                          key={`${url}#${nonce}#${viewport.id}`}
                          src={url}
                          title={`Preview at ${viewport.label}`}
                          // Laid out at its true CSS width and then scaled
                          // down, so the page's media queries see the device
                          // width rather than the pane's. `transform: scale`
                          // rather than CSS `zoom`: both shrink the box, only
                          // transform keeps hit-testing correct — the same
                          // defect pitfall #15 documents for CodeMirror.
                          style={{
                            width: viewport.width,
                            height: viewport.height,
                            transform: `scale(${layout.scale})`,
                            transformOrigin: "top left",
                            border: 0,
                          }}
                          // react-doctor-disable-next-line react-doctor/iframe-missing-sandbox
                          sandbox={PREVIEW_SANDBOX}
                          referrerPolicy="no-referrer"
                          allow="clipboard-read; clipboard-write; fullscreen"
                        />
                      </div>
                      <span className="text-[9.5px] tabular-nums text-muted-foreground/70">
                        {viewport.label} · {viewport.width}
                        {layout.scale < 1
                          ? ` · ${Math.round(layout.scale * 100)}%`
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <iframe
                  key={`${url}#${nonce}`}
                  src={url}
                  title="Preview"
                  className="h-full w-full border-0"
                  // react-doctor-disable-next-line react-doctor/iframe-missing-sandbox
                  sandbox={PREVIEW_SANDBOX}
                  referrerPolicy="no-referrer"
                  allow="clipboard-read; clipboard-write; fullscreen"
                />
              )
            ) : (
              <SuspendedState
                onReload={() => {
                  setLoaded(true);
                  setNonce((n) => n + 1);
                }}
              />
            )
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    );
  },
);

function SuspendedState({ onReload }: { onReload: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-2xl border border-border/60 bg-card text-muted-foreground">
        <Icon name="globe" size="lg" />
      </div>
      <div className="space-y-1">
        <p className="text-[12.5px] font-medium text-foreground">
          Preview suspended
        </p>
        <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground">
          Released to free memory after sitting in the background.
        </p>
      </div>
      <button
        type="button"
        onClick={onReload}
        className="rounded-md border border-border/60 bg-card px-3 py-1 text-[11px] hover:bg-accent/50"
      >
        Reload
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-card text-muted-foreground">
        <Icon name="globe" size="lg" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          Nothing to preview yet
        </p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          Type a URL above, or open the{" "}
          <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10.5px]">
            Ports
          </span>{" "}
          dropdown to jump straight to your running dev server. Public sites
          often block embedding — open them in your browser via the link icon
          if you see a blank page.
        </p>
      </div>
    </div>
  );
}

function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "0.0.0.0" ||
      h === "[::1]" ||
      h.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}
