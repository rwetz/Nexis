// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/**
 * Byte count for UI display: "512 B", "3.4 KB", "1.2 MB", "31.4 GB".
 *
 * Binary units (1024-based) with decimal-style labels — the convention every
 * system tool this app sits next to uses (`du -h`, `df -h`, btop, Task
 * Manager), so matching them matters more than SI pedantry about "KiB".
 *
 * Scales through PB rather than stopping at MB: the system-monitor panel
 * reports total RAM and disk capacity, where an MB-capped formatter renders
 * "31981.4 MB" — technically correct and unreadable.
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const negative = n < 0;
  let value = Math.abs(n);
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  // Whole bytes never show a decimal; scaled units always do, so the width of
  // a column of values stays stable as it crosses a unit boundary.
  const text = unit === 0 ? `${Math.round(value)} B` : `${value.toFixed(1)} ${BYTE_UNITS[unit]}`;
  return negative ? `-${text}` : text;
}

/** Byte *rate* for throughput readouts: "1.2 MB/s". */
export function formatBytesPerSec(n: number): string {
  return `${formatBytes(n)}/s`;
}

/**
 * Compact duration for uptime and process run-time: "45s", "12m", "3h 07m",
 * "4d 06h". Fixed two-digit minor units keep a column from jittering as
 * values tick over.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${String(h % 24).padStart(2, "0")}h`;
}
