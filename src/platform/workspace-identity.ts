// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Project-scoped identity for anything stored per workspace.
 *
 * **`workspaceScopeKey()` is not this.** It returns `local` or `wsl:<distro>`,
 * which identifies the *environment* a workspace runs in, not the project. It
 * reads like the right helper and is the wrong one: anything keyed with it is
 * shared across every local project on the machine. That mistake shipped once
 * already (the HTTP client's saved requests) and is what this module exists to
 * stop repeating.
 *
 * The normalization rules are the ones settled in
 * `docs/vault/decisions/command-ledger.md` §6, so the ledger and every other
 * per-project store agree on what "the same workspace" means:
 *
 * - a mangled verbatim prefix is healed first (CLAUDE.md pitfall #23);
 * - separators are flipped to `/`;
 * - a trailing separator is dropped, so `C:/p` and `C:/p/` are one project;
 * - Windows and WSL-UNC paths are case-folded, because their filesystems are
 *   case-insensitive and `C:/Proj` and `c:/proj` are the same directory.
 *
 * POSIX paths are **not** case-folded: `/home/me/Proj` and `/home/me/proj` are
 * genuinely different directories on Linux, and folding them would merge two
 * projects' history.
 */

import { stripVerbatimPrefix } from "@/lib/path";

/** True for a path whose filesystem is case-insensitive. */
function isCaseInsensitivePath(path: string): boolean {
  // Drive-letter paths, and the UNC share a WSL distro is reached through
  // from Windows (the host side of it is still Windows).
  return /^[a-zA-Z]:[\\/]/.test(path) || /^[\\/]{2}/.test(path);
}

/**
 * The canonical form of a workspace root, used as a storage key.
 *
 * Returned as a path rather than a hash so a stored key stays inspectable and
 * greppable; a caller that needs a filesystem-safe name (the ledger's
 * per-workspace directory) hashes this, so there is one normalization rule
 * with two renderings rather than two rules.
 */
export function workspaceProjectKey(root: string | null | undefined): string {
  if (!root) return "";
  let p = stripVerbatimPrefix(root).replace(/\\/g, "/");
  // Drop a trailing slash, but never turn a root into the empty string:
  // "/" and "C:/" are real locations.
  if (p.length > 1 && p.endsWith("/") && !/^[a-zA-Z]:\/$/.test(p)) {
    p = p.slice(0, -1);
  }
  return isCaseInsensitivePath(p) ? p.toLowerCase() : p;
}

/**
 * Whether two workspace roots name the same project.
 *
 * Exists so call sites compare through the normalization instead of with
 * `===` on raw strings, which is the comparison that made pitfall #23's
 * poisoned paths look like different workspaces.
 */
export function sameProject(a: string | null, b: string | null): boolean {
  const ka = workspaceProjectKey(a);
  return ka !== "" && ka === workspaceProjectKey(b);
}
