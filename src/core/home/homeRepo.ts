// Read-only queries for the "Bugün" home screen.
import type { SqlDb } from "../db/sql";
import { toAnnotation, toDocument, toRecording } from "../repo";
import type { Annotation, Document, Recording } from "../types";

export interface RecentDocument {
  doc: Document;
  lastPage: number | null;
  pageCount: number | null;
  lastOpenedAt: string | null;
}

export interface RecentHighlight {
  annotation: Annotation;
  doc: Document;
}

export interface RecentRecording {
  recording: Recording;
  doc: Document;
}

/** Columns of `document` prefixed with d_, to join without name clashes. */
const DOC_COLS = ["id", "course_id", "title", "week", "file_path", "file_hash", "read_status", "favorite", "added_at", "updated_at"]
  .map((c) => `d.${c} AS d_${c}`)
  .join(", ");

const unprefix = (r: Record<string, unknown>, p: string) =>
  Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith(p)).map(([k, v]) => [k.slice(p.length), v])) as never;

export class HomeRepo {
  constructor(readonly db: SqlDb) {}

  /** Last opened documents; documents opened before last_opened_at existed fall back to updated_at. */
  async recentDocuments(limit = 3): Promise<RecentDocument[]> {
    const rows = await this.db.all(
      `SELECT * FROM document WHERE last_opened_at IS NOT NULL OR read_status <> 'unread'
       ORDER BY COALESCE(last_opened_at, updated_at) DESC LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({
      doc: toDocument(r),
      lastPage: r.last_page == null ? null : Number(r.last_page),
      pageCount: r.page_count == null ? null : Number(r.page_count),
      lastOpenedAt: r.last_opened_at == null ? null : String(r.last_opened_at),
    }));
  }

  async recentHighlights(limit = 5): Promise<RecentHighlight[]> {
    const rows = await this.db.all(
      `SELECT a.*, ${DOC_COLS} FROM annotation a JOIN document d ON d.id = a.document_id
       ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({ annotation: toAnnotation(r), doc: toDocument(unprefix(r, "d_")) }));
  }

  async recentRecordings(limit = 3): Promise<RecentRecording[]> {
    const rows = await this.db.all(
      `SELECT r.*, ${DOC_COLS} FROM recording r JOIN document d ON d.id = r.document_id
       WHERE r.file_path <> '' ORDER BY r.started_at DESC, r.id DESC LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({ recording: toRecording(r), doc: toDocument(unprefix(r, "d_")) }));
  }

  /** Highlights created at or after an ISO timestamp. */
  async highlightsSince(iso: string): Promise<number> {
    const [r] = await this.db.all<{ c: number }>("SELECT COUNT(*) AS c FROM annotation WHERE created_at >= ?", [iso]);
    return Number(r?.c ?? 0);
  }
}
