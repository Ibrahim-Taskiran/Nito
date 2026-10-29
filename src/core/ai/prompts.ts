// Prompt builders and citation parsing for the local model. Pure.
import type { Hit } from "./bm25";
import { fitPages, type Chunk } from "./text";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Characters of document text sent for a summary (fits a small model's context). */
export const SUMMARY_BUDGET = 9000;

export function summaryPrompt(title: string, pages: string[], budget = SUMMARY_BUDGET): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Sen bir üniversite öğrencisinin ders asistanısın. Yalnız verilen metne dayan, uydurma. Türkçe yaz. " +
        "Yanıtı Markdown olarak ver: kısa bir giriş cümlesi, ardından '## Ana fikirler' başlığı altında maddeler, " +
        "sonra '## Önemli kavramlar' başlığı altında kavram: açıklama maddeleri. Bilginin geldiği sayfayı [s. N] biçiminde belirt.",
    },
    { role: "user", content: `Belge: ${title}\n\nMetin (sayfa etiketli):\n${fitPages(pages, budget)}\n\nBu belgeyi özetle.` },
  ];
}

const sourceLabel = (c: Chunk): string =>
  c.page != null ? `${c.title}, s. ${c.page}` : `${c.title} (${c.source === "note" ? "not" : "vurgu"})`;

/** "Chat with notes": retrieved chunks first, then the question. */
export function chatPrompt(question: string, hits: Hit[], history: ChatMessage[] = []): ChatMessage[] {
  const context = hits.length
    ? hits.map((h, i) => `(${i + 1}) ${sourceLabel(h.chunk)}\n${h.chunk.text}`).join("\n\n")
    : "(İlgili kaynak bulunamadı.)";
  return [
    {
      role: "system",
      content:
        "Sen bir üniversite öğrencisinin ders asistanısın. Soruyu yalnız aşağıdaki kaynaklara dayanarak Türkçe ve kısa yanıtla. " +
        "Her bilginin sonuna geldiği sayfayı [s. N] biçiminde yaz (N sayfa numarası). " +
        "Kaynaklarda yanıt yoksa bunu açıkça söyle, tahmin etme.\n\nKaynaklar:\n" + context,
    },
    ...history.slice(-4),
    { role: "user", content: question },
  ];
}

export type Segment = { text: string } | { page: number; label: string; title?: string };

/**
 * Splits an answer into plain text and [s. N] citations. Also takes "[s.N]", "[S. 3, 4]"
 * and "[Hafta 3, s. 4]" (small models copy the source label; the title then picks the document).
 */
export function parseCitations(answer: string): Segment[] {
  const out: Segment[] = [];
  const re = /\[(?:([^[\]\n]{1,80}?),\s*)?s\.?\s*(\d+(?:\s*[,–-]\s*\d+)*)\s*\]/giu;
  let last = 0;
  for (const m of answer.matchAll(re)) {
    if (m.index > last) out.push({ text: answer.slice(last, m.index) });
    const title = m[1]?.trim();
    for (const n of m[2].split(/\s*[,–-]\s*/)) out.push({ page: Number(n), label: `s. ${n}`, ...(title ? { title } : {}) });
    last = m.index + m[0].length;
  }
  if (last < answer.length) out.push({ text: answer.slice(last) });
  return out;
}

/**
 * The retrieved chunk a page citation points to (best-ranked first). A page that was not retrieved
 * still resolves when the hits come from one document only; otherwise null (the model invented it).
 */
export function resolveCitation(page: number, hits: Hit[], title?: string): Chunk | null {
  const onPage = hits.filter((h) => h.chunk.page === page);
  const found = (onPage.find((h) => title && h.chunk.title === title) ?? onPage[0])?.chunk;
  if (found) return found;
  const docs = new Set(hits.filter((h) => h.chunk.documentId != null).map((h) => h.chunk.documentId));
  const only = hits.find((h) => h.chunk.documentId != null)?.chunk;
  return docs.size === 1 && only ? { ...only, page } : null;
}

/** Light Markdown for display: headings and **bold** become strong runs; everything else stays text. */
export function emphasis(s: string): { text: string; strong: boolean }[] {
  const md = s.replace(/^#{1,6}[ \t]*(.+)$/gm, "**$1**");
  return md.split(/\*\*(.+?)\*\*/s).map((text, i) => ({ text, strong: i % 2 === 1 })).filter((r) => r.text);
}

/** Small models often wrap Markdown in a ```markdown fence; drop it (also while streaming). */
export const cleanAnswer = (s: string): string => s.replace(/^[ \t]*```[\w-]*[ \t]*(\n|$)/gm, "").trim();
