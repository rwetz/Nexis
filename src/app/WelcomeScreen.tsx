// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

const DarkVeilBackground = lazy(() =>
  import("@/components/ui/backgrounds/DarkVeil").then((m) => ({ default: m.DarkVeilBackground })),
);
const DitherBackground = lazy(() =>
  import("@/components/ui/backgrounds/Dither").then((m) => ({ default: m.DitherBackground })),
);
const DotGridBackground = lazy(() =>
  import("@/components/ui/backgrounds/DotGrid").then((m) => ({ default: m.DotGridBackground })),
);
import { Button } from "@/components/ui/button";
import { CursorAura } from "@/components/ui/CursorAura";
import { ParticleText } from "@/components/ui/ParticleText";
import { Icon } from "@/components/icon";
import { fmtShortcut, MOD_KEY, SHIFT_KEY } from "@/lib/platform";
import { openOnboarding } from "@/modules/onboarding/onboardingDialogStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  nextWelcomeBg,
  setWelcomeBackgroundId,
  type WelcomeBgId,
} from "@/modules/settings/store";
import { getFolderColor, useTheme } from "@/modules/theme";

type Props = {
  onNewTerminal: () => void;
};

/** Shift every channel by `amount` (-1..1), clamped. Used for the dot grid's
 *  resting tone, which has to move away from the page: darker on a dark
 *  theme, lighter on a light one, or the dots vanish in one of the two. */
function shiftHex(hex: string, amount: number): string {
  const h = hex.replace(/^#/, "");
  const n = parseInt(
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h,
    16,
  );
  if (Number.isNaN(n)) return hex;
  const bump = Math.round(amount * 255);
  const clamp = (v: number) => Math.min(255, Math.max(0, v + bump));
  const r = clamp((n >> 16) & 255);
  const g = clamp((n >> 8) & 255);
  const b = clamp(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Convert a hex color to its HSL hue in degrees (0–360). */
function hexToHue(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let hue = 0;
  if (max === r)      hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / d + 2) / 6;
  else                hue = ((r - g) / d + 4) / 6;
  return hue * 360;
}

const SHORTCUTS = [
  { label: "Open AI agent",      keys: [MOD_KEY, "I"] },
  { label: "Quick open file",    keys: [MOD_KEY, "P"] },
  { label: "New editor tab",     keys: [MOD_KEY, "E"] },
  { label: "Split pane",         keys: [MOD_KEY, "D"] },
  { label: "Keyboard shortcuts", keys: [MOD_KEY, "K"] },
  { label: "New window",         keys: [MOD_KEY, SHIFT_KEY, "N"] },
] as const;

export function WelcomeScreen({ onNewTerminal }: Props) {
  const { themeId, resolvedMode } = useTheme();
  const folderColor = getFolderColor(themeId, resolvedMode);
  const hueShift = useMemo(() => hexToHue(folderColor), [folderColor]);
  const dotRest = useMemo(
    () => shiftHex(folderColor, resolvedMode === "dark" ? -0.24 : 0.3),
    [folderColor, resolvedMode],
  );

  const storedBg = usePreferencesStore((s) => s.welcomeBackgroundId);
  const cycle = usePreferencesStore((s) => s.welcomeBackgroundCycle);

  // The background shown for THIS viewing, decided once on mount.
  //
  // Held in state rather than read from the store on every render, because
  // the rotation writes the next id back to preferences: reading the store
  // directly would swap the background out from under the user the instant
  // the write landed. So this viewing keeps what it started with, and the
  // stored value is what the *next* viewing picks up.
  const [shown, setShown] = useState<WelcomeBgId>(storedBg);
  const rotatedRef = useRef(false);

  useEffect(() => {
    if (rotatedRef.current) return;
    rotatedRef.current = true;
    if (!cycle) return;
    const current = usePreferencesStore.getState().welcomeBackgroundId;
    setShown(current);
    void setWelcomeBackgroundId(nextWelcomeBg(current)).catch(() => {});
    // Mount only: cycling advances once per viewing, not on every preference
    // change. The ref, not the dep list, is what enforces that — an effect
    // with no deps still re-runs if the component remounts under StrictMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A picker change while the screen is open should be visible immediately;
  // that is a deliberate choice, not the rotation writing back.
  useEffect(() => {
    if (!cycle) setShown(storedBg);
  }, [storedBg, cycle]);

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 text-center select-none overflow-hidden">
      <Suspense fallback={null}>
        {shown === "darkveil" && (
          <DarkVeilBackground
            hueShift={hueShift}
            speed={0.3}
            noiseIntensity={0.04}
            warpAmount={0.5}
          />
        )}
        {/* Dither keeps the exact BG Studio settings — grey on black, which
            is the look that was signed off. It is not theme-tinted for that
            reason; the other two are. */}
        {shown === "dither" && <DitherBackground />}
        {shown === "dotgrid" && (
          <DotGridBackground
            baseColor={dotRest}
            activeColor={folderColor}
            opacity={0.75}
          />
        )}
      </Suspense>

      {/* Scoped to this screen only. See CursorAura's own note on why this
          is not a global layer. */}
      <CursorAura color={folderColor} size={460} opacity={0.32} />

      <div
        className="relative z-10 flex flex-col items-center gap-6"
        style={{ animation: "welcome-fadein 0.55s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        {/* Logo + radial glow */}
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden
            className="absolute size-32 rounded-full"
            style={{ background: `radial-gradient(ellipse at center, ${folderColor}33 0%, transparent 70%)` }}
          />
          <img
            src="/nexis-logo.png"
            alt="Nexis"
            className="relative size-16 drop-shadow-lg"
            draggable={false}
          />
        </div>

        <div className="mt-4 space-y-2">
          <p className="font-heading text-[22px] font-semibold tracking-tight">
            <ParticleText text="Welcome to Nexis" fontSize={22} fontWeight={600} />
          </p>
          <p className="text-[14px] text-muted-foreground">
            Open a terminal or file to get started — or press {MOD_KEY}+I to ask the AI agent.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onNewTerminal}
            className="bg-brand text-brand-foreground hover:bg-brand/80"
          >
            New Terminal
            <span className="ml-1.5 opacity-50">{fmtShortcut(MOD_KEY, "T")}</span>
          </Button>

          {/* Onboarding is a one-shot for anyone who dismissed it on day one
              unless there is a way back in. This is that way in — the same
              takeover the command palette opens. */}
          <Button
            size="sm"
            variant="outline"
            onClick={openOnboarding}
            className="bg-transparent"
          >
            <Icon name="checklist" size="xs" className="mr-1.5" />
            View onboarding
          </Button>
        </div>

        {/* Thin divider */}
        <div aria-hidden className="h-px w-48 bg-gradient-to-r from-transparent via-border/50 to-transparent" />

        {/* Shortcut grid */}
        <div className="mt-0 grid grid-cols-2 gap-x-6 gap-y-2">
          {SHORTCUTS.map(({ label, keys }) => (
            <div key={label} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-muted-foreground/70">{label}</span>
              <span className="flex items-center gap-0.5">
                {keys.map((k, i) => (
                  <kbd
                    key={i}
                    className="rounded px-1 py-0.5 text-[11px] font-medium leading-none
                               bg-white/5 text-muted-foreground/60 border border-white/10
                               shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.15)]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes welcome-fadein {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes darkveil-fadein {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
