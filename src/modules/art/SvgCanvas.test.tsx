// @vitest-environment jsdom
import "@/test/dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, expect, it } from "vitest";
import { SvgCanvas } from "./SvgCanvas";

// jsdom has no SVG layout. A null CTM is a state the canvas already handles
// (it draws no overlay); this test is about focus and keys, not geometry.
beforeAll(() => {
  const proto = SVGElement.prototype as unknown as Record<string, unknown>;
  proto.getScreenCTM ??= () => null;
});

const SOURCE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="8" height="8"/></svg>';

function Harness() {
  const [source, setSource] = useState(SOURCE);
  return (
    <>
      <SvgCanvas source={source} onChange={setSource} />
      <output data-testid="source">{source}</output>
    </>
  );
}

// Regression: the shape's pointerdown preventDefaults, which in WebView2 also
// cancels the click's focus, so the canvas never saw the arrow keys.
it("takes keyboard focus when a shape is clicked, so arrows nudge it", () => {
  const { container } = render(<Harness />);
  const canvas = screen.getByRole("application", { name: "SVG canvas" });
  const rect = container.querySelector(".nx-canvas-art rect");
  expect(rect).not.toBeNull();

  fireEvent.pointerDown(rect!, { button: 0, pointerId: 1 });
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 1 });
  expect(document.activeElement).toBe(canvas);

  fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
  expect(screen.getByTestId("source").textContent).not.toBe(SOURCE);
});
