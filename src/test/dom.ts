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
