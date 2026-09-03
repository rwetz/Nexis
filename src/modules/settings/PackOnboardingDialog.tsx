// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * One-time first-run picker for the expansion-pack surface. Presets are
 * just starting values for the same enabledPacks config edited in
 * Settings → Features; dismissing keeps the current config (all packs on)
 * so upgrading users who close the dialog see zero change.
 *
 * The cards are driven by `PRESETS` in `src/lib/packs.ts` rather than by a
 * list kept here, so this screen and Settings → Features cannot disagree
 * about what a preset is.
 */
import { Icon } from "@/components/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PACKS, PRESET_IDS, PRESETS, type PresetId } from "@/lib/packs";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setEnabledPacks, setPacksOnboarded } from "@/modules/settings/store";

/** Applying a preset touches only module-level setters. */
const choose = (id: PresetId) => {
  void setEnabledPacks([...PRESETS[id].packs]);
  void setPacksOnboarded(true);
};

export function PackOnboardingDialog() {
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const packsOnboarded = usePreferencesStore((s) => s.packsOnboarded);
  const open = hydrated && !packsOnboarded;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Dismissal = keep everything as-is, never ask again.
        if (!o) void setPacksOnboarded(true);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose your setup</DialogTitle>
          <DialogDescription>
            Nexis ships a lot of panels. Pick what you are building and it will
            start with the ones that fit — you can enable or disable any pack
            later in Settings → Features. Nothing is downloaded or removed
            either way.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {PRESET_IDS.map((id) => {
            const preset = PRESETS[id];
            // Only name the packs that actually have panels today; listing a
            // pack whose views have not landed would promise a panel the user
            // will go looking for and not find.
            const named = preset.packs.filter(
              (p) => PACKS[p].views.length > 0,
            );
            return (
              <button
                key={id}
                type="button"
                onClick={() => choose(id)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5 text-left transition-colors",
                  "hover:border-primary/40 hover:bg-primary/[0.05]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                )}
              >
                <Icon
                  name={preset.icon}
                  size="xl"
                  className="text-muted-foreground"
                />
                <span className="text-[12.5px] font-medium">
                  {preset.label}
                </span>
                <span className="text-[10.5px] leading-relaxed text-muted-foreground">
                  {preset.blurb}
                </span>
                {named.length > 0 && (
                  <span className="mt-0.5 text-[10px] text-muted-foreground/70">
                    {named.map((p) => PACKS[p].label).join(" · ")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
