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

/** Hex to a linear 0..1 RGB triple, which is what the GL backgrounds take. */
function hexToRgbTuple(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
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

/**
 * The seven-stop spectrum the rainbow hover accent paints with, as hex.
 *
 * The accent itself emits `oklch()` into CSS, which the backgrounds cannot
 * use: two of them are WebGL and want linear RGB, and the third fills a
 * canvas. So the same stops are resolved to hex once here, through the
 * browser's own colour parser rather than a hand-rolled OKLCH conversion —
 * one implementation of the maths, and it is the one the page already uses.
 */
function rainbowStops(variant = 0): string[] {
  const { hue } = RAINBOW_VARIANTS[variant % RAINBOW_VARIANTS.length];
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const out = RAINBOW_STOP_OFFSETS.map((offset) => {
    probe.style.color = `oklch(0.72 0.19 ${(hue + offset) % 360})`;
    const resolved = getComputedStyle(probe).color;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(resolved);
    if (!m) return "#5227FF";
    const hex = (v: string) => Number(v).toString(16).padStart(2, "0");
    return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
  });
  probe.remove();
  return out;
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
  // The dots have to sit ON the page, not vanish into it: the welcome screen
  // paints no plate behind them, so a resting tone derived by darkening a
  // dark accent came out near-black on near-black. This lightens on a dark
  // theme and darkens on a light one — toward the viewer either way.
  const dotRest = useMemo(
    () => shiftHex(folderColor, resolvedMode === "dark" ? 0.18 : -0.28),
    [folderColor, resolvedMode],
  );
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
            // instead of sitting on one hue.
            hueShift={rainbow ? 0 : hueShift}
            speed={0.3}
            noiseIntensity={0.04}
            warpAmount={rainbow ? 1.1 : 0.5}
            scanlineIntensity={rainbow ? 0.06 : 0}
          />
        )}
        {/* Dither keeps the BG Studio settings — grey on black — unless the
            rainbow is on, in which case its two tones become spectrum ends
            and the posterised bands read as a gradient ramp. */}
        {shown === "dither" && (
          <DitherBackground
            color={rainbow ? hexToRgbTuple(rainbowHex[5]) : undefined}
            background={rainbow ? hexToRgbTuple(rainbowHex[0]) : undefined}
          />
        )}
        {shown === "dotgrid" && (
          <DotGridBackground
            baseColor={dotRest}
            activeColor={folderColor}
            rainbow={rainbow ? rainbowHex : undefined}
            opacity={0.9}
          />
        )}
      </Suspense>

      <div
        className="relative z-10 flex flex-col items-center gap-6"
        style={{ animation: "welcome-fadein 0.55s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        {/* The mark, unadorned. The radial glow behind it fought whichever
            background was running — it was a second light source painted on
            top of one the background already had. */}
        <img
          src="/nexis-logo.png"
          alt="Nexis"
          className="size-16 drop-shadow-lg"
          draggable={false}
        />

        <div className="mt-2 flex flex-col items-center gap-2">
          {/* The wordmark, at display scale. Settings match the BG Studio
              pass; `highlight` is what the particles take as the pointer
              pushes through them, which is the whole reason it reacts. */}
          <h1 className="font-heading">
            <ParticleText
              text="Welcome to Nexis"
              fontSize={72}
              fontWeight={800}
              color={rainbow ? rainbowHex[3] : "#f8fafc"}
              highlight={rainbow ? rainbowHex[0] : "#8b5cf6"}
              particleSize={2.2}
              density={4}
              scatter={190}
              gather={1600}
              stagger={420}
              repelStrength={42}
              repelRadius={120}
              idleDrift={0.8}
              glow
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
