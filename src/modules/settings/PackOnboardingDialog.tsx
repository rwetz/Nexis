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
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PACK_PRESETS, PACKS } from "@/lib/packs";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setEnabledPacks, setPacksOnboarded } from "@/modules/settings/store";

const PRESETS: {
  id: keyof typeof PACK_PRESETS;
  label: string;
  blurb: string;
}[] = [
  {
    id: "bare-bones",
    label: "Bare-Bones",
    blurb: "Terminal, editor, files, source control, and AI chat. Nothing else.",
  },
  {
    id: "standard",
    label: "Standard",
    blurb: "The core plus code navigation, build/test/debug, and dev tools.",
  },
  {
    id: "everything",
    label: "Everything",
    blurb: "The full surface, ML Lab and all. The classic Nexis experience.",
  },
];


/** Applying a preset touches only module-level setters. */
const choose = (id: keyof typeof PACK_PRESETS) => {
  void setEnabledPacks([...PACK_PRESETS[id]]);
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose your setup</DialogTitle>
          <DialogDescription>
            Nexis ships a lot of panels. Pick how much of it you want visible
            — you can enable or disable any pack later in Settings →
            Features. Nothing is downloaded or removed either way.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p.id)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5 text-left transition-colors",
                "hover:border-primary/40 hover:bg-primary/[0.05]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              )}
            >
              <span className="text-[12.5px] font-medium">{p.label}</span>
              <span className="text-[10.5px] leading-relaxed text-muted-foreground">
                {p.blurb}
              </span>
              {PACK_PRESETS[p.id].length > 0 && (
                <span className="mt-0.5 text-[10px] text-muted-foreground/70">
                  {PACK_PRESETS[p.id].map((id) => PACKS[id].label).join(" · ")}
                </span>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
