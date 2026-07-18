// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useEffect, useRef, useState } from "react";
import { basename } from "@/lib/path";
import { IS_MAC, IS_WINDOWS, IS_LINUX } from "@/lib/platform";
import {
  generateNlCommand,
  type NlCommandResult,
} from "@/modules/ai/lib/nlCommand";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; result: NlCommandResult }
  | { kind: "error"; message: string };

type Props = {
  cwd: string | null;
  /** Insert the command at the shell prompt (no newline — the user's Enter
   * is the confirmation). */
  onInsert: (command: string) => void;
  onClose: () => void;
};

const PLATFORM = IS_MAC ? "macos" : IS_WINDOWS ? "windows" : IS_LINUX ? "linux" : "";

/**
 * Floating "describe what you want to run" bar over the terminal pane
 * (Warp's AI Command Search). Enter asks the model; a second Enter inserts
 * the suggestion at the prompt. Nothing is ever executed from here.
 */
export function AiCommandBar({ cwd, onInsert, onClose }: Props) {
  const [intent, setIntent] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The intent text the current result answers — a re-Enter with unchanged
  // text inserts; edited text re-asks.
  const askedRef = useRef<string | null>(null);
  const defaultShellPath = usePreferencesStore((s) => s.defaultShellPath);

  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  const ask = async () => {
    const text = intent.trim();
    if (!text) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    askedRef.current = text;
    setPhase({ kind: "loading" });
    try {
      const shell = defaultShellPath.trim()
        ? basename(defaultShellPath.trim())
        : null;
      const result = await generateNlCommand(
        text,
        { platform: PLATFORM, shell, cwd },
        { abortSignal: ac.signal },
      );
      if (ac.signal.aborted) return;
      setPhase({ kind: "result", result });
    } catch (e) {
      if (ac.signal.aborted) return;
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const insert = (command: string) => {
    if (!command) return;
    onInsert(command);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (
        phase.kind === "result" &&
        phase.result.command &&
        askedRef.current === intent.trim()
      ) {
        insert(phase.result.command);
        return;
      }
      void ask();
    }
  };

  return (
    <div
      className="absolute left-1/2 top-3 z-50 w-[min(560px,92%)] -translate-x-1/2 rounded-lg border border-border bg-card/95 shadow-lg backdrop-blur-sm"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="shrink-0 text-[13px] text-brand">✦</span>
        <input
          ref={inputRef}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Describe what you want to run…"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        <span className="shrink-0 text-[10px] text-muted-foreground/70">
          {phase.kind === "result" && phase.result.command
            ? "↵ insert · esc close"
            : "↵ ask · esc close"}
        </span>
      </div>

      {phase.kind === "loading" && (
        <div className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="inline-block animate-pulse">Thinking…</span>
        </div>
      )}

      {phase.kind === "result" && (
        <div className="border-t border-border/60 px-3 py-2">
          {phase.result.command ? (
            <>
              <pre className="overflow-x-auto rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[11.5px] leading-relaxed text-foreground">
                {phase.result.command}
              </pre>
              {phase.result.explanation && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {phase.result.explanation}
                </p>
              )}
              {phase.result.warning && (
                <p className="mt-1 text-[11px] leading-relaxed text-amber-500">
                  ⚠ {phase.result.warning}
                </p>
              )}
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => insert(phase.result.command)}
                  className="rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Insert at prompt
                </button>
              </div>
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {phase.result.explanation || "The model declined to suggest a command."}
            </p>
          )}
        </div>
      )}

      {phase.kind === "error" && (
        <div className="border-t border-border/60 px-3 py-2">
          <p className="text-[11px] leading-relaxed text-rose-400">
            {phase.message}
          </p>
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={() => void openSettingsWindow("models")}
              className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            >
              Open Settings → Models
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
