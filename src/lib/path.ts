// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Returns the directory portion of a path.
 * Handles Unix paths, Windows absolute paths, and Windows drive roots.
 *
 * Examples:
 *   dirname("/foo/bar")   → "/foo"
 *   dirname("C:/foo")     → "C:/"   (drive root preserved)
 *   dirname("C:/foo/bar") → "C:/foo"
 */
export function dirname(path: string | null): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx < 0) return normalized;
  if (idx === 0) return "/";
  // Windows drive root: "C:/file" → "C:/"
  if (idx === 2 && normalized[1] === ":") return normalized.slice(0, 3);
  return normalized.slice(0, idx);
}

/**
 * Final path segment, separators normalized and trailing separators ignored:
 * "src/app.ts" → "app.ts", "C:\\Users\\Ryan\\" → "Ryan". Returns the input
 * when there is no segment ("/", "").
 */
export function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

/**
 * Directory portion of a repo-relative or display path: "" when there is no
 * parent, so UI labels can render nothing instead of a stray separator.
 *
 * Examples:
 *   displayDirname("README.md")  → ""
 *   displayDirname("src/app.ts") → "src"
 *   displayDirname("C:/file")    → "C:/"  (drive root preserved, pitfall #12)
 */
export function displayDirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return "";
  if (idx === 2 && normalized[1] === ":") return normalized.slice(0, 3);
  return normalized.slice(0, idx);
}

/**
 * Directory portion of an absolute path, flooring at the filesystem root —
 * for parent-directory navigation.
 *
 * Examples:
 *   absoluteDirname("/foo/bar") → "/foo"
 *   absoluteDirname("/file")    → "/"
 *   absoluteDirname("C:/file")  → "C:/"  (drive root preserved, pitfall #12)
 */
export function absoluteDirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return "/";
  if (idx === 2 && normalized[1] === ":") return normalized.slice(0, 3);
  return normalized.slice(0, idx);
}

/**
 * Removes a Windows verbatim-path prefix, leaving an ordinary absolute path.
 * Handles both the native `\\?\C:/…` form and the mangled `//?/C:/…` form a
 * slash-flipped one produces (pitfall #23): as-is, that hybrid is not a
 * verbatim prefix at all — Windows parses it as a UNC path to server `?`,
 * so every canonicalize/spawn-cwd check rejects it with os error 3.
 * No-op on anything else.
 */
export function stripVerbatimPrefix(path: string): string {
  return path.replace(/^[/\\]{2}\?[\\/]/, "");
}
