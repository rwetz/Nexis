// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * NetworkGraph — draw the model itself, not just its training curves.
 *
 * Tier 1 (always): the architecture from train.toml — an MLP renders as a
 * node graph (input features → hidden layers → classes; big layers are
 * bucketed, see lib/netgraph.ts), CNN/GPT render as labeled block
 * diagrams. Works on both engines, before any training exists.
 *
 * Tier 2 (when the engine emits a `weights` artifact — contract in
 * ML_SUITE.md): edge opacity/width follows learned |weight| magnitudes,
 * re-read every eval, so you can watch connections strengthen and die
 * off as training runs.
 *
 * Input feature names come from the data CSV's header; class labels from
 * the latest confusion-matrix artifact. Both are best-effort — unknown
 * columns render as unlabeled ghost nodes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { canvasBackingScale } from "@/lib/canvas";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useMlStore } from "./store";
import { Explain } from "./Explain";
import { cssColor } from "./MetricChart";
import { readConfusionMatrix, readWeights } from "./lib/artifacts";
import { readTextFile } from "./lib/fs";
import { readTrainToml } from "./lib/config";
import {
  csvHeaderFeatures,
  parseDataConfig,
  parseTomlNet,
  type TomlNet,
} from "./lib/netspec";
import {
  bucketMagnitudes,
  columnsForMlp,
  type DrawnColumn,
  type WeightsFile,
} from "./lib/netgraph";

/**
 * Drawing geometry, in CSS pixels at scale 1.
 *
 * The sidebar height was 150px, which put ~20 nodes into 110px of usable
 * span and left the labels fighting the top row. `tab` is the same drawing
 * given room to breathe when the graph is opened as its own tab.
 */
const GEOMETRY = {
  panel: { height: 220, nodeR: 4.5, padX: 14, padY: 26, font: 10 },
  tab: { height: 560, nodeR: 7, padX: 48, padY: 56, font: 13 },
} as const;

export type NetworkGraphVariant = keyof typeof GEOMETRY;

