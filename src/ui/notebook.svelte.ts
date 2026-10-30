// The open document's notebook ("Defter"); rules in core/notebook. Ink and notes live in the Reader like any page.
import { NotebookRepo, type NotebookPage, type PaperKind } from "../core/notebook";
import type { Reader } from "./reader.svelte";

export class Notebook {
  pages = $state.raw<NotebookPage[]>([]);
  private repo: NotebookRepo;

  constructor(readonly reader: Reader) {
    this.repo = new NotebookRepo(reader.lib.repo.db);
  }

  async load(): Promise<void> {
    this.pages = await this.repo.open(this.reader.doc.id);
  }

  /** Adds a page at the end; returns its key. */
  async add(kind: PaperKind): Promise<number> {
    const key = await this.repo.add(this.reader.doc.id, kind);
    await this.load();
    return key;
  }

  async move(key: number, dir: -1 | 1): Promise<void> {
    await this.repo.move(this.reader.doc.id, key, dir);
    await this.load();
  }

  /** Deletes a page and drops what was on it from the open reader. */
  async remove(key: number): Promise<void> {
    const r = this.reader;
    await this.repo.remove(r.doc.id, key);
    r.ink = r.ink.filter((s) => s.page !== key);
    r.images = r.images.filter((i) => i.page !== key);
    r.annotations = r.annotations.filter((a) => a.page !== key);
    await Promise.all([r.tools.load(), this.load()]);
  }
}
