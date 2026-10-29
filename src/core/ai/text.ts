// Text helpers for retrieval: Turkish-aware tokenizer and page-keeping chunker. Pure.

/** Common Turkish (and a few English) function words that carry no topic. */
export const STOPWORDS: ReadonlySet<string> = new Set(
  ("acaba ama ancak artık aslında az bana bazı belki ben beni benim beri bile bir biraz biri birkaç birçok biz bize bizi " +
    "bu buna bunda bundan bunlar bunları bunu bunun burada çok çünkü da daha de değil diye diğer en gibi göre hem hep hepsi " +
    "her hiç için ile ise işte kadar ki kim mi mı mu mü nasıl ne neden nerede niçin o ona onda ondan onlar onu onun olan " +
    "olarak oldu olduğu olur ve veya ya yani şey şu şuna şunu tüm üzere var yok sonra önce kez her şöyle böyle " +
    "the a an and or of to in is are was for on with as by be this that it at from")
    .split(" "),
);

/** Lowercases with Turkish rules (I→ı, İ→i), drops punctuation and stopwords. */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFC")
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Cheap Turkish stem: the first 5 letters (suffixes pile up after the root). */
export const stem = (w: string): string => (/^\p{N}+$/u.test(w) ? w : w.slice(0, 5));

/** Index terms for BM25. */
export const terms = (text: string): string[] => tokenize(text).map(stem);

export interface Chunk {
  documentId: number | null;
  title: string;
  /** 1-based PDF page; null for notes. */
  page: number | null;
  source: "pdf" | "note" | "highlight";
  text: string;
}

/** Collapses whitespace so chunk sizes count real characters. */
export const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * Splits text into ~size-char pieces that overlap by `overlap` chars.
 * Cuts at a space when one is near, so words stay whole.
 */
export function splitText(text: string, size = 800, overlap = 150): string[] {
  const t = squash(text);
  if (!t) return [];
  if (t.length <= size) return [t];
  const out: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(t.length, start + size);
    if (end < t.length) {
      const sp = t.lastIndexOf(" ", end);
      if (sp > start + size / 2) end = sp;
    }
    out.push(t.slice(start, end).trim());
    if (end >= t.length) break;
    let next = end - overlap;
    const sp = t.indexOf(" ", next);
    if (sp !== -1 && sp < end) next = sp + 1;
    start = Math.max(next, start + 1);
  }
  return out;
}

/** One chunk list per document; chunks never cross a page so each keeps its page number. */
export function chunkPages(documentId: number, title: string, pages: string[], size = 800, overlap = 150): Chunk[] {
  return pages.flatMap((p, i) =>
    splitText(p, size, overlap).map((text) => ({ documentId, title, page: i + 1, source: "pdf" as const, text })),
  );
}

/**
 * Fits a whole document into `budget` chars for a summary prompt:
 * each page gets an equal share, unused share passes to later pages.
 */
export function fitPages(pages: string[], budget: number): string {
  const clean = pages.map(squash);
  let left = budget;
  const parts: string[] = [];
  clean.forEach((p, i) => {
    if (!p) return;
    const share = Math.floor(left / (clean.length - i));
    const piece = p.length <= share ? p : p.slice(0, Math.max(0, share - 1)) + "…";
    left -= piece.length;
    parts.push(`[s. ${i + 1}] ${piece}`);
  });
  return parts.join("\n");
}