export function NetworkGraph({
  projectDir,
  variant = "panel",
  onOpenAsTab,
}: {
  projectDir: string;
  variant?: NetworkGraphVariant;
  /** Shows the "open as tab" affordance when provided (panel variant only —
   *  the tab is already the detached view). */
  onOpenAsTab?: () => void;
}) {
  const weightsArtifact = useMlStore((s) => s.weightsArtifact);
  const cmArtifact = useMlStore((s) => s.cmArtifact);
  // Re-read train.toml when a new run starts — that's the moment edited
  // hyperparameters (hidden sizes etc.) actually take effect.
  const liveRunId = useMlStore((s) => s.activeRun?.runId ?? null);

  const [net, setNet] = useState<TomlNet | null>(null);
  const [features, setFeatures] = useState<string[] | null>(null);
  const [classes, setClasses] = useState<string[] | null>(null);
  const [weights, setWeights] = useState<WeightsFile | null>(null);

  // Architecture + feature names from the project's files.
  useEffect(() => {
    let cancelled = false;
    setNet(null);
    setFeatures(null);
    void (async () => {
      const toml = await readTrainToml(projectDir);
      if (cancelled || toml == null) return;
      const parsed = parseTomlNet(toml);
      setNet(parsed);
      if (parsed?.kind !== "mlp") return;
      const { path, target } = parseDataConfig(toml);
      if (!path || !/\.csv$/i.test(path)) return;
      const csv = await readTextFile(`${projectDir}/${path}`);
      if (cancelled || csv == null) return;
      const header = csv.slice(0, csv.indexOf("\n") + 1 || csv.length);
      setFeatures(csvHeaderFeatures(header, target));
    })();
    return () => {
      cancelled = true;
    };
  }, [projectDir, liveRunId]);

  // Class labels from the confusion matrix of the run in view.
  useEffect(() => {
    if (!cmArtifact) {
      setClasses(null);
      return;
    }
    let cancelled = false;
    void readConfusionMatrix(cmArtifact.path).then((cm) => {
      if (!cancelled) setClasses(cm?.labels ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [cmArtifact?.path]);

  // Tier 2: learned weights, refreshed each eval the engine reports one.
  useEffect(() => {
    if (!weightsArtifact) {
      setWeights(null);
      return;
    }
    let cancelled = false;
    void readWeights(weightsArtifact.path).then((w) => {
      if (!cancelled) setWeights(w);
    });
    return () => {
      cancelled = true;
    };
  }, [weightsArtifact?.path]);

  const isTab = variant === "tab";
  if (!net) {
    // In the panel this is a section that simply isn't applicable, so it
    // renders nothing. A tab is a thing the user deliberately opened, so it
    // has to account for itself rather than showing an empty pane.
    if (!isTab) return null;
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="max-w-md text-[12px] leading-snug text-muted-foreground">
          No architecture to draw for this project — its{" "}
          <span className="font-mono">train.toml</span> has no recognizable{" "}
          <span className="font-mono">[net]</span> section yet. Create or train
          a model and this updates on its own.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        isTab
          ? "flex h-full min-h-0 flex-col rounded-md border border-border/60 bg-muted/20 p-3"
          : "mb-2 rounded-md border border-border/60 bg-muted/20 p-2"
      }
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Network
        </span>
        <span className="flex items-center gap-1.5">
          {net.kind === "mlp" && weights ? (
            <span className="text-[9.5px] text-muted-foreground/60">
              connection strength = learned weights
              {weightsArtifact?.epoch != null
                ? ` · after pass ${weightsArtifact.epoch}`
                : ""}
            </span>
          ) : null}
          {onOpenAsTab && !isTab ? (
            <button
              type="button"
              onClick={onOpenAsTab}
              aria-label="Open network in a tab"
              title="Open the network diagram in its own tab"
              className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <Icon name="expand" size="xs" />
            </button>
          ) : null}
        </span>
      </div>
      {net.kind === "mlp" ? (
        <MlpGraph
          hidden={net.hidden}
          features={features}
          classes={classes}
          weights={weights}
          variant={variant}
        />
      ) : net.kind === "cnn" ? (
        <BlockDiagram
          blocks={[
            { label: "images", term: undefined },
            ...net.conv.map((c, i) => ({
              label: `conv ${i + 1} · ${c}ch`,
              term: "conv",
            })),
            ...(net.hidden.length > 0
              ? [{ label: `dense · ${net.hidden.join("×")}`, term: "hidden" }]
              : []),
            { label: classes ? `${classes.length} classes` : "classes", term: undefined },
          ]}
          caption="Convolution layers learn visual patterns; the dense layer maps them to classes."
        />
      ) : (
        <BlockDiagram
          blocks={[
            { label: `context · ${net.context ?? "?"}`, term: "context" },
            { label: `embed · ${net.embed ?? "?"}`, term: "embed" },
            {
              label: `${net.layers ?? "?"} block${(net.layers ?? 0) === 1 ? "" : "s"} · ${net.heads ?? "?"} heads`,
              term: "heads",
            },
            { label: "next char", term: undefined },
          ]}
          caption="A tiny GPT: each block attends over the context to predict the next character."
        />
      )}
    </div>
  );
}

// ── MLP node graph (canvas) ───────────────────────────────────────────────────

function MlpGraph({
  hidden,
  features,
  classes,
  weights,
  variant,
}: {
  hidden: number[];
  features: string[] | null;
  classes: string[] | null;
  weights: WeightsFile | null;
  variant: NetworkGraphVariant;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const geom = GEOMETRY[variant];
  const zoomLevel = usePreferencesStore((s) => s.zoomLevel);

  // Memoized so the redraw effect keys on real changes, not array identity.
  const columns = useMemo(
    () => columnsForMlp(features?.length ?? null, hidden, classes?.length ?? null),
    [features, hidden, classes],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const width = wrap.clientWidth;
      const height = variant === "tab" ? wrap.clientHeight : geom.height;
      if (width <= 0 || height <= 0) return;
      // Backing store in device pixels (dpr × app zoom), CSS box in CSS
      // pixels. Assigning width/height also resets the 2D context, so the
      // scale below has to be re-applied on every draw, not once at setup.
      const scale = canvasBackingScale();
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.clearRect(0, 0, width, height);

      const nodeColor = cssColor(canvas, "--chart-2", "#888");
      const mutedColor = cssColor(canvas, "--muted-foreground", "#777");

      // Node positions per column.
      const colX = (c: number) =>
        geom.padX +
        (columns.length > 1
          ? (c / (columns.length - 1)) * (width - geom.padX * 2)
          : 0);
      const nodeY = (col: DrawnColumn, i: number) => {
        const span = height - geom.padY * 2;
        if (col.drawn === 1) return geom.padY + span / 2;
        return geom.padY + (i / (col.drawn - 1)) * span;
      };

      // Edges between adjacent columns. Structure-only: faint uniform
      // lines. With weights: opacity/width follow bucketed |w|.
      for (let c = 0; c < columns.length - 1; c++) {
        const from = columns[c];
        const to = columns[c + 1];
        const layer = weights?.layers[c];
        const usable =
          layer && layer.in === (from.total ?? -1) && layer.out === (to.total ?? -1);
        const mags = usable ? bucketMagnitudes(layer, from.drawn, to.drawn) : null;
        for (let a = 0; a < from.drawn; a++) {
          for (let b = 0; b < to.drawn; b++) {
            const mag = mags ? mags[a][b] : null;
            if (mag !== null && mag < 0.05) continue; // dead connections vanish
            ctx.strokeStyle = nodeColor;
            ctx.globalAlpha = mag !== null ? 0.08 + mag * 0.65 : 0.1;
            ctx.lineWidth =
              (mag !== null ? 0.5 + mag * 1.5 : 0.5) * (geom.nodeR / 3.5);
            ctx.beginPath();
            ctx.moveTo(colX(c) + geom.nodeR, nodeY(from, a));
            ctx.lineTo(colX(c + 1) - geom.nodeR, nodeY(to, b));
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      // Nodes + column captions.
      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        const ghost = col.total == null;
        for (let i = 0; i < col.drawn; i++) {
          ctx.beginPath();
          ctx.arc(colX(c), nodeY(col, i), geom.nodeR, 0, Math.PI * 2);
          if (ghost) {
            ctx.strokeStyle = mutedColor;
            ctx.globalAlpha = 0.5;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = nodeColor;
            ctx.fill();
          }
        }
        ctx.fillStyle = mutedColor;
        ctx.font = `${geom.font}px ui-sans-serif, system-ui`;
        ctx.textAlign = c === 0 ? "left" : c === columns.length - 1 ? "right" : "center";
        const caption =
          col.total != null && col.total > col.drawn
            ? `${col.label} (${col.total})`
            : col.label;
        ctx.fillText(
          caption,
          colX(c) +
            (c === 0 ? -geom.nodeR : c === columns.length - 1 ? geom.nodeR : 0),
          geom.font + 2,
        );
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
    // `zoomLevel` is a dependency even though the draw never reads it:
    // changing app zoom moves `--app-zoom` without changing any CSS-pixel
    // size, so ResizeObserver never fires and the canvas would keep a
    // backing store sized for the old zoom (i.e. render soft) until the next
    // layout change.
  }, [columns, weights, geom, variant, zoomLevel]);

  const inputLabel = features
    ? features.join(", ")
    : "input columns (add data to name them)";
  const outputLabel = classes
    ? classes.join(", ")
    : "classes (train once to name them)";

  const isTab = variant === "tab";
  return (
    <div className={isTab ? "flex min-h-0 flex-1 flex-col" : "w-full"}>
      <div ref={wrapRef} className={isTab ? "min-h-0 flex-1" : "w-full"}>
        <canvas
          ref={canvasRef}
          className={
            isTab
              ? "block h-full w-full rounded-sm bg-background/40"
              : "block w-full rounded-sm bg-background/40"
          }
        />
      </div>
      <p
        className={cn(
          "mt-1 leading-snug text-muted-foreground/60",
          isTab ? "text-[11px]" : "truncate text-[9.5px]",
        )}
      >
        <Explain term="hidden">
          <span>
            {inputLabel} → {hidden.join(" → ")} → {outputLabel}
          </span>
        </Explain>
      </p>
    </div>
  );
}

// ── Block diagram (CNN / GPT) ─────────────────────────────────────────────────

function BlockDiagram({
  blocks,
  caption,
}: {
  blocks: { label: string; term: string | undefined }[];
  caption: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {blocks.map((b, i) => (
          <span key={b.label} className="flex items-center gap-1">
            {i > 0 ? (
              <span className="text-[10px] text-muted-foreground/50">→</span>
            ) : null}
            <Explain term={b.term}>
              <span className="rounded border border-border/70 bg-background/50 px-1.5 py-0.5 font-mono text-[10px] text-foreground/85">
                {b.label}
              </span>
            </Explain>
          </span>
        ))}
      </div>
      <p className="mt-1 text-[9.5px] leading-snug text-muted-foreground/60">
        {caption}
      </p>
    </div>
  );
}
