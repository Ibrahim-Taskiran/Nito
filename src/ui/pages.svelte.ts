// Inserted blank pages of the open document and the page list in reading order (rules in core/pages).
import { PageRepo, pageSlots, type InsertedPage, type InsertWhere, type PageSlot } from "../core/pages";
import type { SqlDb } from "../core/db/sql";
import type { Id } from "../core/types";
import { PageFlags } from "./pageFlags.svelte";
import type { Reader } from "./reader.svelte";

export class PageOrder {
  inserts = $state.raw<InsertedPage[]>([]);
  /** Pages of the PDF; set once it is open. */
  numPages = $state(0);
  readonly slots: PageSlot[] = $derived(pageSlots(this.numPages, this.inserts));
  private repo: PageRepo;

  constructor(db: SqlDb, readonly documentId: Id) {
    this.repo = new PageRepo(db);
  }

  async load(): Promise<void> {
    this.inserts = await this.repo.list(this.documentId);
  }

  slot(key: number): PageSlot | undefined {
    return this.slots.find((s) => s.key === key);
  }

  /** Size of a blank page in PDF points. */
  blankSize(key: number): { w: number; h: number } | undefined {
    const b = this.inserts.find((i) => -i.id === key);
    return b && { w: b.w, h: b.h };
  }

  /** Adds a blank page next to `ref`; returns its key. */
  async insert(ref: number, where: InsertWhere, size: { w: number; h: number }): Promise<number> {
    const key = await this.repo.insert(this.documentId, ref, where, size);
    await this.load();
    return key;
  }

  async remove(key: number): Promise<void> {
    await this.repo.remove(this.documentId, key);
    await this.load();
  }
}

/** Deletes a blank page and drops what was on it from the open reader. */
export async function removeBlankPage(reader: Reader, key: number): Promise<void> {
  await reader.pages.remove(key);
  reader.ink = reader.ink.filter((s) => s.page !== key);
  reader.images = reader.images.filter((i) => i.page !== key);
  reader.annotations = reader.annotations.filter((a) => a.page !== key);
  await Promise.all([reader.tools.load(), PageFlags.for(reader.lib, reader.doc.id).load()]);
}
