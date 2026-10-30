// Whisper initial prompt for a lecture: course, document title, key terms of the PDF and a punctuated
// Turkish seed sentence. It steers spelling, casing, punctuation and subject words. Pure.

/** A correctly punctuated lecture-style sentence; whisper copies the style of its prompt. */
export const SEED = "Bugünkü derste konuyu örneklerle, adım adım anlatıyoruz.";

/** whisper keeps only the tail of the prompt within its context (`-mc 128` tokens); Turkish runs ~3 chars a token. */
export const PROMPT_MAX_CHARS = 330;

const STOP = new Set(
  ("acaba ama ancak artık aslında bazı belki bile bir biraz birçok böyle bu buna bunu bunun burada çok daha dahi değil diğer diye " +
    "en fakat gibi göre hem her hep için ile ise kadar ki mı mi mu mü nasıl ne neden olan olarak olur sonra şey şu şöyle tüm üzere " +
    "var ve veya ya yani yine yok zaten önce sayfa hafta ders bölüm şekil tablo örnek soru cevap konu")
    .split(" "),
);

const WORD = /[\p{L}][\p{L}\p{N}'’-]*[\p{L}\p{N}]/gu;

/**
 * The PDF's most telling words: frequent, not common filler, counted extra when they stand in a short line
 * (a heading). Keeps the most frequent spelling of each word.
 */
export function keyTerms(pages: readonly string[], max = 20): string[] {
  const score = new Map<string, number>();
  const forms = new Map<string, Map<string, number>>();
  for (const page of pages) {
    for (const line of page.split("\n")) {
      const words = line.match(WORD) ?? [];
      const heading = words.length > 0 && words.length <= 6;
      for (const w of words) {
        const key = w.toLocaleLowerCase("tr");
        if (key.length < 4 || STOP.has(key)) continue;
        score.set(key, (score.get(key) ?? 0) + (heading ? 3 : 1));
        const f = forms.get(key) ?? new Map<string, number>();
        f.set(w, (f.get(w) ?? 0) + 1);
        forms.set(key, f);
      }
    }
  }
  return [...score.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"))
    .slice(0, max)
    .map(([key]) => [...forms.get(key)!.entries()].sort((a, b) => b[1] - a[1])[0][0]);
}

/** "Bilgisayar Ağları. Hafta 5: Protokoller. TCP, UDP, … Bugünkü derste …" within PROMPT_MAX_CHARS. */
export function lecturePrompt(course: string | null, title: string, terms: readonly string[] = []): string {
  const head = [course, title].map((s) => s?.replace(/\s+/g, " ").trim().replace(/[.:]$/, "")).filter(Boolean).map((s) => `${s}.`);
  const fixed = [...head, SEED].join(" ");
  const list: string[] = [];
  for (const t of terms) {
    const next = `${[...list, t].join(", ")}. `;
    if (next.length + fixed.length > PROMPT_MAX_CHARS) break;
    list.push(t);
  }
  const words = list.length ? `${list.join(", ")}. ` : "";
  return `${head.join(" ")} ${words}${SEED}`.trim().slice(-PROMPT_MAX_CHARS);
}
