// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { fileIconArt, folderIconArt } from "./iconResolver";

/**
 * File/folder type icon for the explorer, tab bar, pickers and diff lists.
 *
 * Renders the art **inline** rather than as an `<img src="data:…">`. That is
 * load-bearing, not a refactor: the icon bodies carry `var(--terminal-ansi-*)`
 * fills so they wear the active theme's palette (see `CAT_TO_THEME` in
 * `iconResolver.ts`), and a `data:` URL is an isolated document that the page's
 * custom properties do not cascade into. Inline, a theme switch recolours every
 * icon with no cache to invalidate and no re-render to force.
 *
 * `body` comes from the bundled catppuccin / vscode-icons JSON assets — build
 * inputs, never user content — which is why `dangerouslySetInnerHTML` is
 * acceptable here. Do not extend this component to render art from a path, a
 * workspace file, or anything else a user can author.
 */
export function FileTypeIcon({
  name,
  kind = "file",
  expanded = false,
  className,
}: {
  name: string;
  kind?: "file" | "dir";
  expanded?: boolean;
  className?: string;
}) {
  const art =
    kind === "dir" ? folderIconArt(name, expanded) : fileIconArt(name);
  // Art is null until the icon JSON finishes loading. Hold the same box with an
  // empty span rather than returning null, so rows don't reflow when the sets
  // resolve — every caller sizes this with a `size-*` class.
  if (!art) return <span className={className} />;
  return (
    <svg
      viewBox={`0 0 ${art.width} ${art.height}`}
      className={className}
      aria-hidden
      focusable="false"
      dangerouslySetInnerHTML={{ __html: art.body }}
    />
  );
}
