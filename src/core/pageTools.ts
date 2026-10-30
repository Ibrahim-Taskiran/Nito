// Page tools: tape (cover an area), text boxes and sticky notes, margin expansion, layer visibility.
// All rects are normalised to the original PDF page (0..1). Values above 1 lie in the added margin.

export interface PageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tape extends PageRect {
  id: number;
  documentId: number;
  page: number;
  /** Shown through (tapped open); false = covered. */
  revealed: boolean;
}

export type NoteKind = "text" | "sticky";

export interface PageNote extends PageRect {
  id: number;
  documentId: number;
  page: number;
  kind: NoteKind;
  /** Markdown-light text with $LaTeX$ and ``` code blocks. */
  body: string;
  /** Sticky notes fold to an icon. */
  collapsed: boolean;
  /** Sticky note paper colour (one of NOTE_COLORS). */
  color: string;
}

/** Extra writable area: right as a fraction of the page width, bottom of the page height. */
export interface Margin {
  right: number;
  bottom: number;
}

export const NO_MARGIN: Margin = Object.freeze({ right: 0, bottom: 0 });
export const MARGIN_STEP = 0.25;
export const MARGIN_MAX = 1;

/** Calm paper colours for sticky notes; the first is the default. */
export const NOTE_COLORS = [
  { color: "#fff3a8", name: "Sarı" },
  { color: "#ffd6e0", name: "Pembe" },
  { color: "#d4f5c9", name: "Yeşil" },
  { color: "#d3e8ff", name: "Mavi" },
  { color: "#ffe0b8", name: "Turuncu" },
  { color: "#e6dcff", name: "Mor" },
  { color: "#ebedf0", name: "Gri" },
] as const;

export const DEFAULT_NOTE_COLOR: string = NOTE_COLORS[0].color;

/** A stored note colour; anything not in NOTE_COLORS becomes the default. */
export const asNoteColor = (v: unknown): string =>
  NOTE_COLORS.find((c) => c.color === (typeof v === "string" ? v.toLowerCase() : v))?.color ?? DEFAULT_NOTE_COLOR;

export const asNoteKind = (v: unknown): NoteKind => (v === "sticky" ? "sticky" : "text");

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 1e4) / 1e4;

/** Writable area of a page in page units: 1 + margin each way. */
export function pageBounds(m: Margin = NO_MARGIN): { w: number; h: number } {
  return { w: 1 + m.right, h: 1 + m.bottom };
}

/** Rect spanned by two points (any drag direction), kept inside `bounds`. */
export function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }, bounds = pageBounds()): PageRect {
  const x0 = clamp(Math.min(a.x, b.x), 0, bounds.w);
  const y0 = clamp(Math.min(a.y, b.y), 0, bounds.h);
  const x1 = clamp(Math.max(a.x, b.x), 0, bounds.w);
  const y1 = clamp(Math.max(a.y, b.y), 0, bounds.h);
  return { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) };
}

/** A drag smaller than this (page fraction, each way) is a tap, not a new tape. */
export const MIN_TAPE = 0.012;
export const isTapeSized = (r: PageRect): boolean => r.w >= MIN_TAPE && r.h >= MIN_TAPE;

export const containsPoint = (r: PageRect, p: { x: number; y: number }): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Topmost (last drawn) tape under the point, or null. */
export function tapeAt<T extends PageRect>(tapes: readonly T[], p: { x: number; y: number }): T | null {
  for (let i = tapes.length - 1; i >= 0; i--) if (containsPoint(tapes[i], p)) return tapes[i];
  return null;
}

/** Moves by (dx, dy) and keeps the whole rect inside `bounds`. */
export function moveWithin(r: PageRect, dx: number, dy: number, bounds = pageBounds()): PageRect {
  return { ...r, x: clamp(r.x + dx, 0, Math.max(0, bounds.w - r.w)), y: clamp(r.y + dy, 0, Math.max(0, bounds.h - r.h)) };
}

/** Bottom-right corner drag; size stays between `min` and the bounds. */
export function resizeWithin(r: PageRect, dx: number, dy: number, bounds = pageBounds(), min = { w: 0.08, h: 0.04 }): PageRect {
  return {
    ...r,
    w: clamp(r.w + dx, Math.min(min.w, bounds.w - r.x), bounds.w - r.x),
    h: clamp(r.h + dy, Math.min(min.h, bounds.h - r.y), bounds.h - r.y),
  };
}

/** New note rect at a tapped point, nudged so it stays on the writable area. */
export function noteRectAt(kind: NoteKind, p: { x: number; y: number }, bounds = pageBounds()): PageRect {
  const size = kind === "sticky" ? { w: 0.24, h: 0.16 } : { w: 0.32, h: 0.08 };
  return moveWithin({ x: p.x, y: p.y, ...size }, 0, 0, bounds);
}

/** How far content reaches past the PDF page (0 when everything is on the page). */
export function contentExtent(items: Iterable<{ x: number; y: number; w?: number; h?: number }>): Margin {
  let right = 0;
  let bottom = 0;
  for (const i of items) {
    right = Math.max(right, i.x + (i.w ?? 0) - 1);
    bottom = Math.max(bottom, i.y + (i.h ?? 0) - 1);
  }
  return { right: round(Math.max(0, right)), bottom: round(Math.max(0, bottom)) };
}

export type MarginSide = "right" | "bottom";

/** One more step of margin on a side, up to MARGIN_MAX. */
export function growMargin(m: Margin, side: MarginSide): Margin {
  return { ...m, [side]: round(Math.min(MARGIN_MAX, m[side] + MARGIN_STEP)) };
}

/** Removes a side's margin, but never below what the content there needs. `kept` tells the caller. */
export function clearMargin(m: Margin, side: MarginSide, extent: Margin): { margin: Margin; kept: boolean } {
  const need = extent[side];
  if (need <= 0) return { margin: { ...m, [side]: 0 }, kept: false };
  const steps = Math.ceil(need / MARGIN_STEP - 1e-9) * MARGIN_STEP;
  return { margin: { ...m, [side]: round(Math.max(Math.min(m[side], steps), Math.min(need, MARGIN_MAX))) }, kept: true };
}

/** Parses stored margin numbers; junk becomes 0, values are kept in 0..MARGIN_MAX. */
export function asMargin(right: unknown, bottom: unknown): Margin {
  const f = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, 0, MARGIN_MAX) : 0);
  return { right: f(right), bottom: f(bottom) };
}

/** Layers the reader can hide. Highlights include the highlighter pen. */
export const LAYERS = [
  { key: "highlights", name: "Vurgular ve fosforlu" },
  { key: "ink", name: "Kalem yazısı" },
  { key: "images", name: "Resimler" },
  { key: "notes", name: "Metin kutuları ve notlar" },
  { key: "tape", name: "Bantlar" },
] as const;

export type LayerKey = (typeof LAYERS)[number]["key"];
export type Layers = Record<LayerKey, boolean>;

export const ALL_LAYERS: Layers = Object.freeze({ highlights: true, ink: true, images: true, notes: true, tape: true });

/** Stored layer settings (per device); anything unknown or missing stays visible. */
export function parseLayers(json: string | null): Layers {
  const out = { ...ALL_LAYERS };
  try {
    const v = JSON.parse(json ?? "{}");
    for (const { key } of LAYERS) if (v?.[key] === false) out[key] = false;
  } catch { /* bad JSON: all visible */ }
  return out;
}
