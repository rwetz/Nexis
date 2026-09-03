// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  PACK_IDS,
  PACK_PRESETS,
  PACKS,
  PRESET_IDS,
  PRESETS,
  type PackId,
  type PresetId,
} from "@/lib/packs";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setEnabledPacks } from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function FeaturesSection() {
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);

  const toggle = (id: PackId, on: boolean) => {
    const next = on
      ? [...enabledPacks, id]
      : enabledPacks.filter((p) => p !== id);
    // Persist in canonical PACK_IDS order so the stored value is stable.
    void setEnabledPacks(PACK_IDS.filter((p) => next.includes(p)));
  };

  const enabledSet = new Set(enabledPacks);
  const matchesPreset = (id: PresetId) => {
    const preset = PACK_PRESETS[id];
    return (
      preset.length === enabledPacks.length &&
      preset.every((p) => enabledSet.has(p))
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Features"
        description="Choose which expansion packs are enabled. The terminal, editor, Files, Recent Files, Source Control, and AI chat are always available. Disabling a pack hides its panels — nothing is uninstalled, and your pinned sidebar items come back when you re-enable it."
      />

      {/* Presets get the full width rather than the right-hand control column
          of a SettingRow. Six of them wrapped into that column read as a
          cramped cluster of chips, and it left `blurb` — the one line that
          says what each preset is actually for — with nowhere to go. */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12.5px] font-medium">Presets</span>
          <span className="text-[10.5px] leading-relaxed text-muted-foreground">
            One-click bundles over the same toggles below.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {PRESET_IDS.map((id) => {
            const active = matchesPreset(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => void setEnabledPacks([...PACK_PRESETS[id]])}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-md border px-2.5 py-2 text-left transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                  active
                    ? "border-primary/50 bg-primary/10"
                    : "border-border/60 bg-background/40 hover:border-border hover:bg-muted/50",
                )}
              >
                <span className="flex w-full items-center gap-1.5">
                  <Icon
                    name={PRESETS[id].icon}
                    size="sm"
                    active={active}
                    className={active ? "text-primary" : "text-muted-foreground"}
                  />
                  <span className="min-w-0 truncate text-[11.5px] font-medium">
                    {PRESETS[id].label}
                  </span>
                  {active && (
                    <Icon
                      name="check"
                      size="xs"
                      className="ml-auto shrink-0 text-primary"
                    />
                  )}
                </span>
                <span className="text-[10px] leading-snug text-muted-foreground/80">
                  {PRESETS[id].blurb}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {PACK_IDS.map((id) => {
        const pack = PACKS[id];
        // A pack whose panels have not landed yet is still a real toggle, and
        // saying so is better than a switch that appears to do nothing.
        const empty = pack.views.length === 0;
        return (
          <SettingRow
            key={id}
            title={
              <span className="flex items-center gap-1.5">
                <Icon name={pack.icon} size="sm" />
                {pack.label}
                {empty ? (
                  <span className="rounded-sm bg-muted px-1 py-px text-[9.5px] font-normal text-muted-foreground">
                    No panels yet
                  </span>
                ) : null}
              </span>
            }
            description={pack.description}
          >
            <Switch
              checked={enabledPacks.includes(id)}
              onCheckedChange={(v) => toggle(id, v)}
            />
          </SettingRow>
        );
      })}
    </div>
  );
}
