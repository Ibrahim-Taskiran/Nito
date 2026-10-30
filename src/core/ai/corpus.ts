// Turns a course's documents, notes and highlights into retrieval chunks. Pure.
import { transcriptParagraphs } from "../transcribe/transcript";
import type { Annotation, Document, Id, Note } from "../types";
import { chunkPages, splitText, type Chunk } from "./text";

export interface CorpusInput {
  docs: { doc: Document; pages: string[]; annotations: Annotation[] }[];
  notes: Note[];
  /** Transcript note id -> its recording, so a "[kayıt mm:ss]" citation can play it. */
  recordings?: ReadonlyMap<Id, Id>;
}

/** Notes may hold sanitised HTML; keep the words only. */
export const plainText = (s: string): string =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function buildCorpus({ docs, notes, recordings }: CorpusInput): Chunk[] {
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
    if (n.kind === "transcript") {
      // One chunk list per "## mm:ss" paragraph, each keeping its moment in the recording.
      const title = (n.documentId != null ? byId.get(n.documentId) : undefined) || n.title || "Ders kaydı";
      const recordingId = recordings?.get(n.id) ?? null;
      for (const p of transcriptParagraphs(n.body)) {
        for (const text of splitText(p.text)) {
          out.push({ documentId: n.documentId, title, page: null, source: "transcript", text, at: p.start, recordingId });
        }
      }
      continue;
    }
    const title = n.title || (n.documentId != null ? byId.get(n.documentId) : undefined) || "Not";
    for (const text of splitText(plainText(n.body))) out.push({ documentId: n.documentId, title, page: null, source: "note", text });
  }
  return out;
}
