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
    ? hits.map((h, i) => `(${i + 1}) [${sourceLabel(h.chunk)}]\n${h.chunk.text}`).join("\n\n")
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

export type Segment = { text: string } | { page: number; label: string };

/** Splits an answer into plain text and [s. N] citations (also "[s.N]", "[S. 3, 4]"). */
export function parseCitations(answer: string): Segment[] {
  const out: Segment[] = [];
  const re = /\[\s*s\.?\s*(\d+(?:\s*[,–-]\s*\d+)*)\s*\]/giu;
  let last = 0;
  for (const m of answer.matchAll(re)) {
    if (m.index > last) out.push({ text: answer.slice(last, m.index) });
    for (const n of m[1].split(/\s*[,–-]\s*/)) out.push({ page: Number(n), label: `s. ${n}` });
    last = m.index + m[0].length;
  }
  if (last < answer.length) out.push({ text: answer.slice(last) });
  return out;
}

/** The retrieved chunk a page citation points to (best-ranked first); null if the model invented it. */
export function resolveCitation(page: number, hits: Hit[]): Chunk | null {
  return hits.find((h) => h.chunk.page === page)?.chunk ?? null;
}
