// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Command } from "cmdk";
import type { PackId } from "@/lib/packs";
import { cn } from "@/lib/utils";
import { Search01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

export type CommandDef = {
  id: string;
  label: string;
  description?: string;
  category: string;
  icon?: typeof Settings01Icon;
  action: () => void;
  keywords?: string[];
  /** Expansion pack that owns the targeted feature (see src/lib/packs.ts).
   * The caller filters out commands of disabled packs before rendering.
   * Omit for core commands. */
  pack?: PackId;
};

type Props = {
  commands: CommandDef[];
  onClose: () => void;
};

export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const categories = [...new Set(commands.map((c) => c.category))].sort();

  return (
    <div
      className="pointer-events-none absolute inset-0 z-50 flex items-start justify-center pt-12"
      onClick={onClose}
    >
      <Command
        className="pointer-events-auto flex max-h-[60vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        label="Command Palette"
        filter={(value, search) => {
          const q = search.toLowerCase();
          const v = value.toLowerCase();
          return v.includes(q) ? 1 : 0;
        }}
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2.5">
          <HugeiconsIcon
            icon={Search01Icon}
            size={14}
            strokeWidth={1.75}
            className="shrink-0 text-muted-foreground"
          />
          <Command.Input
            ref={inputRef as React.Ref<HTMLInputElement>}
            value={query}
            onValueChange={setQuery}
            placeholder="Type a command…"
            className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
          <kbd className="rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        <Command.List className="flex-1 overflow-y-auto py-1">
          <Command.Empty className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            No commands found
          </Command.Empty>

          {categories.map((cat) => {
            const catCommands = commands.filter((c) => c.category === cat);
            return (
              <Command.Group
                key={cat}
                heading={cat}
                className="[&>[cmdk-group-heading]]:px-3 [&>[cmdk-group-heading]]:py-1.5 [&>[cmdk-group-heading]]:text-[10px] [&>[cmdk-group-heading]]:font-semibold [&>[cmdk-group-heading]]:uppercase [&>[cmdk-group-heading]]:tracking-wider [&>[cmdk-group-heading]]:text-muted-foreground/70"
              >
                {catCommands.map((cmd) => (
                  <Command.Item
                    key={cmd.id}
                    value={`${cmd.label} ${cmd.keywords?.join(" ") ?? ""}`}
                    onSelect={() => {
                      onClose();
                      cmd.action();
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2 text-[12.5px] outline-none",
                      "data-[selected=true]:bg-muted/60 data-[selected=true]:text-foreground",
                      "rounded-lg mx-1",
                    )}
                  >
                    {cmd.icon && (
                      <HugeiconsIcon
                        icon={cmd.icon}
                        size={14}
                        strokeWidth={1.75}
                        className="shrink-0 text-muted-foreground"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-foreground">{cmd.label}</span>
                      {cmd.description && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          {cmd.description}
                        </span>
                      )}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            );
          })}
        </Command.List>
      </Command>
    </div>
  );
}
