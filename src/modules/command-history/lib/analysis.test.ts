// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import type { CommandRecord } from "@/modules/terminal/lib/ledger";
import {
  buildJournal,
  buildTrends,
  commandFamily,
  median,
  normalizeArgv,
  startOfDay,
} from "./analysis";

let seq = 0;
function rec(
  argv: string,
  durationMs: number,
  startedAt = ++seq,
  exitCode = 0,
  cwd = "C:/ws",
): CommandRecord {
  return {
    id: `cmd-${startedAt}`,
    startedAt,
    endedAt: startedAt + durationMs,
    durationMs,
    cwd,
    argv,
    exitCode,
  };
}

describe("commandFamily", () => {
  it("splits a driver by its subcommand, because the driver alone says nothing", () => {
    // "47 runs of pnpm" tells you nothing you did not already know.
    expect(commandFamily("pnpm build --watch")).toBe("pnpm build");
    expect(commandFamily("cargo test -p nexis")).toBe("cargo test");
    expect(commandFamily("git commit -m 'x'")).toBe("git commit");
  });

  it("groups an ordinary command on its first word", () => {
    expect(commandFamily("ls -la src")).toBe("ls");
    expect(commandFamily("rg TODO")).toBe("rg");
  });

  it("looks past modifiers and inline env assignments", () => {
    expect(commandFamily("sudo docker ps")).toBe("docker ps");
    expect(commandFamily("RUST_LOG=debug cargo run")).toBe("cargo run");
    expect(commandFamily("time pnpm test")).toBe("pnpm test");
  });

  it("does not mistake a flag for a subcommand", () => {
    // `git -C ../other status` must not be filed under "git -C".
    expect(commandFamily("git -C ../other status")).toBe("git");
  });

  it("survives an empty or whitespace-only command line", () => {
    expect(commandFamily("   ")).toBe("");
  });
});

describe("normalizeArgv and median", () => {
  it("collapses whitespace so one command is one row", () => {
    expect(normalizeArgv("  cargo   build  ")).toBe("cargo build");
  });

  it("averages the middle pair for an even-length list", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3); // (2+3)/2 rounded
    expect(median([])).toBe(0);
  });
});

describe("buildTrends", () => {
  it("groups runs of the same command and reports the median", () => {
    const trends = buildTrends([
      rec("cargo build", 10_000),
      rec("cargo build", 20_000),
      rec("cargo build", 30_000),
    ]);
    expect(trends).toHaveLength(1);
    expect(trends[0].runs).toBe(3);
    expect(trends[0].medianMs).toBe(20_000);
    expect(trends[0].totalMs).toBe(60_000);
  });

  /**
   * The sort key is total time, not the single slowest run: a command run 200
   * times for 2s each costs more of the day than one 40s outlier, and "where
   * does the wall-clock go" is the question the table exists to answer.
   */
  it("ranks by total time spent, not by the slowest single run", () => {
    const trends = buildTrends([
      rec("slow-once", 40_000),
      rec("slow-once", 40_000),
      ...Array.from({ length: 40 }, () => rec("quick", 3_000)),
    ]);
    expect(trends[0].argv).toBe("quick");
  });

  it("drops noise: one-off commands and sub-second ones", () => {
    const trends = buildTrends([
      rec("cargo build", 9_000),
      rec("ls", 20),
      rec("ls", 25),
      rec("ls", 30),
    ]);
    // `cargo build` ran once; `ls` is below the interesting-duration floor.
    expect(trends).toHaveLength(0);
  });

  /**
   * Drift is the regression signal — "went 18s to 47s". With too few runs it
   * would be two samples pretending to be a trend, so it reports null rather
   * than a number nobody should act on.
   */
  it("reports drift only once there are enough runs to mean something", () => {
    const few = buildTrends([rec("build", 10_000), rec("build", 30_000)]);
    expect(few[0].driftPct).toBeNull();

    const many = buildTrends([
      rec("build", 10_000),
      rec("build", 10_000),
      rec("build", 10_000),
      rec("build", 30_000),
      rec("build", 30_000),
      rec("build", 30_000),
    ]);
    expect(many[0].driftPct).toBe(200);
  });

  it("orders each group by time so 'the last run' is the last run", () => {
    const trends = buildTrends([
      rec("build", 5_000, 300),
      rec("build", 9_000, 100),
      rec("build", 7_000, 200),
    ]);
    expect(trends[0].series).toEqual([9_000, 7_000, 5_000]);
    expect(trends[0].lastMs).toBe(5_000);
    expect(trends[0].lastAt).toBe(300);
  });

  it("counts failures alongside the timings", () => {
    const trends = buildTrends([
      rec("build", 5_000, ++seq, 0),
      rec("build", 5_000, ++seq, 101),
    ]);
    expect(trends[0].failures).toBe(1);
  });
});

describe("buildJournal", () => {
  it("counts only what happened inside the window", () => {
    const j = buildJournal(
      [rec("ls", 100, 50), rec("ls", 100, 150), rec("ls", 100, 250)],
      100,
      200,
    );
    expect(j.commands).toBe(1);
    expect(j.firstAt).toBe(150);
    expect(j.lastAt).toBe(150);
  });

  it("summarizes what ran, where, and what failed", () => {
    const j = buildJournal(
      [
        rec("pnpm build", 4_000, 10, 0, "C:/ws/app"),
        rec("pnpm build", 6_000, 20, 1, "C:/ws/app"),
        rec("git status", 100, 30, 0, "C:/ws"),
      ],
      0,
      1_000,
    );
    expect(j.commands).toBe(3);
    expect(j.failures).toBe(1);
    expect(j.activeMs).toBe(10_100);
    expect(j.families[0]).toEqual({
      label: "pnpm build",
      runs: 2,
      totalMs: 10_000,
    });
    expect(j.directories[0].label).toBe("C:/ws/app");
  });

  it("reports an empty window without inventing anything", () => {
    const j = buildJournal([], 0, 1_000);
    expect(j.commands).toBe(0);
    expect(j.activeMs).toBe(0);
    expect(j.firstAt).toBeNull();
    expect(j.families).toEqual([]);
  });

  it("ignores a blank cwd rather than filing work under an empty directory", () => {
    const j = buildJournal([rec("ls", 100, 10, 0, "")], 0, 1_000);
    expect(j.commands).toBe(1);
    expect(j.directories).toEqual([]);
  });
});

describe("startOfDay", () => {
  it("floors to local midnight", () => {
    const noon = new Date(2026, 8, 4, 12, 34, 56).getTime();
    const start = startOfDay(noon);
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(start).getDate()).toBe(4);
    expect(start).toBeLessThanOrEqual(noon);
  });
});
