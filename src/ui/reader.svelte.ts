// Reader screen state for one open document. Only this file talks to Repo for annotations.
import { loadRate } from "./playback";
import { ImageRepo } from "../core/imageRepo";
import { INK_KINDS, hitsStroke, isHexColor, simplify, type InkKind, type InkPoint, type InkStroke } from "../core/ink";
import { InkRepo } from "../core/inkRepo";
import { centeredRect, imageExt, imageMime, type ImageRect, type PageImage } from "../core/pageImage";
import type { AnnotationMark } from "../core/repo";
import { findHits, firstHitFrom, type SearchHit } from "../core/search";
import type { Annotation, Document, Id, LabelKey, Rect } from "../core/types";
import { InkEdit } from "./inkEdit.svelte";
import { Lecture } from "./lecture.svelte";
import type { Library } from "./library.svelte";
import { PageOrder } from "./pages.svelte";
import { PageTools } from "./pageTools.svelte";
import { openPdf, type PDFDocumentProxy } from "./pdf";
import { Recorder } from "./recorder.svelte";

/** "laser" draws a fading line that is never saved. "tape", "text" and "note" are the page tools. */
export type InkTool = "none" | InkKind | "laser" | "eraser" | "select" | PageTool;
export type PageTool = "tape" | "text" | "note";
/** Tools that draw on the ink layer. */
export const isInkTool = (t: InkTool): boolean => t !== "none" && t !== "tape" && t !== "text" && t !== "note";
export type InkSize = 0 | 1 | 2;

const PREFS_KEY = "nito.inkPrefs";
const KINDS = Object.keys(INK_KINDS) as InkKind[];

