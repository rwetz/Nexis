// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The things Atlas can ask Nexis to do.
 *
 * As a standalone app these were Tauri commands that went hunting for another
 * program — locate an installed Nexis and spawn it, or try nine terminal
 * emulators in turn. Inside Nexis they are just callbacks the host already has
 * (`switchWorkspacePath`, `cdInNewTab`, `openFileTab`), so the panel takes them
 * as props and passes them down through a context.
 *
 * A context rather than prop-drilling because the call sites are three levels
 * down (`RepoTable` -> `DetailPanel`, `CityCanvas` -> `Inspector`) and neither
 * intermediate view has any business knowing about workspaces or tabs.
 *
 * The default is a no-op host rather than a throw. A missing provider should
 * render an Atlas whose buttons do nothing, not crash the sidebar — this panel
 * is also reachable from a plugin contribution, and an ErrorBoundary tripping
 * on a context lookup would be a worse failure than a dead button.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";

export type AtlasHost = {
  /** Point the whole Nexis window at this repo. */
  openWorkspace: (path: string) => void;
  /** Open a terminal tab with its working directory at this path. */
  openTerminal: (path: string) => void;
  /** Open a file in an editor tab. */
  openFile: (path: string) => void;
};

const NOOP: AtlasHost = {
  openWorkspace: () => {},
  openTerminal: () => {},
  openFile: () => {},
};

const AtlasHostContext = createContext<AtlasHost>(NOOP);

export function AtlasHostProvider({
  host,
  children,
}: {
  host: Partial<AtlasHost>;
  children: ReactNode;
}) {
  const {
    openWorkspace = NOOP.openWorkspace,
    openTerminal = NOOP.openTerminal,
    openFile = NOOP.openFile,
  } = host;
  // Memoized on the three callbacks rather than on `host`: App.tsx builds the
  // object inline, so without this every parent render would hand every
  // consumer a new context value.
  const value = useMemo(
    () => ({ openWorkspace, openTerminal, openFile }),
    [openWorkspace, openTerminal, openFile],
  );
  return (
    <AtlasHostContext.Provider value={value}>{children}</AtlasHostContext.Provider>
  );
}

export function useAtlasHost(): AtlasHost {
  return useContext(AtlasHostContext);
}
