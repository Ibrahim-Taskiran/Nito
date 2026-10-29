// Turns a course's documents, notes and highlights into retrieval chunks. Pure.
import type { Annotation, Document, Note } from "../types";
import { chunkPages, splitText, type Chunk } from "./text";

export interface CorpusInput {
  docs: { doc: Document; pages: string[]; annotations: Annotation[] }[];
  notes: Note[];
}

/** Notes may hold sanitised HTML; keep the words only. */
export const plainText = (s: string): string =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function buildCorpus({ docs, notes }: CorpusInput): Chunk[] {
  const byId = new Map(docs.map((d) => [d.doc.id, d.doc.title]));
  const out: Chunk[] = [];
  for (const { doc, pages, annotations } of docs) {
    out.push(...chunkPages(doc.id, doc.title, pages));
    for (const a of annotations) {
      const text = [a.text, a.comment].filter(Boolean).join(" — Yorum: ");
      if (text.trim()) out.push({ documentId: doc.id, title: doc.title, page: a.page, source: "highlight", text });
    }
  }
  for (const n of notes) {
    const title = n.title || (n.documentId != null ? byId.get(n.documentId) : undefined) || "Not";
    for (const text of splitText(plainText(n.body))) out.push({ documentId: n.documentId, title, page: null, source: "note", text });
  }
  return out;
}
