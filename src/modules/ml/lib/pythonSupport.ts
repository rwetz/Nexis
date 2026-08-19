// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Whether PyTorch is likely to have wheels for an interpreter.
 *
 * This exists because the failure it predicts is expensive and opaque. The
 * Python engine install is a ~3 GB download, and pip only discovers there is
 * no matching wheel *after* resolving — so a too-new CPython spends minutes
 * downloading nothing and ends at "No matching distribution found for torch",
 * which reads like a network problem rather than a version problem.
 *
 * The bounds are a heuristic, not an authority: pip is the authority, and a
 * new CPython gains wheels weeks-to-months after its release. So this only
 * ever *warns* — it never blocks the install, because a bound that has since
 * moved must not stop someone whose environment actually works.
 */

/** Oldest CPython minor PyTorch still publishes for. */
export const TORCH_MIN_MINOR = 9;
/**
 * Newest CPython minor PyTorch publishes for. Bump this when torch ships
 * wheels for a newer interpreter; being stale here only costs a spurious
 * warning, never a blocked install.
 */
export const TORCH_MAX_MINOR = 13;

export type TorchSupport = "ok" | "too-new" | "too-old" | "unknown";

/**
 * Minor version from anything Python reports itself as — `pyvenv.cfg`'s
 * bare `3.12.1`, `python --version`'s `Python 3.14.0`, and the `3.13.0rc1`
 * form a pre-release reports.
 */
export function parsePythonMinor(version: string | null | undefined): number | null {
  if (!version) return null;
  const m = /(?:^|\s)(\d+)\.(\d+)/.exec(version);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  // Only CPython 3.x is in scope; a 2.x or a future 4.x tells us nothing
  // useful about torch wheels, so say so rather than guessing.
  if (major !== 3) return null;
  return minor;
}

export function torchSupport(version: string | null | undefined): TorchSupport {
  const minor = parsePythonMinor(version);
  if (minor === null) return "unknown";
  if (minor > TORCH_MAX_MINOR) return "too-new";
  if (minor < TORCH_MIN_MINOR) return "too-old";
  return "ok";
}

/** One sentence naming the problem and the way out, or null when there is none. */
export function torchSupportWarning(version: string | null | undefined): string | null {
  switch (torchSupport(version)) {
    case "too-new":
      return `PyTorch has no wheels for Python ${parsePythonMinor(version) === null ? "this version" : `3.${parsePythonMinor(version)}`} yet, so this install will very likely fail after downloading. The standalone engine below needs no Python at all, or use a Python 3.${TORCH_MAX_MINOR} environment.`;
    case "too-old":
      return `PyTorch dropped Python 3.${parsePythonMinor(version)}. Use Python 3.${TORCH_MIN_MINOR} or newer, or the standalone engine below.`;
    default:
      return null;
  }
}
