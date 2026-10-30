// Lasso selection on a page: which strokes and pictures a free loop holds, and moving / scaling them.
// Page-normalised units like ink. A uniform scale of x and y keeps shapes on screen in proportion.
import type { InkPoint } from "./ink";
import type { ImageRect } from "./pageImage";

export type Pt = { x: number; y: number };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Move by (dx, dy) after scaling by k about (ox, oy). */
export interface Transform {
  dx: number;
  dy: number;
  k: number;
  ox: number;
  oy: number;
}

export const IDENTITY: Transform = { dx: 0, dy: 0, k: 1, ox: 0, oy: 0 };

/** Even-odd ray test. The polygon closes itself. */
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A stroke is in the lasso when most of its points are (a loop drawn a bit short still works). */
export function strokeInLasso(points: readonly Pt[], lasso: readonly Pt[], share = 0.6): boolean {
  if (lasso.length < 3 || !points.length) return false;
  let n = 0;
  for (const p of points) if (pointInPolygon(p, lasso)) n++;
  return n / points.length >= share;
}

/** A picture or note is in the lasso when its centre is. */
export const rectInLasso = (r: Box, lasso: readonly Pt[]): boolean => lasso.length >= 3 && pointInPolygon({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, lasso);

export function pointsBox(points: readonly Pt[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return x0 === Infinity ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionBox(boxes: readonly Box[]): Box {
  return pointsBox(boxes.flatMap((b) => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]));
}

export const apply = (t: Transform, p: Pt): Pt => ({ x: t.ox + (p.x - t.ox) * t.k + t.dx, y: t.oy + (p.y - t.oy) * t.k + t.dy });

export function applyPoints(t: Transform, pts: readonly InkPoint[]): InkPoint[] {
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return pts.map((q) => {
    const a = apply(t, q);
    return { x: r(a.x), y: r(a.y), p: q.p };
  });
}

export function applyBox(t: Transform, b: Box): Box {
  const a = apply(t, b);
  return { x: a.x, y: a.y, w: b.w * t.k, h: b.h * t.k };
}

export const applyRect = (t: Transform, r: ImageRect): ImageRect => applyBox(t, r);

/** Smallest selection side after scaling (page fraction), so it can still be grabbed. */
const MIN_SIDE = 0.01;

/**
 * Corner drag: the opposite corner stays put, the aspect ratio stays the same.
 * `corner` is the dragged corner (0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left), `to` where it is now.
 */
export function scaleFromCorner(box: Box, corner: 0 | 1 | 2 | 3, to: Pt): Transform {
  const ox = corner === 0 || corner === 3 ? box.x + box.w : box.x;
  const oy = corner === 0 || corner === 1 ? box.y + box.h : box.y;
  const fx = corner === 0 || corner === 3 ? box.x : box.x + box.w;
  const fy = corner === 0 || corner === 1 ? box.y : box.y + box.h;
  const d0 = Math.hypot(fx - ox, fy - oy);
  // Project the pointer on the diagonal, so sideways wobble does not change the size.
  const ux = (fx - ox) / (d0 || 1), uy = (fy - oy) / (d0 || 1);
  const along = (to.x - ox) * ux + (to.y - oy) * uy;
  const minK = MIN_SIDE / Math.max(MIN_SIDE, Math.min(box.w || 1, box.h || 1));
  const k = Math.max(minK, d0 ? along / d0 : 1);
  return { dx: 0, dy: 0, k, ox, oy };
}

/** Shift that brings a box back on the writable area (the page and its added margin). */
function pullInside(b: Box, bounds: { w: number; h: number }): Pt {
  const fix = (pos: number, size: number, max: number) => (size >= max ? -pos : pos < 0 ? -pos : pos + size > max ? max - size - pos : 0);
  return { x: fix(b.x, b.w, bounds.w), y: fix(b.y, b.h, bounds.h) };
}

/** Keeps a moved / scaled box on the writable area. */
export function clampMove(t: Transform, box: Box, bounds: { w: number; h: number }): Transform {
  const f = pullInside(applyBox(t, box), bounds);
  return { ...t, dx: t.dx + f.x, dy: t.dy + f.y };
}

/** Offset for a pasted copy: down and right, and back on the page if that leaves it. */
export function pasteOffset(box: Box, bounds: { w: number; h: number }, step = 0.03): Transform {
  return clampMove({ ...IDENTITY, dx: step, dy: step }, box, bounds);
}

// ---- Moving to another page ----

/** One page's units to another's: x' = x * sx + dx. Two axes, as pages may differ in shape. */
export interface PageMap {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
}

/** Where a page sits (screen pixels, or PDF points from 0, 0) and its writable area in page units. */
export interface PagePlace {
  rect: Box;
  bounds: { w: number; h: number };
}

/**
 * Map that keeps things where they are on screen (or the same size on paper), shifted by `shift` in the
 * same units as the rects. The result is pulled back onto the target page.
 */
export function pageMap(from: PagePlace, to: PagePlace, box: Box, shift: Pt = { x: 0, y: 0 }): PageMap {
  const ux = from.rect.w / from.bounds.w, uy = from.rect.h / from.bounds.h;
  const vx = to.bounds.w / to.rect.w, vy = to.bounds.h / to.rect.h;
  const m = { sx: ux * vx, sy: uy * vy, dx: (from.rect.x + shift.x - to.rect.x) * vx, dy: (from.rect.y + shift.y - to.rect.y) * vy };
  const f = pullInside(mapBox(m, box), to.bounds);
  return { ...m, dx: m.dx + f.x, dy: m.dy + f.y };
}

/** Same spot and paper size on a page of `size` PDF points (no screen needed). */
export const paperPlace = (size: { w: number; h: number }, bounds: { w: number; h: number }): PagePlace => ({
  rect: { x: 0, y: 0, w: size.w * bounds.w, h: size.h * bounds.h },
  bounds,
});

export const mapPt = (m: PageMap, p: Pt): Pt => ({ x: p.x * m.sx + m.dx, y: p.y * m.sy + m.dy });

export function mapPoints(m: PageMap, pts: readonly InkPoint[]): InkPoint[] {
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return pts.map((q) => {
    const a = mapPt(m, q);
    return { x: r(a.x), y: r(a.y), p: q.p };
  });
}

export function mapBox(m: PageMap, b: Box): Box {
  const a = mapPt(m, b);
  return { x: a.x, y: a.y, w: b.w * m.sx, h: b.h * m.sy };
}
