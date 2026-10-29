// Reader screen state for one open document. Only this file talks to Repo for annotations.
import type { Annotation, Document, Id, LabelKey, Rect } from "../core/types";
import type { Library } from "./library.svelte";
import { openPdf, type PDFDocumentProxy } from "./pdf";

export class Reader {
  pdf = $state.raw<PDFDocumentProxy | null>(null);
  error = $state<string | null>(null);
  annotations = $state<Annotation[]>([]);
  /** Annotation picked in the list, outlined on the page. */
  focusedId = $state<Id | null>(null);

  constructor(readonly lib: Library, readonly doc: Document) {}

  async load(): Promise<void> {
    try {
      const [pdf] = await Promise.all([openPdf(await this.lib.platform.storage.read(this.doc.filePath)), this.reloadAnnotations()]);
      this.pdf = pdf;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  async close(): Promise<void> {
    await this.pdf?.loadingTask.destroy();
    this.pdf = null;
  }

  private async reloadAnnotations(): Promise<void> {
    this.annotations = await this.lib.repo.listAnnotations(this.doc.id);
  }

  async addHighlight(page: number, rects: Rect[], label: LabelKey, text: string): Promise<Id> {
    const id = await this.lib.repo.addAnnotation({ documentId: this.doc.id, page, rects, label, text });
    await this.reloadAnnotations();
    return id;
  }

  async update(id: Id, patch: { label?: LabelKey; comment?: string }): Promise<void> {
    await this.lib.repo.updateAnnotation(id, patch);
    await this.reloadAnnotations();
  }

  async remove(id: Id): Promise<void> {
    await this.lib.repo.deleteAnnotation(id);
    if (this.focusedId === id) this.focusedId = null;
    await this.reloadAnnotations();
  }
}
