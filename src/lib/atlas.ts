// Handing the open workspace to Atlas, the family's map of your local repos.
//
// Nexis is the view from inside one project; Atlas is the view of all of them
// at once. The link between them is a URL scheme Atlas registers, so this is a
// string and an `openUrl` — no probing for an install, no child process, and
// nothing to keep in sync beyond the two verbs below.
//
// Atlas parses and validates the URL on its own side before acting on it, and
// only ever *selects* a repo it has already scanned. A link cannot make it read
// a directory it would not otherwise have looked at.

import { openUrl } from "@tauri-apps/plugin-opener";

/** The scheme Atlas registers. Also listed in the `opener:allow-open-url`
 *  scope in `src-tauri/capabilities/default.json` — the opener plugin's default
 *  scope permits only http/https/mailto/tel, so without that entry every call
 *  here is rejected before it reaches the OS. */
export const ATLAS_SCHEME = "nexis-atlas";

/** `map` opens the repo's file tree as an isometric city; `focus` just selects
 *  it in Atlas's list. Nexis links to the map because the list is the view you
 *  already have — a file tree and a source-control panel are open two panes
 *  away, and the map is the thing Nexis cannot show you. */
export type AtlasView = "map" | "focus";

/**
 * Build a link to `path` in Atlas.
 *
 * The path is percent-encoded rather than interpolated: a Windows path is full
 * of backslashes and often contains a space, and `C:\Users\me\My Repo` pasted
 * raw into a query string is not a URL Atlas can parse back out.
 */
export function atlasUrl(path: string, view: AtlasView = "map"): string {
  return `${ATLAS_SCHEME}://${view}?path=${encodeURIComponent(path)}`;
}

/**
 * Open `path` in Atlas.
 *
 * Rejects when no Atlas is installed — the OS has nothing registered for the
 * scheme and says so. Callers should surface that as "Atlas isn't installed"
 * rather than as a failure of Nexis, which is what it looks like from here.
 */
export async function showInAtlas(
  path: string,
  view: AtlasView = "map",
): Promise<void> {
  await openUrl(atlasUrl(path, view));
}
