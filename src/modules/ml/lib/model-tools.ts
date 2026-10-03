// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * "Talk to your models": agent tools that let the AI chat's language model
 * use the models trained in the ML Lab.
 *
 * The language model handles the conversation; the trained model handles the
 * question it was trained for. A user asks "who's the greatest player in my
 * data?", the language model calls `ml_rank_csv` on the GOAT project, and
 * answers from the ranking it gets back. The language model never guesses a
 * prediction itself, because the tools hand it the trained model's numbers.
 *
 * The tools are read-only and auto-approved. They list projects, read run
 * summaries, and run `nexis-ml serve` (the allowlisted engine subcommand) on
 * an existing checkpoint. Nothing here trains, writes, or deletes. Paths are
 * confined to the workspace: a project is chosen by name from the discovered
 * list, a run by id from that project's run store, and a CSV must resolve
 * inside the workspace root.
 */
import { z } from "zod";
import type { ToolContribution } from "@/modules/ai/tools/plugin-tools";
import { useMlStore } from "../store";
import { readTextFile } from "./fs";
import { withHeadlessSession, type HeadlessSession, type Prediction } from "./headless";
import { parseDataConfig, parseTomlNet } from "./netspec";
import { discoverProjects, readRuns, type HistoricalRun, type MlProject } from "./projects";

const MAX_PREDICT_ROWS = 50;
const MAX_RANK_ROWS = 5000;

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF. Enough for exports. */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.some((f) => f !== "")) records.push(record);
      record = [];
    } else {
      field += c;
    }
  }
  record.push(field);
  if (record.some((f) => f !== "")) records.push(record);
  const [header = [], ...rows] = records;
  return { header: header.map((h) => h.trim()), rows };
}

/** The run to serve: the one asked for, else the best finished run. Pinned
 *  runs come first in `runs` (see `readRuns`), so a pinned baseline wins. */
export function pickRun(runs: HistoricalRun[], requested?: string): HistoricalRun | null {
  if (requested) return runs.find((r) => r.id === requested) ?? null;
  return (
    runs.find((r) => r.status === "ok") ??
    runs.find((r) => r.status === "cancelled") ??
    null
  );
}

/** A CSV row as a model input: only the model's own features, only numbers.
 *  Missing features are left out (the engine fills the training mean). */
export function rowToInput(
  header: string[],
  row: string[],
  features: string[],
): Record<string, number> {
  const input: Record<string, number> = {};
  for (const f of features) {
    const idx = header.indexOf(f);
    if (idx < 0) continue;
    const raw = row[idx]?.trim();
    const n = raw === "" || raw == null ? NaN : Number(raw);
    if (Number.isFinite(n)) input[f] = n;
  }
  return input;
}

export type TabularOutput = { label?: string; probs?: Record<string, number>; value?: number };

export type Scored = {
  id: string;
  label?: string;
  /** What the ranking sorted on. */
  score: number;
  probability?: number;
  /** ln(p / (1 - p)): tells 0.99990 from 0.9999999 when both print as 1. */
  logOdds?: number;
  expected?: number;
  value?: number;
};

/** Log-odds, clamped so an exact 0 or 1 from a float32 softmax stays finite. */
export function logOdds(p: number): number {
  const q = Math.min(1 - 1e-12, Math.max(1e-12, p));
  return Math.log(q / (1 - q));
}

/** Σ class × p, when every class name is a number (ordinal tiers). */
export function expectedClass(probs: Record<string, number>): number | null {
  let sum = 0;
  for (const [cls, p] of Object.entries(probs)) {
    const n = Number(cls);
    if (!Number.isFinite(n)) return null;
    sum += n * p;
  }
  return sum;
}

/**
 * Score one prediction. Classification sorts on the probability of
 * `rankClass`, tie-broken by the expected class; regression sorts on the value.
 */
export function scorePrediction(id: string, out: TabularOutput, rankClass: string | null): Scored {
  if (out.value !== undefined && out.probs === undefined) {
    return { id, score: out.value, value: out.value };
  }
  const probs = out.probs ?? {};
  const probability = rankClass ? (probs[rankClass] ?? 0) : 0;
  const expected = expectedClass(probs) ?? undefined;
  return {
    id,
    label: out.label,
    // the expected class only breaks ties in the 4th decimal and beyond
    score: probability + (expected ?? 0) * 1e-6,
    probability,
    logOdds: logOdds(probability),
    expected,
  };
}

