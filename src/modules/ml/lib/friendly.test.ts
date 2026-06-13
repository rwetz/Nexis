// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  displayMetric,
  formatElapsed,
  headlineMetric,
  runStatusWord,
  statusSentence,
  trendOf,
} from "./friendly";
import type { Series } from "./series";

describe("displayMetric", () => {
  it("translates known metrics into plain language", () => {
    expect(displayMetric("acc/val").label).toBe("Accuracy");
    expect(displayMetric("acc/val").format(0.938)).toBe("93.8%");
    expect(displayMetric("loss/train").better).toBe("down");
  });

  it("labels textgen perplexity in plain language", () => {
    expect(displayMetric("perplexity/val").label).toBe("Perplexity");
    expect(displayMetric("perplexity/val").better).toBe("down");
  });

  it("falls back gracefully for unknown metric names", () => {
    const d = displayMetric("custom/thing");
    expect(d.label).toBe("custom/thing");
    expect(d.format(0.5)).toBe("0.5");
  });
});

describe("headlineMetric", () => {
  it("prefers accuracy over losses", () => {
    expect(headlineMetric(["loss/train", "loss/val", "acc/val"])).toBe("acc/val");
  });
  it("falls back to validation loss, then anything", () => {
    expect(headlineMetric(["loss/train", "loss/val"])).toBe("loss/val");
    expect(headlineMetric(["zzz", "aaa"])).toBe("aaa");
    expect(headlineMetric([])).toBeNull();
  });
});

describe("trendOf", () => {
  const falling: Series = {
    steps: Array.from({ length: 50 }, (_, i) => i),
    values: Array.from({ length: 50 }, (_, i) => 1 - i * 0.015),
  };

  it("falling loss is improving; falling accuracy is worsening", () => {
    expect(trendOf(falling, "down")).toBe("improving");
    expect(trendOf(falling, "up")).toBe("worsening");
  });

  it("flat series and tiny series are steady", () => {
    const flat: Series = { steps: [1, 2, 3, 4, 5, 6], values: [1, 1, 1, 1, 1, 1] };
    expect(trendOf(flat, "down")).toBe("steady");
    expect(trendOf({ steps: [1], values: [1] }, "down")).toBe("steady");
    expect(trendOf(undefined, "down")).toBe("steady");
  });
});

describe("statusSentence", () => {
  it("describes a healthy run in plain words", () => {
    const s = statusSentence({
      phase: "running",
      epoch: 3,
      totalEpochs: 15,
      headlineName: "acc/val",
      headlineValue: 0.938,
      trend: "improving",
    });
    expect(s).toContain("pass 3 of 15");
    expect(s).toContain("accuracy is 93.8%");
    expect(s).toContain("improving");
    expect(s).not.toContain("acc/val"); // no jargon
  });

  it("covers every phase without jargon", () => {
    for (const phase of ["starting", "cancelling", "ok", "cancelled", "error"] as const) {
      const s = statusSentence({
        phase,
        epoch: 2,
        totalEpochs: 10,
        headlineName: "loss/val",
        headlineValue: 0.1,
        trend: "steady",
      });
      expect(s.length).toBeGreaterThan(10);
      expect(s).not.toContain("loss/val");
    }
  });
});

describe("formatElapsed / runStatusWord", () => {
  it("formats durations", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(83_000)).toBe("1:23");
    expect(formatElapsed(2 * 3600_000 + 5 * 60_000)).toBe("2h 5m");
  });
  it("maps statuses to friendly words", () => {
    expect(runStatusWord("ok")).toBe("completed");
    expect(runStatusWord("cancelled")).toBe("stopped early");
    expect(runStatusWord("error")).toBe("failed");
    expect(runStatusWord("unknown")).toBe("interrupted");
  });
});
