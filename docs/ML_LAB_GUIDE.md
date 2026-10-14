# Synapse (ML Lab) — Complete Guide

**Synapse** is Nexis's ML lab (its code and pack id are still `ml-lab` / `ml`).
It turns Nexis into a place where you can **train a small model on your own
data, watch it learn, and use it**, without leaving the app and without a
cloud account.

Training is done by **Axon**, a single downloadable engine binary. No Python,
no PyTorch, no CUDA toolchain.

This guide explains every feature, how to use it, and why it exists. To get
going, read [Quick start](#quick-start); the rest is reference.

> Companion docs: [`ML_SUITE.md`](ML_SUITE.md) is the design and decision
> record; this file is the user and feature guide.
> [`ML_MODEL_WALKTHROUGH.md`](ML_MODEL_WALKTHROUGH.md) builds one model start
> to finish (a basketball GOAT ranker), including asking it questions in the
> AI chat. Axon's own README covers the engine from the command line.

> **Engine history.** Axon was called `nexis-ml-rs` up to v0.8, and Nexis
> originally shipped with a Python engine, `nexis-ml`. The Python engine is
> phased out; [§23](#legacy-python) lists what it still does that Axon
> doesn't yet.

---

## Table of contents

1. [What it is](#what-it-is)
2. [The pieces: panel, engine, protocol](#the-pieces)
3. [Quick start](#quick-start)
4. [Installing Axon](#installing-an-engine)
5. [Projects & templates](#projects--templates)
6. [Your own spreadsheet](#your-data)
7. [`train.toml` reference](#traintoml-reference)
8. [Training in the panel](#training-in-the-panel)
9. [Devices: CPU, GPU, and `auto`](#devices)
10. [Runs & the run store](#runs--the-run-store)
11. [Comparing runs](#comparing-runs)
12. [Confusion matrix and predicted-vs-actual](#confusion-matrix)
13. [The inference Playground](#playground)
14. [Image sample grids](#sample-previews)
15. [ONNX export](#onnx-export)
16. [Notes, tags & pinned baselines](#notes-tags-pins)
17. [Pause, resume & stop](#pause-resume-stop)
18. [Reproducibility](#reproducibility)
19. [CLI reference](#cli-reference)
20. [The NDJSON protocol](#protocol)
21. [Troubleshooting & FAQ](#troubleshooting)
22. [Design notes (the *why*)](#design-notes)
23. [The legacy Python engine](#legacy-python)

---

<a name="what-it-is"></a>
## 1. What it is

Synapse is a small, local-first machine-learning workbench:

- **Your data, your machine.** Point it at a CSV in your workspace or a folder
  of images. No cloud, no accounts, no model zoo.
- **Small models, fast.** The defaults train in seconds to minutes on a laptop.
- **Watch it learn.** Live curves, a confusion matrix or a predicted-vs-actual
  plot, and image sample grids update as training runs.
- **Then use it.** An inference Playground, AI-chat tools that call your model,
  and ONNX export turn a trained run into something you can poke at or ship.
- **The model is a file.** Everything about it lives in `train.toml`, which
  the panel edits for you and you can edit by hand.

---

<a name="the-pieces"></a>
## 2. The pieces: panel, engine, protocol

```
┌─────────────────────────────┐     NDJSON over stdio      ┌────────────────────┐
│  Synapse panel (UI)         │ ◀───────────────────────── │   Axon (engine)    │
│  charts, runs, playground   │ ──────────────────────────▶│   one binary       │
└─────────────────────────────┘   stdin control commands   └────────────────────┘
                                                                      │ writes
                                                                      ▼
                                                        .nexis-ml/runs/<id>/  (the run store)
```

- **The panel** is the UI in Nexis. It finds the engine, scaffolds projects,
  launches training and renders everything.
- **Axon** is the program that trains. It is a single binary that Nexis
  downloads and verifies against a pinned SHA-256.
- **The protocol** is line-delimited JSON (NDJSON) on stdout plus a few
  control commands on stdin. Because finished runs keep their full event
  stream on disk, the panel can render any past run without the engine
  running. See [§20](#protocol).

---

<a name="quick-start"></a>
## 3. Quick start

1. **Open Synapse** from the titlebar (it needs the ML Lab pack; the **AI /
   ML** preset turns it on).
2. **Get the engine.** If none is found, click **Download engine**. Nexis
   shows the version, source and checksum, downloads Axon, and verifies it
   before it ever runs. See [§4](#installing-an-engine).
3. **Create a project.** In the **Create** card, pick a
   [stock network](#stock-networks) (a *Starter* comes with data and trains
   immediately) or a bare model family, name it, and hit **Create**.
4. **Use your own data.** Open **Training data**, choose a CSV, the column to
   predict, and whether it is a category or a number. See [§6](#your-data).
5. **Watch it learn**, then open the **Playground** to try the model on your
   own input, or export it to ONNX.

---

<a name="installing-an-engine"></a>
## 4. Installing Axon

**Download (recommended).** The setup card's **Download engine** button
fetches the pinned Axon release for your platform (Windows x64, Linux x64)
into Nexis's app-data folder (`…/engine/axon(.exe)`). Before the bytes are
written or run, they must match the SHA-256 compiled into this Nexis
release. "latest" is never used, so a replaced release asset fails the check
instead of running. The card also offers **install from a local copy** for
offline machines; the same checksum applies.

**Updating.** When the engine in use is older than the version this Nexis
release pins, the panel shows an **Update** notice. Updating replaces the
managed binary. An install from before the rename (`…/engine/nexis-ml(.exe)`)
keeps working until then, and the update removes it.

**On PATH.** Nexis also finds an `axon` on your `PATH`. It checks that
`axon --version` really prints `axon <version>`, so an unrelated program that
happens to be called `axon` isn't mistaken for the engine.

**WSL workspaces.** The download is a Windows binary in the host's app-data
folder, which a distro can't run. In a WSL workspace the card gives the three
commands that put the Linux build on the distro's `PATH`.

**macOS.** There is no prebuilt macOS build yet; build Axon from source
(`cargo build --release`) and put it on your `PATH`.

To re-scan after installing, use **I installed it — check again**.

---

<a name="projects--templates"></a>
## 5. Projects & templates

A **project** is a folder with a `train.toml`. Create one from the panel's
**Create** card or the CLI:

```sh
axon new tabular my-model      # or: axon new image my-images
```

### `tabular` — "my spreadsheet, what predicts what"
An **MLP** over a CSV (or built-in synthetic data until you choose one). It
predicts a **category** ("will this customer churn?") or a **number** ("what
will this house sell for?"). See [§6](#your-data).
- **Watch:** loss curves, and either accuracy plus a
  [confusion matrix](#confusion-matrix), or average error plus a
  predicted-vs-actual plot.

### `image` — a small CNN over folders of images
A convolutional classifier over a folder-per-class image directory.
- **Data:** `data/<class>/*.png|jpg|jpeg|bmp`, one folder per class. `axon new
  image` ships four example pattern classes so it trains out of the box.
- **Watch:** accuracy, a confusion matrix, and a sample-prediction grid
  (green border = right, red = wrong) after every pass.

Text generation (`textgen`) and the code-it-yourself `blank` template belong
to the legacy Python engine; see [§23](#legacy-python).

<a name="stock-networks"></a>
### Stock networks

The create card's **Pick a stock network** gallery holds ready-made starting
points. A stock network is **not a new engine template**: it is a set of
documented `train.toml` values applied on top of a template.

**Starters** pair a network with a **synthetic dataset** Nexis generates into
`data/`, and point `[data] path` / `target` at it, so the project trains the
moment it exists. Every starter dataset is invented by a seeded generator (a
hidden scoring rule plus noise decides the label). It is learnable, and it is
clearly not real-world data. Swap in your own CSV whenever you're ready.
Targets are integer class ids; `PROJECT.md` records what each id means.

| starter | predicts | classes | rows |
|---|---|---|---:|
| Basketball GOAT | career tier, then rank by P(all-time great) | 4 | 900 |
| Game picker | home win | 2 | 1000 |
| Churn risk | customer churn | 2 | 800 |
| Lead score | lead converts | 2 | 700 |
| Credit risk | loan default | 2 | 900 |
| Fraud flag | fraudulent transaction (6% positive) | 2 | 1500 |
| Flower species | species from 4 measurements | 3 | 450 |
| Wine quality | poor / fine / excellent | 3 | 900 |
| Home price band | budget / mid / premium | 3 | 900 |
| Demand band | low / normal / high day | 3 | 730 |
| Exam outcome | student passes | 2 | 600 |
| Machine health | failure soon | 2 | 1200 |

**Architectures** are the classic shapes, for comparing and learning:

| family | stock networks |
|---|---|
| Spreadsheet (MLP) | Linear baseline `[]`, Tiny `[8]`, Classic `[32, 16]`, Wide `[256]`, Deep funnel `[128, 64, 32]`, Deep uniform `[64, 64, 64, 64]`, Bottleneck `[64, 8, 64]`, Big `[512, 256, 128]` |
| Image (CNN, `conv1`/`conv2` → dense) | Mini 8/16→32, LeNet-style 6/16→84, Standard 16/32→64, Wide 32/64→128, Large 64/128→256 |
| Text (GPT, legacy Python engine) | Nano 32/32/2/1, Micro 64/64/4/2, Mini 128/128/4/4, Small 256/256/8/6, Long-context 512/128/4/4, Deep narrow 128/96/4/8 |

With a stock network selected, the **Starting configuration** size sets only
the training budget (epochs, batch size, learning rate); the network's own
shape wins. If the scaffold lacks a key the stock network sets, Nexis leaves
the engine's default and the log names the key. It never adds an unknown key
to the engine's schema. The only keys it adds are the documented `[data]`
`path`, `target` and `task`.

The catalog is `src/modules/ml/lib/stock-models.ts`, the generators
`src/modules/ml/lib/starter-data.ts`.

---

<a name="your-data"></a>
## 6. Your own spreadsheet

The **Training data** section of a tabular project chooses the data without
editing `train.toml`:

- **Spreadsheet (CSV)** — any `.csv` in the workspace.
- **Column to predict** — guessed from a label-ish name, else the last column.
- **Predict** — *Decide for me*, *A category*, or *A number*.

The preview underneath says what training will actually do, using the same
rules as Axon:

- **Which columns the model learns from.** Numeric columns are used as
  numbers. A text column with up to 50 different values (a city, a plan, a
  yes/no) becomes a **category**. A text column with more than that — IDs,
  names, free-text notes — is **left out**, and the preview names it.
- **Blank cells.** Empty, `NA`, `N/A`, `NaN`, `null`, `none`, `?` and `-`
  all count as missing. A missing number is filled with the column's
  training average, and the model also learns *that* it was missing. A
  missing category is its own category. Rows with no value in the column to
  predict are skipped.
- **Category or number.** *Decide for me* predicts a **category** when the
  column holds text, or a handful (≤ 20) of whole numbers like class ids; and
  a **number** for anything else numeric. Choose explicitly when that guess
  is wrong, e.g. a 1–5 rating you want treated as a quantity.
- **Uneven classes.** When one class is at least 3× as common as another,
  Axon weights the rarer classes up while training, so a 6%-positive fraud
  column isn't learned as "never fraud". `[train] class_weights` controls it.

CSV parsing is real CSV: quoted fields, commas and line breaks inside quotes,
Windows line endings, and a UTF-8 BOM all work.

The encoding (averages, category lists) is fitted on the training rows only
and saved with the model, so the Playground, the AI-chat tools and ONNX
export all encode a row exactly the way training did.

---

<a name="traintoml-reference"></a>
## 7. `train.toml` reference

`train.toml` is the editable surface. The panel's forms edit it for you and
keep your comments. Every key has a default.

### `[train]` (all templates)

| key | meaning |
|---|---|
| `epochs` | passes over the data |
| `batch_size` | rows or images per gradient step |
| `lr` | learning rate |
| `val_split` | fraction held out for validation (e.g. `0.2`) |
| `seed` | seeds the data shuffle and the weight init, so runs repeat |
| `device` | `auto` \| `cpu` \| `gpu`, see [§9](#devices) |
| `class_weights` | classification: `auto` (balance when classes are 3:1 or worse) \| `balanced` \| `none` |
| `samples` | rows of synthetic data when there is no `[data] path` |

### Tabular

```toml
[data]
path = "data.csv"         # CSV with a header row
target = "price"          # the column to predict
task = "auto"             # auto | classification | regression
categorical = ["zip"]     # numeric-looking columns that are really categories
ignore = ["id"]           # columns to leave out

[model]
hidden = [32, 16]         # MLP hidden-layer widths; a single int (hidden = 64) also works
```

`hidden` takes a list (`[64, 32]` → two hidden layers) or one width (`64`). An
empty list (`[]`) is a bare linear model.

### Image

```toml
[data]
path = "data"             # a folder of <class>/ subfolders of images

[model]
conv1 = 16                # filters in the first conv layer
conv2 = 32                # filters in the second conv layer
hidden = 64               # dense layer width before the output
```

A malformed `train.toml` is an error that names the problem; Axon doesn't
quietly fall back to defaults.

---

<a name="training-in-the-panel"></a>
## 8. Training in the panel

When you train, the panel shows:

- **A progress bar and plain-language status** ("pass 7 of 20", "finished").
- **The hero chart** — the most meaningful metric: *Accuracy* for a category
  model, *Average error* for a number model. Long runs are decimated so the
  chart stays smooth without losing spikes.
- **The run log** (under Details) — what the model reads, which columns were
  left out, how many rows were skipped, and whether classes were rebalanced.
- **The hyperparameter form** — epochs, learning rate, batch size, `hidden`,
  the CNN's filters, and so on.

| metric | label | meaning |
|---|---|---|
| `acc/val` | Accuracy | share of validation rows classified correctly |
| `mae/val` | Average error | how far off a prediction is on average, in the column's units |
| `rmse/val` | Prediction error | typical miss, with big misses counting extra |
| `r2/val` | Fit (R²) | variation explained: 1 is perfect, 0 is no better than the average |
| `loss/train`, `loss/val` | Training / validation loss | what the optimizer minimizes |
| `mem/gpu_mb` | GPU memory | footprint on GPU runs |

**Auto-open.** The setting **"Open the ML Lab panel automatically when a
training run starts"** (off by default) pops the panel up for runs started
elsewhere.

---

<a name="devices"></a>
## 9. Devices: CPU, GPU, and `auto`

Set `[train] device`:

- **`auto`** (default) and **`cpu`** — the CPU. For the model sizes Axon
  builds, the CPU is faster: the GPU backend's start-up (adapter probe,
  kernel tuning) takes seconds, which dwarfs training at these sizes.
- **`gpu`** — the GPU through **wgpu** (Vulkan/DX12/Metal/OpenGL), on any
  modern GPU with no vendor toolchain. Falls back to the CPU, with a warning,
  if there is no usable adapter.

GPU runs plot a `mem/gpu_mb` curve. The device a run actually used is
recorded in its summary.

---

<a name="runs--the-run-store"></a>
## 10. Runs & the run store

Every training run is saved under the project as a self-contained folder:

```
<project>/.nexis-ml/runs/<run-id>/
├── config.json       # resolved hyperparameters + derived metadata (task, target, columns)
├── metrics.jsonl     # every protocol event, one JSON object per line
├── summary.json      # final status, per-metric last/min/max, artifacts
├── checkpoints/      # best.json (metadata + input encoding), best-weights.json
├── artifacts/        # confusion matrices or residuals, weights, sample grids
└── notes.json        # your note, tags, and pinned-baseline flag
```

The folder name `.nexis-ml` predates the engine rename and is kept so existing
projects keep their history. The **run browser** lists past runs with their
status and key metrics, and renders any of them without the engine running.
Run ids are timestamp-based (`YYYY-MM-DD-HHMM-<name>`), so they sort
chronologically.

---

<a name="comparing-runs"></a>
## 11. Comparing runs

Select **two or more** past runs to **overlay their metric curves** on one
chart (one color per run, with a legend). This is how you answer "did
widening the net actually help?" at a glance.

---

<a name="confusion-matrix"></a>
## 12. Confusion matrix and predicted-vs-actual

**Category models** (tabular and image) write a **confusion matrix** each
pass: rows are the real class, columns the model's guess; the green diagonal
is correct and red cells are mistakes, shaded by count.

**Number models** write a **predicted-vs-actual** plot each pass instead:
each validation row is a dot, across is the real value, up is the model's
guess, and dots on the dashed diagonal are exact. The header gives the
average miss in the column's own units.

Both update live and are there on any past run.

---

<a name="playground"></a>
## 13. The inference Playground

The Playground runs a **trained** model on your own input. It starts a
`serve` session (a long-lived engine process answering one request per line)
on the run you are viewing and builds a form from the model's columns:

- a **number box** for each numeric column (the placeholder is the training
  average, which a blank uses),
- a **dropdown** for each category column, listing the categories seen in
  training (a blank counts as missing).

A category model answers with the predicted class and each class's
probability; a number model answers with the predicted value, named after the
column it predicts. Image models can't be served yet; watch the sample grid
during training instead.

<a name="talk-to-your-models"></a>
### Talking to your models from the AI chat

With the ML Lab pack on, the AI window's **Chat** gets three tools that let a
language model use the models you trained:

| tool | input | returns |
|---|---|---|
| `ml_list_models` | none | every ML project in the workspace: kind, architecture, data file, target, feature columns, `PROJECT.md` brief, the run it would serve, and the last five runs with final metrics |
| `ml_predict` | `project`, optional `run`; `rows` (up to 50 objects of column → number or category text) | per-row predicted class and probabilities, or the predicted number, plus the model's task, target and columns |
| `ml_rank_csv` | `project`, `csv`, optional `run`, `id_column`, `rank_class`, `top`, `ascending` | every row scored, the top N: by the probability of `rank_class` (default: the highest-numbered class) with `log_odds` to separate near-1.0 scores, or by the predicted number for a number model |

So you can ask *"what models do I have?"*, *"would a customer on the basic
plan with 3 support tickets churn?"*, or *"rank every listing in
data/houses.csv by predicted price"*, and the language model calls your model
instead of guessing.

**How it runs.** Each call starts its own `axon serve` on the chosen run's
checkpoint, sends the requests, and stops it. It is a separate *headless*
session the Playground never sees, and one runs at a time. With no `run` the
tools serve the first pinned **completed** run, else the newest completed run,
else the newest stopped run. Columns are matched by name; extra CSV columns
are ignored; category columns are passed through as text exactly as written.

**Safety.** The tools are read-only and auto-approved: they read the run store
and run inference, and never train, write or delete. A project is chosen by
name from the open workspace, a run by id from that project's run store, and a
CSV only from inside the workspace root (`..` is resolved first). The data a
provider sees is the tool *results* shown in the chat; with a local provider
(Ollama, LM Studio, …) nothing leaves the machine.

---

<a name="sample-previews"></a>
## 14. Image sample grids

Image models write a grid of validation images each pass, **green-bordered
if the prediction was right, red if wrong**. It is stored as a run artifact,
so it is there on past runs too.

---

<a name="onnx-export"></a>
## 15. ONNX export

**⤓ Export ONNX model** writes the run you are viewing (or the project's
newest trained run) to `model.onnx` in the project folder, plus `model.json`
describing its inputs. It exports the trained weights — it does not retrain —
so the exported model is exactly the one the run browser shows.

```sh
axon export --onnx [--run <id>] [dir]
```

- **Input** (`input`): one row of the encoded inputs listed in `model.json` —
  numeric columns as raw values (a missing value: the training average, and
  set its `<col> missing` slot to 1), category columns one-hot (all zeros for
  a category training never saw). Standardization is inside the graph.
- **Output** (`output`): class logits for a category model; the predicted
  value, in the column's units, for a number model.
- It runs in onnxruntime / `ort` in any language and matches `axon serve`
  exactly. Image-model export is a planned follow-up.

---

<a name="notes-tags-pins"></a>
## 16. Notes, tags & pinned baselines

Each run carries lightweight metadata (`notes.json`, travels with the run):

- **Note** — free text ("first try with a wider net").
- **Tags** — short labels.
- **Pinned baseline** — pinned runs sort to the top and are what the AI-chat
  tools serve by default.

---

<a name="pause-resume-stop"></a>
## 17. Pause, resume & stop

While a run is training:

- **Pause / Resume** — the engine halts at the next pass boundary and waits.
- **Stop** — a graceful cancel: the run keeps its best checkpoint and is
  finalized as `cancelled`. (A hard kill is available if a stuck process
  doesn't respond.)

---

<a name="reproducibility"></a>
## 18. Reproducibility

`[train] seed` seeds both the data shuffle and the weight initialization:
train twice with the same seed, data and config and you get the same result
on the same device. GPU and CPU runs can differ at the last decimal because of
floating-point order.

---

<a name="cli-reference"></a>
## 19. CLI reference

Everything in the panel is also a CLI. Add `--nexis-protocol` to stream NDJSON
on stdout (what the panel consumes); without it you get human-readable output.

| command | what it does |
|---|---|
| `axon --version` | print `axon <version>` |
| `axon env` | one-line JSON capability report (`backend`, `serve`, `tasks`, `categorical`) |
| `axon new <tabular\|image> [dir]` | scaffold a project |
| `axon train [dir]` | train the MLP or CNN from `train.toml` |
| `axon serve --run <id> [dir]` | request/response inference loop (the Playground) |
| `axon export --onnx [--run <id>] [dir]` | write `model.onnx` + `model.json` |

---

<a name="protocol"></a>
## 20. The NDJSON protocol

You only need this if you are extending the lab. The engine prints one JSON
object per line on stdout (in `--nexis-protocol` mode); the same objects are
appended to `metrics.jsonl`. **Consumers ignore unknown event types and
fields.**

**Training events** (`ev`): `run.started`, `metric`, `epoch`, `artifact`,
`sample`, `log`, `run.finished`.

```json
{"ev":"run.started","run":"…","name":"tabular","totalEpochs":15,"device":"cpu","protocol":1}
{"ev":"metric","run":"…","step":3,"epoch":3,"name":"mae/val","value":18342.1}
{"ev":"epoch","run":"…","epoch":3,"of":15}
{"ev":"artifact","run":"…","kind":"residuals","path":"…/residuals-epoch3.json"}
{"ev":"run.finished","run":"…","status":"ok","summary":{ … }}
```

Artifact kinds: `confusion-matrix` (`{labels, matrix}`), `residuals`
(`{target, actual, predicted}`), `weights` (the network graph's overlay),
`image-grid` (a PNG).

**Serve dialect:** a `ready` event, then one `prediction` or `error` per
request line.

```json
{"ev":"ready","run":"…","template":"tabular","meta":{"task":"regression","target":"price","features":["sqft","city"],"columns":[{"name":"sqft","kind":"numeric","mean":2003.0},{"name":"city","kind":"categorical","categories":["Lima","Oslo"]}],"classes":[]}}
{"input":{"sqft":2000,"city":"Oslo"}}
{"ev":"prediction","input":{…},"output":{"value":372471.7}}
```

A classification model answers `"output":{"label":"yes","probs":{…}}`.

**Control commands** (written to the engine's stdin while training):
`{"cmd":"cancel"}`, `{"cmd":"pause"}`, `{"cmd":"resume"}`.

---

<a name="troubleshooting"></a>
## 21. Troubleshooting & FAQ

**The panel says no engine is found.**
Click **Download engine**, or put `axon` on your `PATH`, then **check again**.
**Where Nexis looked** lists every path it tried. `axon --version` is the
same check the panel runs.

**A column I wanted is "left out".**
It has more than 50 different text values, so it reads as an ID or free text.
If it really is a category, list it in `[data] categorical`; if it is a number
stored as text, clean the CSV.

**A rating or count is being predicted as categories (or vice versa).**
Choose *A number* or *A category* under **Predict**, which sets `[data] task`.

**"…has N non-numeric values, so it can't be predicted as a number."**
The column has text in it. Predict it as a category, or fix those cells.

**Training is slow, or not using my GPU.**
`auto` trains on the CPU on purpose; set `device = "gpu"` for larger models.

**The Playground says this engine can't serve models, or there's no category
dropdown.** The engine is older than this Nexis expects; use the **Update**
notice at the top of the panel.

**Where did my run go?**
`<project>/.nexis-ml/runs/`. It is just files: copy, archive or delete freely.

---

<a name="design-notes"></a>
## 22. Design notes (the *why*)

- **Why one binary.** A Python + PyTorch install is a ~3 GB commitment to an
  interpreter Nexis didn't choose, and the most common failure is pip
  discovering after minutes that PyTorch has no wheels for the installed
  Python. A single pinned, checksum-verified binary removes that whole class
  of problem.
- **Why config, not code.** The model is declared in `train.toml`, so the
  panel can edit it, starters can set it, and every run records exactly what
  was trained.
- **Why the encoding lives in the checkpoint.** A model is only usable if a
  new row is encoded exactly the way training rows were. Saving the fitted
  schema (averages, category lists) with the weights makes the Playground,
  chat tools and ONNX export agree with training by construction.
- **Why NDJSON over stdio.** Trivial to emit, trivial to append to a file, and
  finished runs render without the engine.
- **Why wgpu.** CUDA ties you to NVIDIA and a toolchain; wgpu uses the GPU on
  essentially any modern machine from the same binary.
- **Why hand-rolled ONNX.** burn (the Rust ML framework under Axon) imports
  ONNX but doesn't export it, so Axon hand-encodes the protobuf for the MLP —
  no heavy dependency, and verified against onnxruntime.

---

<a name="legacy-python"></a>
## 23. The legacy Python engine

The Python engine (`nexis-ml`, PyTorch) is phased out and no longer
maintained. Nexis still detects it (in workspace virtualenvs and on `PATH`)
and the setup card keeps its manual install steps, because it covers a few
things Axon doesn't yet:

- the `textgen` template (a tiny character-level GPT, with generated-text
  snapshots and a text Playground),
- the `blank` template (a `train.py` you write yourself),
- the self-contained HTML run report (`nexis-ml export --run <id>`),
- `replay`.

It does not have Axon's regression, category columns, missing-value handling,
class balancing or ONNX export. Runs from either engine live in the same run
store and render the same way in the panel.

---

*This guide tracks the implemented lab; for the milestone-by-milestone
record and rationale, see [`ML_SUITE.md`](ML_SUITE.md) and Axon's `PLAN.md`.*
