// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Starter datasets for the stock networks — small, synthetic, seeded CSVs a
 * new project can train on the moment it is created.
 *
 * Every dataset is generated, not shipped: a hidden scoring rule over the
 * features plus noise decides the label, so a network has something real to
 * learn and something it can't (the noise). They are deliberately synthetic.
 * The ML Lab must never pass invented numbers off as real-world facts, which
 * is why the basketball set has invented players and the guide explains how
 * to swap in real stats.
 *
 * Targets are integer class ids (0..k-1). Both engines read a numeric target;
 * a string label is not something the standalone engine documents.
 *
 * Pure (no React/Tauri) and deterministic for a given seed, so the tests can
 * pin the shape and the panel can regenerate an identical file.
 */

export type StarterFile = { path: string; content: string };

export type StarterDataset = {
  /** The training CSV, relative to the project dir. */
  path: string;
  /** Its label column. Every other column is a numeric feature. */
  target: string;
  /** What each class id means, in order. Written to PROJECT.md. */
  classes: string[];
  /** Builds the training CSV plus any companion files. */
  build: (seed?: number) => StarterFile[];
};

// ── Seeded randomness ────────────────────────────────────────────────────────

/** mulberry32: tiny, fast, good enough for synthetic rows. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = {
  u: (lo?: number, hi?: number) => number;
  n: (mean?: number, sd?: number) => number;
  int: (lo: number, hi: number) => number;
  pick: <T>(items: readonly T[]) => T;
};

function rand(seed: number): Rand {
  const next = rng(seed);
  const u = (lo = 0, hi = 1) => lo + (hi - lo) * next();
  const n = (mean = 0, sd = 1) => {
    const a = Math.max(next(), 1e-12);
    return mean + sd * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * next());
  };
  return {
    u,
    n,
    int: (lo, hi) => Math.floor(u(lo, hi + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Fixed decimals without trailing noise (`12.30` → `12.3`). */
function fmt(v: number, decimals: number): string {
  return String(Number(v.toFixed(decimals)));
}

type Row = Record<string, number>;

function toCsv(columns: string[], rows: Array<Record<string, string | number>>): string {
  return `${[columns.join(","), ...rows.map((r) => columns.map((c) => r[c]).join(","))].join("\n")}\n`;
}

/** Class ids from a score by fixed quantile cut points (ascending). */
function quantileLabels(scores: number[], cuts: number[]): number[] {
  const sorted = scores.slice().sort((a, b) => a - b);
  const edges = cuts.map((q) => sorted[Math.floor(q * (sorted.length - 1))]);
  return scores.map((s) => edges.filter((e) => s > e).length);
}

/**
 * The common shape: draw feature rows, score each one with a hidden rule,
 * add noise, then cut the score into classes at the given quantiles.
 */
function scored(opts: {
  rows: number;
  seed: number;
  columns: Array<[name: string, decimals: number]>;
  draw: (r: Rand) => Row;
  score: (row: Row) => number;
  noise: number;
  cuts: number[];
  target: string;
}): string {
  const r = rand(opts.seed);
  const rows = Array.from({ length: opts.rows }, () => opts.draw(r));
  const labels = quantileLabels(
    rows.map((row) => opts.score(row) + r.n(0, opts.noise)),
    opts.cuts,
  );
  return toCsv(
    [...opts.columns.map(([name]) => name), opts.target],
    rows.map((row, i) => ({
      ...Object.fromEntries(opts.columns.map(([name, d]) => [name, fmt(row[name], d)])),
      [opts.target]: labels[i],
    })),
  );
}

// ── Basketball: the GOAT ranker (the walkthrough's dataset) ─────────────────

const FIRST = ["Marcus", "Andre", "Tyrell", "Devin", "Jalen", "Cole", "Isaiah", "Malik", "Darius", "Theo", "Rashad", "Elliot", "Quentin", "Nico", "Bryce", "Omar", "Felix", "Grant", "Hugo", "Jonah", "Kofi", "Luca", "Mateo", "Reggie", "Silas", "Tobias", "Victor", "Wes", "Xavier", "Zane"] as const;
const LAST = ["Hale", "Okafor", "Brandt", "Castillo", "Mercer", "Draper", "Nwosu", "Kessler", "Lindqvist", "Ferro", "Abernathy", "Whitlock", "Osei", "Ramsey", "Petrov", "Calloway", "Duquesne", "Halvorsen", "Ibarra", "Jemison", "Kowal", "Lachance", "Montague", "Northcutt", "Quarles", "Rourke", "Stanhope", "Tillman", "Vasquez", "Yarbrough"] as const;

