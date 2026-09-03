// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  formatFor,
  looksLikeSvg,
  toDataUri,
  toJsx,
} from "./svgExport";
import { sanitizeSvgForPreview } from "./svgSanitize";
import {
  byteLength,
  formatBytes,
  optimizeSvg,
  savingsPercent,
} from "./svgOptimize";

const INKSCAPE_EXPORT = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Created with a drawing program -->
<svg
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg"
   version="1.1"
   viewBox="0 0 24 24"
   id="svg1">
  <metadata id="metadata1">junk</metadata>
  <g id="layer1" sodipodi:insensitive="true" transform="">
    <path
       d="M 3.500000 18.500000 L 20.250000 5.125000"
       stroke="#aabbcc" />
  </g>
</svg>`;

describe("optimizeSvg", () => {
  it("strips editor cruft without touching the drawing", () => {
    const { svg } = optimizeSvg(INKSCAPE_EXPORT);
    expect(svg).not.toContain("<?xml");
    expect(svg).not.toContain("<!--");
    expect(svg).not.toContain("<metadata");
    expect(svg).not.toContain("sodipodi:");
    expect(svg).not.toContain("xmlns:sodipodi");
    expect(svg).not.toContain('version="1.1"');
    // The geometry and the real namespace survive.
    expect(svg).toContain("<path");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 24 24"');
  });

  it("reports a real byte saving", () => {
    const result = optimizeSvg(INKSCAPE_EXPORT);
    expect(result.beforeBytes).toBe(byteLength(INKSCAPE_EXPORT));
    expect(result.afterBytes).toBe(byteLength(result.svg));
    expect(result.afterBytes).toBeLessThan(result.beforeBytes);
    expect(savingsPercent(result)).toBeGreaterThan(0);
    expect(result.applied.length).toBeGreaterThan(0);
  });

  it("rounds decimals but leaves integers and geometry order alone", () => {
    const { svg } = optimizeSvg('<svg><path d="M 1.23456 2.5 L 10 20.00001"/></svg>');
    expect(svg).toContain("1.23");
    // 2.5 is already shorter than any rounding of it.
    expect(svg).toContain("2.5");
    expect(svg).toContain("10");
    expect(svg).toContain("20");
    expect(svg).not.toContain("1.23456");
  });

  it("honours the precision option", () => {
    const four = optimizeSvg('<svg><path d="M 1.23456 0"/></svg>', {
      precision: 4,
    });
    expect(four.svg).toContain("1.2346");
  });

  it("never lengthens a number", () => {
    // A rounding that produces a longer string is discarded rather than
    // applied -- "0.5" must not become "0.50".
    const { svg } = optimizeSvg('<svg><path d="M 0.5 0.25"/></svg>', {
      precision: 3,
    });
    expect(svg).toContain("0.5");
    expect(svg).not.toContain("0.500");
  });

  it("shortens only hex colours that survive it", () => {
    const { svg } = optimizeSvg(
      '<svg><path fill="#aabbcc" stroke="#123456"/></svg>',
    );
    expect(svg).toContain("#abc");
    // Not reducible -- must be left exactly as written.
    expect(svg).toContain("#123456");
  });

  it("keeps title and desc unless asked", () => {
    const src = "<svg><title>Close</title><desc>An X</desc><path/></svg>";
    expect(optimizeSvg(src).svg).toContain("<title>");
    expect(optimizeSvg(src, { stripTitles: true }).svg).not.toContain("<title>");
    expect(optimizeSvg(src, { stripTitles: true }).svg).not.toContain("<desc>");
  });

  it("is idempotent", () => {
    // Running it twice must not keep shaving bytes, or the reported saving is
    // a function of how many times you pressed the button.
    const once = optimizeSvg(INKSCAPE_EXPORT).svg;
    const twice = optimizeSvg(once).svg;
    expect(twice).toBe(once);
  });

  it("leaves already-minimal art alone", () => {
    const minimal = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1H9"/></svg>';
    const result = optimizeSvg(minimal);
    expect(result.svg).toBe(minimal);
    expect(savingsPercent(result)).toBe(0);
  });
});

describe("toJsx", () => {
  it("renames the attributes React spells differently", () => {
    const out = toJsx(
      '<svg class="a" stroke-width="1.5" stroke-linecap="round" fill-rule="evenodd"><path clip-path="url(#c)"/></svg>',
    );
    expect(out).toContain('className="a"');
    expect(out).toContain('strokeWidth="1.5"');
    expect(out).toContain('strokeLinecap="round"');
    expect(out).toContain('fillRule="evenodd"');
    expect(out).toContain('clipPath="url(#c)"');
    expect(out).not.toContain("stroke-width");
  });

  it("drops namespaced xmlns attributes but keeps the plain one", () => {
    const out = toJsx(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path/></svg>',
    );
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).not.toContain("xmlns:xlink");
  });

  it("converts XML comments into JSX comments", () => {
    expect(toJsx("<svg><!-- hi --><path/></svg>")).toContain("{/* hi */}");
  });

  it("leaves an attribute it does not know verbatim", () => {
    // Guessing a camelCase form would produce something the DOM ignores.
    const out = toJsx('<svg data-thing="1" some-future-attr="2"><path/></svg>');
    expect(out).toContain('data-thing="1"');
    expect(out).toContain('some-future-attr="2"');
  });
});

describe("toDataUri", () => {
  it("escapes the characters that would break a CSS url()", () => {
    const uri = toDataUri('<svg fill="#abc"><path d="M0 0"/></svg>');
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(uri).not.toContain("#");
    expect(uri).not.toContain('"');
    expect(uri).toContain("%23");
    expect(uri).toContain("%22");
  });

  it("escapes percent first so nothing is double-decoded", () => {
    // If '%' were escaped after '#', the '%23' it produced would itself be
    // rewritten and the URI would decode to the wrong text.
    const uri = toDataUri("<svg>100% #fff</svg>");
    expect(uri).toContain("100%25");
    expect(uri).toContain("%23fff");
  });

  it("collapses newlines, which are a parse error inside url()", () => {
    const uri = toDataUri("<svg>\n  <path/>\n</svg>");
    expect(uri).not.toContain("\n");
  });
});

describe("formatFor", () => {
  it("routes to the right renderer", () => {
    const src = '<svg stroke-width="2"><path/></svg>';
    expect(formatFor(src, "svg")).toBe(src);
    expect(formatFor(src, "jsx")).toContain("strokeWidth");
    expect(formatFor(src, "data-uri").startsWith("data:image/svg+xml,")).toBe(
      true,
    );
  });
});

describe("looksLikeSvg", () => {
  it("accepts a document and rejects a fragment or half-typed tag", () => {
    expect(looksLikeSvg("<svg><path/></svg>")).toBe(true);
    expect(looksLikeSvg("  <svg viewBox='0 0 1 1'></svg>  ")).toBe(true);
    expect(looksLikeSvg("<svg><path/>")).toBe(false);
    expect(looksLikeSvg("<path/>")).toBe(false);
    expect(looksLikeSvg("")).toBe(false);
    // Must not match an element that merely starts with the same letters.
    expect(looksLikeSvg("<svgx></svgx>")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("reads like a file listing", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});

describe("sanitizeSvgForPreview", () => {
  it("removes script in both spellings", () => {
    const paired = sanitizeSvgForPreview(
      '<svg><script>alert(1)</script><path/></svg>',
    );
    expect(paired.svg).not.toContain("script");
    expect(paired.svg).toContain("<path/>");
    expect(paired.removed).toContain("<script>");

    const selfClosing = sanitizeSvgForPreview('<svg><script src="x.js"/></svg>');
    expect(selfClosing.svg).not.toContain("script");
  });

  it("removes event handler attributes, quoted or not", () => {
    const r = sanitizeSvgForPreview(
      `<svg onload="steal()"><path onclick='go()' onmouseover=go() d="M0 0"/></svg>`,
    );
    expect(r.svg).not.toContain("onload");
    expect(r.svg).not.toContain("onclick");
    expect(r.svg).not.toContain("onmouseover");
    // The drawing itself survives.
    expect(r.svg).toContain('d="M0 0"');
    expect(r.removed).toContain("event handler attributes");
  });

  it("removes foreignObject, which is a hole through to HTML", () => {
    const r = sanitizeSvgForPreview(
      "<svg><foreignObject><body><img src=x onerror=go()></body></foreignObject><path/></svg>",
    );
    expect(r.svg).not.toContain("foreignObject");
    expect(r.svg).not.toContain("onerror");
    expect(r.removed).toContain("<foreignObject>");
  });

  it("removes javascript: URLs including obfuscated spellings", () => {
    for (const href of [
      'href="javascript:alert(1)"',
      "href='JaVaScRiPt:alert(1)'",
      'xlink:href="java\tscript:alert(1)"',
      'href="vbscript:msgbox(1)"',
    ]) {
      const r = sanitizeSvgForPreview(`<svg><a ${href}><path/></a></svg>`);
      expect(r.svg.toLowerCase()).not.toContain("script:");
      expect(r.svg.toLowerCase()).not.toContain("vbscript");
    }
  });

  it("strips an animation that would re-add a handler at runtime", () => {
    // <set attributeName="onload"> assigns script after a naive pass has run.
    const r = sanitizeSvgForPreview(
      '<svg><rect><set attributeName="onload" to="alert(1)"/></rect></svg>',
    );
    expect(r.svg).not.toContain("onload");
    expect(r.svg).not.toContain("alert");
  });

  it("leaves clean art untouched and reports nothing removed", () => {
    const clean =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1H9" stroke="currentColor"/></svg>';
    const r = sanitizeSvgForPreview(clean);
    expect(r.svg).toBe(clean);
    expect(r.removed).toEqual([]);
  });

  it("keeps a legitimate fragment href", () => {
    // url(#id) references are how gradients and clip paths work.
    const r = sanitizeSvgForPreview(
      '<svg><path fill="url(#g)" clip-path="url(#c)"/><use href="#a"/></svg>',
    );
    expect(r.svg).toContain("url(#g)");
    expect(r.svg).toContain('href="#a"');
    expect(r.removed).toEqual([]);
  });
});
