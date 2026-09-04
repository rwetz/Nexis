// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  ANIMATABLE,
  applyAnimation,
  DEFAULT_TIMELINE,
  isColor,
  isTransform,
  newTrack,
  normalizeKeys,
  trackToCss,
  trackToSmil,
  type Timeline,
  type Track,
} from "./animate";
import { looksLikeSvg } from "./svgExport";
import { sanitizeSvgForPreview } from "./svgSanitize";

const DOC = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect data-nx-id="1" x="3" y="3" width="18" height="18" />
  <g data-nx-id="2"><path d="M0 0 L1 1" /></g>
</svg>`;

const timeline = (tracks: Track[]): Timeline => ({
  ...DEFAULT_TIMELINE,
  tracks,
});

describe("normalizeKeys", () => {
  /**
   * SMIL requires keyTimes ascending, starting at 0 and ending at 1. An
   * out-of-order list is not a smaller animation — the renderer ignores the
   * element outright — so this is correctness, not tidying.
   */
  it("sorts by position", () => {
    const keys = normalizeKeys([
      { at: 1, value: 2 },
      { at: 0, value: 0 },
      { at: 0.5, value: 1 },
    ]);
    expect(keys.map((k) => k.at)).toEqual([0, 0.5, 1]);
  });

  it("pins both ends, holding the nearest value", () => {
    const keys = normalizeKeys([
      { at: 0.25, value: 5 },
      { at: 0.75, value: 9 },
    ]);
    expect(keys[0]).toEqual({ at: 0, value: 5 });
    expect(keys[keys.length - 1]).toEqual({ at: 1, value: 9 });
  });

  it("drops keys outside the timeline", () => {
    expect(normalizeKeys([{ at: -1, value: 0 }, { at: 2, value: 1 }])).toEqual([]);
  });

  it("returns nothing for an empty track", () => {
    expect(normalizeKeys([])).toEqual([]);
  });
});

describe("property classification", () => {
  it("knows which properties ride on transform", () => {
    expect(isTransform("translate-x")).toBe(true);
    expect(isTransform("scale")).toBe(true);
    expect(isTransform("rotate")).toBe(true);
    expect(isTransform("opacity")).toBe(false);
  });

  it("knows which take a colour", () => {
    expect(isColor("fill")).toBe(true);
    expect(isColor("stroke")).toBe(true);
    expect(isColor("opacity")).toBe(false);
  });

  it("gives every animatable property a starting track", () => {
    for (const p of ANIMATABLE) {
      const track = newTrack(p, 1);
      expect(track.keys, p).toHaveLength(2);
      expect(track.property).toBe(p);
    }
  });
});

describe("trackToSmil", () => {
  it("emits animate for a plain attribute", () => {
    const out = trackToSmil(newTrack("opacity", 1), DEFAULT_TIMELINE);
    expect(out).toContain('<animate attributeName="opacity"');
    expect(out).toContain('values="0;1"');
    expect(out).toContain('keyTimes="0;1"');
    expect(out).toContain('dur="2s"');
    expect(out).toContain('repeatCount="indefinite"');
  });

  /**
   * Without `additive="sum"` an animated transform replaces whatever the
   * element already carries, teleporting the shape to the origin the moment
   * the animation starts.
   */
  it("emits an additive animateTransform for a transform property", () => {
    const out = trackToSmil(newTrack("rotate", 1), DEFAULT_TIMELINE);
    expect(out).toContain('<animateTransform attributeName="transform"');
    expect(out).toContain('type="rotate"');
    expect(out).toContain('additive="sum"');
  });

  it("writes translate values on the right axis", () => {
    expect(trackToSmil(newTrack("translate-x", 1), DEFAULT_TIMELINE)).toContain(
      'values="0 0;24 0"',
    );
    expect(trackToSmil(newTrack("translate-y", 1), DEFAULT_TIMELINE)).toContain(
      'values="0 0;0 24"',
    );
  });

  it("scales both axes together", () => {
    expect(trackToSmil(newTrack("scale", 1), DEFAULT_TIMELINE)).toContain(
      'values="1 1;1.2 1.2"',
    );
  });

  it("passes colours through unchanged", () => {
    expect(trackToSmil(newTrack("fill", 1), DEFAULT_TIMELINE)).toContain(
      'values="#3b82f6;#f59e0b"',
    );
  });

  it("says nothing for a track with fewer than two keys", () => {
    const track: Track = { ...newTrack("opacity", 1), keys: [{ at: 0, value: 1 }] };
    expect(trackToSmil(track, DEFAULT_TIMELINE)).toBeNull();
  });

  it("emits a finite repeat when the timeline does not loop", () => {
    const out = trackToSmil(newTrack("opacity", 1), {
      ...DEFAULT_TIMELINE,
      repeat: false,
    });
    expect(out).toContain('repeatCount="1"');
  });
});

describe("trackToCss", () => {
  it("emits keyframes and a rule addressing the target", () => {
    const out = trackToCss(newTrack("opacity", 1), DEFAULT_TIMELINE, 0)!;
    expect(out).toContain("@keyframes nx-anim-0");
    expect(out).toContain("0% { opacity: 0; }");
    expect(out).toContain("100% { opacity: 1; }");
    expect(out).toContain('[data-nx-anim="1"]');
    expect(out).toContain("animation: nx-anim-0 2s linear infinite;");
  });

  it("addresses the whole document when the track has no target", () => {
    expect(trackToCss(newTrack("rotate", null), DEFAULT_TIMELINE, 0)!).toContain(
      "\nsvg {",
    );
  });

  it("writes transforms as CSS functions with units", () => {
    expect(trackToCss(newTrack("rotate", 1), DEFAULT_TIMELINE, 0)!).toContain(
      "transform: rotate(360deg);",
    );
    expect(trackToCss(newTrack("translate-x", 1), DEFAULT_TIMELINE, 0)!).toContain(
      "transform: translateX(24px);",
    );
  });
});

describe("applyAnimation", () => {
  it("adds no animation when the timeline is empty", () => {
    const out = applyAnimation(DOC, timeline([]), "smil");
    expect(out).not.toContain("<animate");
    // Still stripped: the contract is "an exportable document" on every path,
    // so a caller never has to know whether the timeline had anything in it.
    expect(out).not.toContain("data-nx-id");
  });

  it("nests SMIL inside the element it drives", () => {
    const out = applyAnimation(DOC, timeline([newTrack("opacity", 2)]), "smil");
    expect(out).toContain("<g>\n    <animate");
    expect(looksLikeSvg(out)).toBe(true);
  });

  /**
   * `data-nx-id` is how this app traces a click back to a node. It means
   * nothing outside Nexis and has no business in a file somebody ships — the
   * canvas strips it on its own export path for the same reason.
   */
  it("strips the internal tagging from the exported document", () => {
    for (const format of ["smil", "css"] as const) {
      const out = applyAnimation(
        DOC,
        timeline([newTrack("opacity", 1), newTrack("rotate", 2)]),
        format,
      );
      expect(out, format).not.toContain("data-nx-id");
    }
  });

  it("promotes the tag CSS addresses to a real attribute", () => {
    // A stylesheet pointing at an attribute the strip removed is a rule that
    // silently does nothing.
    const out = applyAnimation(DOC, timeline([newTrack("opacity", 1)]), "css");
    expect(out).toContain('data-nx-anim="1"');
    expect(out).toContain('[data-nx-anim="1"]');
  });

  /**
   * Most icon art is self-closing, so reopening the tag is the common path
   * rather than an edge case: `<rect … />` cannot contain a child.
   */
  it("reopens a self-closing target so it can hold the animation", () => {
    const out = applyAnimation(DOC, timeline([newTrack("scale", 1)]), "smil");
    expect(out).toContain("</rect>");
    expect(out).toContain("<animateTransform");
  });

  it("puts an untargeted track at the root", () => {
    const out = applyAnimation(DOC, timeline([newTrack("rotate", null)]), "smil");
    const rootTagEnd = out.indexOf(">") + 1;
    expect(out.slice(rootTagEnd, rootTagEnd + 40)).toContain("<animateTransform");
  });

  it("wraps CSS in CDATA, since a rule can contain < and &", () => {
    const out = applyAnimation(DOC, timeline([newTrack("opacity", 1)]), "css");
    expect(out).toContain("<style>");
    expect(out).toContain("<![CDATA[");
    expect(out).toContain("]]>");
    expect(out).toContain("@keyframes");
  });

  it("produces a document the rest of the pack still accepts", () => {
    for (const format of ["smil", "css"] as const) {
      const out = applyAnimation(
        DOC,
        timeline([newTrack("opacity", 1), newTrack("rotate", 2)]),
        format,
      );
      expect(looksLikeSvg(out), format).toBe(true);
      // The sanitizer strips <set>/<animate> that target an event handler; a
      // plain property animation must survive it untouched.
      expect(sanitizeSvgForPreview(out).removed, format).toEqual([]);
    }
  });

  it("ignores a track whose target is not in the document", () => {
    const out = applyAnimation(DOC, timeline([newTrack("opacity", 99)]), "smil");
    expect(out).not.toContain("<animate");
    expect(looksLikeSvg(out)).toBe(true);
  });

  it("applies several tracks to several targets at once", () => {
    const out = applyAnimation(
      DOC,
      timeline([newTrack("opacity", 1), newTrack("rotate", 2)]),
      "smil",
    );
    expect(out.match(/<animate/g) ?? []).toHaveLength(2);
  });
});
