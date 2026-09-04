// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The command ledger's retention caps.
 *
 * A leaf module with no imports, so the settings store can own the three
 * preferences without importing `ledger.ts` (which pulls in redaction, path
 * normalization and the IPC surface) — the same shape as
 * `sysmon/interval.ts` and `window/quickTerminalConfig`.
 *
 * §7 of `docs/vault/decisions/command-ledger.md` is why there are two caps
 * rather than one, and why they are settings rather than constants: the store
 * grows forever by construction, blobs dominate the footprint and are the
 * least valuable per byte, and the right ceiling is a matter of taste and
 * disk. Metadata is capped by whichever of age or count binds first; output
 * blobs get an independent byte cap and are evicted oldest-first.
 *
 * The steps are coarse on purpose. These are not tuning dials — they answer
 * "how much of my own history am I comfortable keeping", and a free-text
 * number field invites a value that is wrong in a way nothing will surface.
 */

/** Metadata record count. ~200 bytes each, so 50,000 is ~10 MB. */
export const LEDGER_MAX_RECORDS_PRESETS = [
  1_000, 10_000, 50_000, 200_000,
] as const;

export type LedgerMaxRecords = (typeof LEDGER_MAX_RECORDS_PRESETS)[number];

export const LEDGER_DEFAULT_MAX_RECORDS: LedgerMaxRecords = 50_000;

/**
 * Metadata age limit, in days.
 *
 * There is deliberately no "forever" step. The prune reads this as
 * `now - days`, so a zero or negative value would drop *everything* on the
 * next workspace open — an unbounded option here is one hand-edited config
 * away from being a data-loss bug, and 10 years is unbounded in practice.
 */
export const LEDGER_MAX_AGE_DAYS_PRESETS = [7, 30, 90, 365, 3_650] as const;

export type LedgerMaxAgeDays = (typeof LEDGER_MAX_AGE_DAYS_PRESETS)[number];

export const LEDGER_DEFAULT_MAX_AGE_DAYS: LedgerMaxAgeDays = 90;

/**
 * Output-blob byte cap per workspace, in MB.
 *
 * Zero is a real, supported choice — "keep the timings and exit codes, throw
 * the output away". It is what makes the two caps visibly independent, and it
 * is the honest setting for someone who wants build-time trends without a
 * durable copy of everything their terminal has ever printed.
 */
export const LEDGER_MAX_OUTPUT_MB_PRESETS = [0, 64, 256, 1_024] as const;

export type LedgerMaxOutputMb = (typeof LEDGER_MAX_OUTPUT_MB_PRESETS)[number];

export const LEDGER_DEFAULT_MAX_OUTPUT_MB: LedgerMaxOutputMb = 256;

/**
 * Snap an arbitrary stored value onto the allowed steps.
 *
 * A hand-edited config (or one written by a future build with different
 * steps) must not be able to set a cap that deletes the ledger on open — see
 * the age-limit note above. Same reasoning, and same shape, as
 * `coerceSysmonInterval`.
 */
function coerce<T extends number>(
  presets: readonly T[],
  fallback: T,
  value: unknown,
): T {
  return presets.includes(value as T) ? (value as T) : fallback;
}

export function coerceLedgerMaxRecords(value: unknown): LedgerMaxRecords {
  return coerce(
    LEDGER_MAX_RECORDS_PRESETS,
    LEDGER_DEFAULT_MAX_RECORDS,
    value,
  );
}

export function coerceLedgerMaxAgeDays(value: unknown): LedgerMaxAgeDays {
  return coerce(
    LEDGER_MAX_AGE_DAYS_PRESETS,
    LEDGER_DEFAULT_MAX_AGE_DAYS,
    value,
  );
}

export function coerceLedgerMaxOutputMb(value: unknown): LedgerMaxOutputMb {
  return coerce(
    LEDGER_MAX_OUTPUT_MB_PRESETS,
    LEDGER_DEFAULT_MAX_OUTPUT_MB,
    value,
  );
}

/** Human labels for the steps, shared by Settings and any future surface. */
export function formatMaxRecords(value: LedgerMaxRecords): string {
  return `${value.toLocaleString()} commands`;
}

export function formatMaxAgeDays(value: LedgerMaxAgeDays): string {
  if (value >= 3_650) return "10 years";
  if (value >= 365) return "1 year";
  if (value >= 30) return `${Math.round(value / 30)} months`;
  return `${value} days`;
}

export function formatMaxOutputMb(value: LedgerMaxOutputMb): string {
  if (value === 0) return "Don't keep output";
  if (value >= 1_024) return `${value / 1_024} GB`;
  return `${value} MB`;
}
