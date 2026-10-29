// Importer for the user's previous reference library (item/collection style
// SQLite schema). Reads through a read-only SqlDb on a COPY of the file;
// never writes to the source. Written from the table names only.
import type { Row, SqlDb } from "../db/sql";
import type { LabelKey, NoteKind, ReadStatus, Rect } from "../types";
import { labelFromLegacyColor } from "../labels";
import { cleanTitle, weekNumber } from "../week";
import { htmlToMarkdown } from "../text";

export const DEFAULT_COURSES_ROOT = "3.1_Dersler";

const STATUS_TAGS: Record<string, ReadStatus> = { "Okunmadı": "unread", "Okunuyor": "reading", "Okundu": "read" };
const FAVORITE_TAGS = new Set(["⭐ Favori", "Favori"]);
const NON_DOCUMENT_TYPES = new Set(["attachment", "note", "annotation"]);

export interface PlannedCourse { key: string; name: string; sortOrder: number }
export interface PlannedDocument {
  key: string;
  courseKey: string | null;
  title: string;
  week: number | null;
  readStatus: ReadStatus;
  favorite: boolean;
  tags: string[];
  addedAt: string;
  /** Path relative to the library dir, e.g. "storage/ABCD1234/Hafta 1.pdf". */
  sourceFile: string;
}
export interface PlannedNote {
  key: string;
  documentKey: string | null;
  courseKey: string | null;
  kind: NoteKind;
  title: string;
  body: string; // markdown
}
export interface PlannedAnnotation {
  key: string;
  documentKey: string;
  page: number;
  rects: Rect[];
  label: LabelKey;
  text: string;
  comment: string;
}
export interface ImportPlan {
  courses: PlannedCourse[];
  documents: PlannedDocument[];
  notes: PlannedNote[];
  annotations: PlannedAnnotation[];
  skipped: { deleted: number; withoutPdf: number };
}

const str = (v: unknown) => (v == null ? "" : String(v));

async function hasTable(db: SqlDb, name: string): Promise<boolean> {
  return (await db.all("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", [name])).length > 0;
}

/** "storage:Hafta 1.pdf" -> "Hafta 1.pdf"; other link modes are not copied. */
export function storageFileName(path: string | null | undefined): string | null {
  const p = str(path);
  return p.startsWith("storage:") ? p.slice("storage:".length) : null;
}

