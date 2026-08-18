// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * ReplPanel — an embedded interactive REPL panel.
 *
 * Opens a TerminalPane with a stable leaf ID, then immediately writes the
 * chosen REPL command into it (e.g. `python3`, `node`).  The result is a
 * full interactive REPL — readline editing, colours, tab completion — in a
 * compact sidebar pane.
 *
 * sendToRepl(text) is exported so App.tsx can wire up "Send selection"
 * from the editor.
 */
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  respawnSession,
  useTerminalSession,
} from "@/modules/terminal/lib/useTerminalSession";

// A stable leaf ID reserved for the embedded REPL.  High enough to never
// collide with incrementing tab leaf IDs (which start from 1).
export const REPL_LEAF_ID = 8_000_001;

/** External entry-point: send text to the active REPL (if running). */
let _replWriteFn: ((text: string) => void) | null = null;
export function sendToRepl(text: string): boolean {
  if (_replWriteFn) {
    _replWriteFn(text);
    return true;
  }
  return false;
}

type ReplConfig = {
  id: string;
  label: string;
  command: string;
  color: string;
};

const REPL_CONFIGS: ReplConfig[] = [
  { id: "python", label: "Python", command: "python3", color: "text-blue-400" },
  { id: "node", label: "Node.js", command: "node", color: "text-green-400" },
  { id: "ruby", label: "Ruby", command: "irb", color: "text-red-400" },
  { id: "shell", label: "Shell", command: "", color: "text-muted-foreground" },
];

// ── Tiny inline terminal hook ─────────────────────────────────────────────────
// We can't use the full TerminalPane JSX here because we don't have a slot in
// the renderer pool.  Instead, we expose a raw PTY session and render output
// into a pre-element.  This is intentionally simpler than the full terminal.

type ReplSessionState = "idle" | "starting" | "running" | "exited";

export function ReplPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState("python");
  const [sessionState, setSessionState] = useState<ReplSessionState>("idle");

  const selected = REPL_CONFIGS.find((r) => r.id === selectedId) ?? REPL_CONFIGS[0];

  const session = useTerminalSession({
    leafId: REPL_LEAF_ID,
    container: containerRef,
    visible: sessionState !== "idle",
    focused: true,
    onExit: () => setSessionState("exited"),
  });

  // Register global write fn
  useEffect(() => {
    _replWriteFn = (text: string) => {
      session.write(text);
    };
    return () => {
      if (_replWriteFn === session.write) _replWriteFn = null;
    };
  }, [session]);

  const startRepl = useCallback(async () => {
    setSessionState("starting");
    // If the previous REPL process has exited, we need to respawn the PTY
    // before we can write a new REPL command into it.
    if (sessionState === "exited") {
      await respawnSession(REPL_LEAF_ID);
    }
    // Tiny delay so the PTY is ready to accept writes
    setTimeout(() => {
      const cmd = selected.command ? `${selected.command}\r` : "";
      if (cmd) session.write(cmd);
      setSessionState("running");
    }, 400);
  }, [selected, session, sessionState]);

  const stopRepl = useCallback(() => {
    // Send EOF (Ctrl+D) — cleanly exits most REPLs (python, node, irb, shells)
    // The onExit callback will fire and transition state to "exited".
    session.write("\x04");
  }, [session]);

  const isRunning = sessionState === "running" || sessionState === "starting";
  const isExited = sessionState === "exited";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          REPL
        </span>
        <div className="flex items-center gap-1">
          {isRunning ? (
            <button
              type="button"
              onClick={stopRepl}
              title="Stop REPL"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/10"
            >
              <Icon name="close" size="xs" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startRepl()}
              title={`Start ${selected.label} REPL`}
              className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
            >
              <Icon name="play" size="xs" />
              Start
            </button>
          )}
        </div>
      </div>

      {/* REPL selector */}
      {!isRunning && (
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-border/30 px-3 py-2">
          {REPL_CONFIGS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedId(r.id)}
              className={cn(
                "rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors",
                selectedId === r.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* Status bar when running */}
      {(isRunning || isExited) && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border/30 px-3 py-1">
          <span className={cn("text-[10px] font-medium", selected.color)}>
            {selected.label}
          </span>
          {isExited && (
            <span className="text-[10px] text-muted-foreground">(exited)</span>
          )}
          <span className="ml-auto text-[9px] text-muted-foreground/50">
            Ctrl+D to exit
          </span>
        </div>
      )}

      {/* Terminal container */}
      <div
        ref={containerRef}
        className={cn(
          "zoom-exempt min-h-0 flex-1",
          sessionState === "idle" && "invisible pointer-events-none h-0 flex-none",
        )}
        style={{ visibility: sessionState !== "idle" ? "visible" : "hidden" }}
      />

      {/* Idle placeholder */}
      {sessionState === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <Icon name="terminal" size="xl" className="text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">
            Select a REPL and press <span className="font-semibold">Start</span>.
          </p>
          <p className="text-[10px] text-muted-foreground/60">
            Use <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[9px]">Alt+Shift+R</kbd> to send the editor selection here.
          </p>
        </div>
      )}
    </div>
  );
}
