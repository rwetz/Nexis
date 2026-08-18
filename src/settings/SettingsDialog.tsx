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
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SettingsTab } from "@/modules/settings/openSettingsWindow";
import { useSettingsDialogStore } from "@/modules/settings/settingsDialogStore";
import { AboutSection } from "./sections/AboutSection";
import { AgentsSection } from "./sections/AgentsSection";
import { EnvironmentSection } from "./sections/EnvironmentSection";
import { FeaturesSection } from "./sections/FeaturesSection";
import { FormattersSection } from "./sections/FormattersSection";
import { GeneralSection } from "./sections/GeneralSection";
import { ModelsSection } from "./sections/ModelsSection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { ThemesSection } from "./sections/ThemesSection";

type TabDef = {
  id: SettingsTab;
  label: string;
  icon: IconName;
  component: () => JSX.Element;
  /**
   * Search terms that route to this section. These are the setting titles the
   * section actually renders — search is only useful if typing "scrollback" or
   * "api key" lands you on the right page, and section labels alone don't do
   * that (General owns ~20 settings under one word).
   */
  keywords: string;
};

type TabGroup = { label: string | null; tabs: TabDef[] };

const TAB_GROUPS: TabGroup[] = [
  {
    label: "Application",
    tabs: [
      {
        id: "general",
        label: "General",
        icon: "settings",
        component: GeneralSection,
        keywords:
          "vim mode word wrap hidden files webgl renderer inline suggestions default shell font family size weight letter spacing scrollback cursor style blink clipboard osc 52 confirm busy terminal explain failed commands launch at login restore window position tabs quick terminal height focus loss",
      },
      {
        id: "features",
        label: "Features",
        icon: "layers",
        component: FeaturesSection,
        keywords: "presets toggles experimental enable disable",
      },
      {
        id: "themes",
        label: "Themes",
        icon: "theme",
        component: ThemesSection,
        keywords:
          "theme colors palette appearance dark light community themes your themes halcyon meridian cinder aurelian thicket vermillion",
      },
      {
        id: "shortcuts",
        label: "Shortcuts",
        icon: "keyboard",
        component: ShortcutsSection,
        keywords: "keybindings keyboard hotkey chord bind reset to default",
      },
    ],
  },
  {
    label: "AI",
    tabs: [
      {
        id: "models",
        label: "Models",
        icon: "ai-scan",
        component: ModelsSection,
        keywords:
          "chat model autocomplete provider base url model id context api key token anthropic claude openai cerebras",
      },
      {
        id: "agents",
        label: "Agents",
        icon: "users",
        component: AgentsSection,
        keywords: "agent subagent custom prompt tools",
      },
    ],
  },
  {
    label: "Developer",
    tabs: [
      {
        id: "environment",
        label: "Environment",
        icon: "variable",
        component: EnvironmentSection,
        keywords: "environment variables env path export",
      },
      {
        id: "formatters",
        label: "Formatters",
        icon: "code",
        component: FormattersSection,
        keywords:
          "format on save formatter prettier rustfmt biome lint reset to default",
      },
    ],
  },
  {
    label: null,
    tabs: [
      {
        id: "about",
        label: "About",
        icon: "info",
        component: AboutSection,
        keywords: "version update license source code github website build",
      },
    ],
  },
];

const ALL_TABS: TabDef[] = TAB_GROUPS.flatMap((g) => g.tabs);

function matches(tab: TabDef, query: string): boolean {
  return (
    tab.label.toLowerCase().includes(query) || tab.keywords.includes(query)
  );
}

