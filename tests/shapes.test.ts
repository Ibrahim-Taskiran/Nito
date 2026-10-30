import { describe, expect, it } from "vitest";
import type { InkPoint } from "../src/core/ink";
import { recognizeShape } from "../src/core/shapes";

// Deterministic wobble so the tests never flake.
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
}

function wobbly(pts: [number, number][], amp: number, seed = 7, step = 0.004): InkPoint[] {
  const r = rng(seed);
  const out: InkPoint[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      out.push({ x: x0 + t * (x1 - x0) + r() * amp, y: y0 + t * (y1 - y0) + r() * amp, p: 0.5 });
    }
  }
  return out;
}

function loop(cx: number, cy: number, rx: number, ry: number, amp: number, turns = 1.03, seed = 3): InkPoint[] {
  const r = rng(seed);
  return Array.from({ length: 90 }, (_, i) => {
    const t = (i / 89) * turns * 2 * Math.PI;
    return { x: cx + rx * Math.cos(t) + r() * amp, y: cy + ry * Math.sin(t) + r() * amp, p: 0.6 };
  });
}

/** Simple cursive-like handwriting: a run of small loops (like "eee") and a word-sized scribble. */
const handwriting = (): InkPoint[] =>
  Array.from({ length: 120 }, (_, i) => {
    const t = i / 119;
    return { x: 0.2 + t * 0.12 + 0.008 * Math.cos(t * 30), y: 0.3 + 0.01 * Math.sin(t * 30), p: 0.5 };
  });

describe("shape recognition", () => {
  it("straightens a wobbly line and snaps it to 0°, 45° and 90°", () => {
    const s = recognizeShape(wobbly([[0.1, 0.2], [0.5, 0.215]], 0.004));
    expect(s?.kind).toBe("line");
    const [a, b] = [s!.points[0], s!.points[s!.points.length - 1]];
    expect(Math.abs(a.y - b.y)).toBeLessThan(1e-3); // snapped level
    const d = recognizeShape(wobbly([[0.1, 0.1], [0.4, 0.42]], 0.004))!;
    const [c, e] = [d.points[0], d.points[d.points.length - 1]];
    expect(Math.abs(e.x - c.x - (e.y - c.y))).toBeLessThan(1e-3); // 45°
    const v = recognizeShape(wobbly([[0.3, 0.1], [0.31, 0.5]], 0.004))!;
    expect(Math.abs(v.points[0].x - v.points[v.points.length - 1].x)).toBeLessThan(1e-3);
    // A slanted line far from the snap angles stays slanted.
    const free = recognizeShape(wobbly([[0.1, 0.1], [0.5, 0.25]], 0.003))!;
    expect(free.kind).toBe("line");
    expect(free.points[free.points.length - 1].y - free.points[0].y).toBeGreaterThan(0.1);
  });

  it("finds circles and ellipses, and keeps a circle round on a non-square page", () => {
    expect(recognizeShape(loop(0.5, 0.5, 0.1, 0.1, 0.008))?.kind).toBe("circle");
    expect(recognizeShape(loop(0.5, 0.5, 0.2, 0.08, 0.008))?.kind).toBe("ellipse");
    // Overshooting past the start (common when closing a circle fast) is still a circle.
    expect(recognizeShape(loop(0.5, 0.5, 0.1, 0.1, 0.006, 1.2))?.kind).toBe("circle");
    // On a page 1.4× taller than wide, y units are smaller: ry = rx / 1.4 is round on screen.
    expect(recognizeShape(loop(0.5, 0.5, 0.1, 0.1 / 1.4, 0.004), { aspect: 1.4 })?.kind).toBe("circle");
  });

  it("finds rectangles, squares and triangles with sharp corners", () => {
    const rect = recognizeShape(wobbly([[0.1, 0.1], [0.5, 0.11], [0.51, 0.3], [0.1, 0.29], [0.11, 0.105]], 0.004))!;
    expect(rect.kind).toBe("rect");
    const ys = new Set(rect.points.map((q) => q.y.toFixed(3)));
    expect(ys.size).toBe(2); // level top and bottom
    expect(recognizeShape(wobbly([[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.4], [0.2, 0.2]], 0.004))?.kind).toBe("square");
    expect(recognizeShape(wobbly([[0.2, 0.4], [0.35, 0.1], [0.5, 0.4], [0.2, 0.4]], 0.004))?.kind).toBe("triangle");
  });

  it("finds arrows drawn in one stroke", () => {
    // Shaft, then one barb.
    expect(recognizeShape(wobbly([[0.1, 0.3], [0.5, 0.3], [0.44, 0.26]], 0.002))?.kind).toBe("arrow");
    // Shaft, barb, back to the tip, the other barb.
    const a = recognizeShape(wobbly([[0.1, 0.3], [0.5, 0.3], [0.44, 0.26], [0.5, 0.3], [0.44, 0.34]], 0.002))!;
    expect(a.kind).toBe("arrow");
    expect(a.points.length).toBeGreaterThanOrEqual(5);
  });

  it("never changes handwriting or small marks", () => {
    expect(recognizeShape(handwriting())).toBeNull();
    expect(recognizeShape(loop(0.5, 0.5, 0.008, 0.008, 0.001))).toBeNull(); // the letter "o"
    expect(recognizeShape(wobbly([[0.1, 0.1], [0.12, 0.1]], 0.001))).toBeNull(); // a dash
    // An L corner is neither a line nor an arrow.
    expect(recognizeShape(wobbly([[0.1, 0.1], [0.1, 0.4], [0.4, 0.4]], 0.002))).toBeNull();
    // A zigzag is not a line.
    expect(recognizeShape(wobbly([[0.1, 0.1], [0.2, 0.15], [0.3, 0.1], [0.4, 0.15], [0.5, 0.1]], 0.001))).toBeNull();
  });

  it("auto mode takes only very clean shapes; allow limits the kinds", () => {
    expect(recognizeShape(wobbly([[0.1, 0.2], [0.5, 0.2]], 0.001), { mode: "auto" })?.kind).toBe("line");
    expect(recognizeShape(loop(0.5, 0.5, 0.1, 0.1, 0.03), { mode: "auto" })).toBeNull();
    expect(recognizeShape(loop(0.5, 0.5, 0.1, 0.1, 0.008), { allow: ["line"] })).toBeNull();
  });

  it("keeps the average pressure", () => {
    const s = recognizeShape(loop(0.5, 0.5, 0.1, 0.1, 0.004))!;
    expect(s.points.every((q) => q.p === 0.6)).toBe(true);
  });
});