export const BASKETBALL_COLUMNS: Array<[string, number]> = [
  ["seasons", 0],
  ["games", 0],
  ["ppg", 1],
  ["rpg", 1],
  ["apg", 1],
  ["spg", 1],
  ["bpg", 1],
  ["ts_pct", 3],
  ["per", 1],
  ["ws_per_48", 3],
  ["all_star", 0],
  ["all_nba", 0],
  ["mvp", 0],
  ["titles", 0],
  ["finals_mvp", 0],
];

export const BASKETBALL_TIERS = [
  "role player",
  "starter",
  "all-star",
  "all-time great",
];

function basketballPlayer(r: Rand): Row {
  // One hidden "talent" drives the box score; role decides its shape.
  const talent = r.n(0, 1);
  const role = r.pick(["guard", "wing", "big"] as const);
  const seasons = Math.round(clamp(6 + 3.2 * talent + r.n(0, 3), 1, 21));
  const games = Math.round(seasons * clamp(68 + 6 * talent + r.n(0, 9), 20, 82));
  const ppg = clamp(9 + 5.5 * talent + r.n(0, 2.6), 1.5, 36);
  const rpg = clamp((role === "big" ? 7.5 : role === "wing" ? 4.8 : 3.2) + 1.8 * talent + r.n(0, 1.2), 0.8, 16);
  const apg = clamp((role === "guard" ? 5.2 : role === "wing" ? 2.8 : 1.6) + 1.5 * talent + r.n(0, 1.1), 0.3, 12);
  const spg = clamp(0.8 + 0.25 * talent + r.n(0, 0.25), 0.1, 2.8);
  const bpg = clamp((role === "big" ? 1.3 : 0.4) + 0.3 * talent + r.n(0, 0.3), 0, 3.8);
  const tsPct = clamp(0.54 + 0.018 * talent + r.n(0, 0.022), 0.44, 0.68);
  const per = clamp(14 + 4.6 * talent + r.n(0, 1.8), 4, 32);
  const ws48 = clamp(0.095 + 0.045 * talent + r.n(0, 0.022), -0.05, 0.3);
  const peak = Math.max(0, talent - 0.7);
  const allStar = Math.round(clamp(peak * seasons * 0.55 + r.n(0, 0.8), 0, seasons));
  const allNba = Math.round(clamp(allStar * (0.45 + 0.15 * talent) + r.n(0, 0.7), 0, allStar));
  const mvp = talent > 1.9 ? Math.round(clamp((talent - 1.9) * 2.4 + r.n(0, 0.6), 0, 5)) : 0;
  const titles = Math.round(clamp(r.u(0, 1) < 0.2 + 0.1 * talent ? r.n(1 + 0.7 * peak, 1) : 0, 0, 7));
  const finalsMvp = Math.round(clamp(titles * sigmoid(talent - 1.5) + r.n(0, 0.4), 0, titles));
  return {
    seasons,
    games,
    ppg,
    rpg,
    apg,
    spg,
    bpg,
    ts_pct: tsPct,
    per,
    ws_per_48: ws48,
    all_star: allStar,
    all_nba: allNba,
    mvp,
    titles,
    finals_mvp: finalsMvp,
  };
}

/** The hidden "legacy" rule the labels come from. The model never sees it. */
function basketballLegacy(p: Row): number {
  return (
    0.06 * p.ppg +
    0.03 * p.rpg +
    0.04 * p.apg +
    0.12 * p.per / 4 +
    6 * p.ws_per_48 +
    0.05 * p.seasons +
    0.18 * p.all_star +
    0.32 * p.all_nba +
    0.9 * p.mvp +
    0.3 * p.titles +
    0.45 * p.finals_mvp
  );
}

function basketball(seed = 23): StarterFile[] {
  const r = rand(seed);
  const players = Array.from({ length: 900 }, () => basketballPlayer(r));
  // Tiers: bottom 50% role players, then starters, all-stars, top 3% greats.
  const tiers = quantileLabels(
    players.map((p) => basketballLegacy(p) + r.n(0, 0.35)),
    [0.5, 0.85, 0.97],
  );
  const used = new Set<string>();
  const names = players.map((_, i) => {
    let name = `${r.pick(FIRST)} ${r.pick(LAST)}`;
    if (used.has(name)) name = `${name} ${["Jr.", "II", "III"][i % 3]}`;
    while (used.has(name)) name = `${name}*`;
    used.add(name);
    return name;
  });
  const cols = BASKETBALL_COLUMNS.map(([c]) => c);
  const cells = (p: Row) =>
    Object.fromEntries(BASKETBALL_COLUMNS.map(([c, d]) => [c, fmt(p[c], d)]));
  return [
    {
      path: "data/players.csv",
      content: toCsv([...cols, "tier"], players.map((p, i) => ({ ...cells(p), tier: tiers[i] }))),
    },
    {
      // Same players with names and no label: the file you rank.
      path: "data/players_named.csv",
      content: toCsv(["player", ...cols], players.map((p, i) => ({ player: names[i], ...cells(p) }))),
    },
  ];
}

