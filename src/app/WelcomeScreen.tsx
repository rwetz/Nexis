import { lazy, Suspense, useMemo } from "react";

const DarkVeilBackground = lazy(() =>
  import("@/components/ui/backgrounds/DarkVeil").then((m) => ({ default: m.DarkVeilBackground })),
);
import { AnimatedFolder } from "@/components/ui/AnimatedFolder";
import { Button } from "@/components/ui/button";
import { fmtShortcut, MOD_KEY, SHIFT_KEY } from "@/lib/platform";
import { getFolderColor, useTheme } from "@/modules/theme";

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

const SHORTCUTS = [
  { label: "New terminal",    keys: [MOD_KEY, "T"] },
  { label: "Quick open file", keys: [MOD_KEY, "P"] },
  { label: "New editor tab",  keys: [MOD_KEY, "E"] },
  { label: "Split pane",      keys: [MOD_KEY, "D"] },
  { label: "Keyboard shortcuts", keys: [MOD_KEY, "K"] },
  { label: "New window",      keys: [MOD_KEY, SHIFT_KEY, "N"] },
] as const;

export function WelcomeScreen({ onNewTerminal }: Props) {
  const { themeId, resolvedMode } = useTheme();
  const folderColor = getFolderColor(themeId, resolvedMode);
  const hueShift = useMemo(() => hexToHue(folderColor), [folderColor]);

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 text-center select-none overflow-hidden">
      <Suspense fallback={null}>
        <DarkVeilBackground
          hueShift={hueShift}
          speed={0.4}
          noiseIntensity={0.025}
          warpAmount={0.5}
        />
      </Suspense>

      <div
        className="relative z-10 flex flex-col items-center gap-6"
        style={{ animation: "welcome-fadein 0.55s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <AnimatedFolder color={folderColor} size={1.5} />

        <div className="mt-8 space-y-2">
          <p className="text-[22px] font-semibold tracking-tight">
            Welcome to Nexis
          </p>
          <p className="text-[14px] text-muted-foreground">
            Open a terminal or file to get started
          </p>
        </div>

        <Button size="sm" onClick={onNewTerminal}>
          New Terminal
          <span className="ml-1.5 opacity-50">{fmtShortcut(MOD_KEY, "T")}</span>
        </Button>

        {/* Shortcut grid */}
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2">
          {SHORTCUTS.map(({ label, keys }) => (
            <div key={label} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-muted-foreground/70">{label}</span>
              <span className="flex items-center gap-0.5">
                {keys.map((k, i) => (
                  <kbd
                    key={i}
                    className="rounded px-1 py-0.5 text-[11px] font-medium leading-none
                               bg-white/5 text-muted-foreground/60 border border-white/8"
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
      `}</style>
    </div>
  );
}
