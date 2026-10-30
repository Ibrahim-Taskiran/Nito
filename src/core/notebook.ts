// Notebook ("Defter") beside a PDF: one per document, an ordered list of A4 pages with a paper pattern.
// Notebook pages share the layer tables (ink_stroke, page_note, …) with PDF pages through their own page keys:
// key = -(NOTEBOOK_BASE + notebook_page.id), far below inserted blank pages (-page_insert.id), so they never meet.
import type { SqlDb } from "./db/sql";
import { PAGE_TABLES } from "./pages";
import type { Id } from "./types";

export type PaperKind = "plain" | "grid" | "lined" | "dots";

export const PAPER_KINDS: readonly { key: PaperKind; name: string }[] = [
  { key: "plain", name: "Düz" },
  { key: "grid", name: "Kareli" },
  { key: "lined", name: "Çizgili" },
  { key: "dots", name: "Noktalı" },
];

/** A4 in PDF points. */
export const NOTEBOOK_SIZE = { w: 595, h: 842 } as const;

export const NOTEBOOK_BASE = 1_000_000_000;
export const notebookKey = (id: Id): number => -(NOTEBOOK_BASE + id);
export const isNotebookKey = (key: number): boolean => key <= -NOTEBOOK_BASE;
export const notebookId = (key: number): Id => -key - NOTEBOOK_BASE;

export interface NotebookPage {
  id: Id;
  /** Page key in the layer tables. */
  key: number;
  kind: PaperKind;
  pos: number;
}

/** Spacing as a fraction of the page width: 5 mm squares and dots, 8 mm lines on A4 (210 mm). */
const STEP: Record<Exclude<PaperKind, "plain">, number> = { grid: 5 / 210, dots: 5 / 210, lined: 8 / 210 };
const LINE = "#cfd8e3";
const DOT = "#a9b3bf";

/** CSS background (image and tile size) for a page `width` px wide. Drawn by CSS, so it stays sharp at any zoom. */
export function paperBackground(kind: PaperKind, width: number): { image: string; size: string } {
  if (kind === "plain" || width <= 0) return { image: "none", size: "auto" };
  const s = +(width * STEP[kind]).toFixed(2);
  if (kind === "grid") {
    return { image: `linear-gradient(to right, ${LINE} 1px, transparent 1px), linear-gradient(to bottom, ${LINE} 1px, transparent 1px)`, size: `${s}px ${s}px` };
  }
  if (kind === "lined") return { image: `linear-gradient(to bottom, transparent ${s - 1}px, ${LINE} ${s - 1}px)`, size: `100% ${s}px` };
  const r = Math.max(0.8, +(s * 0.07).toFixed(2));
  return { image: `radial-gradient(circle at center, ${DOT} ${r}px, transparent ${r + 0.6}px)`, size: `${s}px ${s}px` };
}

export const isPaperKind = (k: unknown): k is PaperKind => PAPER_KINDS.some((p) => p.key === k);

/** Order after swapping the page `key` with its neighbour `dir` places away; null when it is already at that end. */
export function swapPos(pages: readonly NotebookPage[], key: number, dir: -1 | 1): [NotebookPage, NotebookPage] | null {
  const i = pages.findIndex((p) => p.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= pages.length) return null;
  return [{ ...pages[i], pos: pages[j].pos }, { ...pages[j], pos: pages[i].pos }];
}

export class NotebookRepo {
  constructor(readonly db: SqlDb) {}

  async list(documentId: Id): Promise<NotebookPage[]> {
    const rows = await this.db.all<{ id: number; kind: string; pos: number }>(
      "SELECT id, kind, pos FROM notebook_page WHERE document_id = ? ORDER BY pos, id",
      [documentId],
    );
    return rows.map((r) => ({ id: Number(r.id), key: notebookKey(Number(r.id)), kind: isPaperKind(r.kind) ? r.kind : "plain", pos: Number(r.pos) }));
  }

  /** The notebook's pages; a new notebook starts with one plain page. */
  async open(documentId: Id): Promise<NotebookPage[]> {
    const pages = await this.list(documentId);
    if (pages.length) return pages;
    await this.add(documentId, "plain");
    return this.list(documentId);
  }

  /** Adds a page at the end. Returns its page key. */
  async add(documentId: Id, kind: PaperKind): Promise<number> {
    const rows = await this.db.all<{ m: number | null }>("SELECT MAX(pos) AS m FROM notebook_page WHERE document_id = ?", [documentId]);
    const pos = rows[0]?.m == null ? 0 : Number(rows[0].m) + 1;
    const r = await this.db.run("INSERT INTO notebook_page (document_id, kind, pos) VALUES (?, ?, ?)", [documentId, kind, pos]);
    return notebookKey(r.lastId);
  }

  /** Swaps a page with its neighbour. */
  async move(documentId: Id, key: number, dir: -1 | 1): Promise<void> {
    const swap = swapPos(await this.list(documentId), key, dir);
    if (!swap) return;
    for (const p of swap) await this.db.run("UPDATE notebook_page SET pos = ? WHERE document_id = ? AND id = ?", [p.pos, documentId, p.id]);
  }

  /** Deletes a page and everything on it. The last page stays, so the notebook is never empty. */
  async remove(documentId: Id, key: number): Promise<void> {
    if (!isNotebookKey(key)) throw new Error("Defter sayfası değil");
    const pages = await this.list(documentId);
    if (pages.length <= 1) throw new Error("Defterin son sayfası silinemez");
    await this.db.run("DELETE FROM notebook_page WHERE document_id = ? AND id = ?", [documentId, notebookId(key)]);
    for (const t of PAGE_TABLES) await this.db.run(`DELETE FROM ${t} WHERE document_id = ? AND page = ?`, [documentId, key]);
  }
}
