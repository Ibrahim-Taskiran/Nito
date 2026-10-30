// Flashcards and multiple-choice questions from slides with the local model: prompt and a strict,
// forgiving parser for its JSON answer. Pure.
import type { ChatMessage } from "./prompts";
import { squash } from "./text";

/** Characters of slide text sent for card generation. */
export const CARDS_BUDGET = 9000;
export const MAX_CARDS = 30;

export type DraftCard =
  | { kind: "term"; term: string; definition: string; page: number }
  | { kind: "mc"; question: string; answer: string; wrong: string[]; page: number };

/** Pages `from..to` (1-based, inclusive) as "[s. N] text", each page an equal share of `budget`. */
export function pageRangeText(pages: readonly string[], from: number, to: number, budget = CARDS_BUDGET): string {
  const range = pages.slice(from - 1, to).map(squash);
  let left = budget;
  const parts: string[] = [];
  range.forEach((p, i) => {
    if (!p) return;
    const share = Math.floor(left / (range.length - i));
    const piece = p.length <= share ? p : p.slice(0, Math.max(0, share - 1)) + "…";
    left -= piece.length;
    parts.push(`[s. ${from + i}] ${piece}`);
  });
  return parts.join("\n");
}

export function cardsPrompt(title: string, pages: readonly string[], from: number, to: number, budget = CARDS_BUDGET): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Sen bir üniversite öğrencisi için ders kartı hazırlayan asistansın. Yalnız verilen slayt metnine dayan, uydurma. Türkçe yaz. " +
        "Yanıt olarak YALNIZ şu biçimde geçerli bir JSON nesnesi ver, başka hiçbir şey yazma:\n" +
        '{"cards":[{"term":"kavram","definition":"kısa tanım","page":3}],' +
        '"questions":[{"question":"soru?","answer":"doğru cevap","wrong":["yanlış 1","yanlış 2","yanlış 3"],"page":4}]}\n' +
        "Kurallar: 4-10 kavram kartı ve 3-6 çoktan seçmeli soru. Tanım ve cevaplar kısa olsun (en çok 2 cümle). " +
        "Her soruda 3 makul ama yanlış seçenek olsun. page, bilginin geldiği sayfa numarasıdır.",
    },
    { role: "user", content: `Belge: ${title} (s. ${from}–${to})\n\nSlayt metni:\n${pageRangeText(pages, from, to, budget)}` },
  ];
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? squash(v).slice(0, max) : "");
const key = (s: string) => s.toLocaleLowerCase("tr");

/** The JSON object in a model answer: drops ```json fences and any chatter around the outermost braces. */
export function extractJson(text: string): unknown {
  const t = text.replace(/```[\w-]*/g, "").trim();
  const start = t.search(/[[{]/);
  if (start < 0) throw new Error("Yanıtta JSON yok.");
  const close = t[start] === "{" ? "}" : "]";
  const end = t.lastIndexOf(close);
  if (end <= start) throw new Error("Yanıttaki JSON yarım kalmış.");
  return JSON.parse(t.slice(start, end + 1));
}

/**
 * Validated drafts from the model's answer. Items with missing fields are skipped (counted in
 * `skipped`); pages outside `from..to` fall back to `from`; duplicates and over-long text are dropped.
 * Throws a Turkish error when there is no usable JSON at all.
 */
export function parseCards(text: string, from: number, to: number): { cards: DraftCard[]; skipped: number } {
  let v: unknown;
  try {
    v = extractJson(text);
  } catch (e) {
    throw new Error(`Yapay zekânın yanıtı okunamadı: ${e instanceof Error ? e.message : String(e)}`);
  }
  const obj = (Array.isArray(v) ? { cards: v } : v) as { cards?: unknown; questions?: unknown };
  const list = (x: unknown): Record<string, unknown>[] =>
    Array.isArray(x) ? x.filter((i): i is Record<string, unknown> => !!i && typeof i === "object") : [];
  const page = (p: unknown) => {
    const n = typeof p === "string" ? Number.parseInt(p, 10) : typeof p === "number" ? Math.round(p) : NaN;
    return Number.isFinite(n) && n >= from && n <= to ? n : from;
  };
  const out: DraftCard[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  // A model sometimes puts questions into "cards"; accept them there too.
  const questions = [...list(obj.questions), ...list(obj.cards).filter((c) => "question" in c)];
  for (const c of list(obj.cards)) {
    if ("question" in c) continue;
    const term = str(c.term ?? c.front, 80).replace(/\s*[:—–]\s*/g, " - ");
    const definition = str(c.definition ?? c.back, 400);
    if (!term || !definition || seen.has(key(term))) {
      skipped++;
      continue;
    }
    seen.add(key(term));
    out.push({ kind: "term", term, definition, page: page(c.page) });
  }
  for (const q of questions) {
    const question = str(q.question, 300);
    const answer = str(q.answer ?? q.correct, 200);
    const wrong = [...new Map(
      (Array.isArray(q.wrong ?? q.options) ? (q.wrong ?? q.options) as unknown[] : [])
        .map((w) => str(w, 200))
        .filter((w) => w && key(w) !== key(answer))
        .map((w) => [key(w), w] as const),
    ).values()].slice(0, 3);
    if (!question || !answer || seen.has(key(question))) {
      skipped++;
      continue;
    }
    seen.add(key(question));
    out.push({ kind: "mc", question, answer, wrong, page: page(q.page) });
  }
  if (!out.length && !skipped) throw new Error("Yapay zekâ kart üretmedi. Başka bir sayfa aralığı dene.");
  return { cards: out.slice(0, MAX_CARDS), skipped: skipped + Math.max(0, out.length - MAX_CARDS) };
}

/** Annotation fields a draft is saved as: Tanım ("term: definition") or Soru (comment = answer). */
export function draftToAnnotation(d: DraftCard): { label: "definition" | "question"; text: string; comment: string; wrong: string[] } {
  return d.kind === "term"
    ? { label: "definition", text: `${d.term}: ${d.definition}`, comment: "", wrong: [] }
    : { label: "question", text: d.question, comment: d.answer, wrong: d.wrong };
}
