// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Spotlight's right-hand pane: what the highlighted result actually is.
 *
 * Files show a real preview (the image itself, the first lines of a text
 * file, or a syntax-coloured miniature of a code file) above a meta block
 * (type, size, modified, lines or dimensions). Commands show their category
 * and description.
 *
 * It must keep up with a pointer sweeping down the list, which drives two
 * choices. The pane itself is not animated between results (see the note on
 * the old AnimatePresence version in AppleSpotlight); only the visual fades
 * in once its content has loaded. And reads are debounced and cached, so a
 * fast sweep reads only the file the pointer settles on, and returning to a
 * file reads nothing.
 */
import { memo, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { formatBytes, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { assetUrl } from "@/platform/desktop";
import { filesystem } from "@/platform/filesystem";
import { FileTypeIcon } from "@/modules/explorer/lib/FileTypeIcon";
import { CodeMiniature } from "./CodeMiniature";
import { languageOf, plainInline, previewKind, typeLabel } from "./previewKind";

/** Files larger than this get their meta but no content read. */
const READ_CAP = 256 * 1024;
const PREVIEW_LINES = 40;
const DEBOUNCE_MS = 70;

type FileInfo = {
  size: number | null;
  mtime: number | null;
  /** First lines of a text or code file; null when not read or unreadable. */
  lines: string[] | null;
  totalLines: number | null;
};

/** Small LRU: a Map keeps insertion order, so the first key is the oldest. */
const cache = new Map<string, FileInfo>();
function remember(path: string, info: FileInfo) {
  cache.delete(path);
  cache.set(path, info);
  if (cache.size > 80) cache.delete(cache.keys().next().value as string);
}

async function loadInfo(path: string): Promise<FileInfo> {
  const hit = cache.get(path);
  if (hit) return hit;
  const info: FileInfo = { size: null, mtime: null, lines: null, totalLines: null };
  try {
    const stat = await filesystem.stat(path);
    info.size = stat.size;
    // fs_stat reports epoch milliseconds, and 0 when the platform has none.
    info.mtime = stat.mtime > 0 ? stat.mtime : null;
  } catch {
    // Meta is best effort; the preview still names the file.
  }
  const kind = previewKind(path);
  if ((kind === "code" || kind === "text") && info.size !== null && info.size <= READ_CAP) {
    try {
      const res = await filesystem.readFile(path);
      if (res.kind === "text") {
        const all = res.content.split(/\r?\n/);
        info.totalLines = all.length;
        info.lines = all.slice(0, PREVIEW_LINES);
      }
    } catch {
      // Unreadable: meta only.
    }
  }
  remember(path, info);
  return info;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[10.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right text-foreground/85">{value}</span>
    </div>
  );
}

function TextExcerpt({ lines, markdown }: { lines: string[]; markdown: boolean }) {
  return (
    <div className="h-full overflow-hidden bg-card px-3 py-2.5 text-[9.5px] leading-[1.45] text-foreground/85">
      {lines.slice(0, 16).map((line, i) => {
        if (markdown && /^#{1,6}\s/.test(line)) {
          const level = line.match(/^#+/)![0].length;
          return (
            <div key={i} className={cn("truncate font-semibold text-foreground", level === 1 ? "text-[12px]" : "text-[10.5px]")}>
              {plainInline(line.replace(/^#+\s*/, ""))}
            </div>
          );
        }
        if (markdown && /^\s*[-*]\s/.test(line)) {
          return (
            <div key={i} className="truncate pl-2">
              <span className="text-muted-foreground">•</span> {plainInline(line.replace(/^\s*[-*]\s/, ""))}
            </div>
          );
        }
        return (
          <div key={i} className="truncate">
            {(markdown ? plainInline(line) : line) || " "}
          </div>
        );
      })}
    </div>
  );
}

function FileVisual({ path, name, info }: { path: string; name: string; info: FileInfo | null }) {
  const kind = previewKind(path);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  if (kind === "image" && !imgFailed) {
    return (
      <div className="relative flex h-full items-center justify-center bg-[conic-gradient(var(--muted)_25%,transparent_0_50%,var(--muted)_0_75%,transparent_0)] bg-[length:14px_14px]">
        <img
          src={assetUrl(path.replace(/\\/g, "/"))}
          alt=""
          className="max-h-[90%] max-w-[90%] object-contain opacity-0 transition-opacity duration-150"
          onLoad={(e) => {
            e.currentTarget.style.opacity = "1";
            setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
          }}
          onError={() => setImgFailed(true)}
        />
        {dims ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-background/80 px-1 text-[9px] text-muted-foreground">
            {dims.w} × {dims.h}
          </span>
        ) : null}
      </div>
    );
  }
  if (info?.lines && kind === "code") {
    const lang = languageOf(path);
    return <CodeMiniature lines={info.lines} family={lang?.family ?? "c"} fileName={name} />;
  }
  if (info?.lines && kind === "text") {
    return <TextExcerpt lines={info.lines} markdown={/\.(md|markdown|mdx)$/i.test(path)} />;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-card">
      <FileTypeIcon name={name} className="size-10" />
      <span className="text-[10px] text-muted-foreground">
        {info === null ? "Loading" : kind === "binary" ? "No preview for this type" : "Too large to preview"}
      </span>
    </div>
  );
}

export type PreviewTarget =
  | { kind: "file"; path: string; title: string; subtitle: string }
  | { kind: "command"; title: string; subtitle: string; icon: IconName; category?: string };

export const SpotlightPreview = memo(function SpotlightPreview({ target }: { target: PreviewTarget }) {
  const path = target.kind === "file" ? target.path : null;
  const [info, setInfo] = useState<{ path: string; data: FileInfo } | null>(null);

  useEffect(() => {
    if (!path) return;
    const cached = cache.get(path);
    if (cached) {
      setInfo({ path, data: cached });
      return;
    }
    let cancelled = false;
    // Debounced: a pointer sweeping the list reads only where it settles.
    const timer = window.setTimeout(() => {
      void loadInfo(path).then((data) => {
        if (!cancelled) setInfo({ path, data });
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [path]);

  if (target.kind === "command") {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex h-[150px] items-center justify-center rounded-xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm">
            <Icon name={target.icon} size="xl" className="text-primary" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{target.title}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{target.subtitle}</div>
        </div>
        <div className="mt-auto space-y-1 border-t border-border/60 pt-2.5">
          <MetaRow label="Kind" value="Command" />
          {target.category ? <MetaRow label="Category" value={target.category} /> : null}
          <MetaRow label="Run" value="Enter" />
        </div>
      </div>
    );
  }

  const data = info?.path === target.path ? info.data : null;
  const kind = previewKind(target.path);
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="h-[170px] shrink-0 overflow-hidden rounded-xl border border-border/60">
        {/* Keyed on the path: image dimensions and load state belong to one file. */}
        <FileVisual key={target.path} path={target.path} name={target.title} info={data} />
      </div>
      <div className="flex min-w-0 items-start gap-2">
        <FileTypeIcon name={target.title} className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{target.title}</div>
          <div className="truncate text-[10.5px] text-muted-foreground" title={target.path}>
            {target.subtitle || "Workspace root"}
          </div>
        </div>
      </div>
      <div className="mt-auto space-y-1 border-t border-border/60 pt-2.5">
        <MetaRow label="Type" value={typeLabel(target.path)} />
        <MetaRow label="Size" value={data?.size != null ? formatBytes(data.size) : "..."} />
        <MetaRow label="Modified" value={data?.mtime != null ? relativeTime(data.mtime) : "..."} />
        {(kind === "code" || kind === "text") && data?.totalLines != null ? (
          <MetaRow label="Lines" value={data.totalLines.toLocaleString()} />
        ) : null}
      </div>
    </div>
  );
});
