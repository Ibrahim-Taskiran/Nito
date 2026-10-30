import { describe, expect, it } from "vitest";
import {
  apply, applyBox, applyPoints, clampMove, pasteOffset, pointInPolygon, pointsBox, rectInLasso, scaleFromCorner, strokeInLasso, unionBox,
} from "../src/core/selection";
import { DEFAULT_PEN_INPUT, PEN_GRACE_MS, TouchGate, isAccidental, parsePenInput, touchThresholds } from "../src/core/touchInput";

const touch = (id: number, t: number, size = 10) => ({ id, type: "touch", width: size, height: size, t });
const pen = (id: number, t: number) => ({ id, type: "pen", width: 1, height: 1, t });

describe("palm and accidental touch rejection", () => {
  it("lets a finger draw until a stylus is seen (auto), then fingers scroll", () => {
    const g = new TouchGate({ ...DEFAULT_PEN_INPUT });
    expect(g.down(touch(1, 0)).action).toBe("draw");
    g.up(1, "touch", 50);
    expect(g.down(pen(2, 100)).action).toBe("draw");
    g.up(2, "pen", 200);
    expect(g.down(touch(3, 2000)).action).toBe("scroll");
  });

  it("pen-only mode: fingers scroll; finger mode: fingers draw even after a pen", () => {
    expect(new TouchGate({ ...DEFAULT_PEN_INPUT, finger: "pen-only" }).down(touch(1, 0)).action).toBe("scroll");
    const g = new TouchGate({ ...DEFAULT_PEN_INPUT, finger: "finger" });
    g.down(pen(1, 0));
    g.up(1, "pen", 10);
    expect(g.down(touch(2, 1000)).action).toBe("draw");
  });

  it("ignores touches while the pen is down and shortly after it lifts", () => {
    const g = new TouchGate({ ...DEFAULT_PEN_INPUT, finger: "finger" });
    g.down(pen(1, 0));
    expect(g.down(touch(2, 50)).action).toBe("ignore");
    g.up(1, "pen", 100);
    expect(g.down(touch(3, 100 + PEN_GRACE_MS - 1)).action).toBe("ignore");
    expect(g.down(touch(4, 100 + PEN_GRACE_MS + 1)).action).toBe("draw");
  });

  it("ignores a large contact (palm) and keeps unknown sizes", () => {
    const g = new TouchGate({ ...DEFAULT_PEN_INPUT, finger: "finger" });
    const max = touchThresholds(0.5).maxContact;
    expect(g.down(touch(1, 0, max + 5)).action).toBe("ignore");
    expect(g.down(touch(2, 10, 0)).action).toBe("draw");
  });

  it("a pen landing drops the palm stroke in progress; a quick second finger cancels the first (pinch)", () => {
    const g = new TouchGate({ ...DEFAULT_PEN_INPUT, finger: "finger" });
    g.down(touch(1, 0));
    expect(g.down(pen(2, 30))).toEqual({ action: "draw", cancel: true });
    const h = new TouchGate({ ...DEFAULT_PEN_INPUT, finger: "finger" });
    h.down(touch(1, 0));
    expect(h.down(touch(2, 100))).toEqual({ action: "ignore", cancel: true });
    const k = new TouchGate({ ...DEFAULT_PEN_INPUT, finger: "finger" });
    k.down(touch(1, 0));
    expect(k.down(touch(2, 900))).toEqual({ action: "ignore" }); // a late extra touch is only ignored
    expect(k.drawing(1)).toBe(true);
  });

  it("drops tiny quick touch strokes, never pen ones; sensitivity moves the limits", () => {
    expect(isAccidental("touch", 3, 40, 0.5)).toBe(true);
    expect(isAccidental("touch", 3, 400, 0.5)).toBe(false);
    expect(isAccidental("pen", 1, 10, 0.5)).toBe(false);
    expect(touchThresholds(1).maxContact).toBeGreaterThan(touchThresholds(0).maxContact);
    expect(touchThresholds(1).minLength).toBeLessThan(touchThresholds(0).minLength);
  });

  it("parses saved prefs safely", () => {
    expect(parsePenInput(null)).toEqual(DEFAULT_PEN_INPUT);
    expect(parsePenInput({ finger: "pen-only", sensitivity: 9, shapeAuto: true, shapeHold: "x" }))
      .toEqual({ finger: "pen-only", sensitivity: 1, shapeAuto: true, shapeHold: true });
  });
});

