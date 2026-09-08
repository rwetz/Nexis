import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WindowControls } from "@/components/WindowControls";
import { HugeiconsIcon, Moon02Icon, Sun01Icon } from "@/components/icons";
import { IS_MAC, IS_TAURI, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import { useTheme } from "@/modules/theme/ThemeProvider";

export function Header() {
  const { resolvedMode, toggle } = useTheme();

  return (
    <div
      data-tauri-drag-region
      className={`flex h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-card select-none ${
        IS_MAC ? "pr-2 pl-20" : "pr-0 pl-3"
      }`}
    >
      <div className="flex items-center gap-2" data-tauri-drag-region={undefined}>
        <BrandMark />
        <span className="text-[13px] font-semibold tracking-tight">
          Nexis <span className="text-muted-foreground font-medium">Benchmark</span>
        </span>
        {!IS_TAURI && (
          <span className="ml-1 rounded-full bg-brand/12 px-2 py-0.5 text-[10px] font-medium text-brand">
            preview
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center" data-tauri-drag-region>
        <div data-tauri-drag-region className="h-full min-w-2 flex-1" />
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggle}
            className="rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Toggle theme"
          >
            <HugeiconsIcon
              icon={resolvedMode === "dark" ? Sun01Icon : Moon02Icon}
              size={16}
              strokeWidth={1.75}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{resolvedMode === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
      </Tooltip>

      {USE_CUSTOM_WINDOW_CONTROLS && (
        <>
          <span className="ml-1 h-5 w-px shrink-0 bg-border" />
          <WindowControls />
        </>
      )}
    </div>
  );
}
