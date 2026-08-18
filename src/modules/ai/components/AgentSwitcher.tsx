// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon, type IconName } from "@/components/icon";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import type { AgentIconId } from "../lib/agents";
import { useAgentsStore } from "../store/agentsStore";

const ICONS: Record<AgentIconId, IconName> = {
  coder: "code",
  architect: "architect",
  reviewer: "edit",
  security: "security",
  designer: "brush",
  spark: "sparkle",
};

export function AgentSwitcher({ isMiniWindow }: { isMiniWindow?: boolean }) {
  // Subscribe to customAgents + activeId so the trigger updates live.
  const customAgents = useAgentsStore((s) => s.customAgents);
  const activeId = useAgentsStore((s) => s.activeId);
  const setActiveId = useAgentsStore((s) => s.setActiveId);

  // `all()` returns a fresh [...builtins, ...customAgents]; memoize it on the
  // subscribed customAgents so the list is stable and updates reactively —
  // no getState() snapshot + `void` keep-alive hack.
  const list = useMemo(() => useAgentsStore.getState().all(), [customAgents]);

  const active = list.find((a) => a.id === activeId) ?? list[0];
  const builtIn = list.filter((a) => a.builtIn);
  const custom = list.filter((a) => !a.builtIn);
  const activeIconName = ICONS[active.icon] ?? "sparkle";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="xs"
          variant="outline"
          className={cn(
            !isMiniWindow
              ? "flex h-6 items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 text-[10.5px] text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
              : "text-xs mr-1",
          )}
          title={`Agent: ${active.name}`}
        >
          <Icon name={activeIconName} size="xs" />
          <span className="max-w-[7rem] truncate">{active.name}</span>
          <Icon name="chevron-down" size="xs" className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        <div className="px-2 pt-1.5 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Built-in
        </div>
        {builtIn.map((a) => {
          const iconName = ICONS[a.icon] ?? "sparkle";
          return (
            <DropdownMenuItem
              key={a.id}
              onSelect={() => setActiveId(a.id)}
              className={cn(
                "flex items-start gap-2 pr-2 text-[12px]",
                a.id === activeId && "bg-accent/40",
              )}
            >
              <Icon
                name={iconName}
                className={cn( "mt-0.5", a.id === activeId ? "text-foreground" : "text-muted-foreground", )}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{a.name}</span>
                <span className="line-clamp-1 text-[10.5px] text-muted-foreground">
                  {a.description}
                </span>
              </span>
              {a.id === activeId ? (
                <Icon name="check" className="mt-0.5 shrink-0 text-foreground" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {custom.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 pt-1 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Custom
            </div>
            {custom.map((a) => {
              const iconName = ICONS[a.icon] ?? "sparkle";
              return (
                <DropdownMenuItem
                  key={a.id}
                  onSelect={() => setActiveId(a.id)}
                  className={cn(
                    "flex items-start gap-2 text-[12px]",
                    a.id === activeId && "bg-accent/40",
                  )}
                >
                  <Icon name={iconName} className="mt-0.5 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{a.name}</span>
                    {a.description ? (
                      <span className="line-clamp-1 text-[10.5px] text-muted-foreground">
                        {a.description}
                      </span>
                    ) : null}
                  </span>
                  {a.id === activeId ? (
                    <Icon name="check" className="mt-0.5 shrink-0 text-foreground" />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void openSettingsWindow("agents")}
          className="gap-2 text-[12px] text-muted-foreground"
        >
          <Icon name="settings" />
          Manage agents…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ICONS as AGENT_ICONS };
