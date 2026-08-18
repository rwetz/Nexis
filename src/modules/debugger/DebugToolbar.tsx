// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useDebugStore } from "./debugSession";

type Props = {
  onRestart?: () => void;
};

export function DebugToolbar({ onRestart }: Props) {
  const status = useDebugStore((s) => s.status);
  const store = useDebugStore();

  const isStopped = status === "stopped";
  const isRunning = status === "running";
  const isActive = isRunning || isStopped;

  return (
    <div className="flex items-center gap-0.5 px-1">
      {/* Continue / Pause */}
      {isStopped ? (
        <ToolbarBtn
          icon={"play"}
          title="Continue (F5)"
          onClick={() => void store.continue()}
        />
      ) : (
        <ToolbarBtn
          icon={"pause"}
          title="Pause (F6)"
          disabled={!isRunning}
          onClick={() => void store.pause()}
        />
      )}

      {/* Step Over */}
      <ToolbarBtn
        icon={"debug-step-over"}
        title="Step Over (F10)"
        disabled={!isStopped}
        onClick={() => void store.next()}
      />

      {/* Step Into */}
      <ToolbarBtn
        icon={"debug-step-into"}
        title="Step Into (F11)"
        disabled={!isStopped}
        onClick={() => void store.stepIn()}
      />

      {/* Step Out */}
      <ToolbarBtn
        icon={"debug-step-out"}
        title="Step Out (Shift+F11)"
        disabled={!isStopped}
        onClick={() => void store.stepOut()}
      />

      {/* Restart */}
      {onRestart && (
        <ToolbarBtn
          icon={"refresh"}
          title="Restart"
          disabled={!isActive}
          onClick={onRestart}
        />
      )}

      {/* Stop */}
      <ToolbarBtn
        icon={"stop"}
        title="Stop (Shift+F5)"
        disabled={!isActive}
        onClick={() => void store.stop()}
        className="text-destructive hover:text-destructive"
      />

      {/* Status indicator */}
      <span
        className={cn(
          "ml-1 text-[10px] font-medium uppercase tracking-wider",
          status === "stopped" && "text-yellow-500",
          status === "running" && "text-green-500",
          status === "terminated" && "text-muted-foreground",
          status === "starting" && "text-blue-400",
          status === "idle" && "hidden",
        )}
      >
        {status}
      </span>
    </div>
  );
}

function ToolbarBtn({
  icon,
  title,
  disabled,
  onClick,
  className,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  title: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-muted-foreground",
        "hover:bg-muted hover:text-foreground transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      <Icon name={icon} />
    </button>
  );
}
