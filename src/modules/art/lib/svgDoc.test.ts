// @vitest-environment jsdom
// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  handlesFor,
  INDEX_ATTR,
  elementById,
  isSelectable,
  moveHandle,
  parseSvgSource,
  prependTranslate,
  readPoints,
  readViewBox,
  removeElement,
  scaleElement,
  selectableFrom,
  serializeForPreview,
  serializeSvg,
  translateElement,
} from "./svgDoc";

const DOC = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect x="2" y="3" width="10" height="6" />
  <circle cx="18" cy="18" r="4" />
  <path d="M 0 0 L 4 4" />
  <g><line x1="1" y1="2" x2="3" y2="4" /></g>
</svg>`;

function parse(source = DOC) {
  const parsed = parseSvgSource(source);
  if (!parsed) throw new Error("expected the fixture to parse");
  return parsed;
}

function el(source: string, selector: string): Element {
  const parsed = parse(source);
  const found = parsed.root.querySelector(selector);
  if (!found) throw new Error(`no ${selector}`);
  return found;
}

describe("parseSvgSource", () => {
  it("tags every element in document order", () => {
    const parsed = parse();
    expect(parsed.root.getAttribute(INDEX_ATTR)).toBe("0");
    expect(parsed.root.querySelector("rect")?.getAttribute(INDEX_ATTR)).toBe("1");
    // root 0, rect 1, circle 2, path 3, g 4, line 5.
    expect(parsed.root.querySelector("line")?.getAttribute(INDEX_ATTR)).toBe("5");
  });

  it("resolves an id back to its element", () => {
    const parsed = parse();
    expect(elementById(parsed, 2)?.nodeName.toLowerCase()).toBe("circle");
    expect(elementById(parsed, 99)).toBeNull();
  });

  it("rejects anything that is not a well-formed svg root", () => {
    expect(parseSvgSource("")).toBeNull();
    expect(parseSvgSource("<div>hello</div>")).toBeNull();
    expect(parseSvgSource("<svg><rect")).toBeNull();
  });

  it("reads the viewBox, and synthesizes one when it is absent", () => {
    expect(parse().viewBox).toEqual([0, 0, 24, 24]);
    expect(readViewBox(parse('<svg width="40" height="20"><rect/></svg>').root))
      .toEqual([0, 0, 40, 20]);
    // The spec's default replaced-element size — what the browser lays out.
    expect(readViewBox(parse("<svg><rect/></svg>").root)).toEqual([0, 0, 300, 150]);
  });
});

describe("serializeSvg", () => {
  it("strips the index attribute so it never reaches the user's source", () => {
    const out = serializeSvg(parse());
    expect(out).not.toContain(INDEX_ATTR);
    // The preview form keeps it — that is what click-to-select traces through.
    expect(serializeForPreview(parse())).toContain(INDEX_ATTR);
  });

  it("preserves the author's line breaks and indentation", () => {
    // An editor that reflows the document the first time you nudge a shape is
    // an editor people stop using.
    const out = serializeSvg(parse());
    expect(out).toContain('\n  <rect x="2"');
    expect(out.split("\n")).toHaveLength(DOC.split("\n").length);
  });

  /**
   * The one normalization XMLSerializer imposes: `<rect />` comes back as
   * `<rect/>`. Everything else — attribute order, quoting, indentation, blank
   * lines — survives. It is only ever paid when something is actually edited,
   * since the canvas serializes on mutation rather than on load.
   */
  it("round-trips an untouched document apart from self-closing spacing", () => {
    expect(serializeSvg(parse())).toBe(DOC.replace(/ \/>/g, "/>"));
  });
});

describe("selection", () => {
  it("knows which tags a click can land on", () => {
    expect(isSelectable(el(DOC, "rect"))).toBe(true);
    expect(isSelectable(el(DOC, "g"))).toBe(true);
    expect(isSelectable(parse().root)).toBe(false);
  });

  it("walks up to the nearest selectable ancestor", () => {
    const line = el(DOC, "line");
    expect(selectableFrom(line)?.nodeName.toLowerCase()).toBe("line");
    expect(selectableFrom(null)).toBeNull();
  });
});

describe("translateElement", () => {
  it("moves a rect by its own geometry", () => {
    const rect = el(DOC, "rect");
    translateElement(rect, 5, -1);
    expect(rect.getAttribute("x")).toBe("7");
    expect(rect.getAttribute("y")).toBe("2");
    expect(rect).not.toHaveProperty("transform");
  });

  it("moves a circle by its centre", () => {
    const c = el(DOC, "circle");
    translateElement(c, 1, 2);
    expect([c.getAttribute("cx"), c.getAttribute("cy")]).toEqual(["19", "20"]);
  });

  it("moves a line by both endpoints", () => {
    const line = el(DOC, "line");
    translateElement(line, 1, 1);
    expect(line.getAttribute("x2")).toBe("4");
    expect(line.getAttribute("y1")).toBe("3");
  });

  it("rewrites a path's d rather than wrapping it in a transform", () => {
    const p = el(DOC, "path");
    translateElement(p, 2, 3);
    expect(p.getAttribute("d")).toBe("M 2 3 L 6 7");
    expect(p.hasAttribute("transform")).toBe(false);
  });

  it("moves a points list", () => {
    const poly = el('<svg><polygon points="0,0 4,0 4,4" /></svg>', "polygon");
    translateElement(poly, 1, 1);
    expect(readPoints(poly)).toEqual([
      [1, 1],
      [5, 1],
      [5, 5],
    ]);
  });

  it("falls back to a transform for a group", () => {
    const g = el(DOC, "g");
    translateElement(g, 3, 4);
    expect(g.getAttribute("transform")).toBe("translate(3 4)");
  });

  it("does nothing for a zero delta", () => {
    const rect = el(DOC, "rect");
    translateElement(rect, 0, 0);
    expect(rect.getAttribute("x")).toBe("2");
  });
});

describe("prependTranslate", () => {
  /**
   * Without the merge, a drag appends a transform on every pointer move and a
   * second of dragging leaves a kilometre-long attribute.
   */
  it("merges repeated drags into one translate", () => {
    const g = el(DOC, "g");
    prependTranslate(g, 1, 1);
    prependTranslate(g, 2, 3);
    expect(g.getAttribute("transform")).toBe("translate(3 4)");
  });

  it("keeps a following transform intact", () => {
    const g = el('<svg><g transform="rotate(45)"/></svg>', "g");
    prependTranslate(g, 5, 5);
    expect(g.getAttribute("transform")).toBe("translate(5 5) rotate(45)");
  });

  it("merges into a one-argument translate", () => {
    const g = el('<svg><g transform="translate(4)"/></svg>', "g");
    prependTranslate(g, 1, 2);
    expect(g.getAttribute("transform")).toBe("translate(5 2)");
  });
});

describe("handlesFor", () => {
  it("gives a rect four corners and a radius handle", () => {
    const handles = handlesFor(el(DOC, "rect"));
    expect(handles.map((h) => h.id)).toEqual([
      "rect:nw",
      "rect:ne",
      "rect:sw",
      "rect:se",
      "rect:rx",
    ]);
    expect(handles[3]).toMatchObject({ x: 12, y: 9 });
  });

  it("gives a circle one radius handle, tethered to the centre", () => {
    const [h] = handlesFor(el(DOC, "circle"));
    expect(h).toMatchObject({ id: "circle:r", x: 22, y: 18, kind: "size" });
    expect(h.tether).toEqual({ x: 18, y: 18 });
  });

  it("gives a path a handle per point, with controls tethered", () => {
    const p = el('<svg><path d="M 0 0 C 1 1 2 2 3 3"/></svg>', "path");
    const handles = handlesFor(p);
    expect(handles.map((h) => h.id)).toEqual([
      "p:0:p",
      "p:1:c1",
      "p:1:c2",
      "p:1:p",
    ]);
    expect(handles[1].tether).toEqual({ x: 0, y: 0 });
    expect(handles[3].tether).toBeUndefined();
  });

  it("gives an element with no editable geometry no handles", () => {
    expect(handlesFor(el(DOC, "g"))).toEqual([]);
  });
});

describe("moveHandle", () => {
  it("drags a rect corner", () => {
    const rect = el(DOC, "rect");
    moveHandle(rect, "rect:se", 20, 20);
    expect(rect.getAttribute("width")).toBe("18");
    expect(rect.getAttribute("height")).toBe("17");
  });

  /**
   * A negative width is not a mirrored rectangle in SVG — it is an error, and
   * the element silently stops rendering. Dragging past the opposite corner
   * has to flip the rect instead.
   */
  it("flips rather than emitting a negative width", () => {
    const rect = el(DOC, "rect");
    moveHandle(rect, "rect:se", 0, 0);
    expect(rect.getAttribute("x")).toBe("0");
    expect(rect.getAttribute("y")).toBe("0");
    expect(rect.getAttribute("width")).toBe("2");
    expect(rect.getAttribute("height")).toBe("3");
  });

  it("clamps the corner radius to half the shorter side", () => {
    const rect = el(DOC, "rect");
    moveHandle(rect, "rect:rx", 99, 3);
    expect(rect.getAttribute("rx")).toBe("5");
  });

  it("sets a circle radius from the drag distance", () => {
    const c = el(DOC, "circle");
    moveHandle(c, "circle:r", 21, 22);
    expect(c.getAttribute("r")).toBe("5");
  });

  it("moves one path point and leaves the others", () => {
    const p = el(DOC, "path");
    moveHandle(p, "p:1:p", 9, 9);
    expect(p.getAttribute("d")).toBe("M 0 0 L 9 9");
  });

  it("moves one polygon point", () => {
    const poly = el('<svg><polygon points="0,0 4,0 4,4" /></svg>', "polygon");
    moveHandle(poly, "pt:1", 7, 8);
    expect(poly.getAttribute("points")).toBe("0,0 7,8 4,4");
  });

  it("ignores a handle id the element does not own", () => {
    const c = el(DOC, "circle");
    moveHandle(c, "rect:se", 0, 0);
    expect(c.getAttribute("r")).toBe("4");
  });
});

describe("scaleElement", () => {
  it("scales a rect about a pivot", () => {
    const rect = el(DOC, "rect");
    scaleElement(rect, 2, 2, 2, 3);
    expect(rect.getAttribute("x")).toBe("2");
    expect(rect.getAttribute("width")).toBe("20");
  });

  it("keeps a circle a circle under a non-uniform drag", () => {
    const c = el(DOC, "circle");
    scaleElement(c, 2, 4, 0, 0);
    expect(c.getAttribute("r")).toBe("12");
  });

  it("scales a path's coordinates", () => {
    const p = el(DOC, "path");
    scaleElement(p, 2, 2, 0, 0);
    expect(p.getAttribute("d")).toBe("M 0 0 L 8 8");
  });

  it("wraps an unscalable element in a pivoted transform", () => {
    const g = el(DOC, "g");
    scaleElement(g, 2, 2, 5, 5);
    expect(g.getAttribute("transform")).toBe(
      "translate(5 5) scale(2 2) translate(-5 -5)",
    );
  });
});

describe("removeElement", () => {
  it("detaches a node and reports it", () => {
    const parsed = parse();
    const rect = parsed.root.querySelector("rect");
    expect(rect && removeElement(rect)).toBe(true);
    expect(parsed.root.querySelector("rect")).toBeNull();
    expect(serializeSvg(parsed)).not.toContain("<rect");
  });

  it("reports false for a node with no parent", () => {
    expect(removeElement(parse().root)).toBe(false);
  });
});
