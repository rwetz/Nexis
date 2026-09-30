// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon, type IconName } from "@/components/icon";
import { MarkdownCode } from "@/components/ai-elements/markdown-code";
import { cn } from "@/lib/utils";
import { filesystem } from "@/platform/filesystem";
import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; content: string }
  | { kind: "binary" }
  | { kind: "toolarge"; size: number; limit: number }
  | { kind: "error"; message: string };

type ViewMode = "preview" | "raw" | "split";

type Props = {
  path: string;
  visible: boolean;
  /** Open this file in the rich editor. Absent when the Documents pack is off. */
  onEdit?: (path: string) => void;
};

const components = { code: MarkdownCode };

const STORAGE_KEY = "nexis.markdown.viewMode";

function readViewMode(): ViewMode {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "raw" || v === "split") return v;
  } catch {
    // ignore
  }
  return "preview";
}

function writeViewMode(mode: ViewMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

/** The file's text, or why there is none. Re-reads when the path changes. */
function useMarkdownFile(path: string): Status {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    filesystem.readFile(path)
      .then((res) => {
        if (cancelled) return;
        if (res.kind === "text") {
          setStatus({ kind: "ready", content: res.content });
        } else if (res.kind === "binary") {
          setStatus({ kind: "binary" });
        } else {
          setStatus({
            kind: "toolarge",
            size: res.size,
            limit: res.limit,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setStatus({ kind: "error", message: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return status;
}

/**
 * File name, the three view modes, and (when the Documents pack is on) Edit,
 * which opens the file in the rich-text editor.
 */
function PreviewToolbar({
  path,
  mode,
  onMode,
  onEdit,
}: {
  path: string;
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  onEdit?: (path: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-card/60 px-3 py-1">
      <span className="truncate font-mono text-[10.5px] text-muted-foreground/70">
        {path.split(/[\\/]/).pop()}
      </span>
      <div className="flex items-center gap-0.5">
        <ModeButton icon={"sidebar-right"} label="Preview" active={mode === "preview"} onClick={() => onMode("preview")} />
        <ModeButton icon={"layout-left"} label="Split" active={mode === "split"} onClick={() => onMode("split")} />
        <ModeButton icon={"source"} label="Raw" active={mode === "raw"} onClick={() => onMode("raw")} />
        {onEdit ? (
          <>
            <span aria-hidden className="mx-1 h-3.5 w-px bg-border/70" />
            <button
              type="button"
              onClick={() => onEdit(path)}
              title="Edit in the rich-text editor"
              className="flex h-6 cursor-pointer items-center gap-1 rounded px-1.5 text-[10.5px] text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
            >
              <Icon name="edit" size="xs" />
              Edit
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Every state but "ready": loading, or why the file cannot be shown. */
function StatusMessage({ status }: { status: Exclude<Status, { kind: "ready" }> }) {
  if (status.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[12px] text-muted-foreground">Loading…</p>
      </div>
    );
  }
  const text =
    status.kind === "error"
      ? `Failed to read file: ${status.message}`
      : status.kind === "binary"
        ? "Binary file — cannot render as markdown."
        : `File is ${status.size} bytes; limit ${status.limit}.`;
  return (
    <div className="px-6 py-4">
      <p className={cn("text-[12px]", status.kind === "error" ? "text-destructive" : "text-muted-foreground")}>{text}</p>
    </div>
  );
}

/** The rendered markdown, its source, or both side by side. */
function MarkdownBody({ content, mode }: { content: string; mode: ViewMode }) {
  const split = mode === "split";
  return (
    <div className={cn("flex h-full min-h-0", split ? "flex-row" : "flex-col")}>
      {mode !== "raw" && (
        <div
          className={cn(
            "min-h-0 overflow-auto px-6 py-4",
            split ? "w-1/2 flex-shrink-0 border-r border-border/40" : "flex-1",
          )}
        >
          <Streamdown className="prose-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" components={components}>
            {content}
          </Streamdown>
        </div>
      )}
      {mode !== "preview" && (
        <div className={cn("min-h-0 overflow-auto", split ? "flex-1" : "flex-1 px-6 py-4")}>
          <pre
            className={cn(
              "h-full font-mono text-[12px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words",
              split && "px-6 py-4",
            )}
          >
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

export function MarkdownPreviewPane({ path, visible, onEdit }: Props) {
  const status = useMarkdownFile(path);
  const [mode, setModeState] = useState<ViewMode>(readViewMode);

  const setMode = (m: ViewMode) => {
    setModeState(m);
    writeViewMode(m);
  };

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background",
        !visible && "pointer-events-none",
      )}
    >
      <PreviewToolbar path={path} mode={mode} onMode={setMode} onEdit={onEdit} />

      {/* Content area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {status.kind === "ready" ? <MarkdownBody content={status.content} mode={mode} /> : <StatusMessage status={status} />}
      </div>
    </div>
  );
}

function ModeButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[10.5px] outline-none transition-colors",
        "focus-visible:ring-1 focus-visible:ring-primary/40",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
      )}
    >
      <Icon name={icon} />
    </button>
  );
}
