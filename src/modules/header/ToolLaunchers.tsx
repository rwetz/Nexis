// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { CAPABILITY_TOOL_WINDOWS } from "@/capabilities";
import { openToolWindow } from "@/modules/window/toolWindow";

/** Persistent launchers for the two companion-app windows. */
export function ToolLaunchers({ compact }: { compact: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 pl-1">
      {CAPABILITY_TOOL_WINDOWS.map((tool) => (
        <Button
          key={tool.id}
          type="button"
          variant="ghost"
          size={compact ? "icon-sm" : "xs"}
          title={`Open ${tool.label}`}
          aria-label={`Open ${tool.label}`}
          onClick={() => void openToolWindow(tool)}
          className="rounded-md text-muted-foreground hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]"
        >
          <Icon name={tool.icon} size="sm" />
          {!compact && <span>{tool.label}</span>}
        </Button>
      ))}
    </div>
  );
}
