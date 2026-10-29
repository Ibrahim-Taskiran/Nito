// Repository: the only place that knows table/column names.
import type { SqlDb, Row, SqlValue } from "./db/sql";
import { get } from "./db/sql";
import type {
  Annotation, Course, Document, Id, LabelKey, LibraryFilter, Note, NoteKind,
  ReadStatus, Recording, RecordingMark, Rect,
} from "./types";
import { weekNumber } from "./week";

const s = (v: SqlValue): string => (v == null ? "" : String(v));
const n = (v: SqlValue): number => Number(v ?? 0);
const nn = (v: SqlValue): number | null => (v == null ? null : Number(v));

export function toCourse(r: Row): Course {
  return { id: n(r.id), name: s(r.name), sortOrder: n(r.sort_order), createdAt: s(r.created_at) };
}

export function toDocument(r: Row): Document {
  return {
    id: n(r.id),
    courseId: nn(r.course_id),
    title: s(r.title),
    week: nn(r.week),
    filePath: s(r.file_path),
    fileHash: s(r.file_hash),
    readStatus: s(r.read_status) as ReadStatus,
    favorite: n(r.favorite) === 1,
    addedAt: s(r.added_at),
    updatedAt: s(r.updated_at),
  };
}

export function parseRects(json: string): Rect[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v)
      ? v.filter((r) => r && [r.x, r.y, r.w, r.h].every((x) => typeof x === "number"))
      : [];
  } catch {
    return [];
  }
}

export function toAnnotation(r: Row): Annotation {
  return {
    id: n(r.id),
    documentId: n(r.document_id),
    page: n(r.page),
    rects: parseRects(s(r.rects)),
    label: s(r.label) as LabelKey,
    text: s(r.text),
    comment: s(r.comment),
    createdAt: s(r.created_at),
  };
}