describe("lasso selection geometry", () => {
  const square = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }];

  it("tests points, strokes and rects against a lasso", () => {
    expect(pointInPolygon({ x: 0.3, y: 0.3 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0.6, y: 0.3 }, square)).toBe(false);
    const inside = [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }, { x: 0.4, y: 0.35 }];
    expect(strokeInLasso(inside, square)).toBe(true);
    expect(strokeInLasso([...inside, { x: 0.7, y: 0.7 }, { x: 0.8, y: 0.7 }, { x: 0.9, y: 0.7 }], square)).toBe(false);
    expect(rectInLasso({ x: 0.2, y: 0.2, w: 0.1, h: 0.1 }, square)).toBe(true);
    expect(rectInLasso({ x: 0.45, y: 0.45, w: 0.3, h: 0.3 }, square)).toBe(false);
  });

  it("moves and scales points and boxes", () => {
    const t = { dx: 0.1, dy: 0, k: 2, ox: 0.1, oy: 0.1 };
    expect(apply(t, { x: 0.2, y: 0.2 })).toEqual({ x: 0.4, y: 0.30000000000000004 });
    expect(applyPoints(t, [{ x: 0.2, y: 0.2, p: 0.7 }])).toEqual([{ x: 0.4, y: 0.3, p: 0.7 }]);
    expect(applyBox(t, { x: 0.1, y: 0.1, w: 0.1, h: 0.05 })).toEqual({ x: 0.2, y: 0.1, w: 0.2, h: 0.1 });
    expect(pointsBox([{ x: 0.3, y: 0.1 }, { x: 0.1, y: 0.4 }])).toEqual({ x: 0.1, y: 0.1, w: 0.19999999999999998, h: 0.30000000000000004 });
    expect(unionBox([{ x: 0, y: 0, w: 0.1, h: 0.1 }, { x: 0.2, y: 0.2, w: 0.1, h: 0.1 }]).w).toBeCloseTo(0.3);
  });

  it("scales from a corner keeping the opposite corner and the aspect ratio", () => {
    const box = { x: 0.2, y: 0.2, w: 0.2, h: 0.1 };
    const t = scaleFromCorner(box, 2, { x: 0.6, y: 0.4 }); // bottom-right dragged out 2×
    expect(t.k).toBeCloseTo(2);
    expect(apply(t, { x: 0.2, y: 0.2 })).toEqual({ x: 0.2, y: 0.2 });
    const tl = scaleFromCorner(box, 0, { x: 0.3, y: 0.25 }); // top-left dragged in: half size
    expect(tl.k).toBeCloseTo(0.5);
    expect(apply(tl, { x: 0.4, y: 0.3 }).x).toBeCloseTo(0.4);
    expect(scaleFromCorner(box, 2, { x: 0, y: 0 }).k).toBeGreaterThan(0); // never flips or vanishes
  });

  it("keeps moved boxes on the page", () => {
    const box = { x: 0.8, y: 0.8, w: 0.1, h: 0.1 };
    const t = clampMove({ dx: 0.5, dy: -1, k: 1, ox: 0, oy: 0 }, box, { w: 1, h: 1 });
    const b = applyBox(t, box);
    expect(b.x + b.w).toBeCloseTo(1);
    expect(b.y).toBeCloseTo(0);
    const p = applyBox(pasteOffset({ x: 0.95, y: 0.1, w: 0.05, h: 0.1 }, { w: 1, h: 1 }), { x: 0.95, y: 0.1, w: 0.05, h: 0.1 });
    expect(p.x + p.w).toBeLessThanOrEqual(1);
  });
});
