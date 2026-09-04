// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  coerceLedgerMaxAgeDays,
  coerceLedgerMaxOutputMb,
  coerceLedgerMaxRecords,
  formatMaxAgeDays,
  formatMaxOutputMb,
  formatMaxRecords,
  LEDGER_DEFAULT_MAX_AGE_DAYS,
  LEDGER_DEFAULT_MAX_OUTPUT_MB,
  LEDGER_DEFAULT_MAX_RECORDS,
  LEDGER_MAX_AGE_DAYS_PRESETS,
  LEDGER_MAX_OUTPUT_MB_PRESETS,
  LEDGER_MAX_RECORDS_PRESETS,
} from "./ledgerRetention";

describe("ledger retention caps", () => {
  it("passes through every value it offers", () => {
    for (const v of LEDGER_MAX_RECORDS_PRESETS)
      expect(coerceLedgerMaxRecords(v)).toBe(v);
    for (const v of LEDGER_MAX_AGE_DAYS_PRESETS)
      expect(coerceLedgerMaxAgeDays(v)).toBe(v);
    for (const v of LEDGER_MAX_OUTPUT_MB_PRESETS)
      expect(coerceLedgerMaxOutputMb(v)).toBe(v);
  });

  /**
   * The prune reads the age cap as `now - days`, so a stored 0 or a negative
   * would make the next workspace open delete the whole log. This coercion is
   * the guard against a hand-edited config doing that, not tidiness.
   */
  it("refuses an age limit that would delete the log on the next open", () => {
    expect(coerceLedgerMaxAgeDays(0)).toBe(LEDGER_DEFAULT_MAX_AGE_DAYS);
    expect(coerceLedgerMaxAgeDays(-1)).toBe(LEDGER_DEFAULT_MAX_AGE_DAYS);
    expect(LEDGER_MAX_AGE_DAYS_PRESETS.every((d) => d > 0)).toBe(true);
  });

  it("snaps anything off the steps back to the default", () => {
    for (const junk of [null, undefined, "90", NaN, 12345, {}, []]) {
      expect(coerceLedgerMaxRecords(junk)).toBe(LEDGER_DEFAULT_MAX_RECORDS);
      expect(coerceLedgerMaxAgeDays(junk)).toBe(LEDGER_DEFAULT_MAX_AGE_DAYS);
      expect(coerceLedgerMaxOutputMb(junk)).toBe(LEDGER_DEFAULT_MAX_OUTPUT_MB);
    }
  });

  /**
   * Zero output is a real supported choice — "keep the timings and exit codes,
   * throw the output away" — and it is what makes the two caps visibly
   * independent. It must survive coercion rather than being read as absent.
   */
  it("keeps a zero output cap as a real choice, not a missing value", () => {
    expect(coerceLedgerMaxOutputMb(0)).toBe(0);
    expect(formatMaxOutputMb(0)).toBe("Don't keep output");
  });

  it("labels every step without leaking a raw number", () => {
    expect(formatMaxAgeDays(7)).toBe("7 days");
    expect(formatMaxAgeDays(90)).toBe("3 months");
    expect(formatMaxAgeDays(365)).toBe("1 year");
    expect(formatMaxAgeDays(3_650)).toBe("10 years");
    expect(formatMaxOutputMb(256)).toBe("256 MB");
    expect(formatMaxOutputMb(1_024)).toBe("1 GB");
    expect(formatMaxRecords(50_000)).toMatch(/commands$/);
  });

  it("defaults match the decision record's §7 numbers", () => {
    expect(LEDGER_DEFAULT_MAX_RECORDS).toBe(50_000);
    expect(LEDGER_DEFAULT_MAX_AGE_DAYS).toBe(90);
    expect(LEDGER_DEFAULT_MAX_OUTPUT_MB).toBe(256);
  });
});
