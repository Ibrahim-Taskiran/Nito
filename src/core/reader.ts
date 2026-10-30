// Reader logic that does not need pdf.js or the DOM: which pages to render, zoom steps, highlight geometry.
import type { Rect } from "./types";

/** Visible pages plus `margin` pages on each side, within 1..count. */
export function pagesToRender(visible: Iterable<number>, count: number, margin = 1): Set<number> {
  const out = new Set<number>();
  for (const p of visible) {
    for (let q = p - margin; q <= p + margin; q++) if (q >= 1 && q <= count) out.add(q);
  }
  return out;
}

/** Bitmap limits per page: big scans or 400% zoom on an A0 page must not need a 100+ MP canvas. */
export const MAX_CANVAS_PIXELS = 16_000_000;
export const MAX_CANVAS_SIDE = 8192;

/**
 * Bitmap pixels per CSS pixel for a page drawn `cssW` x `cssH` CSS pixels: the device pixel ratio,
 * lowered so the bitmap stays within `maxPixels` and `maxSide` (CSS then stretches it a little).
 */
export function canvasRatio(cssW: number, cssH: number, dpr: number, maxPixels = MAX_CANVAS_PIXELS, maxSide = MAX_CANVAS_SIDE): number {
  const want = dpr > 0 ? dpr : 1;
  if (cssW <= 0 || cssH <= 0) return want;
  const byArea = Math.sqrt(maxPixels / (cssW * cssH));
  const bySide = maxSide / Math.max(cssW, cssH);
  return Math.min(want, byArea, bySide);
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
const ZOOM_STEP = 1.2;

export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
export const zoomIn = (z: number): number => clampZoom(z * ZOOM_STEP);
export const zoomOut = (z: number): number => clampZoom(z / ZOOM_STEP);

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Selection rectangles (screen pixels) -> rectangles normalised to the page box (0..1).
 * Drops rects outside the page and tiny ones, and joins touching rects on one line.
 */
export function normaliseRects(rects: Iterable<Box>, page: Box): Rect[] {
  const out: Rect[] = [];
  for (const r of rects) {
    const x0 = Math.max(r.left, page.left);
    const y0 = Math.max(r.top, page.top);
    const x1 = Math.min(r.left + r.width, page.left + page.width);
    const y1 = Math.min(r.top + r.height, page.top + page.height);
    if (x1 - x0 < 1 || y1 - y0 < 1) continue;
    out.push({ x: (x0 - page.left) / page.width, y: (y0 - page.top) / page.height, w: (x1 - x0) / page.width, h: (y1 - y0) / page.height });
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: Rect[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    const sameLine = last && Math.abs(last.y - r.y) < last.h / 2 && Math.abs(last.h - r.h) < last.h / 2;
    if (sameLine && r.x <= last.x + last.w + 0.01) {
      const right = Math.max(last.x + last.w, r.x + r.w);
      const bottom = Math.max(last.y + last.h, r.y + r.h);
      last.y = Math.min(last.y, r.y);
      last.w = right - last.x;
      last.h = bottom - last.y;
    } else {
      merged.push({ ...r });
    }
  }
  // Four decimals is well under a pixel and keeps the stored JSON short.
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  return merged.map((r) => ({ x: r4(r.x), y: r4(r.y), w: r4(r.w), h: r4(r.h) }));
}

/** Page number typed into the page box, clamped to 1..count. Null when it is not a number. */
export function parsePageInput(text: string, count: number): number | null {
  const n = Number.parseInt(text.trim(), 10);
  if (!Number.isFinite(n) || count < 1) return null;
  return Math.min(count, Math.max(1, n));
}

export interface OutlineNode<D> {
  title: string;
  dest: D;
  items?: readonly OutlineNode<D>[];
}

export interface OutlineRow<D> {
  title: string;
  dest: D;
  depth: number;
}

/** Outline tree (pdf.js getOutline) as a flat, indented list in reading order. */
export function flattenOutline<D>(items: readonly OutlineNode<D>[] | null | undefined, depth = 0): OutlineRow<D>[] {
  return (items ?? []).flatMap((it) => [
    { title: it.title.trim() || "(adsız)", dest: it.dest, depth },
    ...flattenOutline(it.items, depth + 1),
  ]);
}

/** Which mark on a page is the current search hit: the hit's position among that page's hits. */
export function hitOnPage(hits: readonly { page: number }[], index: number): number {
  const h = hits[index];
  if (!h) return -1;
  let k = 0;
  for (let i = 0; i < index; i++) if (hits[i].page === h.page) k++;
  return k;
}
