import { useTheme } from "@/modules/theme/ThemeProvider";
import { useMemo } from "react";
import { css, readPalette } from "./palette";
import { useCityStore } from "./store";
import { formatBytes } from "./types";

/** Floating key for the colour ramp. Glass card over the canvas, so it reads
 *  as part of the view rather than another panel. */
export function Legend() {
  const view = useCityStore((s) => s.view);
  const repos = useCityStore((s) => s.repos);
  const city = useCityStore((s) => s.city);
  const { resolvedMode } = useTheme();

  const palette = useMemo(() => readPalette(resolvedMode === "dark"), [resolvedMode]);

  const entries = useMemo(() => {
    const totals = new Map<string, number>();
    const source = view === "city" && city ? [city.summary] : repos;
    for (const repo of source) {
      for (const slice of repo.langs) {
        totals.set(slice.lang, (totals.get(slice.lang) ?? 0) + slice.bytes);
      }
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([lang, bytes]) => ({ lang, bytes }));
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
