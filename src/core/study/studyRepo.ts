// Data access for the Study Center. Reuses Repo for shared tables; owns card_review.
import type { SqlDb, SqlValue } from "../db/sql";
import { Repo, toAnnotation, toDocument } from "../repo";
import type { Annotation, Document, Id } from "../types";
import { CARD_LABELS, NO_ANSWER, cardFace, newCardState, type Card, type CardState } from "./cards";
import { cornellNote, cornellTitle } from "./markdown";
import type { PackDocument } from "./pack";

export interface CourseProgress {
  courseId: Id | null;
  name: string;
  read: number;
  total: number;
}

export interface DocHighlight {
  ann: Annotation;
  doc: Document;
}

const courseWhere = (courseId: Id | null, col = "d.course_id"): [string, SqlValue[]] =>
  courseId == null ? ["1", []] : [`${col} = ?`, [courseId]];

export class StudyRepo {
  readonly repo: Repo;
  constructor(readonly db: SqlDb) {
    this.repo = new Repo(db);
  }

  /** Flashcards (Tanım + Soru highlights) with their review state; new cards are due today. */
  async listCards(courseId: Id | null, today: string): Promise<Card[]> {
    const [where, params] = courseWhere(courseId);
    const rows = await this.db.all(
      `SELECT a.*, d.course_id, r.box, r.due, r.last_reviewed
       FROM annotation a JOIN document d ON d.id = a.document_id
       LEFT JOIN card_review r ON r.annotation_id = a.id
       WHERE a.label IN (${CARD_LABELS.map(() => "?").join(", ")}) AND ${where}
       ORDER BY d.week IS NULL, d.week, d.title, a.page, a.created_at`,
      [...CARD_LABELS, ...params],
    );
    return rows.flatMap((r) => {
      const a = toAnnotation(r);
      const face = cardFace(a);
      if (!face) return [];
      const state: CardState = r.due == null
        ? newCardState(today)
        : { box: Number(r.box), due: String(r.due), lastReviewed: r.last_reviewed == null ? null : String(r.last_reviewed) };
      return [{
        ...face, ...state,
        annotationId: a.id, documentId: a.documentId, courseId: r.course_id == null ? null : Number(r.course_id),
        label: a.label, page: a.page, hasAnswer: face.back !== NO_ANSWER && face.back.trim() !== "",
      }];
    });
  }

  async saveReview(annotationId: Id, s: CardState): Promise<void> {
    await this.db.run(
      "INSERT OR REPLACE INTO card_review (annotation_id, box, due, last_reviewed) VALUES (?, ?, ?, ?)",
      [annotationId, s.box, s.due, s.lastReviewed],
    );
  }

  /** "Sınav" highlights with their documents, in week/page order. */
  async examHighlights(courseId: Id | null): Promise<DocHighlight[]> {
    const [where, params] = courseWhere(courseId);
    const rows = await this.db.all(
      `SELECT a.*, d.id AS d_id, d.course_id, d.title, d.week, d.file_path, d.file_hash, d.read_status, d.favorite, d.added_at, d.updated_at
       FROM annotation a JOIN document d ON d.id = a.document_id
       WHERE a.label = 'exam' AND ${where}
       ORDER BY d.week IS NULL, d.week, d.title, a.page`,
      params,
    );
    return rows.map((r) => ({ ann: toAnnotation(r), doc: toDocument({ ...r, id: r.d_id }) }));
  }

  /** Read/total per course; documents without a course appear as "Derssiz". */
  async courseProgress(): Promise<CourseProgress[]> {
    const rows = await this.db.all(
      `SELECT c.id, c.name, COUNT(d.id) AS total, COALESCE(SUM(d.read_status = 'read'), 0) AS read
       FROM course c LEFT JOIN document d ON d.course_id = c.id
       GROUP BY c.id ORDER BY c.sort_order, c.name`,
    );
    const out = rows.map((r) => ({ courseId: Number(r.id), name: String(r.name), read: Number(r.read), total: Number(r.total) }));
    const [loose] = await this.db.all(
      "SELECT COUNT(*) AS total, COALESCE(SUM(read_status = 'read'), 0) AS read FROM document WHERE course_id IS NULL",
    );
    if (Number(loose?.total ?? 0) > 0) out.push({ courseId: null, name: "Derssiz", read: Number(loose.read), total: Number(loose.total) });
    return out;
  }

  async documents(courseId: Id | null): Promise<Document[]> {
    return this.repo.listDocuments(courseId == null ? { kind: "all" } : { kind: "course", courseId });
  }

  /** Builds a Cornell template from the document's highlights and saves it as a 'template' note. */
  async createCornellNote(doc: Document): Promise<Id> {
    const anns = await this.repo.listAnnotations(doc.id);
    return this.repo.addNote({
      documentId: doc.id, courseId: doc.courseId, kind: "template",
      title: cornellTitle(doc), body: cornellNote(doc, anns),
    });
  }

  /** Everything a course pack needs; PDFs that cannot be read come back as null. */
  async packDocuments(courseId: Id | null, read: (rel: string) => Promise<Uint8Array>): Promise<PackDocument[]> {
    const docs = await this.documents(courseId);
    return Promise.all(docs.map(async (doc) => ({
      doc,
      anns: await this.repo.listAnnotations(doc.id),
      pdf: await read(doc.filePath).catch(() => null),
    })));
  }
}
