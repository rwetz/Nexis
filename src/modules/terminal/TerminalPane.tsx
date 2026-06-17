// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useTheme } from "@/modules/theme";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SearchAddon } from "@xterm/addon-search";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTerminalSession } from "./lib/useTerminalSession";
import { useTerminalSuggestions } from "./lib/useTerminalSuggestions";
import { useRecording } from "./lib/useRecording";
import { TerminalSuggestionOverlay } from "./components/TerminalSuggestionOverlay";

export type TerminalPaneHandle = {
  write: (data: string) => void;
  focus: () => void;
  getBuffer: (maxLines?: number) => string | null;
  getSelection: () => string | null;
};

type Props = {
  /** Stable identifier for this leaf (passed back through callbacks). */
  leafId: number;
  /** Tab containing this pane is on screen. */
  visible: boolean;
  /** This leaf is the active pane within its tab — receives auto-focus. */
  focused?: boolean;
  initialCwd?: string;
  onSearchReady?: (leafId: number, addon: SearchAddon) => void;
  onExit?: (leafId: number, code: number) => void;
  onCwd?: (leafId: number, cwd: string) => void;
  onTitle?: (leafId: number, title: string) => void;
};

function quotePathForShell(p: string): string {
  return `"${p.replace(/"/g, '\\"')}"`;
}

export const TerminalPane = forwardRef<TerminalPaneHandle, Props>(
  function TerminalPane(
    {
      leafId,
      visible,
      focused = true,
      initialCwd,
      onSearchReady,
      onExit,
      onCwd,
      onTitle,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { resolvedMode, themeId, customThemes } = useTheme();
    const [isDragOver, setIsDragOver] = useState(false);

    const { suggestion } = useTerminalSuggestions(leafId);
    const { isRecording, startRecording, stopAndSave } = useRecording(leafId);
    const [savedToast, setSavedToast] = useState<string | null>(null);

    const session = useTerminalSession({
      leafId,
      container: containerRef,
      visible,
      focused,
      initialCwd,
      onSearchReady: (a) => onSearchReady?.(leafId, a),
      onExit: (c) => onExit?.(leafId, c),
      onCwd: (c) => onCwd?.(leafId, c),
      onTitle: (t) => onTitle?.(leafId, t),
    });

    useEffect(() => {
      // Defer one frame so CSS-variable token resolution sees the new class.
      const id = requestAnimationFrame(() => session.applyTheme());
      return () => cancelAnimationFrame(id);
    }, [resolvedMode, themeId, customThemes, session]);

    useImperativeHandle(
      ref,
      () => ({
        write: (data: string) => session.write(data),
        focus: () => session.focus(),
        getBuffer: (max?: number) => session.getBuffer(max),
        getSelection: () => session.getSelection(),
      }),
      [session],
    );

    const handleDragOver = (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsDragOver(false);
      }
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      const paths = files
        .map((f) => (f as unknown as { path?: string }).path)
        .filter((p): p is string => typeof p === "string" && p.length > 0)
        .map(quotePathForShell);
      if (paths.length === 0) return;
      session.write(paths.join(" "));
      session.focus();
    };

    const handleRecordToggle = async () => {
      if (isRecording) {
        const path = await stopAndSave();
        if (path) {
          setSavedToast(path);
          setTimeout(() => setSavedToast(null), 4000);
        }
      } else {
        startRecording();
      }
    };

    return (
      <div
        ref={containerRef}
        className="zoom-exempt group relative h-full w-full"
        style={{
          visibility: visible ? "visible" : "hidden",
          pointerEvents: visible ? "auto" : "none",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-md border-2 border-dashed border-brand bg-brand/10 backdrop-blur-[1px]">
            <span className="brand-glow rounded-md bg-card/90 px-3 py-1.5 text-xs font-medium text-brand shadow">
              Drop to paste path
            </span>
          </div>
        )}
        {suggestion && visible && (
          <TerminalSuggestionOverlay
            text={suggestion.text}
            x={suggestion.x}
            y={suggestion.y}
          />
        )}

        {/* Recording toggle — top-right corner, visible on hover or while recording */}
        {visible && (
          <div className={`absolute right-2 top-2 z-40 transition-opacity duration-150 ${isRecording ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void handleRecordToggle()}
                  aria-label={isRecording ? "Stop recording" : "Start recording"}
                  className={`flex h-5 w-5 items-center justify-center rounded-full border text-[8px] font-bold shadow-sm transition-colors ${
                    isRecording
                      ? "border-red-500/70 bg-red-500/10 text-red-500 hover:bg-red-500/20"
                      : "border-border/60 bg-card/80 text-muted-foreground hover:bg-muted hover:border-red-400/60 hover:text-red-400"
                  }`}
                >
                  {isRecording ? (
                    <span className="h-2 w-2 rounded-sm bg-red-500" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-current" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                {isRecording ? "Stop recording" : "Record terminal session"}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Saved notification toast */}
        {savedToast && visible && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-50 max-w-[280px] rounded-md border border-border/50 bg-card/95 px-3 py-2 shadow-md">
            <p className="text-[10px] font-medium text-foreground">Recording saved</p>
            <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">{savedToast}</p>
          </div>
        )}
      </div>
    );
  },
);
