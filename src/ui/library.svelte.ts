// Library screen state. Views read it and call its methods; only this file talks to Repo.
import { addDocuments, summaryText, type SourceFile } from "../core/library/addDocuments";
import { searchDocuments, sortDocuments, type SortKey } from "../core/library/browse";
import { NEXT_READ_STATUS } from "../core/labels";
import { Repo } from "../core/repo";
import type { Course, Document, DocumentStats, Id, LibraryFilter, ReadStatus } from "../core/types";
import type { Platform } from "../platform/types";

type Counts = Awaited<ReturnType<Repo["counts"]>>;
export type ViewMode = "grid" | "list";

/** Per-device view preference; storage may be missing or blocked. */
export function pref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
export function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window or blocked storage: keep the in-memory value */
  }
}

/** Below this width DetailPanel is hidden (keep in sync with its CSS media query). */
const NO_DETAIL_PANEL = "(max-width: 1023px)";

/** Cached cover of a document's first page. */
export const thumbPath = (d: Pick<Document, "fileHash">) => `thumbs/${d.fileHash}.png`;

/** Main area shown next to the sidebar. Each Phase 2 group owns one. */
export type Section = "home" | "plan" | "library" | "study" | "notes" | "ai";

export class Library {
  readonly repo: Repo;
  courses = $state<Course[]>([]);
  documents = $state<Document[]>([]);
  counts = $state<Counts>({ all: 0, unread: 0, favorites: 0, byCourse: {} });
  filter = $state<LibraryFilter>({ kind: "all" });
  selectedId = $state<Id | null>(null);
  section = $state<Section>("home");
  /** Two documents side by side (Phase 2D); wins over `opened`. */
  split = $state<[Document, Document] | null>(null);
  /** Document open in the reader. */
  opened = $state<Document | null>(null);
  /** Annotation the reader should scroll to and focus once it loads (note back-links). */
  pendingFocus = $state<{ documentId: Id; annotationId: Id; page: number } | null>(null);
  /** Page the reader should jump to once loaded (AI citations); the reader clears it. */
  openPage = $state<number | null>(null);
  /** Running add batch; null when idle. */
  adding = $state<{ done: number; total: number; abort: AbortController } | null>(null);
  /** Summary of the last finished batch. */
  addSummary = $state<string | null>(null);
  /** Library search box text (title + course name). */
  query = $state("");
  sort = $state<SortKey>(pref("nito.sort", ["recent", "added", "name", "week"], "week"));
  view = $state<ViewMode>(pref("nito.view", ["grid", "list"], "grid"));
  /** Highlight / recording / note counts per document. */
  stats = $state(new Map<Id, DocumentStats>());

  selected = $derived(this.documents.find((d) => d.id === this.selectedId) ?? null);
  /** Documents after search and sort, as the library shows them. */
  visible = $derived(sortDocuments(searchDocuments(this.documents, this.query, this.courses), this.sort));

  private positionTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPosition: (() => Promise<void>) | null = null;

  constructor(readonly platform: Platform) {
    this.repo = new Repo(platform.db);
  }

  async refresh(): Promise<void> {
    [this.courses, this.documents, this.counts, this.stats] = await Promise.all([
      this.repo.listCourses(),
      this.repo.listDocuments(this.filter),
      this.repo.counts(),
      this.repo.documentStats(),
    ]);
  }

  async setFilter(f: LibraryFilter): Promise<void> {
    this.section = "library";
    this.filter = f;
    this.selectedId = null;
    await this.refresh();
  }

  setSort(s: SortKey): void {
    this.sort = s;
    savePref("nito.sort", s);
  }

  setView(v: ViewMode): void {
    this.view = v;
    savePref("nito.view", v);
  }

  async add(files: SourceFile[]): Promise<void> {
    if (this.adding || !files.length) return;
    const abort = new AbortController();
    this.adding = { done: 0, total: files.length, abort };
    const courseId = this.filter.kind === "course" ? this.filter.courseId : null;
    try {
      const r = await addDocuments(this.repo, files, {
        courseId,
        signal: abort.signal,
        onProgress: (done, total) => {
          if (this.adding) Object.assign(this.adding, { done, total });
        },
      });
      this.addSummary = summaryText(r);
    } finally {
      this.adding = null;
      await this.refresh();
    }
  }

  async open(d: Document, page: number | null = null): Promise<void> {
    if (d.readStatus === "unread") await this.repo.setReadStatus(d.id, "reading");
    this.selectedId = d.id;
    this.addSummary = null;
    this.openPage = page;
    this.split = null;
    this.opened = d;
  }

  /** Tap on a card or row: select it, or open it when there is no detail panel (tablet portrait, phone). */
  activate(d: Document): void {
    if (typeof matchMedia === "function" && matchMedia(NO_DETAIL_PANEL).matches) void this.resume(d);
    else this.selectedId = d.id;
  }

  /** Opens at the saved page ("continue where you left off"). */
  resume(d: Document): Promise<void> {
    return this.open(d, d.lastPage && d.lastPage > 1 ? d.lastPage : null);
  }

  /** Reader page changes; written after 1 s of quiet so scrolling does not hammer the DB. */
  savePosition(id: Id, page: number, pageCount: number): void {
    if (this.positionTimer) clearTimeout(this.positionTimer);
    this.pendingPosition = () => this.repo.setReadingPosition(id, page, pageCount);
    this.positionTimer = setTimeout(async () => {
      await this.flushPosition();
      if (!this.opened && !this.split) await this.refresh(); // e.g. split view was closed meanwhile
    }, 1000);
  }

  async flushPosition(): Promise<void> {
    if (this.positionTimer) clearTimeout(this.positionTimer);
    const save = this.pendingPosition;
    this.positionTimer = this.pendingPosition = null;
    if (save) await save().catch((e) => console.error(e));
  }

  async close(): Promise<void> {
    await this.flushPosition();
    this.opened = null;
    await this.refresh();
  }

  async cycleReadStatus(d: Document): Promise<void> {
    await this.repo.setReadStatus(d.id, NEXT_READ_STATUS[d.readStatus]);
    await this.refresh();
  }

  async setReadStatus(d: Document, status: ReadStatus): Promise<void> {
    await this.repo.setReadStatus(d.id, status);
    await this.refresh();
  }

  async toggleFavorite(d: Document): Promise<void> {
    await this.repo.setFavorite(d.id, !d.favorite);
    await this.refresh();
  }

  async rename(d: Document, title: string): Promise<void> {
    await this.repo.renameDocument(d.id, title);
    await this.refresh();
  }

  /** Moves to an existing course, a new course by name, or out of any course (null). */
  async moveToCourse(d: Document, course: Id | string | null): Promise<void> {
    const id = typeof course === "string" ? await this.repo.ensureCourse(course.trim()) : course;
    await this.repo.moveToCourse(d.id, id);
    await this.refresh();
  }

  async setWeek(d: Document, week: number | null): Promise<void> {
    await this.repo.setWeek(d.id, week);
    await this.refresh();
  }

  /** Deletes the document, its data and its stored files. */
  async remove(d: Document): Promise<void> {
    const files = await this.repo.deleteDocument(d.id);
    await Promise.all([...files, thumbPath(d)].map((f) => this.platform.storage.remove(f).catch(() => {})));
    if (this.selectedId === d.id) this.selectedId = null;
    await this.refresh();
  }
}
