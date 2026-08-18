// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon, type IconName } from "@/components/icon";
import { MarkdownCode } from "@/components/ai-elements/markdown-code";
import { cn } from "@/lib/utils";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

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

export function MarkdownPreviewPane({ path, visible }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [mode, setModeState] = useState<ViewMode>(readViewMode);

  const setMode = (m: ViewMode) => {
    setModeState(m);
    writeViewMode(m);
  };

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    invoke<ReadResult>("fs_read_file", {
      path,
      workspace: currentWorkspaceEnv(),
    })
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

  const content = status.kind === "ready" ? status.content : null;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background",
        !visible && "pointer-events-none",
      )}
    >
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-card/60 px-3 py-1">
        <span className="truncate font-mono text-[10.5px] text-muted-foreground/70">
          {path.split(/[\\/]/).pop()}
        </span>
        <div className="flex items-center gap-0.5">
          <ModeButton
            icon={"sidebar-right"}
            label="Preview"
            active={mode === "preview"}
            onClick={() => setMode("preview")}
          />
          <ModeButton
            icon={"layout-left"}
            label="Split"
            active={mode === "split"}
            onClick={() => setMode("split")}
          />
          <ModeButton
            icon={"source"}
            label="Raw"
            active={mode === "raw"}
            onClick={() => setMode("raw")}
          />
        </div>
      </div>

      {/* Content area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {status.kind === "loading" && (
          <div className="flex h-full items-center justify-center">
            <p className="text-[12px] text-muted-foreground">Loading…</p>
          </div>
        )}
        {status.kind === "error" && (
          <div className="px-6 py-4">
            <p className="text-[12px] text-destructive">
              Failed to read file: {status.message}
            </p>
          </div>
        )}
        {status.kind === "binary" && (
          <div className="px-6 py-4">
            <p className="text-[12px] text-muted-foreground">
              Binary file — cannot render as markdown.
            </p>
          </div>
        )}
        {status.kind === "toolarge" && (
          <div className="px-6 py-4">
            <p className="text-[12px] text-muted-foreground">
              File is {status.size} bytes; limit {status.limit}.
            </p>
          </div>
        )}
        {content !== null && (
          <div
            className={cn(
              "flex h-full min-h-0",
              mode === "split" ? "flex-row" : "flex-col",
            )}
          >
            {(mode === "preview" || mode === "split") && (
              <div
                className={cn(
                  "min-h-0 overflow-auto px-6 py-4",
                  mode === "split"
                    ? "w-1/2 flex-shrink-0 border-r border-border/40"
                    : "flex-1",
                )}
              >
                <Streamdown
                  className="prose-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                  components={components}
                >
                  {content}
                </Streamdown>
              </div>
            )}
            {(mode === "raw" || mode === "split") && (
              <div
                className={cn(
                  "min-h-0 overflow-auto",
                  mode === "split" ? "flex-1" : "flex-1 px-6 py-4",
                )}
              >
                <pre
                  className={cn(
                    "h-full font-mono text-[12px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words",
                    mode === "split" && "px-6 py-4",
                  )}
                >
                  {content}
                </pre>
              </div>
            )}
          </div>
        )}
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
