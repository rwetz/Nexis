// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The bottom panel's permanent handle.
 *
 * A panel reachable only by a keybinding is a panel nobody finds: closed, it
 * left no mark anywhere, and the Problems pill beside it only shows when there
 * are problems. This is the pointer's way to what Ctrl/Cmd+J does, and it
 * names the binding in its tooltip so the pointer teaches the keyboard.
 */

import { Icon } from "@/components/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KEY_SEP } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useBottomPanelStore } from "@/modules/bottom-panel";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getBindingTokens, SHORTCUTS } from "@/modules/shortcuts/shortcuts";

export function PanelToggle() {
  const open = useBottomPanelStore((s) => s.open);
  const toggle = useBottomPanelStore((s) => s.toggle);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const def = SHORTCUTS.find((s) => s.id === "panel.toggle");
  const binding = (userShortcuts["panel.toggle"] ?? def?.defaultBindings)?.[0];
  const keys = binding ? getBindingTokens(binding).join(KEY_SEP) : "";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={open}
          aria-label={open ? "Hide bottom panel" : "Show bottom panel"}
          className={cn(
            "flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[10.5px] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            open
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon name="panel-bottom" size="xs" active={open} />
          <span>Panel</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        {open ? "Hide" : "Show"} the bottom panel{keys ? ` (${keys})` : ""}
      </TooltipContent>
    </Tooltip>
  );
}
