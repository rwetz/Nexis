// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import type { PythonEnv } from "./usePythonEnv";

type Props = {
  envs: PythonEnv[];
  activeEnv: PythonEnv | null;
  loading: boolean;
  onSelect: (env: PythonEnv | null) => void;
  onRefresh: () => void;
};

function envLabel(env: PythonEnv): string {
  if (env.version) return `${env.name} (${env.version})`;
  return env.name;
}

function kindDot(kind: PythonEnv["kind"]): string {
  switch (kind) {
    case "venv":
      return "bg-emerald-500";
    case "conda":
      return "bg-sky-500";
    case "system":
      return "bg-muted-foreground/50";
  }
}

export function PythonEnvPill({
  envs,
  activeEnv,
  loading,
  onSelect,
  onRefresh,
}: Props) {
  if (envs.length === 0 && !loading) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors",
            "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
          )}
        >
          <Icon name="brand-python" size="xs" className="shrink-0" />
          {loading ? (
            <span className="opacity-60">Python…</span>
          ) : activeEnv ? (
            <>
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  kindDot(activeEnv.kind),
                )}
              />
              <span className="max-w-40 truncate">{envLabel(activeEnv)}</span>
            </>
          ) : (
            <span className="opacity-60">No env</span>
          )}
          <Icon name="chevron-down" size="xs" className="shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={6}
        className="min-w-56 p-1"
      >
        <DropdownMenuLabel className="px-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Python environment
        </DropdownMenuLabel>
        {envs.length === 0 ? (
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
            No environments detected
          </div>
        ) : (
          envs.map((env) => (
            <DropdownMenuItem
              key={env.path}
              onSelect={() => onSelect(env)}
              className={cn(
                "flex items-center gap-2 text-[11.5px]",
                activeEnv?.path === env.path && "bg-accent/60 font-medium",
              )}
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  kindDot(env.kind),
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{env.name}</span>
                {env.version ? (
                  <span className="text-[10px] text-muted-foreground">
                    Python {env.version}
                  </span>
                ) : null}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onRefresh}
          className="flex items-center gap-2 text-[11.5px] text-muted-foreground"
        >
          <Icon name="refresh" size="xs" />
          Refresh
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
