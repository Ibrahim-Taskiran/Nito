// Handwriting (pen) strokes on PDF pages. Points are normalised to the page (0..1) so zoom does not matter.

/** x, y in 0..1 of the page; p = pen pressure 0..1 (0.5 for mouse and finger). */
export interface InkPoint {
  x: number;
  y: number;
  p: number;
}

/** Saved pen kinds. The laser pointer is never saved, so it is not here. */
export type InkKind = "pen" | "pencil" | "highlighter";

export interface InkStroke {
  id: number;
  documentId: number;
  page: number;
  color: string;
  /** Base width as a fraction of the page width. */
  width: number;
  points: InkPoint[];
  kind: InkKind;
}

export interface InkColor {
  color: string;
  name: string;
}

/** Ballpoint colours: dark, saturated, readable on white paper. */
const PEN_COLORS: readonly InkColor[] = [
  { color: "#000000", name: "Siyah" },
  { color: "#1f2a44", name: "Koyu" },
  { color: "#c0392b", name: "Kırmızı" },
  { color: "#2f6fb0", name: "Mavi" },
  { color: "#1e8449", name: "Yeşil" },
  { color: "#7d3c98", name: "Mor" },
  { color: "#d35400", name: "Turuncu" },
  { color: "#b03a6f", name: "Pembe" },
  { color: "#117a8b", name: "Turkuaz" },
  { color: "#6e4b2a", name: "Kahverengi" },
];

/** Pencil: graphite greys first, then soft coloured pencils. */
const PENCIL_COLORS: readonly InkColor[] = [
  { color: "#4a4a4a", name: "Grafit" },
  { color: "#777777", name: "Gri" },
  { color: "#222222", name: "Siyah" },
  { color: "#a04238", name: "Kırmızı" },
  { color: "#3d6a99", name: "Mavi" },
  { color: "#3f7d4f", name: "Yeşil" },
  { color: "#6d4f8c", name: "Mor" },
  { color: "#b5652b", name: "Turuncu" },
  { color: "#2f7f86", name: "Turkuaz" },
  { color: "#7a5a3a", name: "Kahverengi" },
];

/** Highlighter: bright, light colours that keep black text readable under multiply. */
const HIGHLIGHTER_COLORS: readonly InkColor[] = [
  { color: "#ffe14d", name: "Sarı" },
  { color: "#8ce99a", name: "Yeşil" },
  { color: "#ff9ecb", name: "Pembe" },
  { color: "#8cc8ff", name: "Mavi" },
  { color: "#ffb35c", name: "Turuncu" },
  { color: "#c9a7ff", name: "Mor" },
  { color: "#7ee8e0", name: "Turkuaz" },
  { color: "#ff8a80", name: "Kırmızı" },
  { color: "#d4f06a", name: "Fıstık" },
  { color: "#d0d4d8", name: "Gri" },
];

export interface InkKindInfo {
  kind: InkKind;
  name: string;
  colors: readonly InkColor[];
  /** Base widths (page-width fraction) for the thin / medium / thick setting. */
  widths: readonly [number, number, number];
  opacity: number;
  /** Pressure changes the width (pen, pencil) or not (highlighter). */
  pressure: boolean;
}

export const INK_KINDS: Record<InkKind, InkKindInfo> = {
  pen: { kind: "pen", name: "Tükenmez", colors: PEN_COLORS, widths: [0.0017, 0.0025, 0.004], opacity: 1, pressure: true },
  pencil: { kind: "pencil", name: "Kurşun kalem", colors: PENCIL_COLORS, widths: [0.0009, 0.0014, 0.0022], opacity: 0.72, pressure: true },
  highlighter: { kind: "highlighter", name: "Fosforlu", colors: HIGHLIGHTER_COLORS, widths: [0.009, 0.014, 0.02], opacity: 0.45, pressure: false },
};

export const INK_COLORS = PEN_COLORS;

export const INK_WIDTH = INK_KINDS.pen.widths[1];

/** Unknown kinds in old or foreign rows fall back to the ballpoint. */
export const asInkKind = (v: unknown): InkKind => (v === "pencil" || v === "highlighter" ? v : "pen");

/** Accepts only #rrggbb, so a stored colour can always go into an SVG attribute. */
export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

function distToSegment(p: InkPoint, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker: drops points closer than `tolerance` to the line, keeps the shape. */
export function simplify(points: InkPoint[], tolerance = 0.0008): InkPoint[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let dist = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(points[i], points[a], points[b]);
      if (d > dist) {
        dist = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return points.filter((_, i) => keep[i]).map((q) => ({ x: r(q.x), y: r(q.y), p: Math.round(q.p * 100) / 100 }));
}

/** Smooth SVG path in page units (0..1 scaled by w, h), quadratic curves through midpoints. */
export function strokePath(points: InkPoint[], w: number, h: number): string {
  if (!points.length) return "";
  const P = points.map((q) => [q.x * w, q.y * h] as const);
  const f = (v: number) => v.toFixed(1);
  if (P.length === 1) return `M${f(P[0][0])} ${f(P[0][1])}l0.01 0`;
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 1; i < P.length - 1; i++) {
    const mx = (P[i][0] + P[i + 1][0]) / 2;
    const my = (P[i][1] + P[i + 1][1]) / 2;
    d += `Q${f(P[i][0])} ${f(P[i][1])} ${f(mx)} ${f(my)}`;
  }
  const last = P[P.length - 1];
  return `${d}L${f(last[0])} ${f(last[1])}`;
}

/** Stroke width in pixels from base width and the average pressure (0.5 pressure = base). */
export function strokeWidth(s: Pick<InkStroke, "width" | "points"> & { kind?: InkKind }, pageWidthPx: number): number {
  if (s.kind && !INK_KINDS[s.kind].pressure) return Math.max(1, s.width * pageWidthPx);
  const avg = s.points.reduce((a, q) => a + q.p, 0) / Math.max(1, s.points.length);
  return Math.max(1, s.width * pageWidthPx * (0.5 + avg));
}

/** True when `p` is within `radius` (page fraction) of the stroke. For the eraser. */
export function hitsStroke(s: Pick<InkStroke, "points"> & { width?: number }, p: Pick<InkPoint, "x" | "y">, radius = 0.01): boolean {
  // Wide strokes (highlighter) are hit anywhere on their body, not only near the centre line.
  radius = Math.max(radius, (s.width ?? 0) / 2);
  const q = { ...p, p: 0 };
  if (s.points.length === 1) return Math.hypot(s.points[0].x - p.x, s.points[0].y - p.y) <= radius;
  for (let i = 1; i < s.points.length; i++) if (distToSegment(q, s.points[i - 1], s.points[i]) <= radius) return true;
  return false;
}
