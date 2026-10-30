// Data access for handwriting strokes.
import type { Row, SqlDb } from "./db/sql";
import { asInkKind, type InkKind, type InkPoint, type InkStroke } from "./ink";
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
  kind: asInkKind(r.kind),
});

export class InkRepo {
  constructor(readonly db: SqlDb) {}

  async list(documentId: Id): Promise<InkStroke[]> {
    return (await this.db.all("SELECT * FROM ink_stroke WHERE document_id = ? ORDER BY id", [documentId])).map(toStroke);
  }

  async add(s: Omit<InkStroke, "id" | "kind"> & { kind?: InkKind }): Promise<Id> {
    return (await this.db.run(
      "INSERT INTO ink_stroke (document_id, page, color, width, points, kind) VALUES (?, ?, ?, ?, ?, ?)",
      [s.documentId, s.page, s.color, s.width, JSON.stringify(s.points), s.kind ?? "pen"],
    )).lastId;
  }

  /** Moved (also to another page), scaled, recoloured or shape-corrected strokes keep their id (and their moment in a recording). */
  async update(id: Id, patch: Partial<Pick<InkStroke, "points" | "width" | "color" | "page">>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (patch.page != null) sets.push("page = ?"), vals.push(patch.page);
    if (patch.points) sets.push("points = ?"), vals.push(JSON.stringify(patch.points));
    if (patch.width != null) sets.push("width = ?"), vals.push(patch.width);
    if (patch.color != null) sets.push("color = ?"), vals.push(patch.color);
    if (!sets.length) return;
    await this.db.run(`UPDATE ink_stroke SET ${sets.join(", ")} WHERE id = ?`, [...vals, id] as never[]);
  }

  async remove(id: Id): Promise<void> {
    await this.db.run("DELETE FROM ink_stroke WHERE id = ?", [id]);
  }
}
