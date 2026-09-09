// @vitest-environment jsdom
// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { afterEach, describe, expect, it } from "vitest";
import {
  RAINBOW_VARIANTS,
  installRainbowAccent,
  isRainbowTarget,
  rainbowMode,
  visibleLabel,
} from "./rainbowAccent";

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  return document.getElementById("root") as HTMLElement;
}

function hover(el: Element): void {
  el.dispatchEvent(new Event("pointerover", { bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("scope", () => {
  it("takes buttons whose hover is the neutral highlight", () => {
    const root = mount(`
      <button id="a" class="h-9 hover:bg-accent">Save</button>
      <button id="b" class="hover:bg-muted/40">Open</button>
      <div id="c" role="button" class="hover:bg-accent">Row</div>
      <a id="d" href="#x" class="hover:bg-muted">Link</a>
      <button id="e" class="group-hover:bg-accent">Kbd</button>
    `);
    for (const id of ["a", "b", "c", "d", "e"]) {
      expect(isRainbowTarget(root.querySelector(`#${id}`)!), id).toBe(true);
    }
  });

  it("leaves controls whose hover is already their own colour", () => {
    // The primary, destructive and link button variants. A rainbow here would
    // overpaint meaning the colour is carrying.
    const root = mount(`
      <button id="a" class="bg-primary hover:bg-primary/80">Commit</button>
      <button id="b" class="hover:bg-destructive/20">Delete</button>
      <button id="c" class="text-primary hover:underline">Learn more</button>
    `);
    for (const id of ["a", "b", "c"]) {
      expect(isRainbowTarget(root.querySelector(`#${id}`)!), id).toBe(false);
    }
  });

  it("leaves rows, menu items, options and tree items", () => {
    // These are the bulk of what made the first, CSS-only version too much.
    const root = mount(`
      <div id="a" class="hover:bg-accent">a row</div>
      <div id="b" role="menuitem" class="focus:bg-accent">Copy</div>
      <div id="c" role="option" class="hover:bg-accent">a result</div>
      <li id="d" role="treeitem" class="hover:bg-muted/30">src</li>
    `);
    for (const id of ["a", "b", "c", "d"]) {
      expect(isRainbowTarget(root.querySelector(`#${id}`)!), id).toBe(false);
    }
  });

  it("does not match a bare colour name inside another utility", () => {
    const root = mount(
      `<button id="a" class="hover:bg-accented hover:bg-muted-foreground">x</button>`,
    );
    expect(isRainbowTarget(root.querySelector("#a")!)).toBe(false);
  });
});

describe("glyph vs text", () => {
  it("calls an icon-only button a glyph", () => {
    const root = mount(`<button id="a" class="hover:bg-muted"><svg></svg></button>`);
    expect(rainbowMode(root.querySelector("#a")!)).toBe("glyph");
  });

  it("still calls it a glyph when its only label is screen-reader text", () => {
    const root = mount(
      `<button id="a" class="hover:bg-muted"><svg></svg><span class="sr-only">Close</span></button>`,
    );
    expect(rainbowMode(root.querySelector("#a")!)).toBe("glyph");
  });

  it("gives the glyph priority when a labelled button has an icon", () => {
    const root = mount(`
      <button id="a" class="hover:bg-muted"><svg></svg><span>View onboarding</span></button>
      <button id="b" class="hover:bg-accent">Plain</button>
    `);
    expect(rainbowMode(root.querySelector("#a")!)).toBe("glyph");
    expect(rainbowMode(root.querySelector("#b")!)).toBe("text");
  });

  it("does not mark an empty control", () => {
    const root = mount(`<button id="a" class="hover:bg-muted"></button>`);
    const button = root.querySelector("#a")!;
    expect(rainbowMode(button)).toBe(null);
    expect(isRainbowTarget(button)).toBe(false);
  });

  it("ignores icons and screen-reader text when reading a label", () => {
    const root = mount(
      `<button id="a"><svg><title>x</title></svg><span class="sr-only">hi</span> Run </button>`,
    );
    expect(visibleLabel(root.querySelector("#a")!)).toBe("Run");
  });
});

describe("install", () => {
  it("advances one variant per button entered, not per descendant crossed", () => {
    const root = mount(`
      <button id="a" class="hover:bg-accent"><span id="a1">Save</span><span id="a2">!</span></button>
      <button id="b" class="hover:bg-accent">Open</button>
    `);
    const stop = installRainbowAccent(document);
    const a = root.querySelector<HTMLElement>("#a")!;
    const b = root.querySelector<HTMLElement>("#b")!;

    hover(root.querySelector("#a1")!);
    const first = a.style.getPropertyValue("--rainbow-hue");
    hover(root.querySelector("#a2")!);
    expect(a.style.getPropertyValue("--rainbow-hue")).toBe(first);

    hover(b);
    expect(b.style.getPropertyValue("--rainbow-hue")).not.toBe(first);
    stop();
  });

  it("cycles all four and wraps", () => {
    const root = mount(
      Array.from({ length: RAINBOW_VARIANTS.length + 1 })
        .map((_, i) => `<button id="b${i}" class="hover:bg-accent">${i}</button>`)
        .join(""),
    );
    const stop = installRainbowAccent(document);
    const seen: string[] = [];
    for (let i = 0; i <= RAINBOW_VARIANTS.length; i++) {
      const el = root.querySelector<HTMLElement>(`#b${i}`)!;
      hover(el);
      seen.push(el.style.getPropertyValue("--rainbow-angle"));
    }
    expect(new Set(seen.slice(0, RAINBOW_VARIANTS.length)).size).toBe(
      RAINBOW_VARIANTS.length,
    );
    expect(seen[RAINBOW_VARIANTS.length]).toBe(seen[0]);
    stop();
  });

  it("gives the same button a different variant when re-entered", () => {
    const root = mount(`
      <button id="a" class="hover:bg-accent">A</button>
      <button id="b" class="hover:bg-accent">B</button>
    `);
    const stop = installRainbowAccent(document);
    const a = root.querySelector<HTMLElement>("#a")!;
    hover(a);
    const first = a.style.getPropertyValue("--rainbow-angle");
    hover(root.querySelector("#b")!);
    hover(a);
    expect(a.style.getPropertyValue("--rainbow-angle")).not.toBe(first);
    stop();
  });

  it("stamps a paint server that falls back to currentColor", () => {
    const root = mount(`<button id="a" class="hover:bg-muted"><svg></svg></button>`);
    const stop = installRainbowAccent(document);
    const a = root.querySelector<HTMLElement>("#a")!;
    hover(a);
    expect(a.dataset.rainbow).toBe("glyph");
    expect(a.style.getPropertyValue("--rainbow-paint")).toMatch(
      /^url\(#nexis-rainbow-\d\) currentColor$/,
    );
    stop();
  });

  it("also fires on keyboard focus", () => {
    const root = mount(`<button id="a" class="hover:bg-accent">A</button>`);
    const stop = installRainbowAccent(document);
    const a = root.querySelector<HTMLElement>("#a")!;
    a.dispatchEvent(new Event("focusin", { bubbles: true }));
    expect(a.dataset.rainbow).toBe("text");
    stop();
  });

  it("leaves the DOM as it found it when uninstalled", () => {
    // Turning the setting off has to strip what it wrote, or the last-hovered
    // button keeps its rainbow until something re-renders it.
    const root = mount(`<button id="a" class="hover:bg-accent">A</button>`);
    const stop = installRainbowAccent(document);
    const a = root.querySelector<HTMLElement>("#a")!;
    hover(a);
    expect(a.dataset.rainbow).toBe("text");
    stop();
    expect(a.dataset.rainbow).toBeUndefined();
    expect(a.style.getPropertyValue("--rainbow-angle")).toBe("");
    expect(a.style.getPropertyValue("--rainbow-paint")).toBe("");

    hover(a);
    expect(a.dataset.rainbow).toBeUndefined();
  });
});
