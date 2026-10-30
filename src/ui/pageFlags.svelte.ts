// Page flags of one open document, shared by the reader's flag control and the page thumbnails.
import { FlagRepo, type FlagKind } from "../core/exam/flags";
import type { Id } from "../core/types";
import type { Library } from "./library.svelte";

export class PageFlags {
  /** page -> flags (fixed order). */
  byPage = $state.raw(new Map<number, FlagKind[]>());
  private repo: FlagRepo;

  private static cache = new WeakMap<Library, Map<Id, PageFlags>>();
  /** One instance per document, so the toolbar control and PageNav see the same state. */
  static for(lib: Library, documentId: Id): PageFlags {
    let m = PageFlags.cache.get(lib);
    if (!m) PageFlags.cache.set(lib, (m = new Map()));
    let f = m.get(documentId);
    if (!f) {
      m.set(documentId, (f = new PageFlags(lib, documentId)));
      void f.load();
    }
    return f;
  }

  private constructor(lib: Library, readonly documentId: Id) {
    this.repo = new FlagRepo(lib.repo.db);
  }

  async load(): Promise<void> {
    this.byPage = await this.repo.forDocument(this.documentId).catch(() => new Map());
  }

  on(page: number): FlagKind[] {
    return this.byPage.get(page) ?? [];
  }

  async toggle(page: number, kind: FlagKind): Promise<void> {
    await this.repo.toggle(this.documentId, page, kind);
    await this.load();
  }
}