/** The class to rank by: the one asked for, else the highest-numbered class
 *  (the top tier), else the last class the model lists. */
export function defaultRankClass(classes: string[] | undefined, requested?: string): string | null {
  if (requested) return requested;
  if (!classes || classes.length === 0) return null;
  const numeric = classes.every((c) => Number.isFinite(Number(c)));
  if (numeric) return classes.slice().sort((a, b) => Number(b) - Number(a))[0];
  return classes[classes.length - 1];
}

/** True when `path` is `root` or inside it (separator- and case-tolerant). */
export function insideRoot(path: string, root: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const p = norm(path);
  const r = norm(root);
  return p === r || p.startsWith(`${r}/`);
}

function isAbsolute(p: string): boolean {
  return p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p);
}

/** Collapse `.`/`..` so `insideRoot` can't be fooled by `data/../../x`. */
export function normalizePath(p: string): string {
  const unified = p.replace(/\\/g, "/");
  const drive = unified.match(/^[a-zA-Z]:/)?.[0] ?? "";
  const rest = unified.slice(drive.length);
  const out: string[] = [];
  for (const part of rest.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `${drive}/${out.join("/")}`;
}

// ── Workspace lookups ────────────────────────────────────────────────────────

function requireRoot(root: string | null): string {
  if (!root) throw new Error("No folder is open. Open the workspace that holds the ML projects first.");
  return root;
}

async function findProject(root: string, name: string): Promise<MlProject> {
  const projects = await discoverProjects(root);
  const wanted = name.trim().toLowerCase();
  const hit = projects.find(
    (p) => p.name.toLowerCase() === wanted || p.dir.toLowerCase() === wanted,
  );
  if (!hit) {
    const names = projects.map((p) => p.name).join(", ") || "none";
    throw new Error(`No ML project named "${name}". Projects in this workspace: ${names}.`);
  }
  return hit;
}

async function runsOf(project: MlProject): Promise<HistoricalRun[]> {
  try {
    return await readRuns(project.dir);
  } catch {
    return []; // no run store yet
  }
}

async function engineFor(root: string): Promise<string> {
  const store = useMlStore.getState();
  if (!store.engineExe) await store.detect(root);
  const { engineExe, engineKind, envInfo } = useMlStore.getState();
  if (!engineExe) {
    throw new Error("No nexis-ml engine is set up. Open the ML Lab to install one.");
  }
  if (engineKind === "rust" && !envInfo?.serve) {
    throw new Error("This engine version can't serve models. Update it from the ML Lab.");
  }
  return engineExe;
}

/** Let the panel finish stamping any session it is starting, so its spawn
 *  and ours never share the unstamped window (see headless.ts). */
async function panelQuiet(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const { serve, activeRun } = useMlStore.getState();
    if (serve?.sid !== -1 && activeRun?.sid !== -1) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function serveRun<T>(
  root: string,
  projectName: string,
  runId: string | undefined,
  fn: (session: HeadlessSession, project: MlProject, run: HistoricalRun) => Promise<T>,
): Promise<T> {
  const project = await findProject(root, projectName);
  const run = pickRun(await runsOf(project), runId);
  if (!run) {
    throw new Error(
      runId
        ? `Project "${project.name}" has no run "${runId}".`
        : `Project "${project.name}" has no finished run yet. Train it in the ML Lab first.`,
    );
  }
  const exe = await engineFor(root);
  return withHeadlessSession(
    { exe, projectDir: project.dir, runId: run.id, waitForQuiet: panelQuiet },
    (session) => fn(session, project, run),
  );
}

function tabularOutput(p: Prediction): TabularOutput {
  const o = (p.output ?? {}) as TabularOutput;
  return { label: o.label, probs: o.probs, value: o.value };
}

const round = (n: number | undefined, d = 4) =>
  n === undefined ? undefined : Number(n.toFixed(d));

// ── Tools ────────────────────────────────────────────────────────────────────

const listModels: ToolContribution = {
  id: "nexis.ml:list-models",
  name: "ml_list_models",
  description:
    "List the machine-learning models the user trained in the Nexis ML Lab: each project's " +
    "kind (tabular classifier, image CNN, text GPT), the columns it reads and predicts, its " +
    "training brief, and its recent runs with their final metrics. Call this first whenever " +
    "the user asks about 'my model(s)', before ml_predict or ml_rank_csv.",
  inputSchema: z.object({}),
  approval: "auto",
  async execute(_input: never, ctx) {
    const root = requireRoot(ctx.getWorkspaceRoot());
    const projects = await discoverProjects(root);
    return {
      workspace: root,
      projects: await Promise.all(
        projects.map(async (p) => {
          const [toml, brief, runs] = await Promise.all([
            readTextFile(`${p.dir}/train.toml`),
            readTextFile(`${p.dir}/PROJECT.md`),
            runsOf(p),
          ]);
          const net = toml ? parseTomlNet(toml) : null;
          const data = toml ? parseDataConfig(toml) : { path: null, target: null };
          let columns: string[] | null = null;
          if (data.path && net?.kind === "mlp") {
            const csv = await readTextFile(`${p.dir}/${data.path}`);
            if (csv) columns = parseCsv(csv.slice(0, 4096).split(/\r?\n/)[0] + "\n").header;
          }
          const serveable = pickRun(runs);
          return {
            name: p.name,
            kind: net?.kind ?? "unknown",
            architecture: net,
            data: data.path,
            predicts: data.target,
            features: columns && data.target ? columns.filter((c) => c !== data.target) : columns,
            brief: brief ? brief.replace(/^# Training brief\s*/, "").slice(0, 1200) : null,
            default_run: serveable?.id ?? null,
            runs: runs.slice(0, 5).map((r) => ({
              id: r.id,
              status: r.status,
              pinned: r.pinned ?? false,
              note: r.note || undefined,
              epochs: r.lastEpoch ?? undefined,
              final_metrics: Object.fromEntries(
                Object.entries(r.metrics ?? {}).map(([k, v]) => [k, round(v.last)]),
              ),
            })),
          };
        }),
      ),
    };
  },
};

const predictInput = z.object({
  project: z.string().describe("Project name from ml_list_models."),
  run: z.string().optional().describe("Run id. Default: the pinned or latest finished run."),
  rows: z
    .array(z.record(z.string(), z.number()))
    .max(MAX_PREDICT_ROWS)
    .optional()
    .describe("Tabular models: feature name → number, one object per prediction. Missing features use the training average."),
  prompt: z.string().optional().describe("Text models: the text to continue."),
  max_new: z.number().int().min(1).max(2000).optional().describe("Text models: characters to generate (default 200)."),
  temperature: z.number().min(0.05).max(3).optional().describe("Text models: sampling temperature (default 0.8)."),
});

const predict: ToolContribution = {
  id: "nexis.ml:predict",
  name: "ml_predict",
  description:
    "Run one of the user's trained ML Lab models. Tabular models: pass `rows` (up to 50 " +
    "objects of feature → number) and get each row's predicted class with class " +
    "probabilities, or a predicted value. Text models: pass `prompt` and get the model's " +
    "continuation. Report results as the model's output, not as fact.",
  inputSchema: predictInput,
  approval: "auto",
  async execute(raw: never, ctx) {
    const input = raw as z.infer<typeof predictInput>;
    const root = requireRoot(ctx.getWorkspaceRoot());
    return serveRun(root, input.project, input.run, async (session, project, run) => {
      const base = { project: project.name, run: run.id, device: session.device };
      if (session.template === "textgen") {
        if (!input.prompt) throw new Error("This is a text model: pass `prompt`.");
        const p = await session.infer({
          input: input.prompt,
          maxNew: input.max_new ?? 200,
          temperature: input.temperature ?? 0.8,
        });
        return { ...base, prompt: input.prompt, continuation: p.continuation ?? String(p.output ?? "") };
      }
      if (!input.rows || input.rows.length === 0) {
        throw new Error(`Pass \`rows\`. This model's features: ${(session.meta.features ?? []).join(", ")}.`);
      }
      const known = new Set(session.meta.features ?? []);
      const predictions = [];
      for (const row of input.rows) {
        const unknown = Object.keys(row).filter((k) => !known.has(k));
        // react-doctor-disable-next-line react-doctor/async-await-in-loop -- serve answers one stdin line at a time; infer() refuses overlap
        const out = tabularOutput(await session.infer({ input: row }));
        predictions.push({
          input: row,
          ...(unknown.length ? { ignored_fields: unknown } : {}),
          label: out.label,
          probabilities: out.probs
            ? Object.fromEntries(Object.entries(out.probs).map(([k, v]) => [k, round(v)]))
            : undefined,
          value: round(out.value),
        });
      }
      return { ...base, features: session.meta.features, classes: session.meta.classes, predictions };
    });
  },
};

const rankInput = z.object({
  project: z.string().describe("Project name from ml_list_models."),
  csv: z.string().describe("CSV to score, relative to the project folder (e.g. data/players_named.csv) or the workspace."),
  run: z.string().optional().describe("Run id. Default: the pinned or latest finished run."),
  id_column: z.string().optional().describe("Column that names each row (e.g. player). Default: the first non-feature column."),
  rank_class: z.string().optional().describe("Class to rank by its probability. Default: the highest-numbered class (the top tier)."),
  top: z.number().int().min(1).max(100).optional().describe("How many rows to return (default 15)."),
  ascending: z.boolean().optional().describe("Return the lowest-scoring rows instead."),
});

const rankCsv: ToolContribution = {
  id: "nexis.ml:rank-csv",
  name: "ml_rank_csv",
  description:
    "Score every row of a CSV with one of the user's trained tabular ML Lab models and " +
    "return the top rows. Use it for 'who is the best/most likely/riskiest' questions, " +
    "e.g. ranking players by the model's probability of the all-time-great tier. Feature " +
    "columns are matched by name; other columns are ignored. Up to 5000 rows.",
  inputSchema: rankInput,
  approval: "auto",
  async execute(raw: never, ctx) {
    const input = raw as z.infer<typeof rankInput>;
    const root = requireRoot(ctx.getWorkspaceRoot());
    const project = await findProject(root, input.project);

    const candidates = isAbsolute(input.csv)
      ? [input.csv]
      : [`${project.dir}/${input.csv}`, `${root}/${input.csv}`];
    let text: string | null = null;
    let csvPath = "";
    for (const c of candidates.map(normalizePath)) {
      if (!insideRoot(c, root)) continue;
      text = await readTextFile(c);
      if (text !== null) {
        csvPath = c;
        break;
      }
    }
    if (text === null) throw new Error(`Couldn't read "${input.csv}" inside the workspace.`);
    const { header, rows } = parseCsv(text);
    if (rows.length === 0) throw new Error(`"${input.csv}" has no data rows.`);
    if (rows.length > MAX_RANK_ROWS) {
      throw new Error(`"${input.csv}" has ${rows.length} rows; the limit is ${MAX_RANK_ROWS}.`);
    }

    return serveRun(root, project.name, input.run, async (session, _p, run) => {
      if (session.template === "textgen") throw new Error("Ranking needs a tabular model.");
      const features = session.meta.features ?? [];
      const columns = new Set(header);
      const featureSet = new Set(features);
      const missing = features.filter((f) => !columns.has(f));
      if (missing.length === features.length) {
        throw new Error(`None of the model's features (${features.join(", ")}) are columns in "${input.csv}".`);
      }
      const idCol = input.id_column
        ? header.indexOf(input.id_column)
        : header.findIndex((h) => !featureSet.has(h));
      if (input.id_column && idCol < 0) throw new Error(`No column "${input.id_column}".`);
      const rankClass = defaultRankClass(session.meta.classes, input.rank_class);
      if (rankClass && session.meta.classes && !session.meta.classes.includes(rankClass)) {
        throw new Error(`No class "${rankClass}". Classes: ${session.meta.classes.join(", ")}.`);
      }

      const scored: Scored[] = [];
      for (let i = 0; i < rows.length; i++) {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop -- serve answers one stdin line at a time; infer() refuses overlap
        const out = tabularOutput(await session.infer({ input: rowToInput(header, rows[i], features) }));
        const id = idCol >= 0 ? rows[i][idCol] : `row ${i + 1}`;
        scored.push(scorePrediction(id, out, rankClass));
      }
      scored.sort((a, b) => (input.ascending ? a.score - b.score : b.score - a.score));
      const top = scored.slice(0, input.top ?? 15);
      return {
        project: project.name,
        run: run.id,
        csv: csvPath,
        rows_scored: scored.length,
        ranked_by: rankClass ? `probability of class "${rankClass}"` : "predicted value",
        ...(rankClass
          ? { note: "Near 1.0, compare log_odds. A gap under ~1 is within run-to-run noise; check with another run." }
          : {}),
        ...(missing.length ? { features_missing_from_csv: missing } : {}),
        results: top.map((s, i) => ({
          rank: i + 1,
          id: s.id,
          predicted: s.label,
          probability: round(s.probability, 6),
          log_odds: round(s.logOdds, 2),
          expected_class: round(s.expected, 3),
          value: round(s.value),
        })),
      };
    });
  },
};

export const ML_MODEL_TOOLS: ToolContribution[] = [listModels, predict, rankCsv];
