// Pen editing for one open document: input prefs (palm rejection), shape correction, undo, lasso selection
// and copy / paste. The maths lives in core/shapes, core/touchInput and core/selection.
import { hitsStroke, simplify, type InkPoint, type InkStroke } from "../core/ink";
import type { PageImage } from "../core/pageImage";
import type { PageNote } from "../core/pageTools";
import {
  IDENTITY, applyBox, applyPoints, applyRect, clampMove, pasteOffset, pointsBox, rectInLasso, strokeInLasso, unionBox,
  type Box, type Pt, type Transform,
} from "../core/selection";
import { SHAPE_NAMES, type Shape } from "../core/shapes";
import { TouchGate, parsePenInput, type PenInputPrefs } from "../core/touchInput";
import type { Id } from "../core/types";
import type { Reader } from "./reader.svelte";

const PREFS_KEY = "nito.penInput";

type StrokeState = Pick<InkStroke, "id" | "points" | "width" | "color">;
type Undo =
  | { kind: "add"; ids: Id[]; images?: Id[]; notes?: Id[] }
  | { kind: "shape"; id: Id; raw: InkPoint[] }
  | { kind: "edit"; strokes: StrokeState[]; images: PageImage[]; notes: PageNote[] }
  | { kind: "remove"; strokes: InkStroke[]; images: PageImage[]; notes: PageNote[] };

export interface Selection {
  page: number;
  strokes: Id[];
  images: Id[];
  notes: Id[];
}

interface Clip {
  strokes: Omit<InkStroke, "id" | "documentId" | "page">[];
  images: Omit<PageImage, "id" | "documentId" | "page">[];
  notes: Pick<PageNote, "kind" | "body" | "x" | "y" | "w" | "h">[];
  box: Box;
}