export function toNote(r: Row): Note {
  return {
    id: n(r.id),
    documentId: nn(r.document_id),
    courseId: nn(r.course_id),
    kind: s(r.kind) as NoteKind,
    title: s(r.title),
    body: s(r.body),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

export function toRecording(r: Row): Recording {
  return {
    id: n(r.id),
    documentId: n(r.document_id),
    filePath: s(r.file_path),
    mimeType: s(r.mime_type),
    startedAt: s(r.started_at),
    durationSeconds: n(r.duration_seconds),
  };
}

export function toMark(r: Row): RecordingMark {
  return {
    id: n(r.id),
    recordingId: n(r.recording_id),
    annotationId: n(r.annotation_id),
    offsetSeconds: n(r.offset_seconds),
  };
}

export interface NewDocument {
  courseId: Id | null;
  title: string;
  week?: number | null;
  filePath: string;
  fileHash: string;
  readStatus?: ReadStatus;
  favorite?: boolean;
  addedAt?: string;
}

export interface NewAnnotation {
  documentId: Id;
  page: number;
  rects: Rect[];
  label: LabelKey;
  text?: string;
  comment?: string;
}

export interface NewNote {
  documentId?: Id | null;
  courseId?: Id | null;
  kind: NoteKind;
  title: string;
  body: string;
}

/** An annotation's playable moment, for the ▶ mm:ss button. */
export interface AnnotationMark extends RecordingMark {
  filePath: string;
  mimeType: string;
}

const now = () => new Date().toISOString();

export class Repo {
  constructor(readonly db: SqlDb) {}

  // ---- courses
  async listCourses(): Promise<Course[]> {
    return (await this.db.all("SELECT * FROM course ORDER BY sort_order, name")).map(toCourse);
  }

  async addCourse(name: string, sortOrder = 0): Promise<Id> {
    return (await this.db.run("INSERT INTO course (name, sort_order) VALUES (?, ?)", [name, sortOrder])).lastId;
  }

  /** Finds a course by name (case-insensitive) or creates it. */
  async ensureCourse(name: string): Promise<Id> {
    const r = await get(this.db, "SELECT id FROM course WHERE name = ? COLLATE NOCASE", [name]);
    return r ? n(r.id) : this.addCourse(name);
  }

  // ---- documents
  async listDocuments(filter: LibraryFilter = { kind: "all" }): Promise<Document[]> {
    const where: Record<LibraryFilter["kind"], string> = {
      all: "1",
      unread: "read_status = 'unread'",
      favorites: "favorite = 1",
      course: "course_id = ?",
    };
    const params = filter.kind === "course" ? [filter.courseId] : [];
    const rows = await this.db.all(`SELECT * FROM document WHERE ${where[filter.kind]} ORDER BY week IS NULL, week, title`, params);
    return rows.map(toDocument);
  }

  async getDocument(id: Id): Promise<Document | undefined> {
    const r = await get(this.db, "SELECT * FROM document WHERE id = ?", [id]);
    return r && toDocument(r);
  }

  async documentByHash(hash: string): Promise<Document | undefined> {
    const r = await get(this.db, "SELECT * FROM document WHERE file_hash = ?", [hash]);
    return r && toDocument(r);
  }

  async addDocument(d: NewDocument): Promise<Id> {
    const t = d.addedAt ?? now();
    return (await this.db.run(
      `INSERT INTO document (course_id, title, week, file_path, file_hash, read_status, favorite, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.courseId, d.title, d.week ?? weekNumber(d.title), d.filePath, d.fileHash, d.readStatus ?? "unread", d.favorite ? 1 : 0, t, t],
    )).lastId;
  }

  async setReadStatus(id: Id, status: ReadStatus): Promise<void> {
    await this.db.run("UPDATE document SET read_status = ?, updated_at = ? WHERE id = ?", [status, now(), id]);
  }

  async setFavorite(id: Id, favorite: boolean): Promise<void> {
    await this.db.run("UPDATE document SET favorite = ?, updated_at = ? WHERE id = ?", [favorite ? 1 : 0, now(), id]);
  }

  async counts(): Promise<{ all: number; unread: number; favorites: number; byCourse: Record<Id, number> }> {
    const [tot] = await this.db.all<{ all: number; unread: number; favorites: number }>(
      "SELECT COUNT(*) AS \"all\", SUM(read_status='unread') AS unread, SUM(favorite) AS favorites FROM document",
    );
    const rows = await this.db.all<{ course_id: number; c: number }>("SELECT course_id, COUNT(*) AS c FROM document GROUP BY course_id");
    const byCourse: Record<Id, number> = {};
    for (const r of rows) if (r.course_id != null) byCourse[Number(r.course_id)] = Number(r.c);
    return { all: Number(tot?.all ?? 0), unread: Number(tot?.unread ?? 0), favorites: Number(tot?.favorites ?? 0), byCourse };
  }

  // ---- annotations
  async listAnnotations(documentId: Id): Promise<Annotation[]> {
    return (await this.db.all("SELECT * FROM annotation WHERE document_id = ? ORDER BY page, created_at", [documentId])).map(toAnnotation);
  }

  async addAnnotation(a: NewAnnotation): Promise<Id> {
    return (await this.db.run(
      "INSERT INTO annotation (document_id, page, rects, label, text, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [a.documentId, a.page, JSON.stringify(a.rects), a.label, a.text ?? "", a.comment ?? "", now()],
    )).lastId;
  }

  async updateAnnotation(id: Id, patch: { label?: LabelKey; comment?: string }): Promise<void> {
    if (patch.label) await this.db.run("UPDATE annotation SET label = ? WHERE id = ?", [patch.label, id]);
    if (patch.comment !== undefined) await this.db.run("UPDATE annotation SET comment = ? WHERE id = ?", [patch.comment, id]);
  }

  async deleteAnnotation(id: Id): Promise<void> {
    await this.db.run("DELETE FROM annotation WHERE id = ?", [id]);
  }

  // ---- notes
  async listNotes(where: { documentId?: Id; courseId?: Id } = {}): Promise<Note[]> {
    if (where.documentId != null) return (await this.db.all("SELECT * FROM note WHERE document_id = ? ORDER BY updated_at DESC", [where.documentId])).map(toNote);
    if (where.courseId != null) return (await this.db.all("SELECT * FROM note WHERE course_id = ? ORDER BY updated_at DESC", [where.courseId])).map(toNote);
    return (await this.db.all("SELECT * FROM note ORDER BY updated_at DESC")).map(toNote);
  }

  async addNote(nt: NewNote): Promise<Id> {
    const t = now();
    return (await this.db.run(
      "INSERT INTO note (document_id, course_id, kind, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [nt.documentId ?? null, nt.courseId ?? null, nt.kind, nt.title, nt.body, t, t],
    )).lastId;
  }

  // ---- recordings
  async startRecording(documentId: Id, mimeType: string): Promise<Id> {
    return (await this.db.run("INSERT INTO recording (document_id, mime_type, started_at) VALUES (?, ?, ?)", [documentId, mimeType, now()])).lastId;
  }

  async finishRecording(id: Id, filePath: string, durationSeconds: number): Promise<void> {
    await this.db.run("UPDATE recording SET file_path = ?, duration_seconds = ? WHERE id = ?", [filePath, durationSeconds, id]);
  }

  async deleteRecording(id: Id): Promise<void> {
    await this.db.run("DELETE FROM recording WHERE id = ?", [id]);
  }

  async listRecordings(documentId: Id): Promise<Recording[]> {
    return (await this.db.all("SELECT * FROM recording WHERE document_id = ? AND file_path <> '' ORDER BY started_at", [documentId])).map(toRecording);
  }

  async addMark(recordingId: Id, annotationId: Id, offsetSeconds: number): Promise<void> {
    await this.db.run("INSERT OR REPLACE INTO recording_mark (recording_id, annotation_id, offset_seconds) VALUES (?, ?, ?)", [recordingId, annotationId, offsetSeconds]);
  }

  /** annotationId -> first playable mark (finished recordings only). */
  async marksForDocument(documentId: Id): Promise<Map<Id, AnnotationMark>> {
    const rows = await this.db.all(
      `SELECT m.*, r.file_path, r.mime_type FROM recording_mark m
       JOIN recording r ON r.id = m.recording_id
       JOIN annotation a ON a.id = m.annotation_id
       WHERE a.document_id = ? AND r.file_path <> '' ORDER BY m.offset_seconds`,
      [documentId],
    );
    const out = new Map<Id, AnnotationMark>();
    for (const r of rows) {
      const m = { ...toMark(r), filePath: s(r.file_path), mimeType: s(r.mime_type) };
      if (!out.has(m.annotationId)) out.set(m.annotationId, m);
    }
    return out;
  }

  // ---- tags
  async tagDocument(documentId: Id, name: string): Promise<void> {
    await this.db.run("INSERT OR IGNORE INTO tag (name) VALUES (?)", [name]);
    await this.db.run("INSERT OR IGNORE INTO document_tag (document_id, tag_id) SELECT ?, id FROM tag WHERE name = ?", [documentId, name]);
  }

  async documentTags(documentId: Id): Promise<string[]> {
    const rows = await this.db.all<{ name: string }>(
      "SELECT t.name FROM tag t JOIN document_tag dt ON dt.tag_id = t.id WHERE dt.document_id = ? ORDER BY t.name",
      [documentId],
    );
    return rows.map((r) => String(r.name));
  }
}