export function SettingsDialog() {
  const isOpen = useSettingsDialogStore((s) => s.isOpen);
  const storeTab = useSettingsDialogStore((s) => s.activeTab);
  const hide = useSettingsDialogStore((s) => s.hide);

  const [activeTab, setActiveTab] = useState<SettingsTab>(storeTab);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(false);

  // Sync to the requested tab whenever the dialog opens or the store tab changes.
  useEffect(() => {
    if (isOpen) setActiveTab(storeTab);
  }, [isOpen, storeTab]);

  // A stale query would hide the nav item for the tab we just opened onto.
  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

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

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return TAB_GROUPS;
    return TAB_GROUPS.map((g) => ({
      ...g,
      tabs: g.tabs.filter((t) => matches(t, normalizedQuery)),
    })).filter((g) => g.tabs.length > 0);
  }, [normalizedQuery]);

  const firstMatch = visibleGroups[0]?.tabs[0];

  // Enter jumps to the top hit so search is a keyboard-only path: open, type,
  // Enter. Selecting does not clear the query — the filtered nav stays put so
  // you can Enter again on a near-miss without retyping.
  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && firstMatch) {
      e.preventDefault();
      setActiveTab(firstMatch.id);
    }
  };

  // Escape is handled here rather than in the input's own keydown: Radix listens
  // for it on the document, so a React synthetic `stopPropagation` never reaches
  // far enough to stop the close (this shipped broken once — see the test).
  // Scoped to the search field, so Escape from anywhere else still closes the
  // dialog on the first press, which is what a dialog is expected to do.
  const onEscapeKeyDown = (e: KeyboardEvent) => {
    if (!normalizedQuery) return;
    if (document.activeElement !== searchRef.current) return;
    e.preventDefault();
    setQuery("");
  };

  const ActiveSection = ALL_TABS.find((t) => t.id === activeTab)?.component;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && hide()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={[
            // base positioning & shape
            "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "flex overflow-hidden",
            "w-[min(920px,calc(100vw-2rem))] h-[min(700px,calc(100vh-4rem))]",
            "rounded-2xl bg-popover text-popover-foreground",
            "shadow-xl ring-1 ring-foreground/8",
            // entry/exit animation
            "duration-100 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          ].join(" ")}
          // Radix warns unless a description is supplied or explicitly waived.
          // Each section renders its own SectionHeader copy, so there is no one
          // description that describes the dialog as a whole.
          aria-describedby={undefined}
          onEscapeKeyDown={onEscapeKeyDown}
        >
          <DialogTitle className="sr-only">Settings</DialogTitle>

          {/* Sidebar */}
          <nav className="flex w-52 shrink-0 flex-col border-r border-border/60 bg-card/40">
            {/* Search row — same height as the content header so the two
                bottom borders read as one line across the dialog. */}
            <div className="flex h-12 shrink-0 items-center border-b border-border/60 px-3">
              <div className="relative w-full">
                <Icon
                  name="search"
                  className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search settings"
                  aria-label="Search settings"
                  className="h-7 rounded-md pr-2 pl-7 text-[11.5px] md:text-[11.5px]"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleGroups.map((group, gi) => (
                <div
                  key={group.label ?? "ungrouped"}
                  className={gi > 0 ? "mt-3" : undefined}
                >
                  {group.label ? (
                    <div className="px-2 pt-1 pb-1.5 text-[10px] font-medium tracking-wider text-muted-foreground/70 uppercase">
                      {group.label}
                    </div>
                  ) : (
                    <div className="mx-2 mb-2 border-t border-border/50" />
                  )}
                  {group.tabs.map((t) => {
                    const isActive = t.id === activeTab;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTab(t.id)}
                        aria-current={isActive ? "page" : undefined}
                        className={[
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px]",
                          "transition-colors outline-none",
                          "focus-visible:ring-2 focus-visible:ring-ring/40",
                          isActive
                            ? "bg-muted/70 font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                        ].join(" ")}
                      >
                        <Icon name={t.icon} className="shrink-0" />
                        <span className="truncate">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {visibleGroups.length === 0 && (
                <p className="px-2 py-3 text-[11.5px] text-muted-foreground">
                  No settings match “{query.trim()}”.
                </p>
              )}
            </div>
          </nav>

          {/* Content column */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center justify-end border-b border-border/60 px-3">
              <DialogClose asChild>
                <Button variant="ghost" size="icon-sm" className="shrink-0">
                  <Icon name="close" size="sm" />
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
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
