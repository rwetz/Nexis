// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Poll cadence for the System Monitor.
 *
 * Kept in its own leaf module (no imports) so the settings store can own the
 * preference without importing the panel — same shape as
 * `window/quickTerminalConfig`.
 *
 * The steps are deliberately coarse. A sample with the process table walks
 * every entry under `/proc` (or the Windows process snapshot), so 100 ms is
 * ~10 full walks a second — visibly smoother charts, and real CPU spent on
 * watching the CPU. 1 s is the historical default and stays the default.
 */
export const SYSMON_INTERVALS = [100, 200, 500, 1000] as const;

export type SysmonIntervalMs = (typeof SYSMON_INTERVALS)[number];

export const SYSMON_DEFAULT_INTERVAL_MS: SysmonIntervalMs = 1000;

/**
 * Snap an arbitrary stored value onto the allowed steps. A hand-edited
 * config (or a value written by an older build) must not be able to set a
 * 1 ms poll and pin a core re-listing processes.
 */
export function coerceSysmonInterval(value: unknown): SysmonIntervalMs {
  return SYSMON_INTERVALS.includes(value as SysmonIntervalMs)
    ? (value as SysmonIntervalMs)
    : SYSMON_DEFAULT_INTERVAL_MS;
}