// ── The other starters ───────────────────────────────────────────────────────

const single = (path: string, content: string): StarterFile[] => [{ path, content }];

export const STARTER_DATASETS = {
  basketball: {
    path: "data/players.csv",
    target: "tier",
    classes: BASKETBALL_TIERS,
    build: basketball,
  },
  churn: {
    path: "data/customers.csv",
    target: "churned",
    classes: ["stayed", "churned"],
    build: (seed = 11) =>
      single("data/customers.csv", scored({
        rows: 800, seed, target: "churned", noise: 0.6, cuts: [0.72],
        columns: [["tenure_months", 0], ["monthly_spend", 2], ["support_tickets", 0], ["logins_per_week", 1], ["discount_pct", 0], ["contract_months", 0]],
        draw: (r) => ({
          tenure_months: r.int(1, 72),
          monthly_spend: clamp(r.n(55, 22), 5, 160),
          support_tickets: Math.round(clamp(r.n(1.5, 1.6), 0, 12)),
          logins_per_week: clamp(r.n(4, 2.5), 0, 20),
          discount_pct: r.pick([0, 0, 0, 10, 15, 25]),
          contract_months: r.pick([1, 1, 12, 24]),
        }),
        score: (x) => 0.45 * x.support_tickets - 0.03 * x.tenure_months - 0.25 * x.logins_per_week + 0.012 * x.monthly_spend - 0.05 * x.contract_months - 0.02 * x.discount_pct,
      })),
  },
  leads: {
    path: "data/leads.csv",
    target: "converted",
    classes: ["not converted", "converted"],
    build: (seed = 12) =>
      single("data/leads.csv", scored({
        rows: 700, seed, target: "converted", noise: 0.7, cuts: [0.7],
        columns: [["site_visits", 0], ["pages_per_visit", 1], ["email_opens", 0], ["demo_requested", 0], ["company_size", 0], ["days_since_contact", 0]],
        draw: (r) => ({
          site_visits: Math.round(clamp(r.n(5, 4), 0, 40)),
          pages_per_visit: clamp(r.n(3, 1.5), 1, 12),
          email_opens: Math.round(clamp(r.n(3, 3), 0, 25)),
          demo_requested: r.u() < 0.25 ? 1 : 0,
          company_size: Math.round(Math.exp(r.n(3.5, 1.4))),
          days_since_contact: r.int(0, 90),
        }),
        score: (x) => 0.12 * x.site_visits + 0.2 * x.pages_per_visit + 0.15 * x.email_opens + 1.6 * x.demo_requested + 0.25 * Math.log(1 + x.company_size) - 0.025 * x.days_since_contact,
      })),
  },
  credit: {
    path: "data/applicants.csv",
    target: "defaulted",
    classes: ["repaid", "defaulted"],
    build: (seed = 13) =>
      single("data/applicants.csv", scored({
        rows: 900, seed, target: "defaulted", noise: 0.55, cuts: [0.8],
        columns: [["income_k", 1], ["debt_ratio", 3], ["late_payments", 0], ["credit_age_years", 1], ["open_accounts", 0], ["utilization", 3]],
        draw: (r) => ({
          income_k: clamp(Math.exp(r.n(4.0, 0.5)), 12, 400),
          debt_ratio: clamp(r.n(0.32, 0.15), 0, 1.2),
          late_payments: Math.round(clamp(r.n(0.8, 1.3), 0, 10)),
          credit_age_years: clamp(r.n(9, 6), 0, 45),
          open_accounts: Math.round(clamp(r.n(5, 3), 0, 25)),
          utilization: clamp(r.n(0.35, 0.22), 0, 1),
        }),
        score: (x) => 2.4 * x.debt_ratio + 0.5 * x.late_payments + 1.8 * x.utilization - 0.006 * x.income_k - 0.04 * x.credit_age_years,
      })),
  },
  fraud: {
    path: "data/transactions.csv",
    target: "fraud",
    classes: ["legitimate", "fraud"],
    build: (seed = 14) =>
      single("data/transactions.csv", scored({
        rows: 1500, seed, target: "fraud", noise: 0.5, cuts: [0.94],
        columns: [["amount", 2], ["hour", 0], ["distance_km", 1], ["merchant_risk", 2], ["tx_last_hour", 0], ["card_present", 0]],
        draw: (r) => ({
          amount: clamp(Math.exp(r.n(3.6, 1.1)), 1, 5000),
          hour: r.int(0, 23),
          distance_km: clamp(Math.exp(r.n(1.5, 1.5)), 0, 9000),
          merchant_risk: clamp(r.u(0, 1) ** 2, 0, 1),
          tx_last_hour: Math.round(clamp(r.n(1, 1.3), 0, 15)),
          card_present: r.u() < 0.7 ? 1 : 0,
        }),
        score: (x) => 0.35 * Math.log(1 + x.amount) + (x.hour < 5 ? 0.8 : 0) + 0.3 * Math.log(1 + x.distance_km) + 2 * x.merchant_risk + 0.35 * x.tx_last_hour - 1.2 * x.card_present,
      })),
  },
  flowers: {
    path: "data/flowers.csv",
    target: "species",
    classes: ["setosa-like", "versicolor-like", "virginica-like"],
    build: (seed = 15) => {
      const r = rand(seed);
      const centers = [
        [5.0, 3.4, 1.5, 0.25],
        [5.9, 2.8, 4.3, 1.3],
        [6.6, 3.0, 5.5, 2.0],
      ];
      const rows = Array.from({ length: 450 }, (_, i) => {
        const species = i % 3;
        const [a, b, c, d] = centers[species];
        return {
          sepal_length: fmt(r.n(a, 0.4), 1),
          sepal_width: fmt(r.n(b, 0.32), 1),
          petal_length: fmt(Math.max(0.8, r.n(c, 0.45)), 1),
          petal_width: fmt(Math.max(0.1, r.n(d, 0.22)), 1),
          species,
        };
      });
      return single("data/flowers.csv", toCsv(["sepal_length", "sepal_width", "petal_length", "petal_width", "species"], rows));
    },
  },
  wine: {
    path: "data/wines.csv",
    target: "quality",
    classes: ["poor", "fine", "excellent"],
    build: (seed = 16) =>
      single("data/wines.csv", scored({
        rows: 900, seed, target: "quality", noise: 0.35, cuts: [0.4, 0.85],
        columns: [["acidity", 2], ["residual_sugar", 1], ["sulphates", 2], ["alcohol", 1], ["ph", 2], ["volatile_acidity", 2]],
        draw: (r) => ({
          acidity: clamp(r.n(7.5, 1.4), 4, 14),
          residual_sugar: clamp(Math.exp(r.n(0.9, 0.6)), 0.6, 20),
          sulphates: clamp(r.n(0.62, 0.15), 0.3, 1.6),
          alcohol: clamp(r.n(10.8, 1.1), 8, 15),
          ph: clamp(r.n(3.3, 0.15), 2.8, 4),
          volatile_acidity: clamp(r.n(0.5, 0.17), 0.1, 1.5),
        }),
        score: (x) => 0.45 * x.alcohol + 1.6 * x.sulphates - 2.2 * x.volatile_acidity - 0.02 * x.residual_sugar,
      })),
  },
  housing: {
    path: "data/homes.csv",
    target: "price_band",
    classes: ["budget", "mid-market", "premium"],
    build: (seed = 17) =>
      single("data/homes.csv", scored({
        rows: 900, seed, target: "price_band", noise: 0.4, cuts: [0.4, 0.8],
        columns: [["sqft", 0], ["bedrooms", 0], ["bathrooms", 1], ["age_years", 0], ["lot_acres", 2], ["km_to_center", 1], ["school_rating", 1]],
        draw: (r) => {
          const bedrooms = r.int(1, 6);
          return {
            sqft: clamp(r.n(600 + bedrooms * 420, 300), 350, 6000),
            bedrooms,
            bathrooms: clamp(Math.round((bedrooms * 0.6 + r.n(0.6, 0.5)) * 2) / 2, 1, 6),
            age_years: r.int(0, 110),
            lot_acres: clamp(Math.exp(r.n(-1.6, 0.8)), 0.02, 5),
            km_to_center: clamp(Math.exp(r.n(2.2, 0.7)), 0.3, 80),
            school_rating: clamp(r.n(6.5, 1.8), 1, 10),
          };
        },
        score: (x) => 0.0011 * x.sqft + 0.25 * x.bathrooms - 0.006 * x.age_years + 0.4 * x.lot_acres - 0.5 * Math.log(1 + x.km_to_center) + 0.22 * x.school_rating,
      })),
  },
  demand: {
    path: "data/daily_demand.csv",
    target: "demand",
    classes: ["low", "normal", "high"],
    build: (seed = 18) =>
      single("data/daily_demand.csv", scored({
        rows: 730, seed, target: "demand", noise: 0.4, cuts: [0.3, 0.75],
        columns: [["day_of_week", 0], ["temp_c", 1], ["promo", 0], ["holiday", 0], ["price", 2], ["last_week_units", 0]],
        draw: (r) => ({
          day_of_week: r.int(0, 6),
          temp_c: clamp(r.n(16, 9), -15, 40),
          promo: r.u() < 0.2 ? 1 : 0,
          holiday: r.u() < 0.04 ? 1 : 0,
          price: clamp(r.n(9.5, 1.3), 5, 15),
          last_week_units: Math.round(clamp(r.n(220, 60), 40, 500)),
        }),
        score: (x) => (x.day_of_week >= 5 ? 0.7 : 0) + 0.03 * x.temp_c + 0.9 * x.promo + 1.1 * x.holiday - 0.25 * x.price + 0.006 * x.last_week_units,
      })),
  },
  students: {
    path: "data/students.csv",
    target: "passed",
    classes: ["did not pass", "passed"],
    build: (seed = 19) =>
      single("data/students.csv", scored({
        rows: 600, seed, target: "passed", noise: 0.5, cuts: [0.3],
        columns: [["study_hours", 1], ["attendance_pct", 0], ["prior_grade", 0], ["sleep_hours", 1], ["assignments_done", 0]],
        draw: (r) => ({
          study_hours: clamp(r.n(8, 4), 0, 30),
          attendance_pct: clamp(r.n(85, 10), 30, 100),
          prior_grade: clamp(r.n(72, 12), 30, 100),
          sleep_hours: clamp(r.n(7, 1.2), 3, 11),
          assignments_done: r.int(2, 12),
        }),
        score: (x) => 0.1 * x.study_hours + 0.04 * x.attendance_pct + 0.05 * x.prior_grade + 0.15 * x.sleep_hours + 0.12 * x.assignments_done,
      })),
  },
  machines: {
    path: "data/sensors.csv",
    target: "failure_soon",
    classes: ["healthy", "failure soon"],
    build: (seed = 20) =>
      single("data/sensors.csv", scored({
        rows: 1200, seed, target: "failure_soon", noise: 0.45, cuts: [0.88],
        columns: [["temperature_c", 1], ["vibration_mm_s", 2], ["rpm", 0], ["torque_nm", 1], ["hours_since_service", 0]],
        draw: (r) => ({
          temperature_c: clamp(r.n(62, 8), 30, 110),
          vibration_mm_s: clamp(Math.exp(r.n(0.8, 0.5)), 0.3, 25),
          rpm: clamp(r.n(1500, 180), 800, 2400),
          torque_nm: clamp(r.n(40, 9), 5, 90),
          hours_since_service: r.int(0, 4000),
        }),
        score: (x) => 0.06 * x.temperature_c + 0.35 * x.vibration_mm_s + 0.03 * Math.abs(x.torque_nm - 40) + 0.0006 * x.hours_since_service,
      })),
  },
  games: {
    path: "data/games.csv",
    target: "home_win",
    classes: ["away win", "home win"],
    build: (seed = 21) =>
      single("data/games.csv", scored({
        rows: 1000, seed, target: "home_win", noise: 0.9, cuts: [0.42],
        columns: [["home_net_rating", 1], ["away_net_rating", 1], ["home_rest_days", 0], ["away_rest_days", 0], ["home_injuries", 0], ["away_injuries", 0]],
        draw: (r) => ({
          home_net_rating: r.n(0, 5),
          away_net_rating: r.n(0, 5),
          home_rest_days: r.int(0, 4),
          away_rest_days: r.int(0, 4),
          home_injuries: Math.round(clamp(r.n(1, 1), 0, 6)),
          away_injuries: Math.round(clamp(r.n(1, 1), 0, 6)),
        }),
        score: (x) => 0.18 * (x.home_net_rating - x.away_net_rating) + 0.15 * (x.home_rest_days - x.away_rest_days) - 0.25 * (x.home_injuries - x.away_injuries),
      })),
  },
} satisfies Record<string, StarterDataset>;

export type StarterDatasetId = keyof typeof STARTER_DATASETS;
