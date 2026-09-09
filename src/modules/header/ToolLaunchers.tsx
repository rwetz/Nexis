// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { openToolWindow, type ToolWindowKind } from "@/modules/window/toolWindow";

const TOOLS: ReadonlyArray<{
  kind: ToolWindowKind;
  label: string;
  icon: "globe" | "activity";
  title: string;
}> = [
  { kind: "atlas", label: "Atlas", icon: "globe", title: "Open Atlas" },
  { kind: "benchmark", label: "Benchmark", icon: "activity", title: "Open Benchmark" },
];

/** Persistent launchers for the two companion-app windows. */
export function ToolLaunchers({ compact }: { compact: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-l border-border pl-1">
      {TOOLS.map((tool) => (
        <Button
          key={tool.kind}
          type="button"
          variant="ghost"
          size={compact ? "icon-sm" : "xs"}
          title={tool.title}
          aria-label={tool.title}
          onClick={() => void openToolWindow(tool.kind)}
          className="rounded-md text-muted-foreground hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]"
        >
          <Icon name={tool.icon} size="sm" />
          {!compact && <span>{tool.label}</span>}
        </Button>
      ))}
    </div>
  );
}
