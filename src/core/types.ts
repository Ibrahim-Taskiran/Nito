// Domain entities. Pure data: no Tauri, no DOM.

export type Id = number;

export type ReadStatus = "unread" | "reading" | "read";

export type LabelKey = "important" | "exam" | "definition" | "example" | "question";

export type NoteKind = "live" | "template" | "digest" | "ai" | "transcript" | "free";

export interface Course {
  id: Id;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface Document {
  id: Id;
  courseId: Id | null;
  title: string;
  week: number | null;
  filePath: string; // relative to the app storage dir
  fileHash: string;
  readStatus: ReadStatus;
  favorite: boolean;
  addedAt: string;
  updatedAt: string;
  /** Last page seen in the reader (1-based); null until first opened. */
  lastPage: number | null;
  pageCount: number | null;
  lastOpenedAt: string | null;
}

/** Per-document counts for library badges. */
export interface DocumentStats {
  highlights: number;
  recordings: number;
  notes: number;
}

/** A rectangle in page space, normalised to 0..1 of the page width/height. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Annotation {
  id: Id;
  documentId: Id;
  page: number; // 1-based
  rects: Rect[];
  label: LabelKey;
  text: string;
  comment: string;
  createdAt: string;
}

export interface Note {
  id: Id;
  documentId: Id | null;
  courseId: Id | null;
  kind: NoteKind;
  title: string;
  body: string; // markdown or sanitised HTML
  createdAt: string;
  updatedAt: string;
}

export interface Recording {
  id: Id;
  documentId: Id;
  filePath: string;
  mimeType: string;
  startedAt: string;
  durationSeconds: number;
}

export interface RecordingMark {
  id: Id;
  recordingId: Id;
  annotationId: Id;
  offsetSeconds: number;
}

export interface Tag {
  id: Id;
  name: string;
}

/** Sidebar selection. */
export type LibraryFilter =
  | { kind: "all" }
  | { kind: "unread" }
  | { kind: "favorites" }
  | { kind: "course"; courseId: Id };
