import { describe, expect, it } from "vitest";
import { ZOOM_MAX, ZOOM_MIN, normaliseRects, pagesToRender, zoomIn, zoomOut } from "../src/core/reader";

describe("reader", () => {
  it("renders visible pages plus one on each side", () => {
    expect([...pagesToRender([1], 10)].sort((a, b) => a - b)).toEqual([1, 2]);
    expect([...pagesToRender([5, 6], 10)].sort((a, b) => a - b)).toEqual([4, 5, 6, 7]);
    expect([...pagesToRender([10], 10)].sort((a, b) => a - b)).toEqual([9, 10]);
  });

  it("clamps zoom", () => {
    expect(zoomIn(1)).toBe(1.2);
    expect(zoomIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomOut(ZOOM_MIN)).toBe(ZOOM_MIN);
  });

  it("normalises and joins selection rects", () => {
    const page = { left: 100, top: 50, width: 200, height: 400 };
    const rects = normaliseRects(
      [
        { left: 120, top: 90, width: 40, height: 10 },
        { left: 160, top: 90, width: 30, height: 10 }, // same line, touching
        { left: 120, top: 110, width: 50, height: 10 }, // next line
        { left: 500, top: 90, width: 40, height: 10 }, // off the page
        { left: 130, top: 130, width: 0.5, height: 10 }, // tiny
      ],
      page,
    );
    expect(rects).toEqual([
      { x: 0.1, y: 0.1, w: 0.35, h: 0.025 },
      { x: 0.1, y: 0.15, w: 0.25, h: 0.025 },
    ]);
  });
});
