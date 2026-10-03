// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

import {
  ML_MODEL_TOOLS,
  defaultRankClass,
  expectedClass,
  insideRoot,
  logOdds,
  normalizePath,
  parseCsv,
  pickRun,
  rowToInput,
  scorePrediction,
} from "./model-tools";
import { RESERVED_TOOL_NAMES, admitTool } from "@/modules/ai/tools/plugin-tools";
import type { HistoricalRun } from "./projects";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, CRLF and a missing final newline", () => {
    const { header, rows } = parseCsv('player,ppg\r\n"Hale, Marcus",27.1\r\n"The ""Mailman""",25\r\nX,1');
    expect(header).toEqual(["player", "ppg"]);
    expect(rows).toEqual([["Hale, Marcus", "27.1"], ['The "Mailman"', "25"], ["X", "1"]]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a\n\n1\n\n").rows).toEqual([["1"]]);
  });
});

describe("pickRun", () => {
  const r = (id: string, status: string, pinned = false): HistoricalRun => ({ id, dir: id, status, pinned });

  it("takes the first ok run (pinned runs are already first)", () => {
    expect(pickRun([r("p", "ok", true), r("new", "ok")])?.id).toBe("p");
    expect(pickRun([r("crash", "failed"), r("old", "ok")])?.id).toBe("old");
  });

  it("falls back to a cancelled run, which still has a checkpoint", () => {
    expect(pickRun([r("c", "cancelled"), r("f", "failed")])?.id).toBe("c");
    expect(pickRun([r("f", "failed")])).toBeNull();
  });

  it("honors an explicit run id, and only one that exists", () => {
    expect(pickRun([r("a", "failed")], "a")?.id).toBe("a");
    expect(pickRun([r("a", "ok")], "nope")).toBeNull();
  });
});

describe("rowToInput", () => {
  it("keeps only the model's numeric features", () => {
    const header = ["player", "ppg", "mvp", "team"];
    expect(rowToInput(header, ["Hale", "27.1", "", "BOS"], ["ppg", "mvp", "rpg"])).toEqual({ ppg: 27.1 });
  });
});

describe("ranking", () => {
  it("defaults to the highest-numbered class", () => {
    expect(defaultRankClass(["0", "1", "2", "3"])).toBe("3");
    expect(defaultRankClass(["10", "9"])).toBe("10");
    expect(defaultRankClass(["stayed", "churned"])).toBe("churned");
    expect(defaultRankClass(["0", "1"], "0")).toBe("0");
    expect(defaultRankClass(undefined)).toBeNull();
  });

  it("computes the expected tier only for numeric classes", () => {
    expect(expectedClass({ "0": 0.5, "3": 0.5 })).toBe(1.5);
    expect(expectedClass({ a: 1 })).toBeNull();
  });

  it("sorts on the rank class's probability", () => {
    const a = scorePrediction("a", { label: "3", probs: { "2": 0, "3": 1 } }, "3");
    const c = scorePrediction("c", { label: "2", probs: { "2": 0.6, "3": 0.4 } }, "3");
    expect(a.probability).toBe(1);
    expect(c.score).toBeLessThan(a.score);
  });

  it("breaks a probability tie with the expected tier", () => {
    const hi = scorePrediction("hi", { probs: { "1": 0, "2": 0.5, "3": 0.5 } }, "3");
    const lo = scorePrediction("lo", { probs: { "1": 0.5, "2": 0, "3": 0.5 } }, "3");
    expect(hi.score).toBeGreaterThan(lo.score);
    expect(hi.score - lo.score).toBeLessThan(1e-5);
  });

  it("ranks regression outputs by value", () => {
    expect(scorePrediction("x", { value: 4.2 }, null)).toMatchObject({ score: 4.2, value: 4.2 });
  });
});

describe("workspace confinement", () => {
  it("normalizes dot segments before the containment check", () => {
    expect(normalizePath("C:\\ws\\proj\\data\\..\\..\\..\\secret.csv")).toBe("C:/secret.csv");
    expect(insideRoot(normalizePath("C:/ws/proj/../x.csv"), "C:\\ws")).toBe(true);
    expect(insideRoot(normalizePath("C:/ws/../other/x.csv"), "C:/ws")).toBe(false);
    expect(insideRoot("C:/wsx/a.csv", "C:/ws")).toBe(false);
  });
});

describe("tool contributions", () => {
  it("are admissible, read-only and auto-approved", () => {
    const taken = new Set<string>();
    for (const t of ML_MODEL_TOOLS) {
      expect(admitTool(t, taken)).toEqual({ ok: true });
      expect(RESERVED_TOOL_NAMES).not.toContain(t.name);
      expect(t.approval).toBe("auto");
      taken.add(t.name);
    }
  });

  it("explain themselves without a workspace", async () => {
    const list = ML_MODEL_TOOLS.find((t) => t.name === "ml_list_models")!;
    const ctx = { getWorkspaceRoot: () => null } as never;
    await expect(Promise.resolve().then(() => list.execute({} as never, ctx))).rejects.toThrow(/No folder is open/);
  });
});

describe("logOdds", () => {
  it("separates saturated probabilities and stays finite", () => {
    expect(logOdds(0.9999999)).toBeGreaterThan(logOdds(0.9999) + 5);
    expect(Number.isFinite(logOdds(1))).toBe(true);
    expect(Number.isFinite(logOdds(0))).toBe(true);
    expect(logOdds(0.5)).toBeCloseTo(0);
  });
});
