// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  type PermanentToolId,
  visiblePermanentTools,
} from "./permanentTools";

/**
 * The durable, pack-aware workbench shelf in the titlebar. Its caller owns
 * opening a tool because each one can choose the right Nexis surface (a tab,
 * a focused companion window, and so on) without this presentational chrome
 * knowing about tab state.
 */
export function PermanentToolShelf({
  compact,
  onOpenTool,
}: {
  compact: boolean;
  onOpenTool: (tool: PermanentToolId) => void;
}) {
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  const tools = visiblePermanentTools(enabledPacks);

  if (tools.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-l border-border pl-1">
      {tools.map((tool) => (
        <Button
          key={tool.id}
          type="button"
          variant="ghost"
          size={compact ? "icon-sm" : "xs"}
          title={tool.title}
          aria-label={tool.title}
          onClick={() => onOpenTool(tool.id)}
          className="gap-1.5 rounded-md text-muted-foreground hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]"
        >
          <Icon name={tool.icon} size="sm" />
          {!compact && <span>{tool.label}</span>}
        </Button>
      ))}
    </div>
  );
}
