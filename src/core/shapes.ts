// Shape correction: a hand-drawn line, circle, ellipse, rectangle, triangle or arrow becomes a clean one.
// Pure maths on page-normalised points. `aspect` (page height / width in pixels) makes x and y the same unit,
// so a round circle on screen stays round. Small or complex strokes (handwriting) never match.
import type { InkPoint } from "./ink";

export type ShapeKind = "line" | "circle" | "ellipse" | "rect" | "square" | "triangle" | "arrow";

export interface Shape {
  kind: ShapeKind;
  /** Clean points, page-normalised like the input. Corners appear twice so the smooth path keeps them sharp. */
  points: InkPoint[];
  /** Fit error (0 = perfect); lower is better. */
  error: number;
}

export interface ShapeOptions {
  /** Page height / width in pixels. */
  aspect?: number;
  /** "hold": the user held the pen still, normal thresholds. "auto": only very clean fits. */
  mode?: "hold" | "auto";
  /** Shapes allowed, e.g. ["line"] for the highlighter. All by default. */
  allow?: readonly ShapeKind[];
}

type V = { x: number; y: number };

/** Smallest stroke (bounding box diagonal, page widths) that may become a shape. Handwriting is smaller. */
export const MIN_SHAPE = { hold: 0.035, auto: 0.06 } as const;
/** Fit limits per mode: line deviation and closed shape error, as fractions of the shape size. */
const LIMITS = {
  hold: { line: 0.05, ellipse: 0.085, poly: 0.05 },
  auto: { line: 0.018, ellipse: 0.035, poly: 0.025 },
} as const;
const SNAP_DEG = 8;
const N = 64;

const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(p: V[]): number {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += dist(p[i - 1], p[i]);
  return l;
}

/** `n` points spread evenly along the path. */
export function resample(p: V[], n = N): V[] {
  if (p.length < 2) return p.slice();
  const step = pathLength(p) / (n - 1);
  if (!step) return [p[0]];
  const out: V[] = [{ ...p[0] }];
  let acc = 0;
  let prev = p[0];
  for (let i = 1; i < p.length; i++) {
    let cur = p[i];
    let d = dist(prev, cur);
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const q = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(q);
      prev = q;
      d = dist(prev, cur);
      acc = 0;
    }
    acc += d;
    prev = cur;
  }
  while (out.length < n) out.push({ ...p[p.length - 1] });
  return out;
}

