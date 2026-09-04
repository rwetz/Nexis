// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A keyframe timeline over the playground's document.
 *
 * The roadmap held this back until the rest of the pack earned it, and the
 * hold was right for a reason that only became obvious once the canvas
 * shipped: a timeline needs to *address* elements, and `svgDoc.ts` already
 * tags every element with `data-nx-id` for exactly that. Without it this panel
 * would have had to invent a second selection model, which is the part that
 * would actually have been large.
 *
 * ## The preview is the real thing
 *
 * It renders the animated document itself rather than simulating the motion in
 * React state. Two things fall out of that and both matter: what you see is
 * literally what exports, and the panel needs no clock of its own — SMIL and
 * CSS both run in the browser that is already painting the preview. Restarting
 * is a remount, which is what the `key` is for.
 */

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { ExportBar } from "./ExportBar";
import {
  ANIMATABLE,
  ANIMATABLE_LABELS,
  applyAnimation,
  DEFAULT_TIMELINE,
  hasMotion,
  isColor,
  newTrack,
  type Animatable,
  type AnimationFormat,
  type Timeline,
  type Track,
} from "./lib/animate";
import { parseSvgSource, serializeForPreview } from "./lib/svgDoc";
import { looksLikeSvg } from "./lib/svgExport";
import { sanitizeSvgForPreview } from "./lib/svgSanitize";

/** Written by the SVG playground. Read-only here. */
const PLAYGROUND_KEY = "nexis:svg-playground:source";

function readPlaygroundSource(): string {
  try {
    return localStorage.getItem(PLAYGROUND_KEY) ?? "";
  } catch {
    return "";
  }
}

type Props = {
  workspaceRoot: string | null;
};

