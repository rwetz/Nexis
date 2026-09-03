// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

      <SettingRow
        title="Presets"
        description="One-click bundles over the same toggles below."
      >
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {PRESET_IDS.map((id) => (
            <Button
              key={id}
              size="sm"
              variant={matchesPreset(id) ? "secondary" : "outline"}
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => void setEnabledPacks([...PACK_PRESETS[id]])}
            >
              <Icon name={PRESETS[id].icon} size="xs" />
              {PRESETS[id].label}
            </Button>
          ))}
        </div>
      </SettingRow>

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
