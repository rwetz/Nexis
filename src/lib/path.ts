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
