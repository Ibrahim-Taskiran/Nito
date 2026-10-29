// Library screen state. Views read it and call its methods; only this file talks to Repo.
import { addDocuments, summaryText, type SourceFile } from "../core/library/addDocuments";
import { NEXT_READ_STATUS } from "../core/labels";
import { Repo } from "../core/repo";
import type { Course, Document, Id, LibraryFilter } from "../core/types";
import type { Platform } from "../platform/types";

type Counts = Awaited<ReturnType<Repo["counts"]>>;

/** Main area shown next to the sidebar. Each Phase 2 group owns one. */
export type Section = "library" | "study" | "notes" | "ai";

export class Library {
  readonly repo: Repo;
  courses = $state<Course[]>([]);
  documents = $state<Document[]>([]);
  counts = $state<Counts>({ all: 0, unread: 0, favorites: 0, byCourse: {} });
  filter = $state<LibraryFilter>({ kind: "all" });
  selectedId = $state<Id | null>(null);
  section = $state<Section>("library");
  /** Two documents side by side (Phase 2D); wins over `opened`. */
  split = $state<[Document, Document] | null>(null);
  /** Document open in the reader. */
  opened = $state<Document | null>(null);
  /** Running add batch; null when idle. */
  adding = $state<{ done: number; total: number; abort: AbortController } | null>(null);
  /** Summary of the last finished batch. */
  addSummary = $state<string | null>(null);

  selected = $derived(this.documents.find((d) => d.id === this.selectedId) ?? null);

  constructor(readonly platform: Platform) {
    this.repo = new Repo(platform.db);
  }

  async refresh(): Promise<void> {
    [this.courses, this.documents, this.counts] = await Promise.all([
      this.repo.listCourses(),
      this.repo.listDocuments(this.filter),
      this.repo.counts(),
    ]);
  }

  async setFilter(f: LibraryFilter): Promise<void> {
    this.section = "library";
    this.filter = f;
    this.selectedId = null;
    await this.refresh();
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

  async open(d: Document): Promise<void> {
    if (d.readStatus === "unread") await this.repo.setReadStatus(d.id, "reading");
    this.selectedId = d.id;
    this.addSummary = null;
    this.opened = d;
  }

  async close(): Promise<void> {
    this.opened = null;
    await this.refresh();
  }

  async cycleReadStatus(d: Document): Promise<void> {
    await this.repo.setReadStatus(d.id, NEXT_READ_STATUS[d.readStatus]);
    await this.refresh();
  }

  async toggleFavorite(d: Document): Promise<void> {
    await this.repo.setFavorite(d.id, !d.favorite);
    await this.refresh();
  }
}
