// Data access for Phase 2B: generated notes, free notes and watched folders.
import type { SqlDb, SqlValue } from "../db/sql";
import { get } from "../db/sql";
import { toAnnotation, toDocument, toNote } from "../repo";
import type { Annotation, Document, Id, Note, NoteKind } from "../types";
import { digestBody, digestTitle, liveNoteBody, liveNoteTitle, type DigestDoc } from "./build";
import type { WatchedFolder } from "./watch";

/** `null` course = documents without a course. */
export type CourseRef = Id | null;

export interface NoteFilter {
  /** undefined = all courses; null = notes without a course. */
  courseId?: CourseRef;
  kind?: NoteKind;
}

const now = () => new Date().toISOString();

export class NotesRepo {
  constructor(readonly db: SqlDb) {}

  async list(f: NoteFilter = {}): Promise<Note[]> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (f.courseId !== undefined) {
      where.push("course_id IS ?");
      params.push(f.courseId);
    }
    if (f.kind) {
      where.push("kind = ?");
      params.push(f.kind);
    }
    const sql = `SELECT * FROM note ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC, id DESC`;
    return (await this.db.all(sql, params)).map(toNote);
  }

  async get(id: Id): Promise<Note | undefined> {
    const r = await get(this.db, "SELECT * FROM note WHERE id = ?", [id]);
    return r && toNote(r);
  }

  async addFree(courseId: CourseRef, title = "Yeni not", body = ""): Promise<Id> {
    const t = now();
    return (await this.db.run(
      "INSERT INTO note (document_id, course_id, kind, title, body, created_at, updated_at) VALUES (NULL, ?, 'free', ?, ?, ?, ?)",
      [courseId, title, body, t, t],
    )).lastId;
  }

  /** Saves title/body; does nothing (and keeps updated_at) when nothing changed. */
  async update(id: Id, patch: { title?: string; body?: string }): Promise<void> {
    const cur = await this.get(id);
    if (!cur) return;
    const title = patch.title ?? cur.title;
    const body = patch.body ?? cur.body;
    if (title === cur.title && body === cur.body) return;
    await this.db.run("UPDATE note SET title = ?, body = ?, updated_at = ? WHERE id = ?", [title, body, now(), id]);
  }

  async remove(id: Id): Promise<void> {
    await this.db.run("DELETE FROM note WHERE id = ?", [id]);
  }

  /** Inserts or updates the single note of a kind for a document/course key. */
  private async upsert(kind: "live" | "digest", key: { documentId: Id | null; courseId: CourseRef }, title: string, body: string): Promise<Id> {
    const existing = await get(this.db,
      kind === "live"
        ? "SELECT id, title, body FROM note WHERE kind = 'live' AND document_id = ?"
        : "SELECT id, title, body FROM note WHERE kind = 'digest' AND course_id IS ?",
      [kind === "live" ? key.documentId : key.courseId]);
    if (existing) {
      const id = Number(existing.id);
      if (existing.title !== title || existing.body !== body || kind === "live") {
        await this.db.run("UPDATE note SET title = ?, body = ?, course_id = ?, updated_at = ? WHERE id = ?", [title, body, key.courseId, now(), id]);
      }
      return id;
    }
    const t = now();
    return (await this.db.run(
      "INSERT INTO note (document_id, course_id, kind, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [key.documentId, key.courseId, kind, title, body, t, t],
    )).lastId;
  }

  /** Rebuilds the live note of a document from its highlights. */
  async refreshLive(documentId: Id): Promise<Id> {
    const r = await get(this.db, "SELECT * FROM document WHERE id = ?", [documentId]);
    if (!r) throw new Error("Belge bulunamadı");
    const doc = toDocument(r);
    const anns = (await this.db.all("SELECT * FROM annotation WHERE document_id = ? ORDER BY page, created_at", [documentId])).map(toAnnotation);
    return this.upsert("live", { documentId, courseId: doc.courseId }, liveNoteTitle(doc), liveNoteBody(doc, anns));
  }

  /** Rebuilds the colour digest of a course (`null` = documents without a course). */
  async refreshDigest(courseId: CourseRef, courseName: string): Promise<Id> {
    const docs = (await this.db.all("SELECT * FROM document WHERE course_id IS ? ORDER BY week IS NULL, week, title", [courseId])).map(toDocument);
    const anns = (await this.db.all(
      "SELECT a.* FROM annotation a JOIN document d ON d.id = a.document_id WHERE d.course_id IS ? ORDER BY a.page, a.created_at",
      [courseId],
    )).map(toAnnotation);
    const byDoc = new Map<Id, Annotation[]>();
    for (const a of anns) byDoc.set(a.documentId, [...(byDoc.get(a.documentId) ?? []), a]);
    const input: DigestDoc[] = docs.map((doc) => ({ doc, annotations: byDoc.get(doc.id) ?? [] }));
    return this.upsert("digest", { documentId: null, courseId }, digestTitle(courseName), digestBody(courseName, input));
  }

  /** Where a back-link points: the annotation and its document. */
  async annotationTarget(annotationId: Id): Promise<{ annotation: Annotation; document: Document } | undefined> {
    const a = await get(this.db, "SELECT * FROM annotation WHERE id = ?", [annotationId]);
    if (!a) return undefined;
    const d = await get(this.db, "SELECT * FROM document WHERE id = ?", [a.document_id]);
    return d ? { annotation: toAnnotation(a), document: toDocument(d) } : undefined;
  }

  // ---- watched folders
  async listWatched(): Promise<WatchedFolder[]> {
    const rows = await this.db.all("SELECT * FROM watched_folder ORDER BY path");
    return rows.map((r) => ({
      id: Number(r.id),
      path: String(r.path),
      recursive: Number(r.recursive) === 1,
      lastScan: r.last_scan == null ? null : String(r.last_scan),
    }));
  }

  /** Adds a folder; an existing path only gets its recursive flag updated. */
  async addWatched(path: string, recursive: boolean): Promise<void> {
    await this.db.run(
      "INSERT INTO watched_folder (path, recursive) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET recursive = excluded.recursive",
      [path, recursive ? 1 : 0],
    );
  }

  async removeWatched(id: Id): Promise<void> {
    await this.db.run("DELETE FROM watched_folder WHERE id = ?", [id]);
  }

  async markScanned(id: Id, at: string = now()): Promise<void> {
    await this.db.run("UPDATE watched_folder SET last_scan = ? WHERE id = ?", [at, id]);
  }
}
