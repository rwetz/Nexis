// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useEffect, useRef, useState } from "react";
import { type NotificationType, useNotificationsStore } from "./notificationsStore";

function typeIcon(type: NotificationType) {
  switch (type) {
    case "success": return "success";
    case "warning": return "alert-circle";
    case "error":   return "alert-circle";
    default:        return "info";
  }
}

function typeColor(type: NotificationType): string {
  switch (type) {
    case "success": return "text-green-500";
    case "warning": return "text-amber-500";
    case "error":   return "text-destructive";
    default:        return "text-primary";
  }
}

function relTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function NotificationsCenter() {
  const items = useNotificationsStore((s) => s.items);
  const unread = useNotificationsStore((s) => s.unreadCount);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const clear = useNotificationsStore((s) => s.clear);
  const remove = useNotificationsStore((s) => s.remove);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Relative time ticks every 30 seconds while open.
  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(() => tick((n) => n + 1), 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [open]);

  const onOpen = (v: boolean) => {
    setOpen(v);
    if (v && unread > 0) markAllRead();
  };

  return (
    <Popover open={open} onOpenChange={onOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Notifications"
          className={cn(
            "relative flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            open && "bg-muted text-foreground",
          )}
        >
          <Icon name="notification" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-bold leading-none text-primary-foreground tabular-nums">
              {unread > 99 ? "99" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={6}
        className="z-50 flex w-80 flex-col overflow-hidden rounded-xl border border-border bg-popover p-0 shadow-lg"
      >
          <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
            <span className="text-[12px] font-semibold text-foreground">Notifications</span>
            <div className="flex items-center gap-1">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clear}
                  className="rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
                <Icon
                  name="notification"
                  size="lg"
                  className="text-muted-foreground/40"
                />
                <p className="text-[11.5px] text-muted-foreground">No notifications</p>
              </div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "group flex items-start gap-2 border-b border-border/30 px-3 py-2.5 last:border-none",
                    !n.read && "bg-primary/[0.03]",
                  )}
                >
                  <Icon
                    name={typeIcon(n.type)}
                    size="md"
                    className={cn("mt-0.5 shrink-0", typeColor(n.type))}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium leading-snug text-foreground">
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                        {n.message}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {relTime(n.at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(n.id)}
                    aria-label="Dismiss notification"
                    className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-muted group-hover:opacity-100"
                  >
                    <Icon name="close" size="xs" />
                  </button>
                </div>
              ))
            )}
          </div>
      </PopoverContent>
    </Popover>
  );
}
