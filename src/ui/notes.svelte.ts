// Notes screen state. Only this file talks to NotesRepo for notes.
import { exportFileName } from "../core/notes/build";
import { NotesRepo, type CourseRef } from "../core/notes/notesRepo";
import type { Document, Id, Note, NoteKind } from "../core/types";
import type { Library } from "./library.svelte";

export type CourseFilter = "all" | "none" | Id;

export const KIND_NAMES: Partial<Record<NoteKind, string>> = {
  live: "Canlı not",
  digest: "Renk özeti",
  free: "Serbest not",
  template: "Şablon",
  ai: "Yapay zekâ",
  transcript: "Döküm",
};

export const NO_COURSE_NAME = "Derssiz belgeler";

export class Notes {
  readonly repo: NotesRepo;
  notes = $state<Note[]>([]);
  /** Documents of the chosen course, for the live-note picker. */
  documents = $state<Document[]>([]);
  courseFilter = $state<CourseFilter>("all");
  kindFilter = $state<NoteKind | "all">("all");
  selectedId = $state<Id | null>(null);
  documentId = $state<Id | null>(null);
  /** Short status line (export path, errors). */
  message = $state<string | null>(null);

  selected = $derived(this.notes.find((n) => n.id === this.selectedId) ?? null);

  constructor(readonly lib: Library) {
    this.repo = new NotesRepo(lib.platform.db);
  }

  private get courseRef(): CourseRef | undefined {
    return this.courseFilter === "all" ? undefined : this.courseFilter === "none" ? null : this.courseFilter;
  }

  courseName(id: Id | null): string {
    return id == null ? NO_COURSE_NAME : (this.lib.courses.find((c) => c.id === id)?.name ?? "Ders");
  }

  async refresh(): Promise<void> {
    const ref = this.courseRef;
    const [notes, docs] = await Promise.all([
      this.repo.list({ courseId: ref, kind: this.kindFilter === "all" ? undefined : this.kindFilter }),
      this.lib.repo.listDocuments(),
    ]);
    this.notes = notes;
    this.documents = ref === undefined ? docs : docs.filter((d) => d.courseId === ref);
    if (!this.documents.some((d) => d.id === this.documentId)) this.documentId = this.documents[0]?.id ?? null;
  }

  /** Opens a note; live notes and digests are rebuilt first so they match the highlights. */
  async select(id: Id): Promise<void> {
    this.message = null;
    const n = this.notes.find((x) => x.id === id);
    if (n?.kind === "live" && n.documentId != null) await this.repo.refreshLive(n.documentId);
    else if (n?.kind === "digest") await this.repo.refreshDigest(n.courseId, this.courseName(n.courseId));
    this.selectedId = id;
    await this.refresh();
  }

  async refreshLive(): Promise<void> {
    if (this.documentId == null) return;
    this.selectedId = await this.repo.refreshLive(this.documentId);
    this.message = null;
    await this.refresh();
  }

  /** Digest of the chosen course; needs a course (or "no course") filter. */
  async makeDigest(): Promise<void> {
    const ref = this.courseRef;
    if (ref === undefined) return;
    this.selectedId = await this.repo.refreshDigest(ref, this.courseName(ref));
    this.message = null;
    await this.refresh();
  }

  async newFree(): Promise<void> {
    if (this.kindFilter !== "all" && this.kindFilter !== "free") this.kindFilter = "all";
    this.selectedId = await this.repo.addFree(this.courseRef ?? null);
    await this.refresh();
  }

  async save(id: Id, patch: { title?: string; body?: string }): Promise<void> {
    await this.repo.update(id, patch);
    await this.refresh();
  }

  async remove(id: Id): Promise<void> {
    await this.repo.remove(id);
    if (this.selectedId === id) this.selectedId = null;
    await this.refresh();
  }

  async exportNote(n: Note): Promise<void> {
    try {
      const path = await this.lib.platform.saveExport(exportFileName(n.title), n.body);
      this.message = path ? `Kaydedildi: ${path}` : "Markdown dosyası indirildi.";
    } catch (e) {
      this.message = `Dışa aktarılamadı: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /** Back-link: open the document in the reader at the highlight. */
  async openAnnotation(annotationId: Id): Promise<void> {
    const t = await this.repo.annotationTarget(annotationId);
    if (!t) {
      this.message = "Bu vurgu artık yok. Notu güncelleyin.";
      return;
    }
    this.lib.pendingFocus = { documentId: t.document.id, annotationId, page: t.annotation.page };
    await this.lib.open(t.document);
  }
}

const states = new WeakMap<Library, Notes>();

/** One notes state per library, so filters and the open note survive a trip to the reader. */
export function notesFor(lib: Library): Notes {
  let s = states.get(lib);
  if (!s) states.set(lib, (s = new Notes(lib)));
  return s;
}
