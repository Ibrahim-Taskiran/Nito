// Data access for tapes, text boxes / sticky notes and page margins.
import type { Row, SqlDb } from "./db/sql";
import { DEFAULT_NOTE_COLOR, asMargin, asNoteColor, asNoteKind, type Margin, type NoteKind, type PageNote, type PageRect, type Tape } from "./pageTools";
import type { Id } from "./types";

const toTape = (r: Row): Tape => ({
  id: Number(r.id),
  documentId: Number(r.document_id),
  page: Number(r.page),
  x: Number(r.x),
  y: Number(r.y),
  w: Number(r.w),
  h: Number(r.h),
  revealed: Number(r.revealed) === 1,
});

const toNote = (r: Row): PageNote => ({
  id: Number(r.id),
  documentId: Number(r.document_id),
  page: Number(r.page),
  kind: asNoteKind(r.kind),
  x: Number(r.x),
  y: Number(r.y),
  w: Number(r.w),
  h: Number(r.h),
  body: String(r.body ?? ""),
  collapsed: Number(r.collapsed) === 1,
  color: asNoteColor(r.color),
});

export type NotePatch = Partial<PageRect & { body: string; collapsed: boolean; color: string; page: number }>;

export class PageToolsRepo {
  constructor(readonly db: SqlDb) {}

  async tapes(documentId: Id): Promise<Tape[]> {
    return (await this.db.all("SELECT * FROM page_tape WHERE document_id = ? ORDER BY id", [documentId])).map(toTape);
  }

  async addTape(documentId: Id, page: number, r: PageRect): Promise<Id> {
    return (await this.db.run(
      "INSERT INTO page_tape (document_id, page, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?)",
      [documentId, page, r.x, r.y, r.w, r.h],
    )).lastId;
  }

  async setRevealed(id: Id, revealed: boolean): Promise<void> {
    await this.db.run("UPDATE page_tape SET revealed = ? WHERE id = ?", [revealed ? 1 : 0, id]);
  }

  /** Opens or covers every tape of the document. */
  async setAllRevealed(documentId: Id, revealed: boolean): Promise<void> {
    await this.db.run("UPDATE page_tape SET revealed = ? WHERE document_id = ?", [revealed ? 1 : 0, documentId]);
  }

  async removeTape(id: Id): Promise<void> {
    await this.db.run("DELETE FROM page_tape WHERE id = ?", [id]);
  }

  async notes(documentId: Id): Promise<PageNote[]> {
    return (await this.db.all("SELECT * FROM page_note WHERE document_id = ? ORDER BY id", [documentId])).map(toNote);
  }

  async addNote(documentId: Id, page: number, kind: NoteKind, r: PageRect, body = "", color = DEFAULT_NOTE_COLOR): Promise<Id> {
    return (await this.db.run(
      "INSERT INTO page_note (document_id, page, kind, x, y, w, h, body, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [documentId, page, kind, r.x, r.y, r.w, r.h, body, asNoteColor(color)],
    )).lastId;
  }

  async updateNote(id: Id, patch: NotePatch): Promise<void> {
    const cols: string[] = [];
    const vals: (string | number)[] = [];
    for (const k of ["page", "x", "y", "w", "h", "body"] as const) {
      if (patch[k] !== undefined) {
        cols.push(`${k} = ?`);
        vals.push(patch[k]);
      }
    }
    if (patch.color !== undefined) {
      cols.push("color = ?");
      vals.push(asNoteColor(patch.color));
    }
    if (patch.collapsed !== undefined) {
      cols.push("collapsed = ?");
      vals.push(patch.collapsed ? 1 : 0);
    }
    if (!cols.length) return;
    await this.db.run(`UPDATE page_note SET ${cols.join(", ")} WHERE id = ?`, [...vals, id]);
  }

  async removeNote(id: Id): Promise<void> {
    await this.db.run("DELETE FROM page_note WHERE id = ?", [id]);
  }

  /** page -> margin, only pages that have one. */
  async margins(documentId: Id): Promise<Map<number, Margin>> {
    const rows = await this.db.all("SELECT * FROM page_margin WHERE document_id = ?", [documentId]);
    return new Map(rows.map((r) => [Number(r.page), asMargin(r.extra_right, r.extra_bottom)]));
  }

  async setMargin(documentId: Id, page: number, m: Margin): Promise<void> {
    if (m.right <= 0 && m.bottom <= 0) {
      await this.db.run("DELETE FROM page_margin WHERE document_id = ? AND page = ?", [documentId, page]);
      return;
    }
    await this.db.run(
      `INSERT INTO page_margin (document_id, page, extra_right, extra_bottom) VALUES (?, ?, ?, ?)
       ON CONFLICT (document_id, page) DO UPDATE SET extra_right = excluded.extra_right, extra_bottom = excluded.extra_bottom`,
      [documentId, page, m.right, m.bottom],
    );
  }
}
