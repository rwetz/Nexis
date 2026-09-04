// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Full-bleed generative backdrops: the pack's generative surface, next to the
 * playground's precision one.
 *
 * It shares everything below the waterline — the same seeded RNG, the same
 * sanitizer, the same `ExportBar` with its PNG rendering and workspace save —
 * and differs only in what it makes: wallpaper-scale, coloured, layered art
 * you arrive at by rolling rather than by drawing.
 *
 * ## Roll and lock
 *
 * Copying the *interaction* matters as much as copying the output. A Roll
 * button that takes a new seed, and a lock that holds the seed while another
 * parameter is tuned, are what make this explorable instead of a form. Both
 * are nearly free because seeding was already a decision the pack had made:
 * a scene is a pure function of its numbers, so rolling is just picking one.
 *
 * ## Where the colours come from
 *
 * The palette panel already persists a palette, so this reads it. That is the
 * point of having built them in this order — the two panels compose rather
 * than each growing its own colour picker, and "generate a backdrop in the
 * colours I just chose" needs no wiring beyond a storage key.
 */

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { ExportBar } from "./ExportBar";
import { parseColor } from "./lib/color";
import {
  ASPECTS,
  defaultSceneValues,
  renderScene,
  rollSeed,
  SCENES,
  type SceneDef,
} from "./lib/scenes";
import { sanitizeSvgForPreview } from "./lib/svgSanitize";
import { themePalette } from "./lib/themePalette";

/** Written by PalettePanel. Read-only here — this panel never edits it. */
const PALETTE_STORAGE_KEY = "nexis:art:palette";

const FALLBACK_PALETTE = ["#0f172a", "#1e3a8a", "#3b82f6", "#93c5fd"];

type ColorSource = "palette" | "theme" | "mono";

const SOURCE_LABELS: Record<ColorSource, string> = {
  palette: "Palette",
  theme: "Theme",
  mono: "Mono",
};

