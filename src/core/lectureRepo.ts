// Data access for lecture audio: page timeline, ink stroke moments, cached silences (migration 009).
import type { SqlDb } from "./db/sql";
import type { PageVisit, Span } from "./lecture";
import type { Id } from "./types";

export interface StrokeMark {
  recordingId: Id;
  offsetSeconds: number;
}

export class LectureRepo {
  constructor(readonly db: SqlDb) {}

  async addPageVisit(recordingId: Id, page: number, offsetSeconds: number): Promise<void> {
    await this.db.run("INSERT INTO recording_page (recording_id, page, offset_seconds) VALUES (?, ?, ?)", [recordingId, page, offsetSeconds]);
  }

  /** recordingId -> page visits in time order, for one document. */
  async pageVisits(documentId: Id): Promise<Map<Id, PageVisit[]>> {
    const rows = await this.db.all(
      `SELECT p.recording_id, p.page, p.offset_seconds FROM recording_page p JOIN recording r ON r.id = p.recording_id
       WHERE r.document_id = ? ORDER BY p.recording_id, p.offset_seconds, p.id`,
      [documentId],
    );
    const out = new Map<Id, PageVisit[]>();
    for (const r of rows) {
      const id = Number(r.recording_id);
      if (!out.has(id)) out.set(id, []);
      out.get(id)!.push({ page: Number(r.page), offsetSeconds: Number(r.offset_seconds) });
    }
    return out;
  }

  async markStroke(strokeId: Id, recordingId: Id, offsetSeconds: number): Promise<void> {
    await this.db.run(
      "INSERT OR REPLACE INTO ink_stroke_mark (stroke_id, recording_id, offset_seconds) VALUES (?, ?, ?)",
      [strokeId, recordingId, offsetSeconds],
    );
  }

  /** strokeId -> its moment in a recording, for one document. */
  async strokeMarks(documentId: Id): Promise<Map<Id, StrokeMark>> {
    const rows = await this.db.all(
      "SELECT m.* FROM ink_stroke_mark m JOIN ink_stroke s ON s.id = m.stroke_id WHERE s.document_id = ?",
      [documentId],
    );
    return new Map(rows.map((r) => [Number(r.stroke_id), { recordingId: Number(r.recording_id), offsetSeconds: Number(r.offset_seconds) }]));
  }

  /** Cached silent spans, or null when the recording was never analysed. */
  async silences(recordingId: Id): Promise<Span[] | null> {
    const rows = await this.db.all<{ spans: string }>("SELECT spans FROM recording_silence WHERE recording_id = ?", [recordingId]);
    if (!rows.length) return null;
    try {
      const v = JSON.parse(String(rows[0].spans));
      return Array.isArray(v) ? v.filter((s) => typeof s?.start === "number" && typeof s?.end === "number") : [];
    } catch {
      return [];
    }
  }

  async saveSilences(recordingId: Id, spans: readonly Span[]): Promise<void> {
    await this.db.run("INSERT OR REPLACE INTO recording_silence (recording_id, spans) VALUES (?, ?)", [recordingId, JSON.stringify(spans)]);
  }
}
