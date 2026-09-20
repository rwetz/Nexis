// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

const DarkVeilBackground = lazy(() =>
  import("@/components/ui/backgrounds/DarkVeil").then((m) => ({ default: m.DarkVeilBackground })),
);
import { Button } from "@/components/ui/button";
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
import { RAINBOW_STOP_OFFSETS, RAINBOW_VARIANTS } from "@/modules/theme/rainbowAccent";
import { DEFAULT_THEME_ID } from "@/modules/theme/types";
import { resolveCssColor } from "@/styles/tokens";

type Props = {
  onNewTerminal: () => void;
};

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

/**
 * The seven-stop spectrum the rainbow hover accent paints with, as sRGB.
 *
 * The accent emits `oklch()` into CSS, which a canvas cannot consume. The
 * conversion goes through `resolveCssColor`, NOT through reading
 * `getComputedStyle().color` and parsing it: WebView2 can serialize a
 * computed colour back as `oklch(...)` rather than `rgb(...)`, so a regex
 * expecting `rgb()` silently fails and every stop collapses to the fallback
 * — which is exactly why the wordmark came out one flat indigo instead of a
 * spectrum. `resolveCssColor` round-trips through a canvas pixel, whose
 * bytes are always sRGB. Same trap CLAUDE.md records for Atlas's renderer.
 */
function rainbowStops(variant = 0): string[] {
  const { hue } = RAINBOW_VARIANTS[variant % RAINBOW_VARIANTS.length];
  return RAINBOW_STOP_OFFSETS.map((offset) =>
    resolveCssColor(`oklch(0.72 0.19 ${(hue + offset) % 360})`),
  );
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
  const rainbowPref = usePreferencesStore((s) => s.rainbowAccent);
  // The rainbow accent is the default theme's identity and no other theme's
  // — a named theme's accent hue is the whole point of picking it, so a
  // spectrum would erase it. Same gate the hover accent uses.
  const rainbow = rainbowPref && themeId === DEFAULT_THEME_ID;
  const folderColor = getFolderColor(themeId, resolvedMode);
  const hueShift = useMemo(() => hexToHue(folderColor), [folderColor]);
  const rainbowHex = useMemo(
    () => (rainbow ? rainbowStops(0) : []),
    [rainbow],
  );

  const storedBg = usePreferencesStore((s) => s.welcomeBackgroundId);
  const cycle = usePreferencesStore((s) => s.welcomeBackgroundCycle);

  // The background shown for THIS viewing.
  //
  // Held in state rather than read straight from the store, because the
  // rotation writes the NEXT id back to preferences on mount: reading the
  // store directly would swap the background out from under the viewer the
  // instant that write landed. `rotatedTo` records what the rotation chose,
  // so a later picker change can be told apart from the rotation's own echo.
  const [shown, setShown] = useState<WelcomeBgId>(storedBg);
  const rotatedRef = useRef(false);
  const rotatedTo = useRef<WelcomeBgId | null>(null);

  useEffect(() => {
    if (rotatedRef.current) return;
    rotatedRef.current = true;
    if (!cycle) return;
    const current = usePreferencesStore.getState().welcomeBackgroundId;
    const next = nextWelcomeBg(current);
    setShown(current);
    rotatedTo.current = next;
    void setWelcomeBackgroundId(next).catch(() => {});
    // Mount only: cycling advances once per viewing, not on every preference
    // change. The ref, not the dep list, is what enforces that — an effect
    // with no deps still re-runs if the component remounts under StrictMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picking a background in Settings takes effect immediately, even with
  // cycling on. The one write this ignores is the rotation's own — that
  // value is what the NEXT viewing should open with, not this one.
  useEffect(() => {
    if (storedBg === rotatedTo.current) return;
    setShown(storedBg);
  }, [storedBg]);

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 text-center select-none overflow-hidden">
      <Suspense fallback={null}>
        {shown === "darkveil" && (
          <DarkVeilBackground
            // With the rainbow on, the veil sweeps the whole spectrum
            // instead of sitting on one hue. The warp stays modest: pushed
            // hard it stops reading as a spectrum and collapses into one
            // saturated field, which is how the first pass ended up purple
            // from edge to edge.
            hueShift={rainbow ? 0 : hueShift}
            // The veil sweeps the spectrum rather than sitting on one hue.
            // Slow on purpose: this is ambient, and a fast cycle on a
            // full-screen field is nauseating rather than lively.
            hueCycleSpeed={rainbow ? 14 : 0}
            speed={0.3}
            noiseIntensity={0.04}
            warpAmount={rainbow ? 0.65 : 0.5}
          />
        )}
      </Suspense>

      <div
        className="relative z-10 flex flex-col items-center gap-3"
        style={{ animation: "welcome-fadein 0.55s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        {/* The mark, unadorned. The radial glow behind it fought whichever
            background was running — it was a second light source painted on
            top of one the background already had. */}
        <img
          src="/nexis-logo.png"
          alt="Nexis"
          className="size-24 drop-shadow-lg"
          draggable={false}
        />

        <div className="flex flex-col items-center gap-3">
          {/* The wordmark, at display scale. Settings match the BG Studio
              pass; `highlight` is what the particles take as the pointer
              pushes through them, which is the whole reason it reacts. */}
          <h1 className="font-heading">
            <ParticleText
              text="Welcome to Nexis"
              fontSize={72}
              fontWeight={800}
              // Follows the theme like every other coloured mark in the
              // app: the theme's own accent normally, and the full rainbow
              // spread across the glyphs when the default theme's spectrum
              // is on. Painting it a single rainbow STOP — one arbitrary
              // hue over a background already carrying that spectrum — is
              // what made the first pass a wall of purple.
              color={folderColor}
              highlight={rainbow ? undefined : "#8b5cf6"}
              spectrum={rainbow ? rainbowHex : undefined}
              glow={false}
              particleSize={2.2}
              density={4}
              scatter={190}
              gather={1600}
              stagger={420}
              repelStrength={42}
              repelRadius={120}
              idleDrift={0.8}
            />
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Open a terminal or file to get started — or press {MOD_KEY}+I to ask the AI agent.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* The `arrow` variant: the fill wipes in from the leading edge and
              the arrow steps forward on hover. This is the screen's one real
              call to action, which is what that variant is for. */}
          <Button
            size="sm"
            variant="arrow"
            onClick={onNewTerminal}
          >
            <span>New Terminal</span>
            <span className="opacity-50">{fmtShortcut(MOD_KEY, "T")}</span>
            <Icon name="arrow-right" size="sm" data-slot="button-arrow" />
          </Button>

          {/* Onboarding is a one-shot for anyone who dismissed it on day one
              unless there is a way back in. This is that way in — the same
              takeover the command palette opens. */}
          <Button
            size="sm"
            variant="arrow"
            onClick={openOnboarding}
          >
            <Icon name="checklist" size="xs" />
            <span>View onboarding</span>
            <Icon name="arrow-right" size="sm" data-slot="button-arrow" />
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
