// Palm and accidental touch rejection for drawing. Pure decisions; the ink layer feeds it pointer facts.

/** "auto": fingers draw until a stylus is seen, then they only scroll. */
export type FingerMode = "auto" | "pen-only" | "finger";

export interface PenInputPrefs {
  finger: FingerMode;
  /** Touch sensitivity 0..1: higher accepts larger contacts and shorter strokes. */
  sensitivity: number;
  /** Hold the pen still at the end of a stroke to turn it into a clean shape. */
  shapeHold: boolean;
  /** Correct very clean shapes without holding. */
  shapeAuto: boolean;
}

export const DEFAULT_PEN_INPUT: PenInputPrefs = { finger: "auto", sensitivity: 0.5, shapeHold: true, shapeAuto: false };

/** How long touches stay ignored after the pen lifts (a resting palm often lands right then). */
export const PEN_GRACE_MS = 300;

export interface TouchThresholds {
  /** Largest finger contact (px, the bigger of PointerEvent width / height). Bigger is a palm. */
  maxContact: number;
  /** A touch stroke shorter than this (px) AND quicker than minMs is an accidental tap. */
  minLength: number;
  minMs: number;
}

export function touchThresholds(sensitivity: number): TouchThresholds {
  const s = Math.min(1, Math.max(0, sensitivity));
  return { maxContact: Math.round(20 + 36 * s), minLength: Math.round(14 - 10 * s), minMs: Math.round(160 - 100 * s) };
}

export interface PointerFacts {
  id: number;
  type: string; // "pen" | "touch" | "mouse"
  width: number;
  height: number;
  t: number;
}

/** What a new pointer does: draw, scroll the page, or nothing. `cancel`: drop the touch stroke in progress. */
export type Decision = { action: "draw" | "scroll" | "ignore"; cancel?: boolean };

/** Remembers pen state between pointer events of one ink layer. */
export class TouchGate {
  penSeen = false;
  private penDown = new Set<number>();
  private penUpAt = -Infinity;
  /** Pointer drawing right now and when it started. */
  private active: { id: number; type: string; t: number } | null = null;

  constructor(public prefs: PenInputPrefs = DEFAULT_PEN_INPUT) {}

  down(p: PointerFacts): Decision {
    if (p.type === "pen") {
      this.penSeen = true;
      this.penDown.add(p.id);
      // A finger or palm stroke that started before the pen landed was not meant: drop it.
      const cancel = this.active?.type === "touch";
      this.active = { id: p.id, type: p.type, t: p.t };
      return { action: "draw", cancel };
    }
    if (p.type !== "touch") {
      if (this.active) return { action: "ignore" };
      this.active = { id: p.id, type: p.type, t: p.t };
      return { action: "draw" };
    }
    if (this.penDown.size || p.t - this.penUpAt < PEN_GRACE_MS) return { action: "ignore" };
    if (this.active) {
      // Second finger soon after the first: a pinch or scroll, so the first finger's line goes.
      if (this.active.type === "touch" && p.t - this.active.t < 250) {
        this.active = null;
        return { action: "ignore", cancel: true };
      }
      return { action: "ignore" };
    }
    const contact = Math.max(p.width, p.height);
    // 0 or 1 means the device does not report a size.
    if (contact > 1 && contact > touchThresholds(this.prefs.sensitivity).maxContact) return { action: "ignore" };
    const fingersScroll = this.prefs.finger === "pen-only" || (this.prefs.finger === "auto" && this.penSeen);
    if (fingersScroll) return { action: "scroll" };
    this.active = { id: p.id, type: p.type, t: p.t };
    return { action: "draw" };
  }

  /** A pointer lifted or was cancelled. */
  up(id: number, type: string, t: number): void {
    if (type === "pen") {
      this.penDown.delete(id);
      this.penUpAt = t;
    }
    if (this.active?.id === id) this.active = null;
  }

  /** True while `id` is the pointer that draws. */
  drawing(id: number): boolean {
    return this.active?.id === id;
  }
}

/** True when a finished touch stroke was an accidental brush: tiny and quick. Pen and mouse strokes always count. */
export function isAccidental(type: string, lengthPx: number, ms: number, sensitivity: number): boolean {
  if (type !== "touch") return false;
  const th = touchThresholds(sensitivity);
  return lengthPx < th.minLength && ms < th.minMs;
}

/** Reads saved prefs, keeping only valid values. */
export function parsePenInput(v: unknown): PenInputPrefs {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const finger = o.finger === "pen-only" || o.finger === "finger" || o.finger === "auto" ? o.finger : DEFAULT_PEN_INPUT.finger;
  const s = typeof o.sensitivity === "number" && Number.isFinite(o.sensitivity) ? Math.min(1, Math.max(0, o.sensitivity)) : DEFAULT_PEN_INPUT.sensitivity;
  const bool = (k: "shapeHold" | "shapeAuto") => (typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_PEN_INPUT[k]);
  return { finger, sensitivity: s, shapeHold: bool("shapeHold"), shapeAuto: bool("shapeAuto") };
}
