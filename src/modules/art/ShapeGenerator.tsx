// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Parametric shapes with live controls, feeding the playground's editor.
 *
 * It deliberately does **not** own an export, an optimizer or a size preview —
 * it produces an SVG document and hands it to the editor, where all of that
 * already works. A generator that grew its own export path would be the second
 * implementation of something the pack already has.
 *
 * Insertion is an explicit button rather than live-writing into the editor as
 * sliders move. Live-writing reads as more immediate and is worse: it destroys
 * whatever the user had hand-written the moment they touch a control, and
 * there is no undo across that boundary. The generator previews its own output
 * instead, and replacing the editor's content stays a decision.
 */

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { defaultValues, SHAPES, type ShapeDef } from "./lib/shapes";
import { sanitizeSvgForPreview } from "./lib/svgSanitize";

type Props = {
  /** Replace the editor's content with this markup. */
  onInsert: (svg: string) => void;
};

export function ShapeGenerator({ onInsert }: Props) {
  const [shape, setShape] = useState<ShapeDef>(SHAPES[0]);
  // Values are kept per shape so switching away and back does not discard a
  // set of parameters someone just dialled in.
  const [values, setValues] = useState<Record<string, Record<string, number>>>(
    () => Object.fromEntries(SHAPES.map((s) => [s.id, defaultValues(s)])),
  );

  const current = values[shape.id];
  const svg = useMemo(() => shape.render(current), [shape, current]);
  // Generated markup is produced by our own pure functions and a test asserts
  // it is already clean, but the preview goes through the same gate as any
  // other markup so there is one rule rather than an exception.
  const safe = useMemo(() => sanitizeSvgForPreview(svg).svg, [svg]);

  const set = (key: string, value: number) =>
    setValues((prev) => ({
      ...prev,
      [shape.id]: { ...prev[shape.id], [key]: value },
    }));

  const reset = () =>
    setValues((prev) => ({ ...prev, [shape.id]: defaultValues(shape) }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Shape picker */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 px-2 py-1.5">
        {SHAPES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === shape.id}
            onClick={() => setShape(s)}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              s.id === shape.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* Preview */}
        <div className="mb-3 flex items-center justify-center rounded-lg border border-border/60 bg-card/40 p-3">
          <div
            className="text-primary [&>svg]:h-auto [&>svg]:w-full"
            style={{ maxWidth: 160 }}
            // Generated locally and sanitized above.
            dangerouslySetInnerHTML={{ __html: safe }}
          />
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2">
          {shape.params.map((p) => (
            <label key={p.key} className="flex flex-col gap-0.5" title={p.hint}>
              <span className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                {p.label}
                <span className="font-mono tabular-nums text-muted-foreground/70">
                  {Number(current[p.key].toFixed(2))}
                </span>
              </span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={current[p.key]}
                onChange={(e) => set(p.key, Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-t border-border/50 px-3 py-2">
        <button
          type="button"
          onClick={() => onInsert(svg)}
          className="flex items-center gap-1.5 rounded-md bg-primary/90 px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Icon name="add" size="xs" />
          Insert into editor
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Reset
        </button>
        <span className="ml-auto text-[9.5px] text-muted-foreground/60">
          replaces the editor
        </span>
      </div>
    </div>
  );
}