/** Last colour and size per pen kind. A per-device convenience, so localStorage is fine. */
function loadPrefs(): { colors: Record<InkKind, string>; sizes: Record<InkKind, InkSize> } {
  const colors = Object.fromEntries(KINDS.map((k) => [k, INK_KINDS[k].colors[0].color])) as Record<InkKind, string>;
  const sizes = Object.fromEntries(KINDS.map((k) => [k, 1])) as Record<InkKind, InkSize>;
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    for (const k of KINDS) {
      if (isHexColor(v?.colors?.[k])) colors[k] = v.colors[k];
      if ([0, 1, 2].includes(v?.sizes?.[k])) sizes[k] = v.sizes[k];
    }
  } catch { /* storage off or bad JSON */ }
  return { colors, sizes };
}

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
  /** Recordings of this document: player, page timeline, note replay, cues. */
  readonly lecture: Lecture;
  /** Tapes, text boxes, sticky notes, margins and layer visibility. */
  readonly tools: PageTools;
  /** Inserted blank pages and the page list in reading order. */
  readonly pages: PageOrder;
  /** Handwriting on this document. */
  ink = $state<InkStroke[]>([]);
  inkTool = $state<InkTool>("none");
  /** Last pen kind used; the colour and size controls act on it. */
  inkKind = $state<InkKind>("pen");
  inkColors = $state<Record<InkKind, string>>(loadPrefs().colors);
  inkSizes = $state<Record<InkKind, InkSize>>(loadPrefs().sizes);
  readonly inkRepo: InkRepo;
  /** Shape correction, palm rejection prefs, undo, lasso selection. */
  readonly edit: InkEdit = new InkEdit(this);
  /** Pictures placed on pages, and object URLs for their stored files. */
  images = $state<PageImage[]>([]);
  imageUrls = $state.raw(new Map<string, string>());
  selectedImageId = $state<Id | null>(null);
  readonly imageRepo: ImageRepo;
  /** Search across the PDF's text. */
  searchQuery = $state("");
  hits = $state.raw<SearchHit[]>([]);
  hitIndex = $state(0);
  private texts: Promise<string[]> | null = null;

  private player: HTMLAudioElement | null = null;
  private audioUrls = new Map<string, string>();

  constructor(readonly lib: Library, readonly doc: Document) {
    this.inkRepo = new InkRepo(lib.repo.db);
    this.imageRepo = new ImageRepo(lib.repo.db);
    this.tools = new PageTools(lib.repo.db, doc.id);
    this.pages = new PageOrder(lib.repo.db, doc.id);
    this.recorder = new Recorder(lib, doc.id, () => void this.reloadAnnotations().then(() => this.lecture.load()));
    this.lecture = new Lecture(this);
  }

  async load(): Promise<void> {
    try {
      const [pdf] = await Promise.all([
        openPdf(await this.lib.platform.storage.read(this.doc.filePath)),
        this.reloadAnnotations(),
        this.reloadInk(),
        this.reloadImages(),
        this.lecture.load(),
        this.tools.load(),
        this.pages.load(),
      ]);
      this.pages.numPages = pdf.numPages;
      this.pdf = pdf;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  async close(): Promise<void> {
    await this.recorder.stop();
    this.player?.pause();
    this.lecture.dispose();
    for (const url of this.audioUrls.values()) URL.revokeObjectURL(url);
    for (const url of this.imageUrls.values()) URL.revokeObjectURL(url);
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

  async reloadInk(): Promise<void> {
    this.ink = await this.inkRepo.list(this.doc.id);
  }

  /** Colour of the pen kind in use (or the last one used). */
  get inkColor(): string {
    return this.inkColors[this.inkKind];
  }

  get inkWidth(): number {
    return INK_KINDS[this.inkKind].widths[this.inkSizes[this.inkKind]];
  }

  /** Picks a tool; picking the active one again puts the pen down. */
  setTool(t: Exclude<InkTool, "none">): void {
    if (this.inkTool === t) {
      this.inkTool = "none";
      return;
    }
    this.inkTool = t;
    if (t === "pen" || t === "pencil" || t === "highlighter") this.inkKind = t;
    // Drawing on a hidden layer would look like nothing happens.
    if (t === "highlighter" && !this.tools.layers.highlights) this.tools.setLayer("highlights", true);
    if ((t === "pen" || t === "pencil") && !this.tools.layers.ink) this.tools.setLayer("ink", true);
    if (t === "tape" && !this.tools.layers.tape) this.tools.setLayer("tape", true);
    if ((t === "text" || t === "note") && !this.tools.layers.notes) this.tools.setLayer("notes", true);
    this.selectedImageId = null;
    this.tools.selectedNoteId = null;
    this.edit.clear();
  }

  setInkColor(color: string): void {
    if (!isHexColor(color)) return;
    this.inkColors = { ...this.inkColors, [this.inkKind]: color };
    this.savePrefs();
  }

  setInkSize(size: InkSize): void {
    this.inkSizes = { ...this.inkSizes, [this.inkKind]: size };
    this.savePrefs();
  }

  private savePrefs(): void {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ colors: this.inkColors, sizes: this.inkSizes }));
    } catch { /* storage off */ }
  }

  /** Saves a stroke of the current pen. `clean`: points are final (a corrected shape), so no simplifying. */
  async addStroke(page: number, points: InkPoint[], clean = false): Promise<Id | null> {
    const pts = clean ? points : simplify(points);
    if (!pts.length) return null;
    const stroke = { documentId: this.doc.id, page, color: this.inkColor, width: this.inkWidth, points: pts, kind: this.inkKind };
    const mark = this.recorder.mark();
    const id = await this.inkRepo.add(stroke);
    if (mark) await this.lecture.markStroke(id, mark.recordingId, mark.offsetSeconds);
    await this.reloadInk();
    return id;
  }

  /** Deletes every stroke on `page` that passes near `at`. */
  async eraseAt(page: number, at: { x: number; y: number }): Promise<void> {
    const hit = this.ink.filter((s) => s.page === page && hitsStroke(s, at));
    if (!hit.length) return;
    for (const s of hit) await this.inkRepo.remove(s.id);
    await this.reloadInk();
  }

  async remove(id: Id): Promise<void> {
    await this.lib.repo.deleteAnnotation(id);
    if (this.focusedId === id) this.focusedId = null;
    await this.reloadAnnotations();
  }

  async reloadImages(): Promise<void> {
    this.images = await this.imageRepo.list(this.doc.id);
    const missing = [...new Set(this.images.map((i) => i.filePath))].filter((p) => !this.imageUrls.has(p));
    if (!missing.length) return;
    const urls = new Map(this.imageUrls);
    for (const p of missing) {
      try {
        const bytes = await this.lib.platform.storage.read(p);
        urls.set(p, URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageMime(p) })));
      } catch (e) {
        console.warn("Resim okunamadı:", p, e);
      }
    }
    this.imageUrls = urls;
  }

  /** Asks for a picture and puts it in the middle of `page`. Returns false when cancelled. */
  async insertImage(page: number, pageSize: { w: number; h: number }): Promise<boolean> {
    const file = await this.lib.platform.pickers.pickImage();
    if (!file) return false;
    const ext = imageExt(file.name);
    if (!ext) throw new Error("Bu dosya bir resim değil (PNG, JPG, WEBP, GIF).");
    const rel = `images/${await file.hash()}.${ext}`;
    await file.store(rel);
    await this.placeImage(page, rel, pageSize);
    return true;
  }

  /** Pasted, dropped or downloaded picture bytes (already checked as an image of type `ext`). */
  async addImageBytes(page: number, bytes: Uint8Array, ext: string, pageSize: { w: number; h: number }, at?: { x: number; y: number }): Promise<Id> {
    const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const rel = `images/${hex}.${ext}`;
    await this.lib.platform.storage.write(rel, bytes);
    return this.placeImage(page, rel, pageSize, at);
  }

  /** Puts a stored picture on `page`: centred, or centred on `at` (page fractions) when given. */
  private async placeImage(page: number, rel: string, pageSize: { w: number; h: number }, at?: { x: number; y: number }): Promise<Id> {
    const blob = new Blob([(await this.lib.platform.storage.read(rel)) as BlobPart], { type: imageMime(rel) });
    let dims = { width: 1, height: 1 };
    try {
      const bmp = await createImageBitmap(blob);
      dims = { width: bmp.width, height: bmp.height };
      bmp.close();
    } catch { /* size unknown: placed as a square */ }
    const rect = centeredRect(dims.width, dims.height, pageSize.w, pageSize.h);
    if (at) {
      const b = this.tools.bounds(page);
      rect.x = Math.min(b.w - rect.w, Math.max(0, at.x - rect.w / 2));
      rect.y = Math.min(b.h - rect.h, Math.max(0, at.y - rect.h / 2));
    }
    const id = await this.imageRepo.add({ documentId: this.doc.id, page, filePath: rel, ...rect });
    this.inkTool = "none";
    await this.reloadImages();
    this.selectedImageId = id;
    return id;
  }

  async moveImage(id: Id, rect: ImageRect): Promise<void> {
    this.images = this.images.map((i) => (i.id === id ? { ...i, ...rect } : i));
    await this.imageRepo.move(id, rect);
  }

  async removeImage(id: Id): Promise<void> {
    const img = this.images.find((i) => i.id === id);
    if (!img) return;
    await this.imageRepo.remove(id);
    if (this.selectedImageId === id) this.selectedImageId = null;
    if (!(await this.imageRepo.inUse(img.filePath))) {
      await this.lib.platform.storage.remove(img.filePath).catch(() => {});
      const url = this.imageUrls.get(img.filePath);
      if (url) URL.revokeObjectURL(url);
      const urls = new Map(this.imageUrls);
      urls.delete(img.filePath);
      this.imageUrls = urls;
    }
    await this.reloadImages();
  }

  /** Page texts for search, read once per open document. */
  private pageTexts(): Promise<string[]> {
    const pdf = this.pdf;
    if (!pdf) return Promise.resolve([]);
    this.texts ??= (async () => {
      const out: string[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const content = await (await pdf.getPage(n)).getTextContent();
        out.push(content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? " " : "") : "")).join(""));
      }
      return out;
    })();
    return this.texts;
  }

  /** Runs a search; the current hit becomes the first one on or after `fromPage`. */
  async search(query: string, fromPage: number): Promise<void> {
    this.searchQuery = query;
    const hits = findHits(await this.pageTexts(), query);
    if (this.searchQuery !== query) return; // a newer search won
    this.hits = hits;
    this.hitIndex = firstHitFrom(hits, fromPage);
  }

  /** Steps to the next (+1) or previous (-1) hit, wrapping around. Returns its page. */
  stepHit(dir: 1 | -1): number | null {
    if (!this.hits.length) return null;
    this.hitIndex = (this.hitIndex + dir + this.hits.length) % this.hits.length;
    return this.hits[this.hitIndex].page;
  }

  clearSearch(): void {
    this.searchQuery = "";
    this.hits = [];
    this.hitIndex = 0;
  }

  /** Stops the ▶ mm:ss playback of an annotation (the shared lecture player is starting). */
  pauseMark(): void {
    this.player?.pause();
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
    this.lecture.pause();
    this.player ??= new Audio();
    const player = this.player;
    player.onpause = player.onended = () => (this.playingId = null);
    if (player.src !== url) player.src = url;
    player.playbackRate = loadRate();
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
