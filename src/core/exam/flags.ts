// Page flags ("Hoca vurguladı", "Sınav adayı", "Anlaşılmadı") and the exam list built from them
// plus "Sınav" highlights. Pure except FlagRepo, which only talks to SqlDb.
import type { SqlDb, SqlValue } from "../db/sql";
import { toAnnotation, toDocument } from "../repo";
import type { Annotation, Document, Id } from "../types";
import { compareByWeek } from "../week";

export type FlagKind = "stressed" | "candidate" | "unclear";

export interface FlagInfo {
  key: FlagKind;
  name: string;
  /** Muted colour, same family as the highlight labels. */
  color: string;
}

export const FLAGS: readonly FlagInfo[] = [
  { key: "stressed", name: "Hoca vurguladı", color: "#c08a3e" },
  { key: "candidate", name: "Sınav adayı", color: "#c9776b" },
  { key: "unclear", name: "Anlaşılmadı", color: "#7d8fb0" },
];

const BY_KEY = new Map(FLAGS.map((f) => [f.key, f]));
export const flagInfo = (k: FlagKind): FlagInfo => BY_KEY.get(k) ?? FLAGS[0];
export const isFlagKind = (v: unknown): v is FlagKind => BY_KEY.has(v as FlagKind);

/** Flags of one page in the fixed FLAGS order. */
export const sortFlags = (kinds: Iterable<FlagKind>): FlagKind[] => {
  const set = new Set(kinds);
  return FLAGS.map((f) => f.key).filter((k) => set.has(k));
};

/** Exam view filter: a flag kind, "exam" for Sınav highlights, or null for everything. */
export type ExamKind = FlagKind | "exam";

export interface ExamFilter {
  kind: ExamKind | null;
  /** null = every week (documents without a week too). */
  week: number | null;
}

/** One page in the exam list: its flags and its Sınav highlights. */
export interface ExamItem {
  doc: Document;
  page: number;
  flags: FlagKind[];
  highlights: Annotation[];
}

/** Joins flags and Sınav highlights per (document, page), filters, and sorts by week, title, page. */
export function examItems(
  flags: readonly { doc: Document; page: number; kind: FlagKind }[],
  highlights: readonly { doc: Document; ann: Annotation }[],
  filter: ExamFilter = { kind: null, week: null },
): ExamItem[] {
  const byKey = new Map<string, ExamItem>();
  const item = (doc: Document, page: number) => {
    const key = `${doc.id}:${page}`;
    let it = byKey.get(key);
    if (!it) byKey.set(key, (it = { doc, page, flags: [], highlights: [] }));
    return it;
  };
  for (const f of flags) item(f.doc, f.page).flags.push(f.kind);
  for (const h of highlights) if (h.ann.label === "exam") item(h.doc, h.ann.page).highlights.push(h.ann);
  const { kind, week } = filter;
  return [...byKey.values()]
    .map((it) => ({ ...it, flags: sortFlags(it.flags) }))
    .filter((it) => week == null || it.doc.week === week)
    .filter((it) => kind == null || (kind === "exam" ? it.highlights.length > 0 : it.flags.includes(kind)))
    .sort((a, b) => compareByWeek(a.doc, b.doc) || a.doc.id - b.doc.id || a.page - b.page);
}

/** Weeks present in the list, ascending (documents without a week are left out). */
export const examWeeks = (items: readonly ExamItem[]): number[] =>
  [...new Set(items.map((i) => i.doc.week).filter((w): w is number => w != null))].sort((a, b) => a - b);

export class FlagRepo {
  constructor(readonly db: SqlDb) {}

  /** page -> flags for one document. */
  async forDocument(documentId: Id): Promise<Map<number, FlagKind[]>> {
    const rows = await this.db.all<{ page: number; kind: string }>(
      "SELECT page, kind FROM page_flag WHERE document_id = ? ORDER BY page",
      [documentId],
    );
    const out = new Map<number, FlagKind[]>();
    for (const r of rows) {
      if (!isFlagKind(r.kind)) continue;
      const p = Number(r.page);
      out.set(p, sortFlags([...(out.get(p) ?? []), r.kind]));
    }
    return out;
  }

  /** Adds the flag when missing, removes it when set. Returns whether the page now has it. */
  async toggle(documentId: Id, page: number, kind: FlagKind): Promise<boolean> {
    const del = await this.db.run("DELETE FROM page_flag WHERE document_id = ? AND page = ? AND kind = ?", [documentId, page, kind]);
    if (del.changes > 0) return false;
    await this.db.run("INSERT INTO page_flag (document_id, page, kind) VALUES (?, ?, ?)", [documentId, page, kind]);
    return true;
  }

  /** Every flag with its document; courseId null = all courses. */
  async listWithDocs(courseId: Id | null): Promise<{ doc: Document; page: number; kind: FlagKind }[]> {
    const params: SqlValue[] = courseId == null ? [] : [courseId];
    const rows = await this.db.all(
      `SELECT f.page AS f_page, f.kind AS f_kind, d.* FROM page_flag f JOIN document d ON d.id = f.document_id
       ${courseId == null ? "" : "WHERE d.course_id = ?"} ORDER BY d.id, f.page`,
      params,
    );
    return rows.flatMap((r) => (isFlagKind(r.f_kind) ? [{ doc: toDocument(r), page: Number(r.f_page), kind: r.f_kind }] : []));
  }

  /** "Sınav" highlights with their documents. */
  async examHighlights(courseId: Id | null): Promise<{ doc: Document; ann: Annotation }[]> {
    const params: SqlValue[] = courseId == null ? [] : [courseId];
    const rows = await this.db.all(
      `SELECT a.*, d.id AS d_id, d.course_id, d.title, d.week, d.file_path, d.file_hash, d.read_status, d.favorite,
              d.added_at, d.updated_at, d.last_page, d.page_count, d.last_opened_at
       FROM annotation a JOIN document d ON d.id = a.document_id
       WHERE a.label = 'exam' ${courseId == null ? "" : "AND d.course_id = ?"} ORDER BY a.page`,
      params,
    );
    return rows.map((r) => ({ ann: toAnnotation(r), doc: toDocument({ ...r, id: r.d_id }) }));
  }
}