export function AnimatorPanel({ workspaceRoot }: Props) {
  const [source, setSource] = useState<string>(readPlaygroundSource);
  const [timeline, setTimeline] = useState<Timeline>(DEFAULT_TIMELINE);
  const [format, setFormat] = useState<AnimationFormat>("smil");
  const [property, setProperty] = useState<Animatable>("opacity");
  const [target, setTarget] = useState<number | null>(null);
  // Bumped to remount the preview, which is how an animation restarts.
  const [runId, setRunId] = useState(0);

  const valid = looksLikeSvg(source);

  // The document is tagged so a track can name an element. This is the same
  // tagging the canvas uses, and the ids match because both come from
  // `parseSvgSource` walking the tree in document order.
  const tagged = useMemo(() => {
    if (!valid) return null;
    const parsed = parseSvgSource(source);
    return parsed ? { parsed, markup: serializeForPreview(parsed) } : null;
  }, [source, valid]);

  const targets = useMemo(() => {
    if (!tagged) return [];
    const out: { id: number; label: string }[] = [];
    const walk = (el: Element) => {
      const raw = el.getAttribute("data-nx-id");
      const id = raw === null ? null : Number.parseInt(raw, 10);
      if (id !== null && Number.isFinite(id) && el !== tagged.parsed.root) {
        out.push({ id, label: `${id}. <${el.nodeName.toLowerCase()}>` });
      }
      for (const child of Array.from(el.children)) walk(child);
    };
    walk(tagged.parsed.root);
    return out;
  }, [tagged]);

  const animated = useMemo(() => {
    if (!tagged) return "";
    return applyAnimation(tagged.markup, timeline, format);
  }, [tagged, timeline, format]);

  const safe = useMemo(
    () => (animated ? sanitizeSvgForPreview(animated).svg : ""),
    [animated],
  );

  const addTrack = () =>
    setTimeline((t) => ({
      ...t,
      tracks: [...t.tracks, newTrack(property, target)],
    }));

  const updateTrack = (id: string, patch: Partial<Track>) =>
    setTimeline((t) => ({
      ...t,
      tracks: t.tracks.map((tr) => (tr.id === id ? { ...tr, ...patch } : tr)),
    }));

  const removeTrack = (id: string) =>
    setTimeline((t) => ({ ...t, tracks: t.tracks.filter((tr) => tr.id !== id) }));

  const setKey = (trackId: string, index: number, value: number | string) =>
    setTimeline((t) => ({
      ...t,
      tracks: t.tracks.map((tr) =>
        tr.id === trackId
          ? {
              ...tr,
              keys: tr.keys.map((k, i) => (i === index ? { ...k, value } : k)),
            }
          : tr,
      ),
    }));

  const setKeyTime = (trackId: string, index: number, at: number) =>
    setTimeline((t) => ({
      ...t,
      tracks: t.tracks.map((tr) =>
        tr.id === trackId
          ? { ...tr, keys: tr.keys.map((k, i) => (i === index ? { ...k, at } : k)) }
          : tr,
      ),
    }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="play" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Animator
        </span>
        <button
          type="button"
          onClick={() => setSource(readPlaygroundSource())}
          title="Re-read the SVG playground's current document"
          className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        >
          <Icon name="refresh" size="xs" />
        </button>
      </div>

      {!valid ? (
        <p className="p-4 text-center text-[11px] leading-relaxed text-muted-foreground">
          Draw or paste a mark in the SVG playground first — this animates the
          document that panel is holding.
        </p>
      ) : (
        <>
          {/* Preview */}
          <div className="shrink-0 border-b border-border/50 p-3">
            <div className="mx-auto flex size-24 items-center justify-center text-foreground">
              <div
                key={runId}
                className="size-full [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: safe }}
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRunId((r) => r + 1)}
                title="Restart the animation"
                className="flex items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-0.5 text-[10.5px] transition-colors hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
              >
                <Icon name="refresh" size="xs" />
                Replay
              </button>

              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                Duration
                <input
                  type="number"
                  min={0.1}
                  max={30}
                  step={0.1}
                  value={timeline.duration}
                  onChange={(e) =>
                    setTimeline((t) => ({
                      ...t,
                      duration: Math.max(0.1, Number(e.target.value) || 0.1),
                    }))
                  }
                  className="w-12 rounded border border-border/60 bg-background/60 px-1 py-0.5 text-[10px] tabular-nums focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                />
                s
              </label>

              <button
                type="button"
                aria-pressed={timeline.repeat}
                onClick={() => setTimeline((t) => ({ ...t, repeat: !t.repeat }))}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                  timeline.repeat
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Loop
              </button>

              <span className="ml-auto flex items-center gap-1">
                {(["smil", "css"] as AnimationFormat[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={format === f}
                    onClick={() => setFormat(f)}
                    title={
                      f === "smil"
                        ? "Travels inside the file: an <img> or background-image animates"
                        : "Only animates when the SVG is inline in a page, but a stylesheet can reach it"
                    }
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] uppercase transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                      format === f
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f}
                  </button>
                ))}
              </span>
            </div>
          </div>

          {/* Add a track */}
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 px-2 py-1.5">
            <select
              value={target ?? ""}
              onChange={(e) =>
                setTarget(e.target.value === "" ? null : Number(e.target.value))
              }
              aria-label="Element to animate"
              className="min-w-0 max-w-[45%] rounded border border-border/60 bg-background/60 px-1 py-0.5 text-[10px] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <option value="">Whole document</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>

            <select
              value={property}
              onChange={(e) => setProperty(e.target.value as Animatable)}
              aria-label="Property to animate"
              className="rounded border border-border/60 bg-background/60 px-1 py-0.5 text-[10px] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              {ANIMATABLE.map((p) => (
                <option key={p} value={p}>
                  {ANIMATABLE_LABELS[p]}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={addTrack}
              className="ml-auto flex items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-0.5 text-[10.5px] transition-colors hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <Icon name="add" size="xs" />
              Track
            </button>
          </div>

          {/* Tracks */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {timeline.tracks.length === 0 ? (
              <p className="p-4 text-center text-[11px] leading-relaxed text-muted-foreground/60">
                No tracks. Pick an element and a property, then add one.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {timeline.tracks.map((track) => (
                  <li
                    key={track.id}
                    className={cn(
                      "rounded-md border bg-card/40 px-2 py-1.5",
                      hasMotion(track) ? "border-border/50" : "border-amber-500/40",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10.5px] font-medium">
                        {ANIMATABLE_LABELS[track.property]}
                      </span>
                      <span className="font-mono text-[9.5px] text-muted-foreground/60">
                        {track.target === null ? "svg" : `#${track.target}`}
                      </span>
                      {!hasMotion(track) && (
                        <span
                          className="text-[9px] text-amber-500"
                          title="A track needs at least two keyframes to animate"
                        >
                          no motion
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeTrack(track.id)}
                        title="Remove this track"
                        className="ml-auto rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                      >
                        <Icon name="close" size="xs" />
                      </button>
                    </div>

                    <div className="mt-1 flex flex-col gap-1">
                      {track.keys.map((key, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={key.at}
                            onChange={(e) =>
                              setKeyTime(track.id, i, Number(e.target.value))
                            }
                            aria-label={`Keyframe ${i + 1} position`}
                            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                          />
                          <span className="w-7 shrink-0 text-right font-mono text-[9px] tabular-nums text-muted-foreground/60">
                            {Math.round(key.at * 100)}%
                          </span>
                          {isColor(track.property) ? (
                            <input
                              type="color"
                              value={String(key.value)}
                              onChange={(e) => setKey(track.id, i, e.target.value)}
                              aria-label={`Keyframe ${i + 1} colour`}
                              className="h-4 w-6 shrink-0 cursor-pointer rounded border border-border/60 bg-transparent p-0"
                            />
                          ) : (
                            <input
                              type="number"
                              step={0.1}
                              value={Number(key.value)}
                              onChange={(e) =>
                                setKey(track.id, i, Number(e.target.value) || 0)
                              }
                              aria-label={`Keyframe ${i + 1} value`}
                              className="w-14 shrink-0 rounded border border-border/60 bg-background/60 px-1 py-0.5 text-[10px] tabular-nums focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                            />
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        updateTrack(track.id, {
                          keys: [
                            ...track.keys,
                            {
                              at: 0.5,
                              value: track.keys[track.keys.length - 1]?.value ?? 0,
                            },
                          ].sort((a, b) => a.at - b.at),
                        })
                      }
                      className="mt-1 text-[9.5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                    >
                      + keyframe
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ExportBar source={animated} valid workspaceRoot={workspaceRoot} />
        </>
      )}
    </div>
  );
}
