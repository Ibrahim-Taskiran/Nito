import { describe, expect, it } from "vitest";
import { Bm25 } from "../src/core/ai/bm25";
import { buildCorpus } from "../src/core/ai/corpus";
import { chatPrompt, parseCitations, resolveTranscript } from "../src/core/ai/prompts";
import type { Document, Note } from "../src/core/types";

const doc: Document = {
  id: 1, courseId: 2, title: "Hafta 5: Taşıma", week: 5, filePath: "a.pdf", fileHash: "a", readStatus: "reading",
  favorite: false, addedAt: "", updatedAt: "", lastPage: null, pageCount: null, lastOpenedAt: null,
};
const note = (id: number, kind: Note["kind"], body: string): Note => ({
  id, documentId: 1, courseId: 2, kind, title: "Ders kaydı — yazıya döküm", body, createdAt: "", updatedAt: "",
});
const transcript = note(7, "transcript", "## 00:00\n\nBugün taşıma katmanını konuşacağız.\n\n## 12:05\n\nTCP üçlü el sıkışma ile bağlantı kurar, sınavda çıkar.\n");

describe("AI chat with lecture transcripts", () => {
  it("turns each transcript paragraph into a chunk that keeps its moment and recording", () => {
    const chunks = buildCorpus({ docs: [{ doc, pages: ["TCP baglanti"], annotations: [] }], notes: [transcript, note(8, "free", "Serbest not")], recordings: new Map([[7, 3]]) });
    const tr = chunks.filter((c) => c.source === "transcript");
    expect(tr.map((c) => [c.at, c.recordingId, c.title])).toEqual([[0, 3, "Hafta 5: Taşıma"], [725, 3, "Hafta 5: Taşıma"]]);
    expect(chunks.filter((c) => c.source === "note").map((c) => c.text)).toEqual(["Serbest not"]);
  });

  it("labels transcript sources with [kayıt mm:ss] in the prompt", () => {
    const hits = new Bm25(buildCorpus({ docs: [{ doc, pages: [], annotations: [] }], notes: [transcript] })).search("el sıkışma");
    expect(hits[0].chunk.at).toBe(725);
    expect(chatPrompt("TCP?", hits)[0].content).toContain("Hafta 5: Taşıma, ders kaydı [kayıt 12:05]");
    expect(chatPrompt("TCP?", hits)[0].content).toContain("[kayıt dd:ss]");
  });

  it("parses [kayıt mm:ss] next to page citations and resolves it to the paragraph", () => {
    const segs = parseCitations("El sıkışma [kayıt 12:05], başlık [s. 2]. Uzun ders [Kayit 1:02:05]");
    expect(segs).toEqual([
      { text: "El sıkışma " }, { at: 725, label: "kayıt 12:05" }, { text: ", başlık " }, { page: 2, label: "s. 2" },
      { text: ". Uzun ders " }, { at: 3725, label: "kayıt 1:02:05" },
    ]);
    const hits = new Bm25(buildCorpus({ docs: [], notes: [transcript], recordings: new Map([[7, 3]]) })).search("taşıma el sıkışma");
    expect(resolveTranscript(726, hits)?.at).toBe(725); // the model rounded
    expect(resolveTranscript(300, hits)?.at).toBe(0);
    expect(resolveTranscript(10, [])).toBeNull();
  });
});
