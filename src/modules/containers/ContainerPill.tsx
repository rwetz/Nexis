// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ContainerIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ContainerEnv } from "./useContainerEnv";

type Props = {
  env: ContainerEnv;
};

export function ContainerPill({ env }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex shrink-0 cursor-default items-center gap-1 rounded-full bg-sky-500/12 px-2 py-0.5 text-[10.5px] font-medium text-sky-700 dark:text-sky-400">
          <HugeiconsIcon icon={ContainerIcon} size={11} strokeWidth={2} />
          <span>{env.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-[11px] leading-relaxed">
        Container configuration detected in the workspace root. AI context
        and shell sessions are aware of this environment.
      </TooltipContent>
    </Tooltip>
  );
}