function loadPrefs(): PenInputPrefs {
  try {
    return parsePenInput(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null"));
  } catch {
    return parsePenInput(null);
  }
}

export class InkEdit {
  /** Remembered per device (localStorage): which fingers draw, touch sensitivity, shape correction. */
  prefs = $state<PenInputPrefs>(loadPrefs());
  /** One gate for all pages, so a palm on page 2 is ignored while the pen writes on page 1. */
  readonly gate = new TouchGate(this.prefs);
  /** Last corrected shape, for the "Daire · Geri al" note. */
  lastShape = $state<{ id: Id; name: string } | null>(null);
  selection = $state<Selection | null>(null);
  /** Move / scale shown while dragging the selection; saved on release. */
  preview = $state<Transform>(IDENTITY);
  private undos = $state<Undo[]>([]);
  private clip: Clip | null = null;
  clipReady = $state(false);
  /** Touch long press with the select tool: a small "Yapıştır" menu at screen point (x, y). */
  pasteMenu = $state<{ page: number; at: Pt; x: number; y: number } | null>(null);
  /** Live strokes that must be dropped (a pen landed while a palm was drawing). */
  private cancels = new Set<() => void>();
  private shapeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly reader: Reader) {}

  get canUndo(): boolean {
    return this.undos.length > 0;
  }

  setPrefs(patch: Partial<PenInputPrefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    this.gate.prefs = this.prefs;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch { /* storage off */ }
  }

  onCancel(fn: () => void): () => void {
    this.cancels.add(fn);
    return () => this.cancels.delete(fn);
  }

  cancelLive(): void {
    for (const fn of this.cancels) fn();
  }

  private push(u: Undo): void {
    this.undos = [...this.undos.slice(-49), u];
  }

  async addStroke(page: number, raw: InkPoint[]): Promise<void> {
    const id = await this.reader.addStroke(page, raw);
    if (id != null) this.push({ kind: "add", ids: [id] });
  }

  /** Saves a corrected shape; undo brings back the stroke as drawn. */
  async addShape(page: number, raw: InkPoint[], shape: Shape): Promise<void> {
    const id = await this.reader.addStroke(page, shape.points, true);
    if (id == null) return;
    this.push({ kind: "add", ids: [id] });
    this.push({ kind: "shape", id, raw });
    this.lastShape = { id, name: SHAPE_NAMES[shape.kind] };
    clearTimeout(this.shapeTimer);
    this.shapeTimer = setTimeout(() => (this.lastShape = null), 5000);
  }

  async undo(): Promise<void> {
    const u = this.undos.at(-1);
    if (!u) return;
    this.undos = this.undos.slice(0, -1);
    this.lastShape = null;
    this.selection = null;
    const r = this.reader;
    if (u.kind === "shape") {
      // The stroke as drawn comes back; the next undo removes it.
      await r.inkRepo.update(u.id, { points: simplify(u.raw) });
    } else if (u.kind === "add") {
      for (const id of u.ids) await r.inkRepo.remove(id);
      for (const id of u.images ?? []) await r.removeImage(id);
      for (const id of u.notes ?? []) await r.tools.removeNote(id);
    } else if (u.kind === "edit") {
      for (const s of u.strokes) await r.inkRepo.update(s.id, { points: s.points, width: s.width, color: s.color });
      for (const i of u.images) await r.moveImage(i.id, { x: i.x, y: i.y, w: i.w, h: i.h });
      for (const n of u.notes) await r.tools.updateNote(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });
    } else {
      for (const s of u.strokes) await r.inkRepo.add(s);
      for (const i of u.images) await r.imageRepo.add(i);
      for (const n of u.notes) {
        const id = await r.tools.addNote(n.page, n.kind, { x: n.x, y: n.y });
        await r.tools.updateNote(id, { body: n.body, w: n.w, h: n.h, collapsed: n.collapsed });
      }
      await r.reloadImages();
    }
    await r.reloadInk();
  }

  // ---- Selection ----

  private picked(): { strokes: InkStroke[]; images: PageImage[]; notes: PageNote[] } {
    const s = this.selection;
    if (!s) return { strokes: [], images: [], notes: [] };
    return {
      strokes: this.reader.ink.filter((x) => s.strokes.includes(x.id)),
      images: this.reader.images.filter((x) => s.images.includes(x.id)),
      notes: this.reader.tools.notes.filter((x) => s.notes.includes(x.id)),
    };
  }

  /** Bounding box of the selection (before the live preview). */
  box(): Box | null {
    const p = this.picked();
    const boxes = [
      ...p.strokes.map((s) => {
        const b = pointsBox(s.points);
        const pad = s.width / 2;
        return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
      }),
      ...p.images,
      ...p.notes,
    ];
    return boxes.length ? unionBox(boxes) : null;
  }

  /** Selects what the lasso holds on `page`. A short lasso is a tap: the stroke under it. */
  select(page: number, lasso: Pt[], tap: boolean): void {
    const r = this.reader;
    const layers = r.tools.layers;
    const visible = (s: InkStroke) => (s.kind === "highlighter" ? layers.highlights : layers.ink) && !r.lecture.hidesStroke(s.id);
    const strokes = r.ink.filter((s) => s.page === page && visible(s));
    let sel: Selection;
    if (tap) {
      const at = lasso[0];
      const hit = strokes.filter((s) => hitsStroke(s, at, 0.012)).at(-1);
      sel = { page, strokes: hit ? [hit.id] : [], images: [], notes: [] };
    } else {
      sel = {
        page,
        strokes: strokes.filter((s) => strokeInLasso(s.points, lasso)).map((s) => s.id),
        images: layers.images ? r.images.filter((i) => i.page === page && rectInLasso(i, lasso)).map((i) => i.id) : [],
        notes: layers.notes ? r.tools.notes.filter((n) => n.page === page && rectInLasso(n, lasso)).map((n) => n.id) : [],
      };
    }
    this.preview = IDENTITY;
    this.selection = sel.strokes.length || sel.images.length || sel.notes.length ? sel : null;
  }

  clear(): void {
    this.selection = null;
    this.preview = IDENTITY;
  }

  /** Live move / scale, kept on the page. */
  setPreview(t: Transform): void {
    const b = this.box();
    const s = this.selection;
    this.preview = b && s ? clampMove(t, b, this.reader.tools.bounds(s.page)) : t;
  }

  /** Saves the previewed move / scale. Stroke widths scale with the strokes. */
  async commit(): Promise<void> {
    const t = this.preview;
    const s = this.selection;
    this.preview = IDENTITY;
    if (!s || (t.dx === 0 && t.dy === 0 && t.k === 1)) return;
    const p = this.picked();
    const r = this.reader;
    this.push({
      kind: "edit",
      strokes: p.strokes.map((x) => ({ id: x.id, points: x.points, width: x.width, color: x.color })),
      images: p.images.map((x) => ({ ...x })),
      notes: p.notes.map((x) => ({ ...x })),
    });
    // Show the result at once; the database follows.
    r.ink = r.ink.map((x) => (s.strokes.includes(x.id) ? { ...x, points: applyPoints(t, x.points), width: x.width * t.k } : x));
    for (const x of p.strokes) await r.inkRepo.update(x.id, { points: applyPoints(t, x.points), width: x.width * t.k });
    for (const i of p.images) await r.moveImage(i.id, applyRect(t, i));
    // Notes move with the selection; their text keeps its size.
    for (const n of p.notes) {
      const b = applyBox(t, n);
      await r.tools.updateNote(n.id, { x: b.x, y: b.y });
    }
    await r.reloadInk();
  }

  async recolor(color: string): Promise<void> {
    const p = this.picked();
    if (!p.strokes.length) return;
    this.push({ kind: "edit", strokes: p.strokes.map((x) => ({ id: x.id, points: x.points, width: x.width, color: x.color })), images: [], notes: [] });
    for (const x of p.strokes) await this.reader.inkRepo.update(x.id, { color });
    await this.reader.reloadInk();
  }

  async remove(): Promise<void> {
    const p = this.picked();
    if (!this.selection) return;
    this.selection = null;
    const r = this.reader;
    this.push({ kind: "remove", strokes: p.strokes, images: p.images.map((x) => ({ ...x })), notes: p.notes.map((x) => ({ ...x })) });
    for (const x of p.strokes) await r.inkRepo.remove(x.id);
    // Picture files stay, so undo can bring the picture back.
    for (const x of p.images) await r.imageRepo.remove(x.id);
    for (const x of p.notes) await r.tools.removeNote(x.id);
    await Promise.all([r.reloadInk(), r.reloadImages()]);
  }

  copy(): boolean {
    const p = this.picked();
    const box = this.box();
    if (!box) return false;
    this.clip = {
      strokes: p.strokes.map(({ color, width, points, kind }) => ({ color, width, points, kind })),
      images: p.images.map(({ filePath, x, y, w, h }) => ({ filePath, x, y, w, h })),
      notes: p.notes.map(({ kind, body, x, y, w, h }) => ({ kind, body, x, y, w, h })),
      box,
    };
    this.clipReady = true;
    return true;
  }

  /** Pastes the copied items on `page`, a little down and right, and selects the copy. */
  async paste(page: number): Promise<boolean> {
    const c = this.clip;
    if (!c) return false;
    const r = this.reader;
    const t = pasteOffset(c.box, r.tools.bounds(page));
    const ids: Id[] = [];
    const images: Id[] = [];
    const notes: Id[] = [];
    for (const s of c.strokes) ids.push(await r.inkRepo.add({ ...s, documentId: r.doc.id, page, points: applyPoints(t, s.points) }));
    for (const i of c.images) images.push(await r.imageRepo.add({ documentId: r.doc.id, page, filePath: i.filePath, ...applyRect(t, i) }));
    for (const n of c.notes) {
      const b = applyBox(t, n);
      const id = await r.tools.addNote(page, n.kind, { x: b.x, y: b.y });
      await r.tools.updateNote(id, { body: n.body, w: n.w, h: n.h, x: b.x, y: b.y });
      notes.push(id);
    }
    this.push({ kind: "add", ids, images, notes });
    await Promise.all([r.reloadInk(), r.reloadImages()]);
    // The next paste lands a step further.
    this.clip = { ...c, strokes: c.strokes.map((s) => ({ ...s, points: applyPoints(t, s.points) })), images: c.images.map((i) => ({ ...i, ...applyRect(t, i) })),
      notes: c.notes.map((n) => ({ ...n, ...applyBox(t, n) })), box: applyBox(t, c.box) };
    this.selection = { page, strokes: ids, images, notes };
    this.preview = IDENTITY;
    return true;
  }
}
