// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  buildHeadSnippet,
  buildManifest,
  FAVICON_TARGETS,
  needsOpaqueBackground,
  plannedFiles,
} from "./faviconSet";

describe("FAVICON_TARGETS", () => {
  it("has unique names and sizes, and a reason for each", () => {
    const names = FAVICON_TARGETS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of FAVICON_TARGETS) {
      expect(t.size, t.name).toBeGreaterThan(0);
      expect(t.why, t.name).toBeTruthy();
      expect(t.name).toMatch(/\.png$/);
    }
  });

  /**
   * The one iOS actually reads. A set assembled from folklore ends up with a
   * 64px PNG nothing loads and no 180px one.
   */
  it("includes the 180px apple-touch-icon", () => {
    const apple = FAVICON_TARGETS.find((t) => t.name === "apple-touch-icon.png");
    expect(apple?.size).toBe(180);
  });

  it("includes the two sizes the web manifest needs", () => {
    const sizes = FAVICON_TARGETS.filter((t) => t.manifest).map((t) => t.size);
    expect(sizes).toEqual([192, 512]);
  });
});

describe("needsOpaqueBackground", () => {
  /**
   * iOS composites nothing behind a home-screen icon: a transparent PNG lands
   * on the wallpaper, and a dark mark vanishes against a dark one.
   */
  it("is true for the apple touch icon and false for the rest", () => {
    for (const t of FAVICON_TARGETS) {
      expect(needsOpaqueBackground(t), t.name).toBe(
        t.name === "apple-touch-icon.png",
      );
    }
  });
});

describe("buildManifest", () => {
  const options = {
    name: "Example",
    shortName: "Ex",
    themeColor: "#3b82f6",
    backgroundColor: "#000000",
  };

  it("is valid JSON carrying the given metadata", () => {
    const parsed = JSON.parse(buildManifest(options));
    expect(parsed.name).toBe("Example");
    expect(parsed.short_name).toBe("Ex");
    expect(parsed.theme_color).toBe("#3b82f6");
    expect(parsed.background_color).toBe("#000000");
    expect(parsed.display).toBe("standalone");
  });

  /**
   * A manifest listing a file that was never generated is worse than none: the
   * browser fetches it, 404s, and falls back silently. So the icons array is
   * derived from the target list rather than written by hand.
   */
  it("lists only icons this set actually writes", () => {
    const parsed = JSON.parse(buildManifest(options));
    const written = new Set(plannedFiles());
    for (const icon of parsed.icons) {
      expect(written, icon.src).toContain(icon.src.replace(/^\//, ""));
      expect(icon.type).toBe("image/png");
      expect(icon.sizes).toMatch(/^\d+x\d+$/);
    }
    expect(parsed.icons).toHaveLength(2);
  });

  it("ends with a newline, like a file a person committed", () => {
    expect(buildManifest(options).endsWith("\n")).toBe(true);
  });
});

describe("buildHeadSnippet", () => {
  it("references files the set writes, plus the SVG", () => {
    const snippet = buildHeadSnippet();
    const written = plannedFiles();
    const hrefs = [...snippet.matchAll(/href="\/([^"]+)"/g)].map((m) => m[1]);
    for (const href of hrefs) {
      expect(written, href).toContain(href);
    }
  });

  it("points at the manifest and the apple touch icon", () => {
    const snippet = buildHeadSnippet();
    expect(snippet).toContain('rel="manifest"');
    expect(snippet).toContain('rel="apple-touch-icon"');
  });
});

describe("plannedFiles", () => {
  it("covers the SVG, every PNG, and the manifest", () => {
    const files = plannedFiles();
    expect(files).toContain("favicon.svg");
    expect(files).toContain("site.webmanifest");
    for (const t of FAVICON_TARGETS) expect(files).toContain(t.name);
    expect(new Set(files).size).toBe(files.length);
  });
});