function segDist(p: V, a: V, b: V): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Corner indices of an open polyline (Ramer–Douglas–Peucker). */
function corners(p: V[], tol: number): number[] {
  const keep = new Set([0, p.length - 1]);
  const stack: [number, number][] = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let d = tol;
    for (let i = a + 1; i < b; i++) {
      const di = segDist(p[i], p[a], p[b]);
      if (di > d) [d, worst] = [di, i];
    }
    if (worst >= 0) {
      keep.add(worst);
      stack.push([a, worst], [worst, b]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

/** Mean distance of the points to a closed polygon, divided by `size`. */
function polyError(p: V[], poly: V[], size: number): number {
  let sum = 0;
  for (const q of p) {
    let m = Infinity;
    for (let i = 0; i < poly.length; i++) m = Math.min(m, segDist(q, poly[i], poly[(i + 1) % poly.length]));
    sum += m;
  }
  return sum / p.length / size;
}

const angleDeg = (a: V, b: V) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** Angle at `b` between b→a and b→c, in degrees (0..180). */
function cornerAngle(a: V, b: V, c: V): number {
  const d = Math.abs(angleDeg(b, a) - angleDeg(b, c)) % 360;
  return d > 180 ? 360 - d : d;
}

function snapEnd(a: V, b: V): V {
  const len = dist(a, b);
  const ang = angleDeg(a, b);
  const near = Math.round(ang / 45) * 45;
  if (Math.abs(ang - near) > SNAP_DEG) return b;
  const r = (near * Math.PI) / 180;
  return { x: a.x + len * Math.cos(r), y: a.y + len * Math.sin(r) };
}

/** Points along a polyline, corners doubled (see Shape.points). */
function polyline(v: V[], closed: boolean): V[] {
  const out: V[] = [];
  const all = closed ? [...v, v[0]] : v;
  all.forEach((q, i) => {
    out.push(q);
    if (i > 0 && i < all.length - 1) out.push(q);
  });
  return out;
}

function fitLine(r: V[], size: number, lim: number): { pts: V[]; error: number } | null {
  const a = r[0];
  const b = r[r.length - 1];
  const len = dist(a, b);
  if (len < size * 0.9) return null;
  const dev = Math.max(...r.map((q) => segDist(q, a, b))) / len;
  if (dev > lim * 2) return null;
  const mean = r.reduce((s, q) => s + segDist(q, a, b), 0) / r.length / len;
  if (mean > lim) return null;
  return { pts: [a, snapEnd(a, b)], error: mean };
}

/** Ellipse from the points' spread (principal axes). Error: mean relative radial miss. */
function fitEllipse(r: V[], lim: number): { pts: V[]; error: number; round: boolean } | null {
  const c = { x: r.reduce((s, q) => s + q.x, 0) / r.length, y: r.reduce((s, q) => s + q.y, 0) / r.length };
  let sxx = 0, syy = 0, sxy = 0;
  for (const q of r) {
    const dx = q.x - c.x, dy = q.y - c.y;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  sxx /= r.length; syy /= r.length; sxy /= r.length;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(1e-12, tr / 2 - disc);
  let th = Math.abs(sxy) < 1e-12 ? (sxx >= syy ? 0 : Math.PI / 2) : Math.atan2(l1 - sxx, sxy);
  // Points spread evenly on an ellipse have variance a²/2 along each axis.
  let a = Math.sqrt(2 * l1);
  let b = Math.sqrt(2 * l2);
  const round = b / a > 0.82;
  if (round) a = b = (a + b) / 2;
  // Nearly level ellipses are drawn level.
  const deg = ((th * 180) / Math.PI + 360) % 90;
  if (!round && (deg < SNAP_DEG || deg > 90 - SNAP_DEG)) th = Math.round((th * 2) / Math.PI) * (Math.PI / 2);
  const cos = Math.cos(th), sin = Math.sin(th);
  let err = 0;
  let sweep = 0;
  let prevAng: number | null = null;
  for (const q of r) {
    const dx = q.x - c.x, dy = q.y - c.y;
    const u = dx * cos + dy * sin;
    const w = -dx * sin + dy * cos;
    err += Math.abs(Math.hypot(u / a, w / b) - 1);
    const ang = Math.atan2(dy, dx);
    if (prevAng != null) {
      let d = ang - prevAng;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      sweep += d;
    }
    prevAng = ang;
  }
  err /= r.length;
  // A closed loop goes once round its centre (a little short or long is fine).
  if (Math.abs(sweep) < Math.PI * 1.7 || Math.abs(sweep) > Math.PI * 2.5 || err > lim) return null;
  const pts: V[] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 * Math.PI;
    const u = a * Math.cos(t), w = b * Math.sin(t);
    pts.push({ x: c.x + u * cos - w * sin, y: c.y + u * sin + w * cos });
  }
  return { pts, error: err, round };
}

/** Closed polygon with 3 or 4 corners. Rectangles are made square-cornered (and level when nearly level). */
function fitPolygon(r: V[], size: number, lim: number): { kind: ShapeKind; pts: V[]; error: number } | null {
  const idx = corners(r, size * 0.08);
  let v = idx.map((i) => r[i]);
  // The start and end meet: drop the end, and the start too when it is not a real corner.
  v = v.slice(0, -1);
  if (v.length >= 3 && cornerAngle(v[v.length - 1], v[0], v[1]) > 150) v = v.slice(1);
  if (v.length !== 3 && v.length !== 4) return null;
  if (v.length === 3) {
    const error = polyError(r, v, size);
    return error <= lim ? { kind: "triangle", pts: polyline(v, true), error } : null;
  }
  if (v.some((_, i) => Math.abs(cornerAngle(v[(i + 3) % 4], v[i], v[(i + 1) % 4]) - 90) > 25)) return null;
  // Orientation: mean of the edge angles folded into -45..45 degrees.
  let s = 0, cs = 0;
  for (let i = 0; i < 4; i++) {
    const t = (angleDeg(v[i], v[(i + 1) % 4]) * Math.PI) / 45; // ×4 folds right angles together
    s += Math.sin(t); cs += Math.cos(t);
  }
  let th = Math.atan2(s, cs) / 4;
  if (Math.abs((th * 180) / Math.PI) < 10) th = 0;
  const cos = Math.cos(th), sin = Math.sin(th);
  const rot = r.map((q) => ({ u: q.x * cos + q.y * sin, w: -q.x * sin + q.y * cos }));
  let u0 = Math.min(...rot.map((q) => q.u)), u1 = Math.max(...rot.map((q) => q.u));
  let w0 = Math.min(...rot.map((q) => q.w)), w1 = Math.max(...rot.map((q) => q.w));
  // Hand-drawn corners overshoot a little; pull the box in to the mean of the corners.
  const vu = v.map((q) => q.x * cos + q.y * sin).sort((a, b) => a - b);
  const vw = v.map((q) => -q.x * sin + q.y * cos).sort((a, b) => a - b);
  [u0, u1] = [(u0 + (vu[0] + vu[1]) / 2) / 2, (u1 + (vu[2] + vu[3]) / 2) / 2];
  [w0, w1] = [(w0 + (vw[0] + vw[1]) / 2) / 2, (w1 + (vw[2] + vw[3]) / 2) / 2];
  const square = Math.abs((u1 - u0) / (w1 - w0) - 1) < 0.12;
  if (square) {
    const side = (u1 - u0 + (w1 - w0)) / 2;
    const cu = (u0 + u1) / 2, cw = (w0 + w1) / 2;
    [u0, u1, w0, w1] = [cu - side / 2, cu + side / 2, cw - side / 2, cw + side / 2];
  }
  const back = (u: number, w: number): V => ({ x: u * cos - w * sin, y: u * sin + w * cos });
  const box = [back(u0, w0), back(u1, w0), back(u1, w1), back(u0, w1)];
  const error = polyError(r, box, size);
  return error <= lim ? { kind: square ? "square" : "rect", pts: polyline(box, true), error } : null;
}

/** Open stroke: a shaft and a head (one barb, both barbs, or barb–tip–barb), drawn without lifting the pen. */
function fitArrow(r: V[], size: number, lim: number): { pts: V[]; error: number } | null {
  const idx = corners(r, size * 0.06);
  const v = idx.map((i) => r[i]);
  if (v.length < 3 || v.length > 5) return null;
  const tail = v[0];
  const tip = v[1];
  const shaft = dist(tail, tip);
  if (shaft < size * 0.6) return null;
  // Barb–tip–barb: the pen goes back to the tip between the two barbs, so that corner is not a barb.
  const barbs = v.slice(2).filter((q) => dist(q, tip) > shaft * 0.08);
  if (!barbs.length || barbs.length > 2) return null;
  const side = (b: V) => Math.sign((tip.x - tail.x) * (b.y - tail.y) - (tip.y - tail.y) * (b.x - tail.x));
  if (barbs.length === 2 && side(barbs[0]) === side(barbs[1])) return null;
  for (const b of barbs) {
    const len = dist(b, tip);
    const ang = cornerAngle(tail, tip, b);
    if (len > shaft * 0.6 || ang < 12 || ang > 75) return null;
  }
  // The shaft itself must be straight.
  const shaftPts = r.slice(0, idx[1] + 1);
  const dev = shaftPts.reduce((s, q) => s + segDist(q, tail, tip), 0) / shaftPts.length / shaft;
  if (dev > lim) return null;
  const end = snapEnd(tail, tip);
  // Both barbs: same length and angle, mirrored about the shaft.
  const headLen = barbs.reduce((s, b) => s + dist(b, tip), 0) / barbs.length;
  const headAng = (barbs.reduce((s, b) => s + cornerAngle(tail, tip, b), 0) / barbs.length) * (Math.PI / 180);
  const back = Math.atan2(tail.y - end.y, tail.x - end.x);
  const barb = (sign: number): V => ({ x: end.x + headLen * Math.cos(back + sign * headAng), y: end.y + headLen * Math.sin(back + sign * headAng) });
  return { pts: polyline([tail, end, barb(1), end, barb(-1)], false), error: dev };
}

/** Cuts an overshooting loop after one full turn round its box centre, so the extra bit does not skew the fit. */
function oneTurn(r: V[]): V[] {
  const xs = r.map((q) => q.x), ys = r.map((q) => q.y);
  const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  let sweep = 0;
  for (let i = 1; i < r.length; i++) {
    let d = Math.atan2(r[i].y - c.y, r[i].x - c.x) - Math.atan2(r[i - 1].y - c.y, r[i - 1].x - c.x);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    sweep += d;
    if (Math.abs(sweep) >= 2 * Math.PI) return resample(r.slice(0, i + 1));
  }
  return r;
}

/** The clean shape for a stroke, or null when it is not one (or too small, like handwriting). */
export function recognizeShape(points: InkPoint[], opts: ShapeOptions = {}): Shape | null {
  const aspect = opts.aspect ?? 1;
  const mode = opts.mode ?? "hold";
  const allow = opts.allow;
  const ok = (k: ShapeKind) => !allow || allow.includes(k);
  const lim = LIMITS[mode];
  if (points.length < 2) return null;
  const raw: V[] = points.map((q) => ({ x: q.x, y: q.y * aspect }));
  const xs = raw.map((q) => q.x), ys = raw.map((q) => q.y);
  const size = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (size < MIN_SHAPE[mode]) return null;
  let r = resample(raw);
  const total = pathLength(r);
  const pressure = Math.round((points.reduce((s, q) => s + q.p, 0) / points.length) * 100) / 100;
  const out = (kind: ShapeKind, pts: V[], error: number): Shape => ({
    kind,
    error,
    points: pts.map((q) => ({ x: Math.round(q.x * 1e4) / 1e4, y: Math.round((q.y / aspect) * 1e4) / 1e4, p: pressure })),
  });
  // Very long scribbles (many turns) are writing or shading, not a shape.
  if (total > size * 4.2) return null;

  if (ok("line")) {
    const line = fitLine(r, size, lim.line);
    if (line) return out("line", line.pts, line.error);
  }
  // Closed: the pen comes back to the start (an overshoot past it is fine).
  const gap = Math.max(size * 0.22, total * 0.08);
  const closed = r.slice(Math.floor(r.length * 0.7)).some((q) => dist(q, r[0]) < gap);
  if (closed) {
    r = oneTurn(r);
    const poly = ok("rect") || ok("square") || ok("triangle") ? fitPolygon(r, size, lim.poly) : null;
    const ell = ok("circle") || ok("ellipse") ? fitEllipse(r, lim.ellipse) : null;
    if (poly && ok(poly.kind)) return out(poly.kind, poly.pts, poly.error);
    if (ell) {
      const kind = ell.round ? "circle" : "ellipse";
      if (ok(kind)) return out(kind, ell.pts, ell.error);
    }
    return null;
  }
  if (ok("arrow")) {
    const arrow = fitArrow(r, size, lim.line * 1.6);
    if (arrow) return out("arrow", arrow.pts, arrow.error);
  }
  return null;
}

/** Shape names for the "Şekil düzeltildi" note. */
export const SHAPE_NAMES: Record<ShapeKind, string> = {
  line: "Düz çizgi",
  circle: "Daire",
  ellipse: "Elips",
  rect: "Dikdörtgen",
  square: "Kare",
  triangle: "Üçgen",
  arrow: "Ok",
};
