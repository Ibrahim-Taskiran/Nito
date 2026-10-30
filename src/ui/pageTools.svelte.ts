// Reader state for tapes, text boxes / sticky notes, page margins and layer visibility (one open document).
import type { InkStroke } from "../core/ink";
import type { PageImage } from "../core/pageImage";
import {
  NO_MARGIN, clearMargin, contentExtent, growMargin, noteRectAt, pageBounds, parseLayers,
  type LayerKey, type Layers, type Margin, type MarginSide, type NoteKind, type PageNote, type PageRect, type Tape,
} from "../core/pageTools";
import { PageToolsRepo } from "../core/pageToolsRepo";
import type { SqlDb } from "../core/db/sql";
import type { Id } from "../core/types";

const LAYERS_KEY = "nito.layers";

function loadLayers(): Layers {
  try {
    return parseLayers(localStorage.getItem(LAYERS_KEY));
  } catch {
    return parseLayers(null);
  }
}

export class PageTools {
  tapes = $state<Tape[]>([]);
  notes = $state<PageNote[]>([]);
  margins = $state.raw(new Map<number, Margin>());
  /** Shown layers; a per-device setting. */
  layers = $state<Layers>(loadLayers());
  selectedNoteId = $state<Id | null>(null);
  editingNoteId = $state<Id | null>(null);
  private repo: PageToolsRepo;

  constructor(db: SqlDb, readonly documentId: Id) {
    this.repo = new PageToolsRepo(db);
  }

  async load(): Promise<void> {
    [this.tapes, this.notes, this.margins] = await Promise.all([
      this.repo.tapes(this.documentId),
      this.repo.notes(this.documentId),
      this.repo.margins(this.documentId),
    ]);
  }

  // Layers.
  setLayer(key: LayerKey, on: boolean): void {
    this.layers = { ...this.layers, [key]: on };
    try {
      localStorage.setItem(LAYERS_KEY, JSON.stringify(this.layers));
    } catch { /* storage off */ }
  }

  // Margins.
  margin(page: number): Margin {
    return this.margins.get(page) ?? NO_MARGIN;
  }

  bounds(page: number): { w: number; h: number } {
    return pageBounds(this.margin(page));
  }

  async growMargin(page: number, side: MarginSide): Promise<void> {
    await this.saveMargin(page, growMargin(this.margin(page), side));
  }

  /** Removes a side's margin. Returns false when content there kept (part of) it. */
  async clearMargin(page: number, side: MarginSide, ink: InkStroke[], images: PageImage[]): Promise<boolean> {
    const items = [
      ...ink.filter((s) => s.page === page).flatMap((s) => s.points),
      ...images.filter((i) => i.page === page),
      ...this.notes.filter((n) => n.page === page),
      ...this.tapes.filter((t) => t.page === page),
    ];
    const { margin, kept } = clearMargin(this.margin(page), side, contentExtent(items));
    await this.saveMargin(page, margin);
    return !kept;
  }

  private async saveMargin(page: number, m: Margin): Promise<void> {
    const next = new Map(this.margins);
    if (m.right > 0 || m.bottom > 0) next.set(page, m);
    else next.delete(page);
    this.margins = next;
    await this.repo.setMargin(this.documentId, page, m);
  }

  // Tapes.
  async addTape(page: number, r: PageRect): Promise<void> {
    await this.repo.addTape(this.documentId, page, r);
    this.tapes = await this.repo.tapes(this.documentId);
  }

  async toggleTape(id: Id): Promise<void> {
    const t = this.tapes.find((x) => x.id === id);
    if (!t) return;
    this.tapes = this.tapes.map((x) => (x.id === id ? { ...x, revealed: !x.revealed } : x));
    await this.repo.setRevealed(id, !t.revealed);
  }

  async revealAll(revealed: boolean): Promise<void> {
    this.tapes = this.tapes.map((x) => ({ ...x, revealed }));
    await this.repo.setAllRevealed(this.documentId, revealed);
  }

  async removeTape(id: Id): Promise<void> {
    this.tapes = this.tapes.filter((x) => x.id !== id);
    await this.repo.removeTape(id);
  }

  // Text boxes and sticky notes.
  async addNote(page: number, kind: NoteKind, at: { x: number; y: number }): Promise<Id> {
    const id = await this.repo.addNote(this.documentId, page, kind, noteRectAt(kind, at, this.bounds(page)));
    this.notes = await this.repo.notes(this.documentId);
    this.selectedNoteId = id;
    this.editingNoteId = id;
    return id;
  }

  async updateNote(id: Id, patch: Partial<PageRect & { body: string; collapsed: boolean }>): Promise<void> {
    this.notes = this.notes.map((n) => (n.id === id ? { ...n, ...patch } : n));
    await this.repo.updateNote(id, patch);
  }

  async removeNote(id: Id): Promise<void> {
    this.notes = this.notes.filter((n) => n.id !== id);
    if (this.selectedNoteId === id) this.selectedNoteId = null;
    if (this.editingNoteId === id) this.editingNoteId = null;
    await this.repo.removeNote(id);
  }
}
