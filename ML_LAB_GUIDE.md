# Nexis AI Lab — Complete Guide

The **AI Lab** (a.k.a. the **ML Suite**) turns Nexis into a place where you
can **write a small model, watch it learn, and use it** — without leaving the
terminal app and without a cloud account. It's built for the hobbyist loop:
*copy a tutorial, edit three lines, hit Train, watch the curve.*

This guide explains **every feature, how to use it, and why it exists.** If
you just want to get going, read [Quick start](#quick-start); everything else
is reference you can dip into.

> Companion docs: [`ML_SUITE.md`](ML_SUITE.md) is the design/decision record
> and status; this file is the user + feature guide.

---

## Table of contents

1. [What it is (and the philosophy)](#what-it-is)
2. [The pieces: panel, two engines, one protocol](#the-pieces)
3. [Quick start](#quick-start)
4. [Choosing an engine](#choosing-an-engine)
5. [Installing / locating an engine](#installing-an-engine)
6. [Projects & templates](#projects--templates)
7. [`train.toml` configuration reference](#traintoml-reference)
8. [Training in the panel](#training-in-the-panel)
9. [Devices: CPU, GPU, and `auto`](#devices)
10. [Runs & the run store](#runs--the-run-store)
11. [Comparing runs](#comparing-runs)
12. [The confusion-matrix viewer](#confusion-matrix)
13. [The inference Playground](#playground)
14. [Sample previews (text & image grids)](#sample-previews)
15. [HTML report export](#html-report)
16. [ONNX export](#onnx-export)
17. [Notes, tags & pinned baselines](#notes-tags-pins)
18. [Pause, resume & stop](#pause-resume-stop)
19. [Reproducibility](#reproducibility)
20. [CLI reference](#cli-reference)
21. [The NDJSON protocol](#protocol)
22. [Capabilities by engine](#capabilities-matrix)
23. [Troubleshooting & FAQ](#troubleshooting)
24. [Design notes (the *why*)](#design-notes)

---

<a name="what-it-is"></a>
## 1. What it is (and the philosophy)

The AI Lab is a small, local-first machine-learning workbench:

- **Your model is your file.** Each project has a `train.py` you own and edit.
  The Lab wraps a normal training loop with metric streaming, checkpoints, and
  run storage — it never hides the model definition. Editing the architecture
  and re-training is the whole point.
- **Small models, small data, your machine.** No cloud, no distributed
  training, no model zoo. The defaults train in seconds-to-minutes on a laptop
  and reach for your GPU when it helps.
- **Watch it learn.** Live loss/accuracy curves, generated-text snapshots, and
  sample-prediction grids update as training runs.
- **Then use it.** An inference Playground, a shareable HTML report, and ONNX
  export turn a trained run into something you can poke at or ship.

---

<a name="the-pieces"></a>
## 2. The pieces: panel, two engines, one protocol

```
┌─────────────────────────────┐     NDJSON over stdio      ┌────────────────────┐
│  Nexis "AI Lab" panel (UI)  │ ◀───────────────────────── │   an engine        │
│  charts, runs, playground   │ ──────────────────────────▶│  (Python or Rust)  │
└─────────────────────────────┘   stdin control commands   └────────────────────┘
                                                                      │ writes
                                                                      ▼
                                                        .nexis-ml/runs/<id>/  (the run store)
```

- **The panel** is the UI in Nexis (pinned to the sidebar rail as **"ML Lab"**
  by default). It detects an engine, scaffolds projects, launches training,
  and renders everything.
- **An engine** is the program that actually trains. There are two,
  interchangeable because they speak the **same protocol** and write the
  **same run store**:
  - **`nexis-ml` (Python)** — the full-featured engine (PyTorch).
  - **`nexis-ml-rs` (Rust)** — a single downloadable binary for machines with
    no Python toolchain.
- **The protocol** is line-delimited JSON (NDJSON) on stdout, plus a few
  control commands on stdin. Because it's just text, the panel renders a run
  from either engine with zero changes. See [§21](#protocol).

You normally never think about the protocol — it's what lets "the same panel"
work with "either engine."

---

<a name="quick-start"></a>
## 3. Quick start

1. **Open the panel.** Click **ML Lab** in the sidebar rail.
2. **Get an engine.** If none is detected, the panel offers a one-click
   install into a detected Python environment (CPU PyTorch, or a CUDA build if
   it sees an NVIDIA GPU). See [§5](#installing-an-engine).
3. **Create a project.** In the **Create** card, pick a template
   (`tabular`, `textgen`, or `image`), name it, and hit **Create & train**.
   This scaffolds a folder with `train.py` + `train.toml` and starts training.
4. **Watch it learn.** The progress bar, status sentences, and the hero chart
   update live. For `textgen` you'll see generated-text snapshots; for `image`,
   a sample-prediction grid.
5. **Use it.** When it finishes, open the **Playground** to run the model on
   your own input, or export an **HTML report**.

That's the loop. Everything below is detail.

---

<a name="choosing-an-engine"></a>
## 4. Choosing an engine

| | **Python `nexis-ml`** | **Rust `nexis-ml-rs`** |
|---|---|---|
| Install | `pip install nexis-ml[torch]` | download one binary (~31 MB) |
| Needs Python/PyTorch | yes | **no** |
| Templates | tabular, textgen, image | tabular (MLP), image (CNN) |
| Custom model code (`train.py`) | **yes** — edit freely | no (config-only) |
| GPU | CUDA (NVIDIA) via PyTorch | **wgpu** (Vulkan/DX12/Metal) — any modern GPU |
| Playground / inference | yes (textgen + tabular) | not yet |
| HTML report | yes | not yet |
| ONNX export | no | **yes** (tabular) |

**Use the Python engine** for the full experience — editing model code,
text generation, the Playground, and reports. It's the default.

**Use the Rust engine** when a machine has no Python/PyTorch and you just want
to train a tabular MLP or an image CNN from config, or when you want GPU
training without a CUDA toolchain. It's a fallback/portability path: see
[§22](#capabilities-matrix) for exactly what it does and doesn't do.

---

<a name="installing-an-engine"></a>
## 5. Installing / locating an engine

**Python engine (recommended).** The panel detects `nexis-ml` in:
- every Python environment it finds in your workspace,
- `.venv`/`venv` folders up the directory tree, and
- your `PATH`.

If it isn't found, the panel shows a one-click **install** button that runs
`pip install nexis-ml[torch]` into the best environment it found (preferring an
isolated venv). If it detects an NVIDIA GPU, it offers to install the **CUDA**
PyTorch build first.

**Standalone Rust engine.** The panel also looks for a managed binary under
the app's local-data dir (`…/engine/nexis-ml(.exe)`). You can place a built
binary there, or — once a release is published — download it from the panel.
Internally this is the `ml_download` path: fetch over https → managed dir →
verify with `--version`, exactly like Nexis downloads an LSP server.

To re-scan after installing, use the panel's **re-detect** action.

---

<a name="projects--templates"></a>
## 6. Projects & templates

A **project** is a folder with a `train.py` (your model + loop) and a
`train.toml` (its knobs). Create one from the panel's **Create** card or the
CLI:

```sh
nexis-ml new <template> [dir]      # e.g. nexis-ml new tabular my-classifier
```

There are three templates, each a complete, runnable starting point:

### `tabular` — "my spreadsheet, what predicts what"
A small **MLP** classifier over a CSV (or built-in synthetic data). The
canonical "I have rows with a label column" case.
- **Data:** a CSV with a header row; one column is the target, the rest are
  numeric features.
- **Use it when:** you have structured/tabular data and want a quick
  classifier, or you're learning how a neural net fits.
- **Watch:** loss curves, validation accuracy, and a per-epoch
  [confusion matrix](#confusion-matrix).

### `textgen` — a tiny character-level GPT
A nanoGPT-style transformer that learns to continue text, character by
character.
- **Data:** any UTF-8 `.txt` file.
- **Use it when:** you want to see a language model learn from scratch on your
  own corpus (gibberish → words in a few passes).
- **Watch:** `loss/val`, `perplexity/val`, and a **generated-text snapshot**
  after every pass (scrub through passes to watch it improve).

### `image` — a small CNN over folders of images
A convolutional classifier over a *folder-per-class* image directory.
- **Data:** `data/<class>/*.png|jpg|jpeg|bmp` (one folder per class). The
  Python template ships four bundled pattern classes so it runs out of the box.
- **Use it when:** you have images sorted into class folders and want to train
  a "which class is this?" model.
- **Watch:** accuracy, a confusion matrix, and a **sample-prediction grid**
  (green border = right, red = wrong) after every pass.

> The Rust engine supports `tabular` and `image` (config-only). `textgen`
> requires the Python engine.

---

<a name="traintoml-reference"></a>
## 7. `train.toml` configuration reference

`train.toml` is the editable surface. Edit it and re-run — the
[hyperparameter form](#training-in-the-panel) in the panel edits it for you
(preserving your comments). All keys have sensible defaults.

### Shared `[train]` keys (all templates)

| key | meaning |
|---|---|
| `epochs` | number of passes over the data |
| `batch_size` | rows/sequences/images per gradient step |
| `lr` | learning rate |
| `val_split` | fraction held out for validation (e.g. `0.2`) |
| `seed` | RNG seed — controls data shuffle **and** weight init, so runs are reproducible |
| `device` | `auto` \| `cpu` \| `gpu` — see [§9](#devices) |

### `tabular`

```toml
[data]
path = "data/example.csv"   # CSV with a header row
target = "label"            # column to predict; the rest are features

[model]
hidden = [32, 16]           # MLP hidden-layer widths; a single int (hidden = 64) also works
```

`hidden` accepts a list (`[64, 32]` → two hidden layers) or a single width
(`64` → one). An empty list (`[]`) is a bare linear classifier. Both engines
accept either form.

### `textgen`

```toml
[data]
path = "data/input.txt"     # any UTF-8 .txt

[model]
context = 128               # characters of history seen at once
embed   = 128               # model width (must divide evenly by `heads`)
heads   = 4                 # attention heads
layers  = 4                 # transformer blocks
dropout = 0.1

[train]
steps_per_epoch = 200       # training batches per pass
# ... plus the shared [train] keys

[sample]
length = 240                # characters generated after each pass
temperature = 0.8           # >1 wilder, <1 safer/repetitive
prime = "\n"                # seed text the sample starts from
```

### `image`

```toml
[data]
path = "data"               # a folder of <class>/ subfolders of images

[model]
conv1 = 16                  # filters in the first conv layer
conv2 = 32                  # filters in the second conv layer
hidden = 64                 # dense layer width before the output

[sample]
grid = 16                   # images in the per-epoch sample-prediction grid
```

**Editing model *sizes* (in `train.toml`) is always supported** — the new
sizes ride along in the checkpoint, so inference still works. **Editing model
*code* (in `train.py`)** is encouraged for training, but the built-in
Playground predictors rebuild the model from the saved sizes, so heavy code
changes can make them mismatch the weights (training still works; you'd just
write your own inference). The Lab reports a mismatch clearly instead of
crashing.

---

<a name="training-in-the-panel"></a>
## 8. Training in the panel

When you train, the panel shows:

- **A progress bar + plain-language status** ("pass 7 of 20", "training on
  GPU", "finished"). The goal is that you never need to read raw logs to know
  what's happening.
- **The hero chart** — the primary metric (loss) drawn live, with friendly
  metric names. Long runs are decimated so the chart stays small and smooth
  without losing spikes.
- **The hyperparameter form** — edit `train.toml` from the UI (epochs, lr,
  batch size, `hidden`, etc.) with surgical edits that preserve your comments
  and formatting.
- **The create card** — pick a template and scaffold + train in one click.

**Auto-open.** There's a setting, **"Open the ML Lab panel automatically when
a training run starts"** (off by default). Turn it on if you usually kick off
training from the CLI or elsewhere and want the panel to pop up and follow
along. (Settings sync live across windows.)

---

<a name="devices"></a>
## 9. Devices: CPU, GPU, and `auto`

Set `[train] device` to `auto`, `cpu`, or `gpu`.

- **`cpu`** — always the CPU.
- **`gpu`** — use the GPU; warn and fall back to CPU if none is usable.
- **`auto`** (default) — decide automatically.

The two engines use different GPU backends and slightly different `auto`
heuristics:

| | Python (`nexis-ml`) | Rust (`nexis-ml-rs`) |
|---|---|---|
| GPU backend | **CUDA** (NVIDIA, via PyTorch) | **wgpu** (Vulkan/DX12/Metal/OpenGL — any modern GPU, no vendor toolchain) |
| `auto` | weighs **job size** — tiny jobs stay on CPU where GPU launch overhead would dominate | uses the GPU whenever an adapter is present (probes safely, falls back to CPU on a driverless box) |

When training on a GPU, the panel also plots a **`mem/gpu_mb`** curve (GPU
memory footprint) — `torch.cuda.memory_allocated` on the Python side, the
wgpu compute client's `bytes_in_use` on the Rust side.

The resolved device is recorded on every run (visible in the run summary), so
you always know what a run actually trained on.

---

<a name="runs--the-run-store"></a>
## 10. Runs & the run store

Every training run is saved under the project as a self-contained directory —
no database, fully portable, gitignorable:

```
<project>/.nexis-ml/runs/<run-id>/
├── config.json       # the resolved hyperparameters + derived metadata
├── metrics.jsonl     # every protocol event, one JSON object per line
├── summary.json      # final status, per-metric last/min/max, artifacts
├── checkpoints/      # best.pt / last.pt   (Rust: best.json metadata)
├── artifacts/        # confusion-matrix JSON, sample-grid PNGs, …
└── notes.json        # your note, tags, and pinned-baseline flag
```

The **run browser** in the panel lists past runs with their status and key
metrics. Because finished runs carry their full event stream in
`metrics.jsonl`, the panel renders any past run **without the engine running**
— charts, confusion matrix, samples and all.

Run ids are timestamp-based (`YYYY-MM-DD-HHMM-<name>`), so they sort
chronologically.

---

<a name="comparing-runs"></a>
## 11. Comparing runs

Select **two or more** past runs in the browser to **overlay their metric
curves** on one multi-line chart (each run a color, with a legend and shared
decimation). This is how you answer "did bumping the learning rate / widening
the net actually help?" at a glance instead of squinting at numbers.

---

<a name="confusion-matrix"></a>
## 12. The confusion-matrix viewer

For classification (`tabular` and `image`), each evaluation writes a
**confusion matrix** artifact, rendered in the panel as a colored grid:

- **Rows = actual class, columns = predicted class.**
- The green diagonal is correct predictions; off-diagonal red cells are
  mistakes, shaded by count.

It updates per epoch live, and is available on any historical run. Use it to
see *which* classes the model confuses, not just the overall accuracy.

---

<a name="playground"></a>
## 13. The inference Playground

The Playground runs a **trained** model on your own input, interactively. It
starts a `serve` session (a long-lived engine process answering one request
per line) and adapts to the model:

- **textgen:** type a prompt → the model continues it. Controls for
  `maxNew` (length) and `temperature` (wildness).
- **tabular:** a form built from the model's feature columns → enter values →
  get the predicted class with per-class probabilities. Missing fields fall
  back to the training mean, so partial rows still predict.

Models reconstruct from the **sizes saved in the checkpoint**, so changing a
size in `train.toml` is fully supported. A checkpoint whose `train.py` *code*
was heavily edited may not match the built-in predictor — you'll get a clear
message rather than a crash.

> The Playground works with the **Python** engine and, from v0.8, the
> standalone **Rust** engine (tabular models; the panel checks the engine's
> `serve` capability). Image-model inference isn't in the Playground yet —
> watch the sample-prediction grid during training instead.

---

<a name="sample-previews"></a>
## 14. Sample previews (text & image grids)

Two templates emit live "show me what it can do" previews each pass:

- **textgen → generated-text snapshots.** After every pass the model generates
  a sample (seeded by `[sample] prime`, length `length`, wildness
  `temperature`). The panel shows the latest and lets you **scrub through
  passes** to watch gibberish turn into words.
- **image → sample-prediction grids.** A grid of validation images with the
  model's prediction, **green-bordered if right, red if wrong** — a visual,
  at-a-glance accuracy read.

Both are stored as run artifacts, so they're there on historical runs too.

---

<a name="html-report"></a>
## 15. HTML report export

Export a **self-contained `.html` report** of any run — inline SVG charts, a
metrics summary, the confusion matrix, the latest sample grid (base64
embedded), generated-text samples, and the config. No external assets, no
network: it opens anywhere and is easy to share or archive.

- **Panel:** the export button on a run.
- **CLI:** `nexis-ml export --run <id>` → `report.html` in the run dir.

> HTML report export is a **Python-engine** feature.

---

<a name="onnx-export"></a>
## 16. ONNX export

Export a trained **tabular MLP** to **ONNX** — a portable model you can run
with onnxruntime / `ort` (in any language), no Python required:

```sh
nexis-ml export --onnx [dir]      # Rust engine; writes <dir>/model.onnx
```

- The graph takes **raw features** (input name `input`) and returns class
  logits (`output`); standardization is baked in, so you feed unprocessed
  values.
- Any MLP depth exports. It's verified against onnxruntime for an exact
  prediction match.

> ONNX export is a **Rust-engine** feature (the Python engine's `export`
> writes the HTML report instead — the two engines' `export` do different
> things by design). CNN/image ONNX export is a planned follow-up.

---

<a name="notes-tags-pins"></a>
## 17. Notes, tags & pinned baselines

Each run carries lightweight metadata (`notes.json`, travels with the run):

- **Note** — free text ("first try with dropout 0.2").
- **Tags** — short labels for filtering/organizing.
- **Pinned baseline** — mark one run as your reference; pinned runs sort to the
  top, so "the good one" is always easy to find and compare against.

---

<a name="pause-resume-stop"></a>
## 18. Pause, resume & stop

While a run is training you can:

- **Pause / Resume** — the engine halts at the next epoch boundary and waits,
  then continues. Useful to free the GPU briefly without losing progress.
- **Stop** — a graceful cancel: the engine finishes the current step, writes a
  checkpoint, finalizes the run as `cancelled`, and exits. (A hard kill is
  available if a stuck process doesn't respond.)

These work against **either engine** — both honor the same stdin control
commands (`cancel` / `pause` / `resume`).

---

<a name="reproducibility"></a>
## 19. Reproducibility

`[train] seed` makes a run repeatable: it seeds **both** the data shuffle and
the model's weight initialization. Train twice with the same seed, data, and
config and you get the same result (on the same device/engine). This also
makes ONNX exports deterministic.

Note that GPU vs CPU and Python vs Rust can differ at the last decimal due to
floating-point order — "reproducible" means within an engine+device.

---

<a name="cli-reference"></a>
## 20. CLI reference

Everything in the panel is also a CLI. Add `--nexis-protocol` to stream NDJSON
on stdout (what the panel consumes); without it you get human-readable output.

### Python engine (`nexis-ml`)

| command | what it does |
|---|---|
| `nexis-ml new <template> [dir]` | scaffold a project (`tabular`/`textgen`/`image`) |
| `nexis-ml train [dir]` | run the project's `train.py` |
| `nexis-ml runs [dir]` | list runs in a project |
| `nexis-ml infer [dir] --run <id>` | one-shot inference from a checkpoint |
| `nexis-ml serve [dir] --run <id>` | request/response inference loop (the Playground) |
| `nexis-ml export [dir] --run <id>` | write a self-contained HTML report |
| `nexis-ml replay [dir] --run <id>` | re-emit a finished run's events (re-watch) |
| `nexis-ml env` | JSON capability report (python/torch/CUDA/GPU) |

### Rust engine (`nexis-ml-rs`, binary named `nexis-ml`)

| command | what it does |
|---|---|
| `nexis-ml --version` | print version (Nexis-detectable) |
| `nexis-ml env` | JSON capability report (`backend: cpu` or `wgpu`) |
| `nexis-ml new <template> [dir]` | scaffold a `tabular` or `image` project |
| `nexis-ml train [dir]` | train the MLP/CNN from `train.toml` |
| `nexis-ml export --onnx [dir]` | export the tabular MLP to `model.onnx` |

---

<a name="protocol"></a>
## 21. The NDJSON protocol

You only need this if you're extending the Lab or writing your own engine. The
engine prints one JSON object per line on stdout (in `--nexis-protocol` mode);
the same objects are appended to `metrics.jsonl`. **Consumers ignore unknown
event types and fields** (forward-compatible).

**Training events** (`ev`): `run.started`, `metric`, `epoch`, `artifact`,
`sample`, `log`, `run.finished`.

```json
{"ev":"run.started","run":"…","name":"tabular","totalEpochs":15,"device":"gpu","protocol":1}
{"ev":"metric","run":"…","step":42,"epoch":3,"name":"loss/train","value":0.214}
{"ev":"epoch","run":"…","epoch":3,"of":15}
{"ev":"artifact","run":"…","kind":"confusion-matrix","path":"…/cm-epoch3.json"}
{"ev":"sample","run":"…","output":"…generated text…"}
{"ev":"run.finished","run":"…","status":"ok","summary":{ … }}
```

**Serve (inference) dialect:** a `ready` event, then one `prediction` or
`error` per request.

**Control commands** (the panel writes these to the engine's stdin):
`{"cmd":"cancel"}`, `{"cmd":"pause"}`, `{"cmd":"resume"}`.

Common metric names: `loss/train`, `loss/val`, `acc/val`,
`perplexity/val` (textgen), `mem/gpu_mb` (GPU runs).

Because the protocol is the only contract, any engine that emits it and writes
the run-store layout is a drop-in — which is exactly how the Python and Rust
engines coexist.

---

<a name="capabilities-matrix"></a>
## 22. Capabilities by engine

| feature | Python `nexis-ml` | Rust `nexis-ml-rs` |
|---|:--:|:--:|
| `tabular` MLP | ✅ | ✅ |
| `textgen` GPT | ✅ | ❌ |
| `image` CNN | ✅ | ✅ |
| edit model code (`train.py`) | ✅ | ❌ (config-only) |
| GPU training | ✅ CUDA | ✅ wgpu |
| live charts / runs / confusion matrix | ✅ | ✅ |
| pause / resume / stop | ✅ | ✅ |
| reproducible seed | ✅ | ✅ |
| Playground (serve inference) | ✅ | ✅ (v0.8+, tabular) |
| HTML report (`export --run`) | ✅ | ❌ |
| ONNX export (`export --onnx`) | ❌ | ✅ (tabular) |
| `replay` | ✅ | ❌ |

If you mix engines, keep these gaps in mind: the **Playground, HTML report,
and replay need the Python engine**; **ONNX export needs the Rust engine**.
Runs produced by either engine are readable by both (and by the panel).

---

<a name="troubleshooting"></a>
## 23. Troubleshooting & FAQ

**The panel says no engine is found.**
Install it (panel button → `pip install nexis-ml[torch]`), or place/download a
standalone Rust binary in the managed engine dir, then re-detect. The CLI
`nexis-ml --version` is the same check the panel runs.

**Training is slow / not using my GPU.**
Check the run's device in the summary. Set `device = "gpu"` to force it. On the
Python engine, `auto` keeps *tiny* jobs on CPU on purpose (GPU launch overhead
would make them slower) — bump `epochs`/model size or set `gpu` explicitly.
The Rust engine's GPU path (wgpu) needs no CUDA toolchain.

**"This checkpoint doesn't match the built-in model."**
You edited the model *code* in `train.py`. Training and your own inference
still work; the built-in Playground can't rebuild an edited architecture from
saved sizes. Changing model *sizes* in `train.toml` is always fine.

**`hidden = 64` vs `hidden = [64, 32]`.**
Both work (a scalar is one hidden layer; a list is several). The hyperparameter
form writes a list.

**`textgen` won't start: "embed must be divisible by heads".**
Set `[model] embed` to a multiple of `[model] heads` (e.g. embed 128, heads 4).

**The Rust engine errors on `replay`/`textgen`/HTML export.**
Those are Python-engine features — see [§22](#capabilities-matrix). (`serve`
works from Rust engine v0.8 for tabular runs trained by v0.8+.)

**Where did my run go?**
`<project>/.nexis-ml/runs/`. It's just files — copy, archive, or delete the
folder freely.

---

<a name="design-notes"></a>
## 24. Design notes (the *why*)

A few choices worth understanding:

- **Why two engines?** The user-visible core is *writing a small model and
  watching it learn*, where PyTorch lets a hobbyist copy a tutorial and edit
  three lines. So the **Python engine is primary**. But "no Python on this
  machine" is a real barrier, so a **single-binary Rust engine** was added for
  the downloadable-add-on path. They never compete: same protocol, same run
  store, so the panel doesn't care which one ran.

- **Why `train.py` is yours.** Hiding the model behind a GUI would kill the
  learning loop. The harness is a *library* you wrap a normal loop with, not a
  framework that owns your model. (The Rust engine can't run your `train.py`,
  so there the editable surface is `train.toml` instead — declarative presets.)

- **Why NDJSON over stdio.** It's the simplest possible contract: trivial to
  emit from any language, trivial to append to a file, and it makes finished
  runs renderable without the engine. It's why the Rust engine could be added
  later without touching the UI.

- **Why wgpu for the Rust GPU path.** CUDA ties you to NVIDIA + a toolchain.
  wgpu runs on Vulkan/DX12/Metal, so the *same* downloadable binary uses the
  GPU on essentially any modern machine — the "GPU on any box" win.

- **Why hand-rolled ONNX.** burn (the Rust ML framework) imports ONNX but
  doesn't export it, so the Rust engine hand-encodes the protobuf for the MLP
  — no heavy dependency, and verified against onnxruntime.

---

*This guide tracks the implemented suite; for the milestone-by-milestone
record and rationale, see [`ML_SUITE.md`](ML_SUITE.md) and the engines'
`PLAN.md` / `README.md`.*
