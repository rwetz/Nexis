import { useTheme } from "@/modules/theme/ThemeProvider";
import { useMemo } from "react";
import { css, langTier, readPalette } from "./palette";
import { useAtlasStore } from "@/modules/repos/store";
import { formatBytes } from "@/modules/repos/types";

/** Floating key for the colour ramp. Glass card over the canvas, so it reads
 *  as part of the view rather than another panel. */
export function Legend() {
  const view = useAtlasStore((s) => s.mapView);
  const repos = useAtlasStore((s) => s.repos);
  const city = useAtlasStore((s) => s.city);
  const { resolvedMode, themeId, paletteEpoch } = useTheme();

  const palette = useMemo(
    () => readPalette(resolvedMode === "dark"),
    [resolvedMode, themeId, paletteEpoch],
  );

  const entries = useMemo(() => {
    const totals = new Map<string, number>();
    const source = view === "city" && city ? [city.summary] : repos;
    for (const repo of source) {
      for (const slice of repo.langs) {
        // Folded the same way the scene folds them, so the key describes what
        // is actually on the canvas rather than what the scanner found.
        const key = langTier(slice.lang) === "inert" ? "Assets" : slice.lang;
        totals.set(key, (totals.get(key) ?? 0) + slice.bytes);
      }
    }
    const assets = totals.get("Assets");
    totals.delete("Assets");
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    // Assets keeps a reserved slot rather than competing for one: it is on the
    // canvas either way, and it is usually large enough to crowd out real
    // languages if it is allowed to sort on bytes.
    if (assets !== undefined) top.push(["Assets", assets]);
    return top.map(([lang, bytes]) => ({ lang, bytes }));
  }, [view, repos, city]);

  if (entries.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-border/60 bg-card/80 px-2.5 py-2 backdrop-blur">
      <ul className="flex flex-col gap-1">
        {entries.map(({ lang, bytes }) => (
          <li key={lang} className="flex items-center gap-2 text-[11px] leading-none">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: css(palette.lang(lang)) }}
            />
            <span className="text-foreground/80">{lang}</span>
            <span className="ml-auto pl-3 tabular-nums text-muted-foreground/70">
              {formatBytes(bytes)}
            </span>
          </li>
        ))}
        <li className="mt-0.5 flex items-center gap-2 border-t border-border/60 pt-1.5 text-[11px] leading-none">
          <span
            className="size-2.5 shrink-0 rounded-[3px] border-2"
            style={{ borderColor: css(palette.brand) }}
          />
          <span className="text-muted-foreground">uncommitted</span>
        </li>
      </ul>
    </div>
  );
}
