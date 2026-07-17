// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  PACK_IDS,
  PACK_PRESETS,
  PACKS,
  type PackId,
} from "@/lib/packs";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setEnabledPacks } from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

const PRESET_LABELS: { id: keyof typeof PACK_PRESETS; label: string }[] = [
  { id: "bare-bones", label: "Bare-Bones" },
  { id: "standard", label: "Standard" },
  { id: "everything", label: "Everything" },
];

export function FeaturesSection() {
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);

  const toggle = (id: PackId, on: boolean) => {
    const next = on
      ? [...enabledPacks, id]
      : enabledPacks.filter((p) => p !== id);
    // Persist in canonical PACK_IDS order so the stored value is stable.
    void setEnabledPacks(PACK_IDS.filter((p) => next.includes(p)));
  };

  const matchesPreset = (id: keyof typeof PACK_PRESETS) => {
    const preset = PACK_PRESETS[id];
    return (
      preset.length === enabledPacks.length &&
      preset.every((p) => enabledPacks.includes(p))
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
        <div className="flex items-center gap-1.5">
          {PRESET_LABELS.map(({ id, label }) => (
            <Button
              key={id}
              size="sm"
              variant={matchesPreset(id) ? "secondary" : "outline"}
              className="h-6 px-2 text-[11px]"
              onClick={() => void setEnabledPacks([...PACK_PRESETS[id]])}
            >
              {label}
            </Button>
          ))}
        </div>
      </SettingRow>

      {PACK_IDS.map((id) => {
        const pack = PACKS[id];
        return (
          <SettingRow
            key={id}
            title={pack.label}
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
