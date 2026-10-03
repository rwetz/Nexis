# Building a model start to finish: who is the greatest basketball player of all time?

> A complete, hands-on walk through the Nexis ML Lab: framing a question,
> getting data, training, judging the result honestly, and then asking a
> language model about it in plain English. The example is the oldest argument
> in sports. Every step carries over to any "rank these things" question.
>
> Companion docs: [ML Lab guide](ML_LAB_GUIDE.md) (every feature),
> [ML suite spec](ML_SUITE.md) (design record).

---

## Contents

1. [What you will build](#1-what-you-will-build)
2. [Turn an argument into a question a model can answer](#2-turn-an-argument-into-a-question-a-model-can-answer)
3. [The data](#3-the-data)
4. [Create the project](#4-create-the-project)
5. [Look before you train](#5-look-before-you-train)
6. [Train a baseline first](#6-train-a-baseline-first)
7. [Train the real network](#7-train-the-real-network)
8. [Read the results](#8-read-the-results)
9. [Tune, one change at a time](#9-tune-one-change-at-a-time)
10. [Try single players in the Playground](#10-try-single-players-in-the-playground)
11. [Talk to your model through a language model](#11-talk-to-your-model-through-a-language-model)
12. [Is the answer real? Stability checks](#12-is-the-answer-real-stability-checks)
13. [Swap in real NBA data](#13-swap-in-real-nba-data)
14. [Ship it](#14-ship-it)
15. [The same recipe for any question](#15-the-same-recipe-for-any-question)

---

## 1. What you will build

A small neural network that reads a player's career stat line and estimates
which **tier** that career belongs to:

| tier | meaning |
|---:|---|
| 0 | role player |
| 1 | starter |
| 2 | all-star |
| 3 | all-time great |

Then you will **rank every player** by how confident the model is that he is
tier 3. The top of that ranking is the model's answer to "who is the GOAT?".
Last, you will ask that question in the AI chat. The language model calls your
trained model for the numbers and explains them.

You need:

- Nexis with the **ML Lab** pack on (the *AI / ML* preset turns it on).
- A `nexis-ml` engine. The ML Lab's setup card installs the standalone engine
  in one click. Either engine works for this walkthrough.
- For step 11: an AI provider set up in Nexis whose model supports tool
  calling. A local one (Ollama, LM Studio) works and keeps everything on your
  machine.

Time: about 15 minutes, most of it reading.

---

## 2. Turn an argument into a question a model can answer

"Who is the greatest?" is an opinion. A model cannot settle an opinion. It
learns one function: **inputs → label**, from examples you give it. So the most
important decision in this whole guide happens before any code runs: *what is
the label?*

Three honest ways to frame it:

| framing | label | what the model learns | engine fit |
|---|---|---|---|
| **Tier classification** | 0-3 per career | what separates great careers from good ones | ✅ the `tabular` template is a classifier |
| Award-share regression | MVP vote share per season | what voters reward each season | needs regression |
| Pairwise preference | "A over B" from polls | how fans and experts trade stats off | needs a custom model |

We use **tier classification**. It fits the engine, and it gives you a ranking
for free: sort players by `P(tier = 3)`.

Be clear about what that ranking means. **The model learns whatever standard
the labels encode.** If tier 3 is "named to the NBA 75th Anniversary Team",
the model learns what the panel that picked that team valued, and the ranking
answers "whose career looks most like the careers that panel chose?" That is a
real, defensible question. It is not a law of nature. Everything that follows
inherits the choice you make here.

Two rules fall out of this:

1. **One row = one career.** Not one season, not one game. The thing you rank
   is the thing a row describes.
2. **No label-derived columns.** If tier 3 *means* "in the Hall of Fame",
   a `hall_of_fame` feature hands the model the answer. It will score 100% and
   learn nothing. (Award counts like `all_nba` are fine *as long as* they are not
   how you defined the tier.)

---

## 3. The data

### The starter dataset (synthetic)

The **Basketball GOAT** stock network writes two files into the project:

- `data/players.csv`: 900 careers, 15 numeric features, plus `tier`. You train on this.
- `data/players_named.csv`: the same 900 careers with a `player` name column
  and **no** `tier`. You rank this.

**These players are invented.** Nexis generates them from a seeded random
process: each player gets a hidden "talent" and a role (guard, wing, big), the
box score follows from those, and a hidden "legacy" formula plus noise decides
the tier. Nexis will not invent stats and present them as real NBA history.
Section 13 shows how to drop in real data. The synthetic set is there so the
whole loop works offline, the moment the project exists.

The columns:

| column | meaning |
|---|---|
| `seasons`, `games` | career length |
| `ppg`, `rpg`, `apg`, `spg`, `bpg` | per-game points, rebounds, assists, steals, blocks |
| `ts_pct` | true shooting %: scoring efficiency including 3s and free throws |
| `per` | player efficiency rating (league average is 15) |
| `ws_per_48` | win shares per 48 minutes (average is about .100) |
| `all_star`, `all_nba` | selection counts |
| `mvp`, `titles`, `finals_mvp` | award and championship counts |
| `tier` | the label, 0-3 |

The classes are deliberately unbalanced, as in real history: 450 role players,
315 starters, 108 all-stars, **27 all-time greats** (3%).

---

## 4. Create the project

1. Open **ML Lab** from the titlebar.
2. Click **+ New** next to the project picker (a workspace with no models
   shows the *Build a model* card straight away).
3. Under **1. Pick a stock network**, stay on **Starters** and choose
   **Basketball GOAT**. The card shows `MLP · 64 → 32` and a *data included*
   badge.
4. Under **2. Configure it**, leave the name `goat-ranker` and the size on
   **Starter**. The stock network fixes the architecture; the size only sets
   the training budget (epochs, batch size, learning rate).
5. Leave *Start training right away* **off**. You'll look at the data first.
6. Click **Create Basketball GOAT**.

The engine scaffolds the project, then Nexis applies the stock network. You get:

```
goat-ranker/
├── train.toml              ← the engine's config, with Nexis's edits
├── PROJECT.md              ← the training brief + what each tier number means
└── data/
    ├── players.csv         ← train on this
    └── players_named.csv   ← rank this
```

and in `train.toml` (other keys omitted):

```toml
[data]
path = "data/players.csv"
target = "tier"

[model]
hidden = [64, 32]           # two hidden layers: 64 units, then 32

[train]
epochs = 20
lr = 0.001
```

If the engine's scaffold lacks a key Nexis wanted to set (the standalone
engine's tabular scaffold has no `batch_size`, for example), the log says
`kept its defaults` and names it. Nexis never invents a key the engine didn't
write, except the documented `[data] path` and `target`.

---

## 5. Look before you train

Open `data/players.csv` and skim it. Ask three questions, every time, for every
dataset:

**What would a model that learned nothing score?** Always predicting the
biggest class ("role player") is right 50% of the time. That is your floor. A
model at 55% accuracy has learned almost nothing, however good 55 sounds.

**Is every column available *before* the answer is known?** Here, yes. (A
`hall_of_fame` column would fail this test. See section 2.)

**Is the class you care about rare?** Yes: 27 greats out of 900. With a 20%
validation split, only about 5 greats land in validation. Accuracy will barely
notice whether the model gets them right. So you will judge the model by the
**confusion matrix row for tier 3**, not by accuracy alone.

---

## 6. Train a baseline first

Before the neural network, train the simplest possible model, so you know what
the network has to beat.

1. Open `goat-ranker/train.toml` in the editor and set `hidden = []`. (The
   hyperparameters form won't take an empty value, on purpose: it guards
   against blanking a field by accident.) No hidden layers turns the network
   into **logistic regression**, a straight weighted sum of the stats.
2. Click **Train**.
3. When it finishes, open the run's **Notes & tags** and write `linear
   baseline`, then click **Pin as baseline**. A pinned run stays at the top of the list and is the default the
   chat tools use, until you pin a better one.

On this dataset a linear model scores about **85%** validation accuracy (a
scikit-learn logistic regression on the same split gives 0.85). That is high, because the hidden
legacy formula is mostly a weighted sum of stats. **Lesson: a strong linear
baseline is common, and a deep network that can't beat it is not worth its
complexity.**

> Prefer a separate project for the baseline? Create the **Linear baseline**
> stock network from the *Spreadsheet nets* tab and point its `[data]` at the
> same CSV. Separate projects are better when you want to keep both models.

---

## 7. Train the real network

1. In the hyperparameters form, set **Hidden layers** to `64, 32`.
2. Click **Train** and watch:
   - **Loss** (train and validation) should fall together. If validation turns
     up while train keeps falling, the network is memorizing (overfitting).
   - **Accuracy** should climb past the 50% floor within a few passes.

Expect roughly **85-90%** validation accuracy: the standalone engine reached
89.4% and the Python engine 85.6% on the starter configuration, and the number
moves a few points with the seed. That is about the same as the baseline. That is a real result, not a failure: a
two-layer MLP adds capacity for interactions (say, titles mattering more for
high scorers), and this data has only a few. On real data with era effects and
role interactions, the gap is usually larger.

---

## 8. Read the results

Open the **confusion matrix** for the last pass. Rows are the true tier,
columns the predicted tier. This one is pass 20 of a real run on the standalone
engine:

```
              predicted
              0    1    2    3
actual  0  [ 81    6    0    0 ]
        1  [  9   58    2    0 ]
        2  [  0    2   16    0 ]
        3  [  0    0    0    6 ]
```

Read it like a scout:

- **Row 3** is the one that matters. All 6 true greats in validation were
  called great. If
  you see greats predicted as tier 2, the model is too conservative at the top.
  That is the error that makes a GOAT ranking wrong.
- **0 ↔ 1 confusion** (role player vs starter) is where most errors live. It
  barely matters for this question.
- **No great is ever predicted 0 or 1.** Mistakes land in a neighboring tier.
  That means the model learned that tiers are *ordered*, even though nobody told
  it.

---

## 9. Tune, one change at a time

Change **one** knob per run, write what you changed in the run's notes, and
use each run's **Compare** button to overlay the curves.

| knob | try | what to watch |
|---|---|---|
| `hidden` | `[16]`, `[128, 64, 32]` | smaller is often as good on 900 rows |
| `lr` | `0.003`, `0.0003` | too high: loss jumps around; too low: still falling at the end |
| `epochs` | `40` | does validation loss keep falling, or turn up? |
| `val_split` | `0.3` | more validation greats means a more trustworthy row 3 |
| `seed` | `1`, `2`, `3` | **the big one**; see section 12 |

Pin the run you trust. That is the run the chat tools serve by default.

---

## 10. Try single players in the Playground

Select the pinned run, then click **Try this model** in the Playground and type a stat line. Blank fields use
the training average. Try a few:

- An efficient scorer with no hardware: `ppg 28, per 26, ws_per_48 .220,
  all_nba 6, mvp 0, titles 0`.
- The same line with `mvp 2, titles 3, finals_mvp 2`.

Watch how far tier 3's bar moves. You are probing **what the model values**,
which is the real answer to "who is the greatest?": not a name, but a weighting.

---

## 11. Talk to your model through a language model

The ML Lab adds three tools to the AI chat (while the ML Lab pack is on):

| tool | does |
|---|---|
| `ml_list_models` | lists your ML projects: kind, features, target, brief, recent runs and metrics |
| `ml_predict` | runs a model on up to 50 rows you describe (or continues text, for a text model) |
| `ml_rank_csv` | scores every row of a CSV and returns the top N |

They are **read-only**. They read the run store and run `nexis-ml serve` on a
checkpoint you already trained. They never train, write or delete, so they run
without an approval prompt. They only see projects and CSVs inside the open
workspace. The engine runs locally, so your data goes to the language model's
provider only as the tool results the chat shows you (the ranking, not the
CSV). With a local provider, nothing leaves the machine.

**The division of labor is the point.** The language model is good at
conversation and bad at your data. Your model is good at exactly one question
and can't talk. The tools let each do its part: the language model decides
*which* question to ask your model, asks it, and explains the answer.

Open the AI window's **Chat** and try:

> What models do I have?

The language model calls `ml_list_models` and describes `goat-ranker`: a
tabular classifier over 15 career stats, predicting `tier`, best run at about
86% validation accuracy.

> Using goat-ranker, who are the top 10 players in data/players_named.csv?

It calls `ml_rank_csv` with `project: "goat-ranker"`,
`csv: "data/players_named.csv"`. With no `rank_class`, the tool ranks by the
highest-numbered class, tier 3. Here is the top of a real ranking from the
standalone engine (synthetic players; your run's numbers will differ a little):

```json
{
  "project": "goat-ranker",
  "run": "2026-10-03-0158-tabular",
  "rows_scored": 900,
  "ranked_by": "probability of class \"3\"",
  "note": "Near 1.0, compare log_odds. A gap under ~1 is within run-to-run noise; check with another run.",
  "results": [
    { "rank": 1, "id": "Darius Ramsey",       "predicted": "3", "probability": 0.999995, "log_odds": 12.3 },
    { "rank": 2, "id": "Rashad Abernathy II", "predicted": "3", "probability": 0.999828, "log_odds": 8.67 },
    { "rank": 3, "id": "Omar Montague",       "predicted": "3", "probability": 0.999673, "log_odds": 8.03 },
    { "rank": 4, "id": "Isaiah Hale",         "predicted": "3", "probability": 0.999611, "log_odds": 7.85 },
    { "rank": 5, "id": "Marcus Draper III",   "predicted": "3", "probability": 0.999548, "log_odds": 7.70 }
  ]
}
```

Scoring all 900 players takes well under a second once the model is loaded.

Notice `log_odds`. A confident model pushes several players to a probability
that rounds to 1.0, and the probability column stops telling them apart. Log-odds
keep stretching where probability flattens. Here #1 leads #2 by 3.6, a real
preference, while #3 to #5 sit within 0.35 of each other: a tier, not an order.

Follow-ups that work well:

> Why is Darius Ramsey ranked first? Compare his stat line with #2.

> What would Omar Montague's chance be with two more titles? (The language model
> calls `ml_predict` with his row, edited. Counterfactuals are the most useful
> thing you can ask.)

> Rank them with each of my last three runs. Does the top 5 change?

That last question is the subject of the next section.

> **Steering tip.** The tool descriptions tell the language model to call
> `ml_list_models` first and to report results as the model's output, not as
> fact. If it ever answers from its own memory of real NBA players, say: "use
> my model, not your own knowledge".

---

## 12. Is the answer real? Stability checks

A ranking is only meaningful if it survives things that should not matter.
Retrain with seeds 1, 2 and 3 (one change, three runs) and rank with each run.

On the synthetic set, the same player came out #1 on five seeds of a
reference model and on both Nexis engines, and the top-5 *set* never changed,
but positions 2-5 swapped between seeds. The honest conclusion:

- **#1 is a finding.** It holds up.
- **#2 through #5 are a tier, not an order.** The data can't separate them, and
  a single run that claims to is reading noise.

That is also the honest answer to the real GOAT debate: some careers stand
apart under almost any weighting of stats, and below them is a group whose
order depends on what you choose to value. The model makes that visible
instead of pretending otherwise.

Other checks worth a run each:

- **Drop one feature group** (say, the awards: `all_star`, `all_nba`, `mvp`,
  `finals_mvp`) and retrain. If the ranking changes a lot, your "greatest" is
  mostly "most decorated". Awards are votes, so that is a choice to make on
  purpose.
- **Rank the bottom** (`ascending: true`, or "who is the least likely great?")
  as a sanity check. The bottom should be obviously short careers.

---

## 13. Swap in real NBA data

The project doesn't care where the CSV came from. To use real players:

1. **Collect career rows.** Basketball-Reference player pages (Per Game,
   Advanced, and the awards table) or the NBA Stats API give every column used
   here. Respect each site's terms of use; Basketball-Reference allows modest
   personal use and asks you not to scrape aggressively.
2. **Match the columns.** Same names as section 3, numbers only. Per-game
   stats as per-game, rates as decimals (`ts_pct` is `0.583`, not `58.3`).
3. **Decide the label (section 2) and write it down in `PROJECT.md`.** One
   defensible option:
   - tier 3: NBA 75th Anniversary Team
   - tier 2: 3+ All-Star selections
   - tier 1: 5+ seasons as a regular starter
   - tier 0: everyone else with 3+ seasons
4. **Keep the label-defining columns out of the features.** If tier 2 is
   "3+ All-Star selections", the `all_star` column *is* the label. Remove it,
   or define the tier another way.
5. **Mind eras.** Raw `ppg` favors fast-paced eras. Per-100-possession stats or
   league-relative versions (a player's stat divided by that season's league
   average) make a 1964 career and a 2024 career comparable. Blocks and steals
   weren't recorded before 1973-74, so leave them blank, not zero. Blank means
   "use the average".
6. **Active players** have unfinished careers. Rank them in a separate file, or
   expect them to be underrated.
7. Point `[data] path` at the new file, write a matching `players_named.csv`,
   then go back to step 6 and train a fresh baseline.

With real data you'll have a few hundred careers and maybe 75 greats. That is
small. Prefer a smaller network (`hidden = [16]`), more validation data, and
several seeds.

---

## 14. Ship it

- **HTML report** (Python engine): a self-contained page with curves, metrics
  and the confusion matrix, for sharing a run.
- **ONNX export** (standalone engine): `model.onnx` for running the model in
  any language with onnxruntime, outside Nexis.
- **The run store** (`.nexis-ml/runs/`): every run's config, metrics and
  checkpoint. Commit `train.toml`, `PROJECT.md` and the data; leave the run
  store out of git.

---

## 15. The same recipe for any question

| step | GOAT | your question |
|---|---|---|
| define a row | one career | one customer, one transaction, one game |
| define the label | tier 0-3 | churned, fraud, home win |
| find the floor | 50% (always "role player") | the majority-class rate |
| baseline first | linear | **Linear baseline** stock network |
| judge on the row that matters | true greats | true churners, true fraud |
| check stability | seeds 1-3 | seeds 1-3 |
| ask in plain English | `ml_rank_csv` | `ml_rank_csv` / `ml_predict` |

The ML Lab ships starter projects for several of these (**Churn risk**,
**Fraud flag**, **Credit risk**, **Game picker** and more), each with
synthetic data that trains immediately. Swap in your own CSV whenever you're
ready.
