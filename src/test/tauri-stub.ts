// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// A fake Tauri IPC transport for jsdom tests.
//
// Why stub the transport rather than `vi.mock` each `@tauri-apps/*` module:
// the real packages are thin wrappers that all bottom out in
// `window.__TAURI_INTERNALS__.invoke`. Filling in that one seam means
// `plugin-store`, `api/app`, `plugin-os`, and `plugin-opener` all keep running
// their real code — argument shapes, resource-id plumbing, and any future
// plugin included — instead of each needing its own hand-written double that
// silently drifts from the package it stands in for.
//
// The default for an unrecognised command is `null`, not a throw. Component
// tests should fail on the behaviour under test, not on an unrelated panel
// reaching for an IPC command nobody stubbed yet.

type InvokeHandler = (cmd: string, args: Record<string, unknown>) => unknown;

/** Backing map for the store plugin, so writes read back within a test. */
const storeValues = new Map<string, unknown>();

const DEFAULT_RESPONSES: Record<string, InvokeHandler> = {
  // --- store plugin -------------------------------------------------------
  // `load` hands back a resource id; the LazyStore holds it for later calls.
  "plugin:store|load": () => 1,
  // Returns a `[value, exists]` tuple — the package destructures it, so a bare
  // value fails with "(intermediate value) is not iterable".
  "plugin:store|get": (_cmd, args) => {
    const key = String(args.key);
    return [storeValues.get(key) ?? null, storeValues.has(key)];
  },
  "plugin:store|set": (_cmd, args) => {
    storeValues.set(String(args.key), args.value);
    return null;
  },
  "plugin:store|has": (_cmd, args) => storeValues.has(String(args.key)),
  "plugin:store|delete": (_cmd, args) => storeValues.delete(String(args.key)),
  "plugin:store|entries": () => [...storeValues.entries()],
  "plugin:store|keys": () => [...storeValues.keys()],
  "plugin:store|save": () => null,

  // --- app / os metadata (About reads all four) ---------------------------
  "plugin:app|version": () => "0.0.0-test",
  "plugin:app|name": () => "Nexis",
  "plugin:os|platform": () => "linux",
  "plugin:os|arch": () => "x86_64",

  // --- event system -------------------------------------------------------
  // `listen` must resolve to an unlisten id or callers hang on await.
  "plugin:event|listen": () => 1,
  "plugin:event|unlisten": () => null,
  "plugin:event|emit": () => null,
};

/**
 * Install the fake transport. Pass `overrides` to control specific commands for
 * one test; anything unlisted falls through to the defaults above, then `null`.
 */
export function installTauriStub(
  overrides: Record<string, InvokeHandler> = {},
): void {
  storeValues.clear();

  const handlers = { ...DEFAULT_RESPONSES, ...overrides };

  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    // Tauri hands callbacks to Rust as integer ids and calls back through
    // `window[id]`. Nothing invokes them here, but the id must be unique or
    // concurrent registrations clobber each other.
    transformCallback: (callback?: (payload: unknown) => void) => {
      const id = Math.floor(Math.random() * 1_000_000);
      (window as unknown as Record<string, unknown>)[`_${id}`] = callback;
      return id;
    },
    invoke: async (cmd: string, args: Record<string, unknown> = {}) =>
      handlers[cmd] ? handlers[cmd](cmd, args) : null,
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  };

  // The event plugin reaches for a *second* global on unlisten, separate from
  // __TAURI_INTERNALS__. Without it, every listener teardown throws — which
  // surfaces at unmount, so a test can pass its assertions and still fail.
  (window as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ =
    { unregisterListener: () => {} };
}
