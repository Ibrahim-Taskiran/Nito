// Page identity and display order: PDF pages plus inserted blank pages (the PDF file never changes).
//
// Every page-keyed table (annotation, ink_stroke, page_image, page_tape, page_note, page_margin, page_flag,
// recording_page) stores a "page key":
//   - key > 0: the PDF page number, exactly as before migration 012, so all existing rows stay valid;
//   - key < 0: an inserted blank page, key = -page_insert.id (AUTOINCREMENT, so a key is never reused).
// A blank page sits after PDF page `anchor` (0 = before page 1); several blanks after the same page are
// ordered by `pos`. Blank pages are labelled after their anchor: "20a", "20b"; before page 1: "a", "b".
import type { SqlDb } from "./db/sql";
import type { Id } from "./types";

export interface InsertedPage {
  id: Id;
  /** PDF page this blank page follows; 0 = before page 1. */
  anchor: number;
  /** Order among the blank pages of the same anchor. */
  pos: number;
  /** Size in PDF points (copied from the neighbour page when inserted). */
  w: number;
  h: number;
}

export interface PageSlot {
  /** Page key stored in the layer tables. */
  key: number;
  /** PDF page number, or null for a blank page. */
  pdf: number | null;
  /** Shown to people: "20" or "20a". */
  label: string;
  /** PDF page this slot belongs to: itself, or the page a blank one follows (0 before page 1). */
  anchor: number;
}

export const blankKey = (id: Id): number => -id;
export const isBlankKey = (key: number): boolean => key < 0;
export const blankId = (key: number): Id => -key;

/** a, b, …, z, aa, ab, … */
export function letters(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(97 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const byPos = (a: InsertedPage, b: InsertedPage) => a.pos - b.pos || a.id - b.id;

/** All pages in reading order. Blank pages whose anchor lies past the end are shown after the last page. */
export function pageSlots(numPages: number, inserts: readonly InsertedPage[]): PageSlot[] {
  const groups = new Map<number, InsertedPage[]>();
  for (const b of inserts) {
    const a = Math.min(Math.max(0, Math.floor(b.anchor)), Math.max(0, numPages));
    groups.set(a, [...(groups.get(a) ?? []), b]);
  }
  const out: PageSlot[] = [];
  for (let a = 0; a <= numPages; a++) {
    if (a > 0) out.push({ key: a, pdf: a, label: String(a), anchor: a });
    (groups.get(a) ?? []).sort(byPos).forEach((b, i) => {
      out.push({ key: blankKey(b.id), pdf: null, label: `${a || ""}${letters(i)}`, anchor: a });
    });
  }
  return out;
}

export type InsertWhere = "before" | "after";

/** Where a new blank page goes so it lands right before or after the page `ref` (PDF or blank). */
export function insertSpot(inserts: readonly InsertedPage[], ref: number, where: InsertWhere): { anchor: number; pos: number } {
  const group = (a: number) => inserts.filter((b) => b.anchor === a).sort(byPos);
  if (!isBlankKey(ref)) {
    if (where === "after") {
      const g = group(ref);
      return { anchor: ref, pos: g.length ? g[0].pos - 1 : 0 };
    }
    const g = group(ref - 1);
    return { anchor: Math.max(0, ref - 1), pos: g.length ? g[g.length - 1].pos + 1 : 0 };
  }
  const me = inserts.find((b) => b.id === blankId(ref));
  if (!me) throw new Error("Sayfa bulunamadı");
  const g = group(me.anchor);
  const i = g.findIndex((b) => b.id === me.id);
  const other = g[where === "after" ? i + 1 : i - 1];
  const pos = other ? (me.pos + other.pos) / 2 : me.pos + (where === "after" ? 1 : -1);
  return { anchor: me.anchor, pos };
}

/** The key of the page typed into the page box ("12", "12a"); numbers are clamped to the PDF. Null if unknown. */
export function keyForInput(slots: readonly PageSlot[], text: string, numPages: number): number | null {
  const t = text.trim().toLowerCase();
  if (/^\d+$/.test(t)) {
    if (numPages < 1) return null;
    return Math.min(numPages, Math.max(1, Number.parseInt(t, 10)));
  }
  return slots.find((s) => s.label === t)?.key ?? null;
}

/** PDF page to remember as the reading position for a slot (a blank page counts as the page before it). */
export const pdfPageOf = (slot: PageSlot | undefined): number => (slot ? slot.pdf ?? Math.max(1, slot.anchor) : 1);

/** Slot `step` places away from `key` within the list, clamped to the ends. */
export function stepSlot(slots: readonly PageSlot[], key: number, step: number): number | null {
  const i = slots.findIndex((s) => s.key === key);
  if (i < 0 || !slots.length) return null;
  return slots[Math.min(slots.length - 1, Math.max(0, i + step))].key;
}

/** Tables whose rows belong to one page of a document (deleted with a blank page). */
export const PAGE_TABLES = ["annotation", "ink_stroke", "page_image", "page_tape", "page_note", "page_margin", "page_flag"] as const;

export class PageRepo {
  constructor(readonly db: SqlDb) {}

  async list(documentId: Id): Promise<InsertedPage[]> {
    const rows = await this.db.all<{ id: number; anchor: number; pos: number; width: number; height: number }>(
      "SELECT id, anchor, pos, width, height FROM page_insert WHERE document_id = ? ORDER BY anchor, pos, id",
      [documentId],
    );
    return rows.map((r) => ({ id: Number(r.id), anchor: Number(r.anchor), pos: Number(r.pos), w: Number(r.width), h: Number(r.height) }));
  }

  /** Inserts a blank page next to `ref`. Returns its page key. */
  async insert(documentId: Id, ref: number, where: InsertWhere, size: { w: number; h: number }): Promise<number> {
    const spot = insertSpot(await this.list(documentId), ref, where);
    const r = await this.db.run(
      "INSERT INTO page_insert (document_id, anchor, pos, width, height) VALUES (?, ?, ?, ?, ?)",
      [documentId, spot.anchor, spot.pos, size.w, size.h],
    );
    return blankKey(r.lastId);
  }

  /** Deletes a blank page and everything drawn or placed on it. PDF pages cannot be deleted. */
  async remove(documentId: Id, key: number): Promise<void> {
    if (!isBlankKey(key)) throw new Error("PDF sayfası silinemez");
    // The page goes first; rows left behind by a failure halfway are never shown (keys are not reused).
    await this.db.run("DELETE FROM page_insert WHERE document_id = ? AND id = ?", [documentId, blankId(key)]);
    for (const t of PAGE_TABLES) await this.db.run(`DELETE FROM ${t} WHERE document_id = ? AND page = ?`, [documentId, key]);
  }
}

/** Keys to render: the visible pages plus `margin` neighbours in reading order (blank pages count as pages). */
export function keysToRender(slots: readonly PageSlot[], visible: Iterable<number>, margin = 1): Set<number> {
  const index = new Map(slots.map((s, i) => [s.key, i]));
  const out = new Set<number>();
  for (const k of visible) {
    const i = index.get(k);
    if (i === undefined) continue;
    for (let j = Math.max(0, i - margin); j <= Math.min(slots.length - 1, i + margin); j++) out.add(slots[j].key);
  }
  return out;
}

/** The first of `keys` in reading order (the page at the top of the view). */
export function firstInOrder(slots: readonly PageSlot[], keys: Iterable<number>): number | null {
  const set = new Set(keys);
  return slots.find((s) => set.has(s.key))?.key ?? null;
}