export function courseDisplayName(collectionName: string): string {
  return collectionName.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

/** Converts a legacy annotation position (PDF points, origin bottom-left) to our rect format. */
export function legacyPositionToRects(position: string): { page: number; rects: Rect[] } {
  try {
    const p = JSON.parse(position);
    const rects: Rect[] = (Array.isArray(p.rects) ? p.rects : [])
      .filter((r: unknown) => Array.isArray(r) && r.length === 4)
      .map(([x1, y1, x2, y2]: number[]) => ({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, unit: "pt" as const }));
    return { page: Number(p.pageIndex ?? 0) + 1, rects };
  } catch {
    return { page: 1, rects: [] };
  }
}

export async function planImport(db: SqlDb, opts: { coursesRoot?: string } = {}): Promise<ImportPlan> {
  const root = opts.coursesRoot ?? DEFAULT_COURSES_ROOT;

  // Items: id -> {key, type, added}
  const items = new Map<number, { key: string; type: string; added: string }>();
  for (const r of await db.all(
    "SELECT i.itemID AS id, i.key AS key, t.typeName AS type, i.dateAdded AS added FROM items i JOIN itemTypes t ON t.itemTypeID = i.itemTypeID",
  )) items.set(Number(r.id), { key: str(r.key), type: str(r.type), added: str(r.added) });

  // Parent links of child items.
  const parentOf = new Map<number, number>();
  const attachments = new Map<number, Row>();
  for (const r of await db.all("SELECT itemID, parentItemID, contentType, path FROM itemAttachments")) {
    attachments.set(Number(r.itemID), r);
    if (r.parentItemID != null) parentOf.set(Number(r.itemID), Number(r.parentItemID));
  }
  const notesRows = await db.all("SELECT itemID, parentItemID, note, title FROM itemNotes");
  for (const r of notesRows) if (r.parentItemID != null) parentOf.set(Number(r.itemID), Number(r.parentItemID));
  const annRows = (await hasTable(db, "itemAnnotations"))
    ? await db.all("SELECT itemID, parentItemID, type, text, comment, color, position FROM itemAnnotations")
    : [];
  for (const r of annRows) parentOf.set(Number(r.itemID), Number(r.parentItemID));

  // Deleted = in deletedItems, or any ancestor is.
  const deletedIds = new Set((await db.all("SELECT itemID FROM deletedItems")).map((r) => Number(r.itemID)));
  const isDeleted = (id: number): boolean => {
    for (let cur: number | undefined = id, guard = 0; cur != null && guard < 10; cur = parentOf.get(cur), guard++) {
      if (deletedIds.has(cur)) return true;
    }
    return false;
  };

  // Titles.
  const titles = new Map<number, string>();
  for (const r of await db.all(
    `SELECT d.itemID AS id, v.value AS value FROM itemData d
     JOIN fields f ON f.fieldID = d.fieldID JOIN itemDataValues v ON v.valueID = d.valueID
     WHERE f.fieldName = 'title'`,
  )) titles.set(Number(r.id), str(r.value));

  // Tags per item.
  const tagsOf = new Map<number, string[]>();
  for (const r of await db.all("SELECT it.itemID AS id, t.name AS name FROM itemTags it JOIN tags t ON t.tagID = it.tagID")) {
    const list = tagsOf.get(Number(r.id)) ?? [];
    list.push(str(r.name));
    tagsOf.set(Number(r.id), list);
  }

  // Collections: courses are the direct children of the root collection;
  // deeper sub-collections belong to their course.
  const cols = (await db.all("SELECT collectionID AS id, collectionName AS name, parentCollectionID AS parent, key FROM collections")).map((r) => ({
    id: Number(r.id), name: str(r.name), parent: r.parent == null ? null : Number(r.parent), key: str(r.key),
  }));
  const deletedCols = (await hasTable(db, "deletedCollections"))
    ? new Set((await db.all("SELECT collectionID FROM deletedCollections")).map((r) => Number(r.collectionID)))
    : new Set<number>();
  const byId = new Map(cols.map((c) => [c.id, c]));
  const rootIds = new Set(cols.filter((c) => c.name === root).map((c) => c.id));
  const courseOfCollection = (id: number): string | null => {
    for (let c = byId.get(id), guard = 0; c && guard < 20; c = c.parent == null ? undefined : byId.get(c.parent), guard++) {
      if (deletedCols.has(c.id)) return null;
      if (c.parent != null && rootIds.has(c.parent)) return c.key;
    }
    return null;
  };
  const courses = cols
    .filter((c) => c.parent != null && rootIds.has(c.parent) && !deletedCols.has(c.id))
    .map((c) => ({ key: c.key, name: courseDisplayName(c.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .map((c, i) => ({ ...c, sortOrder: i }));

  const courseOfItem = new Map<number, string>();
  for (const r of await db.all("SELECT collectionID, itemID FROM collectionItems ORDER BY orderIndex")) {
    const course = courseOfCollection(Number(r.collectionID));
    if (course && !courseOfItem.has(Number(r.itemID))) courseOfItem.set(Number(r.itemID), course);
  }

  // Documents: regular items with a stored PDF, plus standalone PDFs.
  const pdfOf = new Map<number, { attId: number; file: string }>();
  for (const [attId, a] of attachments) {
    const file = storageFileName(a.path as string);
    const isPdf = str(a.contentType) === "application/pdf" || /\.pdf$/i.test(file ?? "");
    if (!file || !isPdf || isDeleted(attId)) continue;
    const owner = a.parentItemID == null ? attId : Number(a.parentItemID);
    if (!pdfOf.has(owner)) pdfOf.set(owner, { attId, file });
  }

  const documents: PlannedDocument[] = [];
  const docKeyOfItem = new Map<number, string>(); // item or attachment id -> document key
  let deleted = 0;
  let withoutPdf = 0;
  for (const [id, it] of items) {
    const standalonePdf = it.type === "attachment" && attachments.get(id)?.parentItemID == null && pdfOf.has(id);
    if (NON_DOCUMENT_TYPES.has(it.type) && !standalonePdf) continue;
    if (isDeleted(id)) { deleted++; continue; }
    const pdf = pdfOf.get(id);
    if (!pdf) { withoutPdf++; continue; }
    const tags = tagsOf.get(id) ?? [];
    const status = tags.map((t) => STATUS_TAGS[t]).find(Boolean) ?? "unread";
    const rawTitle = titles.get(id) || pdf.file;
    const title = standalonePdf || !titles.get(id) ? cleanTitle(rawTitle) : rawTitle;
    documents.push({
      key: it.key,
      courseKey: courseOfItem.get(id) ?? courseOfItem.get(pdf.attId) ?? null,
      title,
      week: weekNumber(title),
      readStatus: status,
      favorite: tags.some((t) => FAVORITE_TAGS.has(t)),
      tags: tags.filter((t) => !STATUS_TAGS[t] && !FAVORITE_TAGS.has(t)),
      addedAt: it.added,
      sourceFile: `storage/${items.get(pdf.attId)?.key}/${pdf.file}`,
    });
    docKeyOfItem.set(id, it.key);
    docKeyOfItem.set(pdf.attId, it.key);
  }
  // Annotations hang off any PDF attachment of the document.
  for (const [attId, a] of attachments) {
    if (a.parentItemID != null && docKeyOfItem.has(Number(a.parentItemID))) {
      docKeyOfItem.set(attId, docKeyOfItem.get(Number(a.parentItemID))!);
    }
  }

  const notes: PlannedNote[] = [];
  for (const r of notesRows) {
    const id = Number(r.itemID);
    const it = items.get(id);
    if (!it || isDeleted(id)) continue;
    const parent = r.parentItemID == null ? null : Number(r.parentItemID);
    const tags = tagsOf.get(id) ?? [];
    const kind: NoteKind = tags.includes("nito-yz") ? "ai" : tags.some((t) => t.startsWith("nito-ozet")) ? "digest" : "free";
    notes.push({
      key: it.key,
      documentKey: parent != null ? docKeyOfItem.get(parent) ?? null : null,
      courseKey: parent == null ? courseOfItem.get(id) ?? null : null,
      kind,
      title: str(r.title),
      body: htmlToMarkdown(str(r.note)),
    });
  }

  const annotations: PlannedAnnotation[] = [];
  for (const r of annRows) {
    const id = Number(r.itemID);
    const docKey = docKeyOfItem.get(Number(r.parentItemID));
    const it = items.get(id);
    if (!it || !docKey || isDeleted(id)) continue;
    const pos = legacyPositionToRects(str(r.position));
    annotations.push({
      key: it.key, documentKey: docKey, page: pos.page, rects: pos.rects,
      label: labelFromLegacyColor(str(r.color)), text: str(r.text), comment: str(r.comment),
    });
  }

  return { courses, documents, notes, annotations, skipped: { deleted, withoutPdf } };
}
