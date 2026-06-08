// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AiScanIcon,
  Cancel01Icon,
  CodeIcon,
  InformationCircleIcon,
  KeyboardIcon,
  PaintBoardIcon,
  Settings01Icon,
  UserMultiple02Icon,
  VariableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { JSX, useCallback, useEffect, useRef, useState } from "react";
import type { SettingsTab } from "@/modules/settings/openSettingsWindow";
import { useSettingsDialogStore } from "@/modules/settings/settingsDialogStore";
import { AboutSection } from "./sections/AboutSection";
import { AgentsSection } from "./sections/AgentsSection";
import { EnvironmentSection } from "./sections/EnvironmentSection";
import { FormattersSection } from "./sections/FormattersSection";
import { GeneralSection } from "./sections/GeneralSection";
import { ModelsSection } from "./sections/ModelsSection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { ThemesSection } from "./sections/ThemesSection";

const TABS: {
  id: SettingsTab;
  label: string;
  icon: typeof Settings01Icon;
  component: () => JSX.Element;
}[] = [
  { id: "general",     label: "General",     icon: Settings01Icon,       component: GeneralSection },
  { id: "themes",      label: "Themes",      icon: PaintBoardIcon,       component: ThemesSection },
  { id: "shortcuts",   label: "Shortcuts",   icon: KeyboardIcon,         component: ShortcutsSection },
  { id: "models",      label: "Models",      icon: AiScanIcon,           component: ModelsSection },
  { id: "agents",      label: "Agents",      icon: UserMultiple02Icon,   component: AgentsSection },
  { id: "environment", label: "Environment", icon: VariableIcon,         component: EnvironmentSection },
  { id: "formatters",  label: "Formatters",  icon: CodeIcon,             component: FormattersSection },
  { id: "about",       label: "About",       icon: InformationCircleIcon, component: AboutSection },
];

export function SettingsDialog() {
  const isOpen = useSettingsDialogStore((s) => s.isOpen);
  const storeTab = useSettingsDialogStore((s) => s.activeTab);
  const hide = useSettingsDialogStore((s) => s.hide);

  const [activeTab, setActiveTab] = useState<SettingsTab>(storeTab);
  const scrollRef = useRef<HTMLElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(false);

  // Sync to the requested tab whenever the dialog opens or the store tab changes.
  useEffect(() => {
    if (isOpen) setActiveTab(storeTab);
  }, [isOpen, storeTab]);

  // Reset scroll and re-evaluate overflow on every open AND tab switch.
  // isOpen is in deps so that re-opening on the same tab (no activeTab change)
  // still resets the stale isAtBottom state from the previous session.
  useEffect(() => {
    setIsAtBottom(false); // clear stale state immediately
    const el = scrollRef.current;
    if (!el) return; // dialog content not yet mounted (or just unmounted)
    el.scrollTop = 0;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      setIsAtBottom(el.scrollHeight <= el.clientHeight + 2);
    });
  }, [isOpen, activeTab]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setIsAtBottom(el.scrollHeight - el.scrollTop <= el.clientHeight + 2);
  }, []);

  const ActiveSection = TABS.find((t) => t.id === activeTab)?.component;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && hide()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={[
            // base positioning & shape
            "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "flex flex-col overflow-hidden",
            "w-[min(920px,calc(100vw-2rem))] h-[min(700px,calc(100vh-4rem))]",
            "rounded-2xl bg-popover text-popover-foreground",
            "shadow-xl ring-1 ring-foreground/8",
            // entry/exit animation
            "duration-100 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          ].join(" ")}
        >
          {/* Tab header */}
          <header className="flex h-12 shrink-0 items-center border-b border-border/60 bg-card/60 px-4">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as SettingsTab)}
              className="flex-1 flex items-center justify-center"
            >
              <TabsList className="h-7 bg-muted/40 px-2">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="h-6 gap-1.5 px-2.5 text-[11.5px]"
                  >
                    <HugeiconsIcon icon={t.icon} size={12} strokeWidth={1.75} />
                    <span>{t.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <DialogClose asChild>
              <Button variant="ghost" size="icon-sm" className="shrink-0">
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </header>

          {/* Scrollable content */}
          <div className="relative min-h-0 flex-1">
            <main
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-full overflow-y-auto px-8 pt-6 pb-7 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="mx-auto w-full max-w-160">
                {ActiveSection && <ActiveSection />}
              </div>
            </main>
            {!isAtBottom && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-popover to-transparent"
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