function readSavedPalette(): string[] {
  try {
    const raw = localStorage.getItem(PALETTE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((e) =>
        e && typeof e === "object" && typeof (e as { hex?: unknown }).hex === "string"
          ? (e as { hex: string }).hex
          : null,
      )
      .filter((hex): hex is string => hex !== null && parseColor(hex) !== null);
  } catch {
    return [];
  }
}

type Props = {
  /** Where "Save" writes. Null hides the control — see ExportBar. */
  workspaceRoot: string | null;
};

export function BackdropPanel({ workspaceRoot }: Props) {
  const [scene, setScene] = useState<SceneDef>(SCENES[0]);
  const [aspectId, setAspectId] = useState<string>(ASPECTS[0].id);
  const [source, setSource] = useState<ColorSource>("palette");
  const [seedLocked, setSeedLocked] = useState(false);
  const [withBackground, setWithBackground] = useState(true);

  // Per scene, so switching away and back does not discard a set of parameters
  // just dialled in — the same reasoning as the shape generator.
  const [values, setValues] = useState<Record<string, Record<string, number>>>(
    () => Object.fromEntries(SCENES.map((s) => [s.id, defaultSceneValues(s)])),
  );

  // Re-read on every render rather than caching: the palette panel may have
  // changed it since, and there is no cross-panel event to subscribe to. It is
  // a parse of a few dozen bytes.
  const [paletteTick, setPaletteTick] = useState(0);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PALETTE_STORAGE_KEY) setPaletteTick((t) => t + 1);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const palette = useMemo(() => {
    void paletteTick;
    if (source === "theme") {
      const swatches = themePalette("ansi").map((s) => s.hex);
      return swatches.length > 0 ? swatches : FALLBACK_PALETTE;
    }
    if (source === "mono") {
      // A single-hue ramp, which is what most backdrops actually want and
      // what a full palette makes surprisingly hard to get to.
      return ["#0b1020", "#1b2a4a", "#2f4a7c", "#5b83c0", "#a8c4e8"];
    }
    const saved = readSavedPalette();
    return saved.length > 0 ? saved : FALLBACK_PALETTE;
  }, [source, paletteTick]);

  const aspect = ASPECTS.find((a) => a.id === aspectId) ?? ASPECTS[0];
  const current = values[scene.id];

  const svg = useMemo(
    () =>
      renderScene(scene, {
        values: current,
        palette,
        background: withBackground ? (palette[0] ?? "#000000") : null,
        width: aspect.width,
        height: aspect.height,
      }),
    [scene, current, palette, withBackground, aspect],
  );

  // Generated by our own pure functions and asserted clean by a test, but it
  // goes through the same gate as any other markup so there is one rule.
  const safe = useMemo(() => sanitizeSvgForPreview(svg).svg, [svg]);

  const set = (key: string, value: number) =>
    setValues((prev) => ({
      ...prev,
      [scene.id]: { ...prev[scene.id], [key]: value },
    }));

  const roll = () => {
    if (seedLocked) return;
    set("seed", rollSeed());
  };

  const reset = () =>
    setValues((prev) => ({ ...prev, [scene.id]: defaultSceneValues(scene) }));

  const hasSeed = scene.params.some((p) => p.key === "seed");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="image" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Backdrop
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
          {aspect.width}x{aspect.height}
        </span>
      </div>

      {/* Scene picker */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 px-2 py-1.5">
        {SCENES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === scene.id}
            onClick={() => setScene(s)}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10.5px] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              s.id === scene.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Aspect + colour source */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 px-2 py-1.5">
        {ASPECTS.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={a.id === aspectId}
            onClick={() => setAspectId(a.id)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              a.id === aspectId
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {a.label}
          </button>
        ))}

        <span className="mx-1 h-3 w-px bg-border/60" />

        {(Object.keys(SOURCE_LABELS) as ColorSource[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={source === s}
            onClick={() => setSource(s)}
            title={
              s === "palette"
                ? "The colours saved in the Palette panel"
                : s === "theme"
                  ? "The active theme's terminal colours"
                  : "A single-hue ramp"
            }
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              source === s
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {SOURCE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="shrink-0 border-b border-border/50 p-2">
        <div
          className="w-full overflow-hidden rounded-md border border-border/60 [&>svg]:h-auto [&>svg]:w-full"
          // Ours, and sanitized above.
          dangerouslySetInnerHTML={{ __html: safe }}
        />
        <div className="mt-1.5 flex items-center gap-1">
          {hasSeed && (
            <>
              <button
                type="button"
                onClick={roll}
                disabled={seedLocked}
                className={cn(
                  "flex items-center gap-1 rounded-md bg-primary/90 px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors",
                  "hover:bg-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <Icon name="refresh" size="xs" />
                Roll
              </button>
              <button
                type="button"
                aria-pressed={seedLocked}
                onClick={() => setSeedLocked((v) => !v)}
                title={
                  seedLocked
                    ? "Seed locked — Roll will not change it"
                    : "Lock the seed so tuning a slider keeps this form"
                }
                className={cn(
                  "rounded p-1 transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                  seedLocked
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon name={seedLocked ? "key" : "unfold"} size="xs" active={seedLocked} />
              </button>
            </>
          )}

          <button
            type="button"
            aria-pressed={withBackground}
            onClick={() => setWithBackground((v) => !v)}
            title="Paint the first palette colour as a full-bleed background"
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              withBackground
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Background
          </button>

          <button
            type="button"
            onClick={reset}
            className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {scene.params.map((p) => (
            <label key={p.key} className="flex flex-col gap-0.5" title={p.hint}>
              <span className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                {p.label}
                <span className="font-mono tabular-nums text-muted-foreground/70">
                  {Number(current[p.key].toFixed(3))}
                </span>
              </span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={current[p.key]}
                onChange={(e) => set(p.key, Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
              />
            </label>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted-foreground/70">Colours</span>
          {palette.map((hex, i) => (
            <span
              key={`${hex}-${i}`}
              title={hex}
              className="size-3.5 rounded-sm border border-border/60"
              style={{ background: hex }}
            />
          ))}
        </div>
      </div>

      <ExportBar source={svg} valid workspaceRoot={workspaceRoot} />
    </div>
  );
}
