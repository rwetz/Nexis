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

const CANVAS_HEIGHT = 150;
const NODE_R = 3.5;
const PAD_X = 10;
const PAD_Y = 20;

export function NetworkGraph({ projectDir }: { projectDir: string }) {
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

  if (!net) return null;

  return (
    <div className="mb-2 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Network
        </span>
        {net.kind === "mlp" && weights ? (
          <span className="text-[9.5px] text-muted-foreground/60">
            connection strength = learned weights
            {weightsArtifact?.epoch != null
              ? ` · after pass ${weightsArtifact.epoch}`
              : ""}
          </span>
        ) : null}
      </div>
      {net.kind === "mlp" ? (
        <MlpGraph
          hidden={net.hidden}
          features={features}
          classes={classes}
          weights={weights}
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
}: {
  hidden: number[];
  features: string[] | null;
  classes: string[] | null;
  weights: WeightsFile | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
      if (width <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(CANVAS_HEIGHT * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${CANVAS_HEIGHT}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, CANVAS_HEIGHT);

      const nodeColor = cssColor(canvas, "--chart-2", "#888");
      const mutedColor = cssColor(canvas, "--muted-foreground", "#777");

      // Node positions per column.
      const colX = (c: number) =>
        PAD_X + (columns.length > 1 ? (c / (columns.length - 1)) * (width - PAD_X * 2) : 0);
      const nodeY = (col: DrawnColumn, i: number) => {
        const span = CANVAS_HEIGHT - PAD_Y * 2;
        if (col.drawn === 1) return PAD_Y + span / 2;
        return PAD_Y + (i / (col.drawn - 1)) * span;
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
            ctx.lineWidth = mag !== null ? 0.5 + mag * 1.5 : 0.5;
            ctx.beginPath();
            ctx.moveTo(colX(c) + NODE_R, nodeY(from, a));
            ctx.lineTo(colX(c + 1) - NODE_R, nodeY(to, b));
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
          ctx.arc(colX(c), nodeY(col, i), NODE_R, 0, Math.PI * 2);
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
        ctx.font = "9px ui-sans-serif, system-ui";
        ctx.textAlign = c === 0 ? "left" : c === columns.length - 1 ? "right" : "center";
        const caption =
          col.total != null && col.total > col.drawn
            ? `${col.label} (${col.total})`
            : col.label;
        ctx.fillText(caption, colX(c) + (c === 0 ? -NODE_R : c === columns.length - 1 ? NODE_R : 0), 11);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [columns, weights]);

  const inputLabel = features
    ? features.join(", ")
    : "input columns (add data to name them)";
  const outputLabel = classes
    ? classes.join(", ")
    : "classes (train once to name them)";

  return (
    <div ref={wrapRef} className="w-full">
      <canvas ref={canvasRef} height={CANVAS_HEIGHT} className="w-full rounded-sm bg-background/40" />
      <p className="mt-1 truncate text-[9.5px] leading-snug text-muted-foreground/60">
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
