// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Shared setup for jsdom component tests. Import this (not the pieces) at the
// top of any `// @vitest-environment jsdom` test file.
//
// This is deliberately NOT wired into vitest.config's `setupFiles`: the suite's
// default environment is `node`, and a global setup would load DOM-only matchers
// into several hundred node tests that neither need nor can use them.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL auto-cleans only when Vitest `globals` are enabled; they are not, so an
// un-unmounted tree would leak into the next test's queries.
afterEach(() => {
  cleanup();
});

// jsdom implements no CSS media queries, so `matchMedia` is simply absent.
// ThemeProvider calls it on mount to resolve `mode: "system"`, and Radix uses it
// for reduced-motion — both throw without this. Reports "light" and
// "no-preference" so tests get a deterministic, motion-free baseline.
// Radix measures its floating layers with ResizeObserver, which jsdom does not
// implement. A no-op is correct here rather than a shim that fakes sizes: jsdom
// has no layout engine, so every measurement would be 0 regardless — these tests
// assert structure and behaviour, never geometry.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Radix's focus/scroll management calls these; jsdom stubs them as missing.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// Node ≥26 ships its own experimental web-storage global whose accessor
// yields undefined unless the process was launched with --localstorage-file;
// inside Vitest's jsdom environment it wins over jsdom's working
// implementation, so component code reading `window.localStorage`
// (ThemeProvider's fast-path reads) crashes with "Cannot read properties of
// undefined". Backfill an in-memory Storage when the real one is absent:
// tests only need the API surface within one file's lifetime, so persistence
// is irrelevant. CI pins Node 22, where the global doesn't exist and jsdom's
// is used untouched — this shim exists for development on newer Node.
{
  let missing = false;
  try {
    missing = typeof window.localStorage === "undefined";
  } catch {
    // An opaque-origin jsdom throws on access instead of returning undefined;
    // either way the property is unusable, so replace it below.
    missing = true;
  }
  if (missing) {
    const backing = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return backing.size;
      },
      key(index: number) {
        return [...backing.keys()][index] ?? null;
      },
      getItem(key: string) {
        return backing.get(String(key)) ?? null;
      },
      setItem(key: string, value: string) {
        backing.set(String(key), String(value));
      },
      removeItem(key: string) {
        backing.delete(String(key));
      },
      clear() {
        backing.clear();
      },
    };
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
  }
}
