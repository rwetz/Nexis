// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Icon } from "@/components/icon";
import { installHint } from "@/lib/externalTools";
import { useMissingTools, visibleMissingTools } from "@/lib/missingTools";
import { cn } from "@/lib/utils";
import { currentWorkspaceEnv } from "@/modules/workspace/env";
import { useState } from "react";

/**
 * Status-bar notice for external tools Nexis wanted but could not find.
 *
 * Nexis shells out to language servers, formatters, and git rather than
 * bundling them — that is what keeps the binary small. The cost of that
 * choice is silence: without this, a missing `rust-analyzer` means
 * completions just never appear and nothing anywhere says why. Each entry
 * names what stopped working and the command that fixes it.
 *
 * Renders nothing when everything resolved, so the common case is invisible.
 *
 * The refresh button is what closes the loop. Entries are raised lazily, by
 * whatever tried to use a tool and failed, so nothing re-checks after the user
 * runs the install command we handed them — the notice used to sit there
 * claiming a tool was missing minutes after it was installed. Refresh re-probes
 * every listed tool and retires the ones that now resolve.
 */
export function MissingToolsPill() {
  const missing = useMissingTools((s) => s.missing);
  const dismissed = useMissingTools((s) => s.dismissed);
  const dismiss = useMissingTools((s) => s.dismiss);
  const refresh = useMissingTools((s) => s.refresh);
  const refreshing = useMissingTools((s) => s.refreshing);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  // Only set when a refresh changed nothing: the success case needs no words,
  // because the entry it cleared has already vanished from the list.
  const [note, setNote] = useState<string | null>(null);

  // Both selectors return the store's own arrays; the derived list is built
  // here in the render body (CLAUDE.md pitfall #14).
  const tools = visibleMissingTools(missing, dismissed);
  if (tools.length === 0) return null;

  const recheck = () => {
    setNote(null);
    void refresh(currentWorkspaceEnv()).then((result) => {
      if (result.error) setNote("Check failed");
      else if (result.cleared.length === 0) setNote("Still not found");
      else return;
      // Transient, like the copy confirmation: it answers "did that do
      // anything", and a permanent label would read as part of the panel.
      setTimeout(() => setNote(null), 2500);
    });
  };

  const copy = (id: string, cmd: string) => {
    void navigator.clipboard?.writeText(cmd).then(
      () => {
        setCopied(id);
        setTimeout(() => setCopied(null), 1500);
      },
      () => {},
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${tools.length} tool${tools.length > 1 ? "s" : ""} not installed`}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] transition-colors",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon name="alert" size="xs" />
          <span>
            {tools.length} tool{tools.length > 1 ? "s" : ""} missing
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent side="top" align="end" sideOffset={6} className="w-80 p-2">
        <div className="mb-1.5 flex items-center gap-2 px-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Not installed
          </p>
          {note ? (
            <span className="text-[10px] text-muted-foreground/60">{note}</span>
          ) : null}
          <button
            type="button"
            onClick={recheck}
            disabled={refreshing}
            title="Check again"
            aria-label="Check again"
            className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Icon
              name="refresh"
              size="xs"
              className={cn(refreshing && "nexis-spin")}
            />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {tools.map((tool) => {
            const cmd = installHint(tool);
            return (
              <div
                key={tool.id}
                className="group rounded border border-border/50 p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] font-medium text-foreground">
                      {tool.name}
                    </p>
                    <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                      {tool.enables}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(tool.id)}
                    title="Hide for this session"
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  >
                    <Icon name="close" size="xs" />
                  </button>
                </div>

                {cmd ? (
                  <button
                    type="button"
                    onClick={() => copy(tool.id, cmd)}
                    title="Copy install command"
                    className="mt-1.5 flex w-full items-center gap-1.5 rounded bg-muted/60 px-1.5 py-1 text-left font-mono text-[10px] text-foreground transition-colors hover:bg-muted"
                  >
                    <Icon
                      name="copy"
                      size="xs"
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="truncate">
                      {copied === tool.id ? "Copied" : cmd}
                    </span>
                  </button>
                ) : tool.docsUrl ? (
                  <p className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground">
                    {tool.docsUrl}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
