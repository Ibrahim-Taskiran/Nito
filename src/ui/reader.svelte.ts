// Reader screen state for one open document. Only this file talks to Repo for annotations.
import type { AnnotationMark } from "../core/repo";
import type { Annotation, Document, Id, LabelKey, Rect } from "../core/types";
import type { Library } from "./library.svelte";
import { openPdf, type PDFDocumentProxy } from "./pdf";
import { Recorder } from "./recorder.svelte";

export class Reader {
  pdf = $state.raw<PDFDocumentProxy | null>(null);
  error = $state<string | null>(null);
  annotations = $state<Annotation[]>([]);
  /** annotationId -> moment in a finished recording. */
  marks = $state.raw(new Map<Id, AnnotationMark>());
  /** Annotation picked in the list, outlined on the page. */
  focusedId = $state<Id | null>(null);
  /** Annotation whose recording is playing. */
  playingId = $state<Id | null>(null);
  readonly recorder: Recorder;

  private player: HTMLAudioElement | null = null;
  private audioUrls = new Map<string, string>();

  constructor(readonly lib: Library, readonly doc: Document) {
    this.recorder = new Recorder(lib, doc.id, () => void this.reloadAnnotations());
  }

  async load(): Promise<void> {
    try {
      const [pdf] = await Promise.all([openPdf(await this.lib.platform.storage.read(this.doc.filePath)), this.reloadAnnotations()]);
      this.pdf = pdf;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  async close(): Promise<void> {
    await this.recorder.stop();
    this.player?.pause();
    for (const url of this.audioUrls.values()) URL.revokeObjectURL(url);
    await this.pdf?.loadingTask.destroy();
    this.pdf = null;
  }

  private async reloadAnnotations(): Promise<void> {
    [this.annotations, this.marks] = await Promise.all([
      this.lib.repo.listAnnotations(this.doc.id),
      this.lib.repo.marksForDocument(this.doc.id),
    ]);
  }

  async addHighlight(page: number, rects: Rect[], label: LabelKey, text: string): Promise<Id> {
    const mark = this.recorder.mark();
    const id = await this.lib.repo.addAnnotation({ documentId: this.doc.id, page, rects, label, text });
    if (mark) await this.lib.repo.addMark(mark.recordingId, id, mark.offsetSeconds);
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

  /** Plays the recording from the moment the annotation was made; a second call stops it. */
  async play(annotationId: Id): Promise<void> {
    const mark = this.marks.get(annotationId);
    if (!mark) return;
    if (this.playingId === annotationId) {
      this.player?.pause();
      return;
    }
    let url = this.audioUrls.get(mark.filePath);
    if (!url) {
      const bytes = await this.lib.platform.storage.read(mark.filePath);
      url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mark.mimeType }));
      this.audioUrls.set(mark.filePath, url);
    }
    this.player ??= new Audio();
    const player = this.player;
    player.onpause = player.onended = () => (this.playingId = null);
    if (player.src !== url) player.src = url;
    // Start a little early so the sentence is not cut.
    player.currentTime = Math.max(0, mark.offsetSeconds - 2);
    this.playingId = annotationId;
    try {
      await player.play();
    } catch {
      this.playingId = null;
    }
  }
}
