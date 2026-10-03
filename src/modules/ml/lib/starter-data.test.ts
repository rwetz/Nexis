// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { STARTER_DATASETS, rng } from "./starter-data";

const parse = (csv: string) => {
  const [header, ...rows] = csv.trim().split("\n");
  return { cols: header.split(","), rows: rows.map((r) => r.split(",")) };
};

describe("starter datasets", () => {
  for (const [id, ds] of Object.entries(STARTER_DATASETS)) {
    describe(id, () => {
      const files = ds.build();
      const main = files.find((f) => f.path === ds.path);

      it("builds its training CSV with the target column", () => {
        expect(main).toBeDefined();
        const { cols } = parse(main!.content);
        expect(cols).toContain(ds.target);
      });

      it("has numeric features and every class represented", () => {
        const { cols, rows } = parse(main!.content);
        const t = cols.indexOf(ds.target);
        const seen = new Set<number>();
        for (const row of rows) {
          expect(row).toHaveLength(cols.length);
          for (const cell of row) expect(Number.isFinite(Number(cell)), `${id}: "${cell}"`).toBe(true);
          seen.add(Number(row[t]));
        }
        expect([...seen].sort()).toEqual(ds.classes.map((_, i) => i));
      });

      it("is deterministic for a seed", () => {
        expect(ds.build()).toEqual(files);
      });
    });
  }

  it("basketball ships a named, unlabeled file to rank", () => {
    const named = STARTER_DATASETS.basketball.build().find((f) => f.path === "data/players_named.csv");
    const { cols, rows } = parse(named!.content);
    expect(cols[0]).toBe("player");
    expect(cols).not.toContain("tier");
    expect(new Set(rows.map((r) => r[0])).size).toBe(rows.length);
  });

  it("basketball's top tier is rare and decorated", () => {
    const { cols, rows } = parse(STARTER_DATASETS.basketball.build()[0].content);
    const t = cols.indexOf("tier");
    const mvp = cols.indexOf("all_nba");
    const greats = rows.filter((r) => r[t] === "3");
    expect(greats.length / rows.length).toBeLessThan(0.05);
    const avg = (rs: string[][]) => rs.reduce((s, r) => s + Number(r[mvp]), 0) / rs.length;
    expect(avg(greats)).toBeGreaterThan(avg(rows.filter((r) => r[t] === "0")) + 2);
  });

  it("rng stays in [0, 1)", () => {
    const next = rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
