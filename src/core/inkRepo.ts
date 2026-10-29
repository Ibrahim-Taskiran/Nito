// Data access for handwriting strokes.
import type { Row, SqlDb } from "./db/sql";
import type { InkPoint, InkStroke } from "./ink";
import type { Id } from "./types";

function parsePoints(json: string): InkPoint[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((q) => q && [q.x, q.y, q.p].every((n) => typeof n === "number")) : [];
  } catch {
    return [];
  }
}

const toStroke = (r: Row): InkStroke => ({
  id: Number(r.id),
  documentId: Number(r.document_id),
  page: Number(r.page),
  color: String(r.color),
  width: Number(r.width),
  points: parsePoints(String(r.points ?? "[]")),
});

export class InkRepo {
  constructor(readonly db: SqlDb) {}

  async list(documentId: Id): Promise<InkStroke[]> {
    return (await this.db.all("SELECT * FROM ink_stroke WHERE document_id = ? ORDER BY id", [documentId])).map(toStroke);
  }

  async add(s: Omit<InkStroke, "id">): Promise<Id> {
    return (await this.db.run(
      "INSERT INTO ink_stroke (document_id, page, color, width, points) VALUES (?, ?, ?, ?, ?)",
      [s.documentId, s.page, s.color, s.width, JSON.stringify(s.points)],
    )).lastId;
  }

  async remove(id: Id): Promise<void> {
    await this.db.run("DELETE FROM ink_stroke WHERE id = ?", [id]);
  }
}
