// Transcript data access: recording.transcript_note_id (migration 004) and the 'transcript' note.
import type { SqlDb } from "../db/sql";
import { get } from "../db/sql";
import { Repo } from "../repo";
import type { Id, Recording } from "../types";

export class TranscriptStore {
  private repo: Repo;
  constructor(readonly db: SqlDb) {
    this.repo = new Repo(db);
  }

  /** recordingId -> transcript note id, for one document's recordings. */
  async noteIds(documentId: Id): Promise<Map<Id, Id>> {
    const rows = await this.db.all<{ id: number; transcript_note_id: number }>(
      `SELECT r.id, r.transcript_note_id FROM recording r JOIN note n ON n.id = r.transcript_note_id
       WHERE r.document_id = ?`,
      [documentId],
    );
    return new Map(rows.map((r) => [Number(r.id), Number(r.transcript_note_id)]));
  }

  /** Creates the transcript note (or replaces its body on a re-run) and links it to the recording. */
  async save(rec: Recording, title: string, body: string): Promise<Id> {
    const existing = await get<{ id: number }>(
      this.db,
      "SELECT n.id FROM recording r JOIN note n ON n.id = r.transcript_note_id WHERE r.id = ?",
      [rec.id],
    );
    if (existing) {
      const id = Number(existing.id);
      await this.db.run("UPDATE note SET title = ?, body = ?, updated_at = ? WHERE id = ?", [title, body, new Date().toISOString(), id]);
      return id;
    }
    const doc = await this.repo.getDocument(rec.documentId);
    const id = await this.repo.addNote({ documentId: rec.documentId, courseId: doc?.courseId ?? null, kind: "transcript", title, body });
    await this.db.run("UPDATE recording SET transcript_note_id = ? WHERE id = ?", [id, rec.id]);
    return id;
  }
}
